// ═══════════════════════════════════════════════════════════════
// مركز أمازون — رفع التقارير، طلبات Seller Flex، الربحية، التسويات، إعادة الطلب
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const crypto = require('crypto');
const { Product, Sale, StockMovement } = require('../models/index');
const { AmazonOrder, AmazonTransaction, AmazonSkuMap } = require('../models/amazon');
const { auth, permit } = require('../middleware/auth');

// ─── أدوات مساعدة ───────────────────────────────────────────────
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
const normKey = (s) => toLatin(s).toLowerCase().replace(/^﻿/, '').replace(/[\s\-_/().]+/g, '');

function num(v) {
  let s = toLatin(v).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.\-]/g, '');            // يشيل العملة والفواصل
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

function parseDate(v) {
  const s = toLatin(v).trim();
  if (!s) return null;
  // dd.mm.yyyy أو dd/mm/yyyy (الصيغة المصرية/الأوروبية)
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  let d = new Date(s);
  if (!isNaN(d)) return d;
  d = new Date(s.replace(/\s+[A-Za-z]{2,5}$/, ''));   // يشيل PDT / UTC في الآخر
  return isNaN(d) ? null : d;
}

// يحدد صف العناوين ويرجع خريطة: الحقل → رقم العمود
function mapHeaders(rows, aliases, required) {
  const want = {};
  for (const [field, list] of Object.entries(aliases)) want[field] = list.map(normKey);
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const keys = (rows[i] || []).map(normKey);
    const idx = {};
    for (const [field, list] of Object.entries(want)) {
      const j = keys.findIndex(k => list.includes(k));
      if (j >= 0) idx[field] = j;
    }
    if (required.every(f => idx[f] !== undefined)) return { headerRow: i, idx };
  }
  return null;
}

const ORDER_ALIASES = {
  orderId:      ['amazon-order-id', 'order-id', 'order id', 'رقم الطلب', 'معرف الطلب', 'معرّف الطلب', 'معرف طلب أمازون', 'رقم طلب أمازون'],
  purchaseDate: ['purchase-date', 'order-date', 'تاريخ الشراء', 'تاريخ الطلب'],
  status:       ['order-status', 'item-status', 'حالة الطلب', 'الحالة'],
  productName:  ['product-name', 'title', 'اسم المنتج'],
  sku:          ['sku', 'seller-sku', 'رمز sku', 'رمز التخزين'],
  asin:         ['asin'],
  qty:          ['quantity', 'quantity-purchased', 'quantity-to-ship', 'quantity-shipped', 'الكمية', 'الكمية المشتراة'],
  itemPrice:    ['item-price', 'سعر السلعة', 'سعر المنتج', 'سعر العنصر'],
  shippingPrice:['shipping-price', 'سعر الشحن'],
  city:         ['ship-city', 'مدينة الشحن', 'المدينة']
};

const TX_ALIASES = {
  date:          ['date/time', 'date', 'posted-date', 'التاريخ/الوقت', 'التاريخ والوقت', 'التاريخ'],
  settlementId:  ['settlement id', 'settlement-id', 'رقم التسوية', 'معرف التسوية', 'معرّف التسوية'],
  type:          ['type', 'transaction-type', 'النوع', 'نوع المعاملة'],
  orderId:       ['order id', 'order-id', 'رقم الطلب', 'معرف الطلب', 'معرّف الطلب'],
  sku:           ['sku', 'رمز sku'],
  description:   ['description', 'الوصف'],
  qty:           ['quantity', 'الكمية'],
  productSales:  ['product sales', 'مبيعات المنتجات', 'مبيعات المنتج'],
  shippingCredits:['shipping credits', 'أرصدة الشحن', 'رصيد الشحن'],
  promoRebates:  ['promotional rebates', 'الخصومات الترويجية', 'خصومات ترويجية'],
  sellingFees:   ['selling fees', 'رسوم البيع'],
  fulfillmentFees:['fba fees', 'fulfillment fees', 'رسوم fba', 'رسوم الشحن عبر أمازون', 'رسوم التنفيذ'],
  otherFees:     ['other transaction fees', 'رسوم المعاملات الأخرى', 'رسوم معاملات أخرى'],
  other:         ['other', 'أخرى'],
  total:         ['total', 'الإجمالي', 'المجموع']
};

function stageFromAmazon(status) {
  const s = normKey(status);
  if (/cancel|ملغ/.test(s)) return 'cancelled';
  if (/deliver|تمالتسليم|سلم/.test(s)) return 'delivered';
  if (/return|مرتجع/.test(s)) return 'returned';
  if (/shipped|تمالشحن|شحن/.test(s) && !/unshipped|لميتم/.test(s)) return 'shipped';
  return 'new';
}
const STAGE_RANK = { new: 0, packed: 1, shipped: 2, delivered: 3, returned: 4, cancelled: 5 };

function kindFromType(type) {
  const s = normKey(type);
  if (/refund|استرد|استرج|مرتجع/.test(s)) return 'refund';
  if (/transfer|تحويل/.test(s)) return 'transfer';
  if (/^order|طلب/.test(s)) return 'order';
  if (/fee|service|رسوم|خدمة|اشتراك|subscription|advert|إعلان/.test(s)) return 'fee';
  return 'other';
}

// يربط SKU أمازون بمنتج: جدول الربط ← SKU المنتج ← ASIN
async function buildResolver() {
  const [maps, products] = await Promise.all([
    AmazonSkuMap.find().lean(),
    Product.find().select('name sku asin barcode buyPrice sellPrice stock minStock active').lean()
  ]);
  const byId = new Map(products.map(p => [String(p._id), p]));
  const bySku = new Map(products.filter(p => p.sku).map(p => [p.sku.trim().toLowerCase(), p]));
  const byAsin = new Map(products.filter(p => p.asin).map(p => [p.asin.trim().toUpperCase(), p]));
  const byMap = new Map(maps.map(m => [m.sku.trim().toLowerCase(), byId.get(String(m.product))]));
  const byBarcode = new Map(products.filter(p => p.barcode).map(p => [p.barcode.trim().toLowerCase(), p]));
  const resolve = (sku, asin) => {
    const k = String(sku || '').trim().toLowerCase();
    return byMap.get(k) || bySku.get(k) || byBarcode.get(k) || (asin ? byAsin.get(String(asin).trim().toUpperCase()) : null) || null;
  };
  return { resolve, products };
}

function dateRange(q, field) {
  if (!q.from && !q.to) return {};
  const r = {};
  if (q.from) r.$gte = new Date(q.from);
  if (q.to) { const t = new Date(q.to); t.setHours(23, 59, 59, 999); r.$lte = t; }
  return { [field]: r };
}

async function nextInvoiceNo() {
  const last = await Sale.findOne({ invoiceNo: /^SO-/ }).sort('-invoiceNo');
  const n = last ? parseInt(last.invoiceNo.replace('SO-', '')) + 1 : 1;
  return 'SO-' + String(n).padStart(5, '0');
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// يحوّل سطور طلب واحد لفاتورة بيع ويخصم المخزون — مستخدمة في الترحيل وفي شاشة الاسكانر
const DISPATCH_REASON = 'خروج لأمازون';

// deductStock = false لما البضاعة اتخصمت قبل كده بالاسكانر (خروج لأمازون)
async function postOrderGroup(orderId, items, resolve, userId, { deductStock = true } = {}) {
  const prods = items.map(i => resolve(i.sku, i.asin));
  const missing = items.filter((_, k) => !prods[k]).map(i => i.sku);
  if (missing.length) return { reason: 'SKU غير مربوط: ' + missing.join(', ') };
  if (items.some(i => i.sale)) return { reason: 'الطلب مرحّل قبل كده' };
  // لو السعر مش موجود في التقرير ناخد سعر البيع من صفحة المنتجات
  const lineTotal = (i, k) => i.itemPrice || r2((prods[k].sellPrice || 0) * i.qty);

  const feeTx = await AmazonTransaction.find({ orderId, kind: 'order' }).lean();
  const fees = feeTx.reduce((f, t) => f + t.sellingFees + t.fulfillmentFees + t.otherFees, 0);
  const saleItems = items.map((i, k) => ({ product: prods[k]._id, qty: i.qty, price: r2(lineTotal(i, k) / i.qty), cost: prods[k].buyPrice || 0, total: r2(lineTotal(i, k)) }));
  const subtotal = r2(saleItems.reduce((s, i) => s + i.total, 0));
  const shipping = r2(items.reduce((s, i) => s + (i.shippingPrice || 0), 0));
  const invoiceNo = await nextInvoiceNo();
  const allDelivered = items.every(i => i.stage === 'delivered');
  const sale = await Sale.create({
    invoiceNo, platform: 'amazon', amazonOrderId: orderId, items: saleItems,
    subtotal, shipping, amazonFees: r2(Math.abs(fees)), total: r2(subtotal + shipping),
    status: allDelivered ? 'delivered' : 'shipped', date: items[0].purchaseDate || new Date(),
    notes: 'مرحّل تلقائياً من مركز أمازون', createdBy: userId
  });
  for (let k = 0; k < items.length; k++) {
    if (deductStock) {
      const prod = await Product.findById(prods[k]._id);
      const before = prod.stock;
      prod.stock -= items[k].qty;
      await prod.save();
      await StockMovement.create({ product: prod._id, type: 'out', qty: items[k].qty, before, after: prod.stock, reason: 'طلب أمازون ' + orderId, reference: invoiceNo, createdBy: userId });
    }
    items[k].sale = sale._id;
    items[k].product = prods[k]._id;
    await items[k].save();
  }
  return { sale };
}

// ═══════════════════════════════════════════════════════════════
// 1) رفع تقرير الطلبات
// ═══════════════════════════════════════════════════════════════
router.post('/upload/orders', auth, permit('amazon'), async (req, res) => {
  try {
    const rows = req.body.rows || [];
    const found = mapHeaders(rows, ORDER_ALIASES, ['orderId', 'sku']);
    if (!found) return res.status(400).json({ message: 'لم يتم التعرف على أعمدة تقرير الطلبات (رقم الطلب + SKU)', headers: (rows[0] || []).slice(0, 40) });
    const { headerRow, idx } = found;
    const get = (r, f) => idx[f] !== undefined ? r[idx[f]] : '';
    const { resolve } = await buildResolver();

    // طلبات اتسجلت يدوي من الاسكانر: نشيل السطور اليدوية ونربط سطور التقرير بنفس الفاتورة
    const fileIds = [...new Set(rows.slice(headerRow + 1).map(r => String(get(r, 'orderId') || '').trim()).filter(Boolean))];
    const manualLines = await AmazonOrder.find({ orderId: { $in: fileIds }, manual: true }).lean();
    const manualSale = {};
    for (const m of manualLines) if (m.sale) manualSale[m.orderId] = m.sale;
    if (manualLines.length) await AmazonOrder.deleteMany({ _id: { $in: manualLines.map(m => m._id) } });

    let inserted = 0, updated = 0, skipped = 0;
    for (const r of rows.slice(headerRow + 1)) {
      const orderId = String(get(r, 'orderId') || '').trim();
      const sku = String(get(r, 'sku') || '').trim();
      if (!orderId || !sku) { skipped++; continue; }
      const status = String(get(r, 'status') || '').trim();
      const amzStage = stageFromAmazon(status);
      const asin = String(get(r, 'asin') || '').trim();
      const prod = resolve(sku, asin);
      const data = {
        asin, productName: String(get(r, 'productName') || '').trim(),
        qty: num(get(r, 'qty')) || 1,
        itemPrice: num(get(r, 'itemPrice')),
        shippingPrice: num(get(r, 'shippingPrice')),
        purchaseDate: parseDate(get(r, 'purchaseDate')),
        amazonStatus: status, city: String(get(r, 'city') || '').trim(),
        product: prod?._id
      };
      const existing = await AmazonOrder.findOne({ orderId, sku });
      if (!existing) {
        const ms = manualSale[orderId];
        await AmazonOrder.create({ orderId, sku, ...data, stage: ms && STAGE_RANK[amzStage] < STAGE_RANK.shipped ? 'shipped' : amzStage, sale: ms || undefined });
        inserted++;
      } else {
        Object.assign(existing, data);
        // أمازون تقدّم المرحلة فقط ولا ترجعها للخلف (عشان ما تمسحش التجهيز اليدوي)
        if (STAGE_RANK[amzStage] > STAGE_RANK[existing.stage]) existing.stage = amzStage;
        if (!existing.itemPrice && !data.itemPrice) existing.itemPrice = 0;
        await existing.save();
        updated++;
      }
    }
    res.json({ message: `تم: ${inserted} جديد، ${updated} محدّث، ${skipped} متجاهل`, inserted, updated, skipped });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 2) رفع تقرير المعاملات / التسوية (Date Range Transaction Report)
// ═══════════════════════════════════════════════════════════════
router.post('/upload/transactions', auth, permit('amazon'), async (req, res) => {
  try {
    const rows = req.body.rows || [];
    const found = mapHeaders(rows, TX_ALIASES, ['type', 'total']);
    if (!found) return res.status(400).json({ message: 'لم يتم التعرف على أعمدة تقرير المعاملات (النوع + الإجمالي)', headers: (rows[0] || []).slice(0, 40) });
    const { headerRow, idx } = found;
    const get = (r, f) => idx[f] !== undefined ? r[idx[f]] : '';

    const seen = {};
    const ops = [];
    for (const r of rows.slice(headerRow + 1)) {
      if (!r || r.every(c => !String(c ?? '').trim())) continue;
      const type = String(get(r, 'type') || '').trim();
      const raw = r.map(c => String(c ?? '').trim()).join('|');
      seen[raw] = (seen[raw] || 0) + 1;                 // سطرين متطابقين في نفس الملف = سطرين حقيقيين
      const hash = crypto.createHash('sha1').update(raw + '#' + seen[raw]).digest('hex');
      const doc = {
        hash, type, kind: kindFromType(type),
        date: parseDate(get(r, 'date')),
        settlementId: String(get(r, 'settlementId') || '').trim(),
        orderId: String(get(r, 'orderId') || '').trim(),
        sku: String(get(r, 'sku') || '').trim(),
        description: String(get(r, 'description') || '').trim(),
        qty: num(get(r, 'qty')),
        productSales: num(get(r, 'productSales')),
        shippingCredits: num(get(r, 'shippingCredits')),
        promoRebates: num(get(r, 'promoRebates')),
        sellingFees: num(get(r, 'sellingFees')),
        fulfillmentFees: num(get(r, 'fulfillmentFees')),
        otherFees: num(get(r, 'otherFees')),
        other: num(get(r, 'other')),
        total: num(get(r, 'total'))
      };
      ops.push({ updateOne: { filter: { hash }, update: { $setOnInsert: doc }, upsert: true } });
    }
    let inserted = 0;
    for (let i = 0; i < ops.length; i += 500) {
      const out = await AmazonTransaction.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      inserted += out.upsertedCount || 0;
    }
    res.json({ message: `تم: ${inserted} معاملة جديدة، ${ops.length - inserted} موجودة مسبقاً`, inserted, duplicates: ops.length - inserted });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 3) الطلبات (Seller Flex)
// ═══════════════════════════════════════════════════════════════
router.get('/orders', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try {
    const q = { ...dateRange(req.query, 'purchaseDate') };
    if (req.query.stage) q.stage = req.query.stage;
    if (req.query.search) {
      const s = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      q.$or = [{ orderId: s }, { sku: s }, { productName: s }, { city: s }];
    }
    const orders = await AmazonOrder.find(q).populate('product', 'name stock').populate('sale', 'invoiceNo').sort('-purchaseDate').limit(2000).lean();
    const counts = await AmazonOrder.aggregate([{ $group: { _id: '$stage', n: { $sum: 1 } } }]);
    res.json({ orders, counts: Object.fromEntries(counts.map(c => [c._id, c.n])) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// تغيير مرحلة التجهيز (مجهّز / تم الشحن / تم التسليم / مرتجع)
router.put('/orders/stage', auth, permit('amazon'), async (req, res) => {
  try {
    const { ids = [], stage } = req.body;
    if (!STAGE_RANK.hasOwnProperty(stage)) return res.status(400).json({ message: 'مرحلة غير صحيحة' });
    const orders = await AmazonOrder.find({ _id: { $in: ids } });
    let restocked = 0;
    for (const o of orders) {
      // مرتجع بعد الترحيل → إرجاع الكمية للمخزون مرة واحدة
      if (stage === 'returned' && o.stage !== 'returned' && o.sale && o.product) {
        const prod = await Product.findById(o.product);
        if (prod) {
          const before = prod.stock;
          prod.stock += o.qty;
          await prod.save();
          const sale = await Sale.findByIdAndUpdate(o.sale, { status: 'returned' }, { new: true });
          await StockMovement.create({ product: prod._id, type: 'return', qty: o.qty, before, after: prod.stock, reason: 'مرتجع أمازون ' + o.orderId, reference: sale?.invoiceNo || o.orderId, createdBy: req.user._id });
          restocked++;
        }
      }
      o.stage = stage;
      await o.save();
    }
    res.json({ message: `تم تحديث ${orders.length} سطر` + (restocked ? ` — رجوع ${restocked} للمخزون` : '') });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ترحيل الطلبات المشحونة لفواتير بيع (يخصم المخزون)
router.post('/orders/post-sales', auth, permit('amazon'), async (req, res) => {
  try {
    const { resolve } = await buildResolver();
    const lines = await AmazonOrder.find({ stage: { $in: ['shipped', 'delivered'] }, sale: null }).sort('purchaseDate');
    const groups = {};
    for (const l of lines) (groups[l.orderId] ||= []).push(l);

    let posted = 0;
    const skipped = [];
    for (const [orderId, items] of Object.entries(groups)) {
      const r = await postOrderGroup(orderId, items, resolve, req.user._id, { deductStock: req.body.deductStock !== false });
      if (r.reason) skipped.push({ orderId, reason: r.reason }); else posted++;
    }
    res.json({ message: `تم ترحيل ${posted} طلب لفواتير بيع` + (skipped.length ? ` — ${skipped.length} متوقف` : ''), posted, skipped });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// مطابقة البضاعة اللي خرجت بالاسكانر مع الطلبات اللي في التقرير
// ═══════════════════════════════════════════════════════════════
router.get('/dispatch-compare', auth, permit('amazon', 'amazon:read', 'stock'), async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 6 * 864e5);
    from.setHours(0, 0, 0, 0);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23, 59, 59, 999);
    const { resolve, products } = await buildResolver();
    const byId = new Map(products.map(p => [String(p._id), p]));

    const [moves, orders] = await Promise.all([
      StockMovement.find({ type: 'out', reason: DISPATCH_REASON, createdAt: { $gte: from, $lte: to } }).lean(),
      AmazonOrder.find({ purchaseDate: { $gte: from, $lte: to }, stage: { $ne: 'cancelled' } }).lean()
    ]);
    const rows = {};
    const row = (id) => (rows[id] ||= { _id: id, name: byId.get(id)?.name || '؟', stock: byId.get(id)?.stock, ordered: 0, dispatched: 0, orderIds: new Set(), skus: new Set() });
    for (const m of moves) row(String(m.product)).dispatched += m.qty;
    const unmapped = {};
    for (const o of orders) {
      const p = resolve(o.sku, o.asin);
      if (!p) { unmapped[o.sku] = (unmapped[o.sku] || 0) + o.qty; continue; }
      const r = row(String(p._id));
      r.ordered += o.qty; r.orderIds.add(o.orderId); r.skus.add(o.sku);
    }
    const list = Object.values(rows).map(r => {
      const diff = r.dispatched - r.ordered;
      return { ...r, orderIds: [...r.orderIds], skus: [...r.skus], diff, status: diff === 0 ? 'matched' : diff > 0 ? 'over' : 'short' };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const t = (k) => list.reduce((s, r) => s + r[k], 0);
    res.json({
      from, to, rows: list,
      totals: { ordered: t('ordered'), dispatched: t('dispatched'), orders: new Set(orders.map(o => o.orderId)).size,
        matched: list.filter(r => r.status === 'matched').length, over: list.filter(r => r.status === 'over').length, short: list.filter(r => r.status === 'short').length },
      unmapped: Object.entries(unmapped).map(([sku, qty]) => ({ sku, qty }))
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 4) ربط الـ SKU
// ═══════════════════════════════════════════════════════════════
router.get('/skus', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try {
    const { resolve } = await buildResolver();
    const [orders, txs, maps] = await Promise.all([
      AmazonOrder.find().select('sku asin productName qty').lean(),
      AmazonTransaction.find({ sku: { $ne: '' } }).select('sku description').lean(),
      AmazonSkuMap.find().lean()
    ]);
    const mapped = new Set(maps.map(m => m.sku.toLowerCase()));
    const all = new Map();
    for (const o of orders) {
      const s = all.get(o.sku) || { sku: o.sku, asin: o.asin, name: o.productName, units: 0 };
      s.units += o.qty;
      all.set(o.sku, s);
    }
    for (const t of txs) if (!all.has(t.sku)) all.set(t.sku, { sku: t.sku, asin: '', name: t.description, units: 0 });
    const list = [...all.values()].map(s => {
      const p = resolve(s.sku, s.asin);
      return { ...s, product: p ? { _id: p._id, name: p.name } : null, manual: mapped.has(s.sku.toLowerCase()) };
    }).sort((a, b) => (a.product ? 1 : 0) - (b.product ? 1 : 0) || b.units - a.units);
    res.json(list);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/skus/map', auth, permit('amazon'), async (req, res) => {
  try {
    const { sku, product } = req.body;
    if (!sku || !product) return res.status(400).json({ message: 'SKU والمنتج مطلوبين' });
    await AmazonSkuMap.findOneAndUpdate({ sku }, { sku, product }, { upsert: true });
    await AmazonOrder.updateMany({ sku }, { product });
    res.json({ message: 'تم الربط' });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/skus/map/:sku', auth, permit('amazon'), async (req, res) => {
  await AmazonSkuMap.deleteOne({ sku: req.params.sku });
  res.json({ message: 'تم فك الربط' });
});

// ═══════════════════════════════════════════════════════════════
// 5) ربحية كل منتج (من تقرير المعاملات + تكلفة الشراء)
// ═══════════════════════════════════════════════════════════════
router.get('/profitability', auth, permit('amazon', 'amazon:read', 'reports'), async (req, res) => {
  try {
    const { resolve } = await buildResolver();
    const txs = await AmazonTransaction.find(dateRange(req.query, 'date')).lean();
    const bySku = {};
    let generalFees = 0, transfers = 0;
    for (const t of txs) {
      if (t.kind === 'transfer') { transfers += t.total; continue; }
      if (!t.sku) { generalFees += t.total; continue; }      // رسوم اشتراك/إعلانات بدون SKU
      const g = (bySku[t.sku] ||= { sku: t.sku, unitsSold: 0, unitsRefunded: 0, sales: 0, refunds: 0, fees: 0, net: 0 });
      const fees = t.sellingFees + t.fulfillmentFees + t.otherFees;
      if (t.kind === 'order') { g.unitsSold += t.qty; g.sales += t.productSales + t.shippingCredits + t.promoRebates; }
      else if (t.kind === 'refund') { g.unitsRefunded += Math.abs(t.qty); g.refunds += t.productSales + t.shippingCredits + t.promoRebates; }
      g.fees += fees;
      g.net += t.total;
    }
    const rows = Object.values(bySku).map(g => {
      const p = resolve(g.sku);
      const netUnits = g.unitsSold - g.unitsRefunded;
      const unitCost = p?.buyPrice || 0;
      const cogs = netUnits * unitCost;
      const profit = g.net - cogs;
      const revenue = g.sales + g.refunds;
      return {
        ...g, product: p ? { _id: p._id, name: p.name } : null, netUnits, unitCost,
        sales: r2(g.sales), refunds: r2(g.refunds), fees: r2(g.fees), net: r2(g.net), cogs: r2(cogs), profit: r2(profit),
        margin: revenue ? r2(profit / revenue * 100) : 0,
        feePct: g.sales ? r2(Math.abs(g.fees) / g.sales * 100) : 0,
        profitPerUnit: netUnits ? r2(profit / netUnits) : 0
      };
    }).sort((a, b) => b.profit - a.profit);
    const sum = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
    const totals = {
      sales: sum('sales'), refunds: sum('refunds'), fees: sum('fees'), net: sum('net'), cogs: sum('cogs'),
      productProfit: sum('profit'), generalFees: r2(generalFees), transfers: r2(transfers),
      finalProfit: r2(sum('profit') + generalFees), units: rows.reduce((s, r) => s + r.netUnits, 0),
      missingCost: rows.filter(r => !r.unitCost).length
    };
    res.json({ rows, totals });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 6) التسويات: مطابقة الطلبات مع ما دفعته أمازون
// ═══════════════════════════════════════════════════════════════
router.get('/reconciliation', auth, permit('amazon', 'amazon:read', 'reports'), async (req, res) => {
  try {
    const orders = await AmazonOrder.find(dateRange(req.query, 'purchaseDate')).lean();
    const groups = {};
    for (const o of orders) {
      const g = (groups[o.orderId] ||= { orderId: o.orderId, date: o.purchaseDate, expected: 0, units: 0, stages: new Set(), skus: [] });
      g.expected += o.itemPrice + (o.shippingPrice || 0);
      g.units += o.qty;
      g.stages.add(o.stage);
      g.skus.push(o.sku);
    }
    const ids = Object.keys(groups);
    const txs = await AmazonTransaction.find({ orderId: { $in: ids } }).lean();
    const txBy = {};
    for (const t of txs) {
      const x = (txBy[t.orderId] ||= { settled: 0, refunds: 0, fees: 0, net: 0, settlementIds: new Set() });
      if (t.kind === 'order') x.settled += t.productSales + t.shippingCredits + t.promoRebates;
      if (t.kind === 'refund') x.refunds += t.total;
      x.fees += t.sellingFees + t.fulfillmentFees + t.otherFees;
      x.net += t.total;
      if (t.settlementId) x.settlementIds.add(t.settlementId);
    }
    const now = Date.now();
    const rows = Object.values(groups).map(g => {
      const x = txBy[g.orderId];
      const cancelled = g.stages.size === 1 && g.stages.has('cancelled');
      let status;
      if (cancelled) status = x ? 'cancelled_charged' : 'cancelled';
      else if (!x) status = g.date && now - new Date(g.date) > 21 * 864e5 ? 'overdue' : 'pending';
      else if (x.refunds) status = 'refunded';
      else if (Math.abs(g.expected - x.settled) <= 1) status = 'matched';
      else status = 'diff';
      return {
        orderId: g.orderId, date: g.date, units: g.units, skus: [...new Set(g.skus)].join(', '),
        stage: [...g.stages].join('/'), expected: r2(g.expected),
        settled: r2(x?.settled), refunds: r2(x?.refunds), fees: r2(x?.fees), net: r2(x?.net),
        diff: r2((x?.settled || 0) - g.expected), settlementIds: x ? [...x.settlementIds].join(', ') : '', status
      };
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const known = new Set(await AmazonOrder.distinct('orderId'));
    const orphanTx = await AmazonTransaction.find({ kind: { $in: ['order', 'refund'] }, orderId: { $nin: ['', ...known] }, ...dateRange(req.query, 'date') }).lean();
    const orph = {};
    for (const t of orphanTx) {
      const o = (orph[t.orderId] ||= { orderId: t.orderId, net: 0, date: t.date });
      o.net += t.total;
      if (t.date && (!o.date || t.date < o.date)) o.date = t.date;
    }
    const missingOrders = Object.values(orph).map(o => ({ ...o, net: r2(o.net) }));
    const counts = rows.reduce((c, r) => (c[r.status] = (c[r.status] || 0) + 1, c), {});
    res.json({ rows, counts, missingOrders });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ملخص كل تسوية (دفعة أمازون)
router.get('/settlements', auth, permit('amazon', 'amazon:read', 'reports'), async (req, res) => {
  try {
    const txs = await AmazonTransaction.find().lean();
    const g = {};
    for (const t of txs) {
      const id = t.settlementId || '(بدون رقم)';
      const s = (g[id] ||= { settlementId: id, from: t.date, to: t.date, lines: 0, sales: 0, refunds: 0, fees: 0, otherFees: 0, net: 0, transfer: 0 });
      s.lines++;
      if (t.date && (!s.from || t.date < s.from)) s.from = t.date;
      if (t.date && (!s.to || t.date > s.to)) s.to = t.date;
      if (t.kind === 'order') s.sales += t.productSales + t.shippingCredits + t.promoRebates;
      if (t.kind === 'refund') s.refunds += t.total;
      if (t.kind === 'order' || t.kind === 'refund') s.fees += t.sellingFees + t.fulfillmentFees + t.otherFees;
      if (t.kind === 'fee' || t.kind === 'other') s.otherFees += t.total;
      if (t.kind === 'transfer') s.transfer += t.total; else s.net += t.total;
    }
    const list = Object.values(g).sort((a, b) => new Date(b.to || 0) - new Date(a.to || 0));
    res.json(list.map(s => ({ ...s, sales: r2(s.sales), refunds: r2(s.refunds), fees: r2(s.fees), otherFees: r2(s.otherFees), net: r2(s.net), transfer: r2(s.transfer) })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 7) إعادة الطلب: معدل البيع اليومي ← أيام التغطية ← الكمية المقترحة
// ═══════════════════════════════════════════════════════════════
router.get('/reorder', auth, permit('amazon', 'amazon:read', 'products:read'), async (req, res) => {
  try {
    const days = Math.max(1, +req.query.days || 30);
    const lead = Math.max(0, +req.query.lead || 14);    // مدة توريد المورد
    const cover = Math.max(0, +req.query.cover || 30);  // عايز مخزون يكفي كام يوم بعد الوصول
    const since = new Date(Date.now() - days * 864e5);
    const { resolve, products } = await buildResolver();
    const lines = await AmazonOrder.find({ purchaseDate: { $gte: since }, stage: { $ne: 'cancelled' } }).lean();
    const sold = {};
    const unmapped = new Set();
    for (const l of lines) {
      const p = resolve(l.sku, l.asin);
      if (!p) { unmapped.add(l.sku); continue; }
      sold[p._id] = (sold[p._id] || 0) + l.qty;
    }
    const rows = products.filter(p => p.active !== false).map(p => {
      const units = sold[p._id] || 0;
      const perDay = units / days;
      const daysLeft = perDay ? p.stock / perDay : null;
      const need = Math.max(0, Math.ceil(perDay * (lead + cover) - p.stock));
      let level = 'ok';
      if (perDay && daysLeft <= lead) level = 'urgent';
      else if (perDay && daysLeft <= lead + 7) level = 'soon';
      else if (!perDay) level = 'slow';
      return {
        _id: p._id, name: p.name, sku: p.sku, stock: p.stock, unitsSold: units, perDay: r2(perDay),
        daysLeft: daysLeft === null ? null : Math.floor(daysLeft), suggestedQty: need,
        cost: r2(need * (p.buyPrice || 0)), level
      };
    }).sort((a, b) => ({ urgent: 0, soon: 1, ok: 2, slow: 3 }[a.level] - { urgent: 0, soon: 1, ok: 2, slow: 3 }[b.level]) || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
    res.json({ rows, params: { days, lead, cover }, unmapped: [...unmapped] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 8) ملخص سريع لأعلى الصفحة
// ═══════════════════════════════════════════════════════════════
router.get('/summary', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try {
    const [lines, lastTx, lastOrder] = await Promise.all([
      AmazonOrder.find().select('orderId stage sale').lean(),
      AmazonTransaction.findOne().sort('-date').select('date').lean(),
      AmazonOrder.findOne().sort('-purchaseDate').select('purchaseDate').lean()
    ]);
    const bySt = {}, toPostSet = new Set();
    for (const l of lines) {
      (bySt[l.stage] ||= new Set()).add(l.orderId);
      if ((l.stage === 'shipped' || l.stage === 'delivered') && !l.sale) toPostSet.add(l.orderId);
    }
    const st = Object.fromEntries(Object.entries(bySt).map(([k, v]) => [k, v.size]));
    const toPost = [...toPostSet];
    res.json({ stages: st, toPost: toPost.length, lastTxDate: lastTx?.date, lastOrderDate: lastOrder?.purchaseDate });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 9) نظرة عامة: المبيعات + الطلبات المنتظرة + الأكثر مبيعاً + النواقص
// ═══════════════════════════════════════════════════════════════
router.get('/overview', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try {
    const DAY = 864e5;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const since30 = new Date(today - 29 * DAY);
    const { resolve, products } = await buildResolver();
    const lines = await AmazonOrder.find({ purchaseDate: { $gte: since30 }, stage: { $ne: 'cancelled' } }).lean();

    const period = (from) => {
      const ls = lines.filter(l => new Date(l.purchaseDate) >= from);
      return { orders: new Set(ls.map(l => l.orderId)).size, units: ls.reduce((s, l) => s + l.qty, 0), sales: r2(ls.reduce((s, l) => s + l.itemPrice, 0)) };
    };

    // مبيعات كل يوم آخر 30 يوم
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today - i * DAY);
      daily.push({ date: String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'), sales: 0, units: 0 });
    }
    for (const l of lines) {
      const idx = 29 - Math.floor((today - new Date(new Date(l.purchaseDate).setHours(0, 0, 0, 0))) / DAY);
      if (daily[idx]) { daily[idx].sales = r2(daily[idx].sales + l.itemPrice); daily[idx].units += l.qty; }
    }

    // الأكثر مبيعاً (بالمنتج — يجمع كل الإعلانات/SKUs بتاعة نفس المنتج)
    const top = {};
    for (const l of lines) {
      const p = resolve(l.sku, l.asin);
      const key = p ? String(p._id) : 'sku:' + l.sku;
      const t = (top[key] ||= { name: p?.name || l.productName || l.sku, mapped: !!p, stock: p?.stock, units: 0, sales: 0, skus: new Set() });
      t.units += l.qty; t.sales += l.itemPrice; t.skus.add(l.sku);
    }
    const topProducts = Object.values(top).sort((a, b) => b.units - a.units).slice(0, 10)
      .map(t => ({ ...t, sales: r2(t.sales), skus: [...t.skus] }));

    // النواقص: تحت حد التنبيه أو المخزون مش هيكفي 14 يوم بمعدل البيع الحالي
    const sold = {};
    for (const l of lines) { const p = resolve(l.sku, l.asin); if (p) sold[p._id] = (sold[p._id] || 0) + l.qty; }
    const lowStock = products.filter(p => p.active !== false).map(p => {
      const perDay = (sold[p._id] || 0) / 30;
      const daysLeft = perDay ? Math.floor(p.stock / perDay) : null;
      return { _id: p._id, name: p.name, stock: p.stock, minStock: p.minStock, perDay: r2(perDay), daysLeft };
    }).filter(p => p.stock <= 0 || p.stock <= p.minStock || (p.daysLeft !== null && p.daysLeft <= 14))
      .sort((a, b) => a.stock - b.stock);

    const pending = await AmazonOrder.find({ stage: { $in: ['new', 'packed'] } }).sort('purchaseDate').lean();
    const pendingOrders = {};
    for (const l of pending) {
      const p = resolve(l.sku, l.asin);
      const o = (pendingOrders[l.orderId] ||= { orderId: l.orderId, date: l.purchaseDate, stage: l.stage, items: [], short: false });
      o.items.push({ name: p?.name || l.productName || l.sku, qty: l.qty });
      if (p && p.stock < l.qty) o.short = true;   // المخزون مش مكفي الطلب
    }

    res.json({
      today: period(today), week: period(new Date(today - 6 * DAY)), month: period(since30),
      daily, topProducts, lowStock, pendingOrders: Object.values(pendingOrders),
      stockValue: r2(products.filter(p => p.active !== false).reduce((s, p) => s + Math.max(0, p.stock) * (p.buyPrice || 0), 0)),
      productsCount: products.filter(p => p.active !== false).length
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
module.exports.postOrderGroup = postOrderGroup;
module.exports.buildResolver = buildResolver;
module.exports._test = { num, parseDate, mapHeaders, stageFromAmazon, kindFromType, ORDER_ALIASES, TX_ALIASES };
