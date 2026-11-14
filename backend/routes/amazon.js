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
  total:         ['total', 'الإجمالي', 'المجموع'],
  status:        ['transaction status', 'حالة المعاملة'],
  releaseDate:   ['transaction release date', 'تاريخ تحرير المعاملة', 'تاريخ الإفراج']
};

// بصمة المعاملة: من بياناتها الثابتة بس — مش من الحالة (Deferred ← Released) ولا تاريخ التحرير
// عشان لو نفس الفترة اترفعت تاني بعد ما الفلوس اتحررت، ماتتسجلش مرتين
const txBase = (d) => [d.date ? new Date(d.date).toISOString() : '', d.type, d.orderId, d.sku, d.qty, d.productSales, d.shippingCredits, d.promoRebates, d.sellingFees, d.fulfillmentFees, d.otherFees, d.other, d.total].join('|');
const txHash = (base, n) => crypto.createHash('sha1').update('v2|' + base + '#' + n).digest('hex');

// ترحيل المعاملات القديمة للبصمة الجديدة (مرة واحدة)
async function migrateTxHashes() {
  const old = await AmazonTransaction.find({ hv: { $ne: 2 } }).sort('_id').lean();
  if (!old.length) return;
  const seen = {};
  const ops = old.map(d => {
    const base = txBase(d); seen[base] = (seen[base] || 0) + 1;
    return { updateOne: { filter: { _id: d._id }, update: { $set: { hash: txHash(base, seen[base]), hv: 2 } } } };
  });
  // لو المعاملات الجديدة اتسجلت قبل كده بنفس البصمة، الأرقام الإضافية بتفضل منفصلة
  for (let i = 0; i < ops.length; i += 500) await AmazonTransaction.bulkWrite(ops.slice(i, i + 500), { ordered: false }).catch(() => {});
}

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
    Product.find().select('name sku asin barcode buyPrice sellPrice stock minStock active isKit components').lean()
  ]);
  const byId = new Map(products.map(p => [String(p._id), p]));
  const bySku = new Map(products.filter(p => p.sku).map(p => [p.sku.trim().toLowerCase(), p]));
  const byAsin = new Map(products.filter(p => p.asin).map(p => [p.asin.trim().toUpperCase(), p]));
  const byMap = new Map(maps.map(m => [m.sku.trim().toLowerCase(), byId.get(String(m.product))]));
  const byMult = new Map(maps.map(m => [m.sku.trim().toLowerCase(), Math.max(1, m.qty || 1)]));
  // مكونات كل إعلان: [{ p, qty }] — الإعلان العادي = الصنف × 1
  const byParts = new Map(maps.map(m => [m.sku.trim().toLowerCase(),
    [{ p: byId.get(String(m.product)), qty: Math.max(1, m.qty || 1) }, ...(m.components || []).map(c => ({ p: byId.get(String(c.product)), qty: Math.max(1, c.qty || 1) }))].filter(x => x.p)]));
  const byBarcode = new Map(products.filter(p => p.barcode).map(p => [p.barcode.trim().toLowerCase(), p]));
  const resolve = (sku, asin) => {
    const k = String(sku || '').trim().toLowerCase();
    return byMap.get(k) || bySku.get(k) || byBarcode.get(k) || (asin ? byAsin.get(String(asin).trim().toUpperCase()) : null) || null;
  };
  // كام قطعة من الصنف في الإعلان الواحد (الإعلانات الباكدج) — الافتراضي 1
  const mult = (sku) => byMult.get(String(sku || '').trim().toLowerCase()) || 1;
  // الصنف المركب بيتفك لمكوناته (كل مكوّن × كميته)
  const expand = (list) => list.flatMap(x => x.p.isKit && x.p.components?.length
    ? x.p.components.map(c => ({ p: byId.get(String(c.product)), qty: x.qty * (c.qty || 1) })).filter(y => y.p)
    : [x]);
  const parts = (sku, asin) => {
    const m = byParts.get(String(sku || '').trim().toLowerCase());
    if (m?.length) return expand(m);
    const p = resolve(sku, asin);
    return p ? expand([{ p, qty: 1 }]) : [];
  };
  // تكلفة الإعلان الواحد = مجموع (تكلفة كل مكوّن × كميته)
  const kitCost = (sku, asin) => parts(sku, asin).reduce((t, x) => t + (x.p.buyPrice || 0) * x.qty, 0);
  return { resolve, mult, parts, kitCost, products };
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
  if (items.some(i => i.sale)) return { reason: 'تم ترحيل الطلب مسبقاً' };
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
      await require('../utils/stock').moveStock(prods[k]._id, -items[k].qty, { type: 'out', reason: 'طلب أمازون ' + orderId, reference: invoiceNo, userId });
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
// يسجّل تقرير الطلبات في مركز أمازون — بيرجع null لو الملف مش تقرير طلبات
async function importOrders(rows) {
  {
    const found = mapHeaders(rows, ORDER_ALIASES, ['orderId', 'sku']);
    if (!found) return null;
    // تقرير المعاملات فيه برضه «order id» و«sku» — لو فيه نوع + إجمالي ومافيهوش تاريخ شراء يبقى معاملات مش طلبات
    if (found.idx.purchaseDate === undefined && mapHeaders(rows, TX_ALIASES, ['type', 'total'])) return null;
    const { headerRow, idx } = found;
    const get = (r, f) => idx[f] !== undefined ? r[idx[f]] : '';
    const { resolve, mult, parts, kitCost } = await buildResolver();

    // طلبات اتسجلت يدوي من الاسكانر: نشيل السطور اليدوية ونربط سطور التقرير بنفس الفاتورة
    const fileIds = [...new Set(rows.slice(headerRow + 1).map(r => String(get(r, 'orderId') || '').trim()).filter(Boolean))];
    const manualLines = await AmazonOrder.find({ orderId: { $in: fileIds }, manual: true }).lean();
    const manualSale = {};
    for (const m of manualLines) if (m.sale) manualSale[m.orderId] = m.sale;
    if (manualLines.length) await AmazonOrder.deleteMany({ _id: { $in: manualLines.map(m => m._id) } });

    // كل الطلبات الموجودة بقراءة واحدة بدل بحث لكل سطر
    const ex = new Map();
    for (let i = 0; i < fileIds.length; i += 1000) {
      for (const o of await AmazonOrder.find({ orderId: { $in: fileIds.slice(i, i + 1000) } }).select('orderId sku stage asin productName qty itemPrice shippingPrice purchaseDate amazonStatus city product').lean()) ex.set(o.orderId + '|' + o.sku, o);
    }
    const fresh = new Map();   // أسطر جديدة (لو اتكررت في نفس الملف الأخير بيكسب)
    const upd = new Map();     // _id ← التحديث
    let skipped = 0, unchanged = 0;
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
      const key = orderId + '|' + sku, existing = ex.get(key);
      if (!existing) {
        const prev = fresh.get(key);
        const ms = manualSale[orderId];
        let stage = ms && STAGE_RANK[amzStage] < STAGE_RANK.shipped ? 'shipped' : amzStage;
        if (prev && STAGE_RANK[prev.stage] > STAGE_RANK[stage]) stage = prev.stage;
        fresh.set(key, { orderId, sku, ...data, stage, sale: ms || undefined });
      } else {
        // أمازون تقدّم المرحلة فقط ولا ترجعها للخلف (عشان ما تمسحش التجهيز اليدوي)
        const set = { ...data };
        if (STAGE_RANK[amzStage] > STAGE_RANK[existing.stage]) { set.stage = amzStage; existing.stage = amzStage; }
        const u = { $set: set };
        if (!prod) { delete set.product; u.$unset = { product: 1 }; }
        if (!set.purchaseDate) delete set.purchaseDate;
        // السطر ما اتغيرش؟ منكتبوش تاني (رفع نفس الفترة بيبقى لحظي)
        const same = (a, b) => (a instanceof Date || b instanceof Date) ? +new Date(a || 0) === +new Date(b || 0) : String(a ?? '') === String(b ?? '');
        const changed = Object.keys(set).some(k => !same(set[k], existing[k])) || (!prod && existing.product);
        if (changed) { upd.set(String(existing._id), u); Object.assign(existing, set); if (!prod) delete existing.product; }
        else unchanged++;
      }
    }
    const ops = [
      ...[...fresh.values()].map(d => { if (!d.purchaseDate) delete d.purchaseDate; if (!d.product) delete d.product; if (!d.sale) delete d.sale; return { insertOne: { document: d } }; }),
      ...[...upd.entries()].map(([_id, update]) => ({ updateOne: { filter: { _id }, update } })),
    ];
    for (let i = 0; i < ops.length; i += 500) await AmazonOrder.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    const inserted = fresh.size, updated = upd.size;
    return { message: `تم: ${inserted} جديد، ${updated} محدّث${unchanged ? `، ${unchanged} بدون تغيير` : ''}${skipped ? `، ${skipped} متجاهل` : ''}`, inserted, updated, unchanged, skipped };
  }
}

router.post('/upload/orders', auth, permit('amazon'), async (req, res) => {
  try {
    const r = await importOrders(req.body.rows || []);
    if (!r) return res.status(400).json({ message: 'لم يتم التعرف على أعمدة تقرير الطلبات (رقم الطلب + SKU)' });
    res.json(r);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 2) رفع تقرير المعاملات / التسوية (Date Range Transaction Report)
// ═══════════════════════════════════════════════════════════════
// يسجّل تقرير المعاملات في مركز أمازون — بيرجع null لو الملف مش تقرير معاملات
async function importTransactions(rows) {
  {
    const found = mapHeaders(rows, TX_ALIASES, ['type', 'total']);
    if (!found) return null;
    const { headerRow, idx } = found;
    const get = (r, f) => idx[f] !== undefined ? r[idx[f]] : '';

    await migrateTxHashes();
    const seen = {};
    const ops = [];
    for (const r of rows.slice(headerRow + 1)) {
      if (!r || r.every(c => !String(c ?? '').trim())) continue;
      const type = String(get(r, 'type') || '').trim();
      const doc = {
        hv: 2, type, kind: kindFromType(type),
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
      const base = txBase(doc);
      seen[base] = (seen[base] || 0) + 1;               // سطرين متطابقين في نفس الملف = سطرين حقيقيين
      const hash = txHash(base, seen[base]);
      // الحالة وتاريخ التحرير بيتحدّثوا لو الملف أحدث
      const live = { status: String(get(r, 'status') || '').trim(), releaseDate: parseDate(get(r, 'releaseDate')) || undefined };
      ops.push({ hash, doc, live });
    }
    // تنظيف: طلبات اتسجلت غلط من ملف معاملات قبل كده (من غير تاريخ شراء ولا حالة ولا فاتورة)
    await AmazonOrder.deleteMany({ purchaseDate: null, amazonStatus: '', manual: { $ne: true }, sale: null }).catch(() => {});
    // قراءة واحدة للموجود ← إدخال الجديد دفعة واحدة ← تحديث الحالة بس للي اتغيّر (Deferred → Released)
    const have = new Map();
    const hashes = ops.map(o => o.hash);
    for (let i = 0; i < hashes.length; i += 1000) {
      for (const t of await AmazonTransaction.find({ hash: { $in: hashes.slice(i, i + 1000) } }).select('hash status releaseDate').lean()) have.set(t.hash, t);
    }
    const toInsert = [], toUpdate = [];
    for (const o of ops) {
      const ex = have.get(o.hash);
      if (!ex) { toInsert.push({ hash: o.hash, ...o.doc, ...o.live }); continue; }
      if ((ex.status || '') !== o.live.status || +new Date(ex.releaseDate || 0) !== +new Date(o.live.releaseDate || 0)) toUpdate.push({ updateOne: { filter: { _id: ex._id }, update: { $set: o.live } } });
    }
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 1000) {
      try { inserted += (await AmazonTransaction.insertMany(toInsert.slice(i, i + 1000), { ordered: false })).length; }
      catch (e) { inserted += e.insertedDocs?.length ?? e.result?.insertedCount ?? 0; if (e.code !== 11000 && !e.writeErrors) throw e; }
    }
    for (let i = 0; i < toUpdate.length; i += 500) await AmazonTransaction.bulkWrite(toUpdate.slice(i, i + 500), { ordered: false });
    return { message: `تم: ${inserted} معاملة جديدة، ${ops.length - inserted} موجودة مسبقاً`, inserted, duplicates: ops.length - inserted };
  }
}

router.post('/upload/transactions', auth, permit('amazon'), async (req, res) => {
  try {
    const r = await importTransactions(req.body.rows || []);
    if (!r) return res.status(400).json({ message: 'لم يتم التعرف على أعمدة تقرير المعاملات (النوع + الإجمالي)' });
    res.json(r);
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
          const sale = await Sale.findByIdAndUpdate(o.sale, { status: 'returned' }, { new: true });
          await require('../utils/stock').moveStock(prod._id, o.qty, { type: 'return', reason: 'مرتجع أمازون ' + o.orderId, reference: sale?.invoiceNo || o.orderId, userId: req.user._id });
          restocked++;
        }
      }
      o.stage = stage;
      await o.save();
    }
    res.json({ message: `تم تحديث ${orders.length} سطر` + (restocked ? ` — إعادة ${restocked} إلى المخزون` : '') });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

// ترحيل الطلبات المشحونة لفواتير بيع (يخصم المخزون)
router.post('/orders/post-sales', auth, permit('amazon'), async (req, res) => {
  try {
    const { resolve, mult, parts, kitCost } = await buildResolver();
    const lines = await AmazonOrder.find({ stage: { $in: ['shipped', 'delivered'] }, sale: null }).sort('purchaseDate');
    const groups = {};
    for (const l of lines) (groups[l.orderId] ||= []).push(l);

    let posted = 0;
    const skipped = [];
    for (const [orderId, items] of Object.entries(groups)) {
      const r = await postOrderGroup(orderId, items, resolve, req.user._id, { deductStock: req.body.deductStock !== false });
      if (r.reason) skipped.push({ orderId, reason: r.reason }); else posted++;
    }
    res.json({ message: `تم ترحيل ${posted} طلب لفواتير بيع` + (skipped.length ? ` — تعذّر ترحيل ${skipped.length}` : ''), posted, skipped });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 4) ربط الـ SKU
// ═══════════════════════════════════════════════════════════════
router.get('/skus', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try {
    const { resolve, mult, parts, kitCost } = await buildResolver();
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
      const kit = parts(s.sku, s.asin);
      return { ...s, product: p ? { _id: p._id, name: p.name } : null, packQty: mult(s.sku), parts: kit.map(x => ({ _id: x.p._id, name: x.p.name, qty: x.qty })), manual: mapped.has(s.sku.toLowerCase()) };
    }).sort((a, b) => (a.product ? 1 : 0) - (b.product ? 1 : 0) || b.units - a.units);
    res.json(list);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// كل الربط (عشان كارت الصنف وقائمة المنتجات)
router.get('/skus/maps', auth, async (req, res) => {
  const maps = await AmazonSkuMap.find().sort('sku').lean();
  res.json(maps.map(m => ({ sku: m.sku, product: String(m.product), qty: m.qty || 1, components: (m.components || []).map(c => ({ product: String(c.product), qty: c.qty || 1 })) })));
});

router.post('/skus/map', auth, permit('amazon', 'products'), async (req, res) => {
  try {
    const sku = String(req.body.sku || '').trim();
    const { product, force } = req.body;
    const qty = Math.max(1, Math.round(+req.body.qty || 1));
    // مكونات إضافية (طقم من أصناف مختلفة): [{ product, qty }]
    const components = (Array.isArray(req.body.components) ? req.body.components : [])
      .filter(c => c?.product && String(c.product) !== String(product)).map(c => ({ product: c.product, qty: Math.max(1, Math.round(+c.qty || 1)) }));
    if (!sku || !product) return res.status(400).json({ message: 'رمز SKU والصنف مطلوبان' });
    const existing = await AmazonSkuMap.findOne({ sku }).populate('product', 'name').lean();
    if (existing && String(existing.product?._id) !== String(product) && !force)
      return res.status(409).json({ message: `رمز SKU مرتبط بصنف آخر: ${existing.product?.name || '؟'}`, otherProduct: existing.product?.name });
    await AmazonSkuMap.findOneAndUpdate({ sku }, { sku, product, qty, components }, { upsert: true });
    await AmazonOrder.updateMany({ sku }, { product });
    res.json({ message: 'تم الربط' });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/skus/map/:sku', auth, permit('amazon', 'products'), async (req, res) => {
  await AmazonSkuMap.deleteOne({ sku: req.params.sku });
  await AmazonOrder.updateMany({ sku: req.params.sku, manual: { $ne: true } }, { $unset: { product: 1 } });
  res.json({ message: 'تم فك الربط' });
});

// ═══════════════════════════════════════════════════════════════
// 5) ربحية كل منتج (من تقرير المعاملات + تكلفة الشراء)
// ═══════════════════════════════════════════════════════════════
router.get('/profitability', auth, permit('amazon', 'amazon:read', 'reports'), async (req, res) => {
  try {
    const { resolve, mult, parts, kitCost } = await buildResolver();
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
      const packQty = mult(g.sku);
      const unitCost = kitCost(g.sku);                    // تكلفة الإعلان الواحد = مجموع تكلفة مكوناته
      const cogs = netUnits * unitCost;
      const profit = g.net - cogs;
      const revenue = g.sales + g.refunds;
      return {
        ...g, product: p ? { _id: p._id, name: p.name } : null, netUnits, unitCost, packQty,
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
      const id = t.settlementId || '(دون رقم)';
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
    const { resolve, mult, parts, kitCost, products } = await buildResolver();
    const lines = await AmazonOrder.find({ purchaseDate: { $gte: since }, stage: { $ne: 'cancelled' } }).lean();
    const sold = {};
    const unmapped = new Set();
    for (const l of lines) {
      const p = resolve(l.sku, l.asin);
      if (!p) { unmapped.add(l.sku); continue; }
      for (const x of parts(l.sku, l.asin)) sold[x.p._id] = (sold[x.p._id] || 0) + l.qty * x.qty;
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
// 7.5) الإعلانات: أداء كل SKU + الإجراء المطلوب
// ═══════════════════════════════════════════════════════════════
const LISTING_ACTIONS = {
  restock:    { order: 0, label: 'زوّد الكمية',          color: '#ef4444' },
  loss:       { order: 1, label: 'بيخسر — راجع السعر',    color: '#dc2626' },
  returns:    { order: 2, label: 'مرتجعات عالية',         color: '#f97316' },
  unmapped:   { order: 3, label: 'اربطه بصنف',            color: '#f59e0b' },
  declining:  { order: 4, label: 'مبيعاته بتقل',          color: '#eab308' },
  dead:       { order: 5, label: 'راكد — حرّكه',           color: '#64748b' },
  no_listing: { order: 6, label: 'اعمل له إعلان',          color: '#8b5cf6' },
  star:       { order: 7, label: 'ناجح — حافظ عليه',       color: '#10b981' },
  growing:    { order: 8, label: 'مبيعاته بتزيد',          color: '#22c55e' },
  ok:         { order: 9, label: 'مستقر',                 color: '#3b82f6' },
};
router.get('/listings', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try {
    const days = Math.min(365, Math.max(7, +req.query.days || 30));
    const LEAD = 14, COVER = 30;
    const now = Date.now(), since = new Date(now - days * 864e5), prevSince = new Date(now - 2 * days * 864e5);
    const { resolve, mult, parts, kitCost, products } = await buildResolver();
    const [orders, txs, maps] = await Promise.all([
      AmazonOrder.find({ purchaseDate: { $gte: prevSince } }).select('sku asin productName qty itemPrice purchaseDate stage').lean(),
      AmazonTransaction.find({ date: { $gte: prevSince }, sku: { $ne: '' } }).lean(),
      AmazonSkuMap.find().lean(),
    ]);
    const lastSale = {};
    for (const o of await AmazonOrder.find({ stage: { $ne: 'cancelled' } }).select('sku purchaseDate').lean()) {
      const k = o.sku.toLowerCase(); if (o.purchaseDate && (!lastSale[k] || o.purchaseDate > lastSale[k])) lastSale[k] = o.purchaseDate;
    }
    for (const t of await AmazonTransaction.find({ kind: 'order', sku: { $ne: '' } }).select('sku date').lean()) {
      const k = t.sku.toLowerCase(); if (t.date && (!lastSale[k] || t.date > lastSale[k])) lastSale[k] = t.date;
    }
    // كل الإعلانات المعروفة: SKU أساسي للصنف + المربوطة + اللي ظهرت في التقارير
    const L = new Map();
    const get = (sku, name = '', asin = '') => {
      const k = String(sku).trim(); const key = k.toLowerCase();
      if (!L.has(key)) L.set(key, { sku: k, name, asin, units: 0, prevUnits: 0, revenue: 0, sold: 0, refunded: 0, net: 0, hasTx: false, f: { sales: 0, refunds: 0, ship: 0, promo: 0, selling: 0, fba: 0, otherFees: 0, other: 0 } });
      const x = L.get(key); if (!x.name && name) x.name = name; if (!x.asin && asin) x.asin = asin;
      return x;
    };
    for (const p of products) if (p.sku && p.active !== false) get(p.sku, p.name, p.asin);
    for (const m of maps) get(m.sku);
    for (const o of orders) {
      if (o.stage === 'cancelled') continue;
      const x = get(o.sku, o.productName, o.asin);
      x.hasOrders = true;
      if (o.purchaseDate >= since) { x.units += o.qty; x.revenue += o.itemPrice; } else x.prevUnits += o.qty;
    }
    // تقرير المعاملات لوحده كفاية: لو الإعلان مالوش طلبات مرفوعة، المبيعات بتتحسب من سطور «Order» في المعاملات
    for (const t of txs) {
      const x = get(t.sku, t.description);
      if (t.kind === 'order') {
        if (t.date >= since) { x.txUnits = (x.txUnits || 0) + t.qty; x.txRevenue = (x.txRevenue || 0) + t.productSales; } else x.txPrev = (x.txPrev || 0) + t.qty;
      }
      if (t.date < since) continue;
      x.hasTx = true; x.net += t.total;
      const f = x.f;
      if (t.kind === 'refund') f.refunds += t.productSales; else f.sales += t.productSales;
      f.ship += t.shippingCredits; f.promo += t.promoRebates; f.selling += t.sellingFees; f.fba += t.fulfillmentFees; f.otherFees += t.otherFees; f.other += t.other;
      if (t.kind === 'order') x.sold += t.qty; else if (t.kind === 'refund') x.refunded += Math.abs(t.qty);
    }
    for (const x of L.values()) if (!x.hasOrders && (x.txUnits || x.txPrev)) { x.units = x.txUnits || 0; x.revenue = x.txRevenue || 0; x.prevUnits = x.txPrev || 0; }

    // مبيعات كل صنف من كل إعلاناته (المخزون مشترك بين إعلانات الصنف)
    const prodUnits = {}, prodListings = {};
    const rows = [...L.values()].map(x => {
      const p = resolve(x.sku, x.asin);
      for (const k of parts(x.sku, x.asin)) prodUnits[k.p._id] = (prodUnits[k.p._id] || 0) + x.units * k.qty;
      if (p) (prodListings[p._id] ||= []).push(x.sku);
      return { ...x, p };
    });
    const ranked = rows.filter(r => r.units > 0).sort((a, b) => b.units - a.units);
    const topCut = ranked.length ? ranked[Math.max(0, Math.ceil(ranked.length * 0.1) - 1)].units : Infinity;

    const deadSeen = new Set();
    const out = rows.map(r => {
      const p = r.p;
      const productSells = p && prodUnits[p._id] > 0;
      const packQty = mult(r.sku);
      const kit = parts(r.sku, r.asin);
      // الطقم بيقف لما أول مكوّن يخلص: ناخد المكوّن «عنق الزجاجة» (أقل أيام تغطية)
      const comps = kit.map(k => { const pd = (prodUnits[k.p._id] || 0) / days; return { p: k.p, pd, left: pd ? Math.floor(k.p.stock / pd) : null, need: pd ? Math.max(0, Math.ceil(pd * (LEAD + COVER) - k.p.stock)) : 0 }; });
      const neck = comps.find(c => c.p.stock <= 0 && c.pd) || comps.filter(c => c.left !== null).sort((x, y) => x.left - y.left)[0] || comps[0];
      const daysLeft = neck ? neck.left : null;
      const suggestedQty = neck ? neck.need : 0;
      const neckName = kit.length > 1 && neck ? ` (${neck.p.name})` : '';
      const cogs = p ? (r.sold - r.refunded) * kitCost(r.sku, r.asin) : 0;
      const profit = r.hasTx ? r2(r.net - cogs) : null;
      const fin = r.hasTx ? { ...Object.fromEntries(Object.entries(r.f).map(([k, v]) => [k, r2(v)])), net: r2(r.net), cogs: r2(cogs), profit, fees: r2(r.f.selling + r.f.fba + r.f.otherFees) } : null;
      const returnRate = r.sold ? r2(r.refunded / r.sold * 100) : 0;
      const trend = r.prevUnits ? Math.round((r.units - r.prevUnits) / r.prevUnits * 100) : (r.units ? null : 0);
      const last = lastSale[r.sku.toLowerCase()] || null;
      let action = 'ok', why = '';
      if (!p) { action = 'unmapped'; why = 'الإعلان غير مربوط بصنف في المخزون — المبيعات مش بتخصم من الرصيد'; }
      else if (r.units > 0 && neck && (neck.p.stock <= 0 || (daysLeft !== null && daysLeft <= LEAD))) { action = 'restock'; why = neck.p.stock <= 0 ? `الرصيد خلص${neckName} والإعلان بيبيع ${r.units} في ${days} يوم` : `الرصيد يكفي ${daysLeft} يوم بس${neckName} — اطلب ${suggestedQty} وحدة`; }
      else if (profit !== null && profit < 0 && r.sold >= 2) { action = 'loss'; why = `صافي ${profit} بعد الرسوم والتكلفة — ارفع السعر أو راجع تكلفة الشراء`; }
      else if (r.sold >= 3 && returnRate >= 15) { action = 'returns'; why = `${returnRate}% مرتجع — راجع الصور والوصف والجودة`; }
      else if (r.prevUnits >= 3 && r.units <= r.prevUnits * 0.5) { action = 'declining'; why = `باع ${r.units} مقابل ${r.prevUnits} في الفترة اللي قبلها — راجع السعر والمنافسين${r.units === 0 ? '، واتأكد إن الإعلان شغال ومعاك الـ Buy Box' : ''}`; }
      // راكد: الصنف كله (بكل إعلاناته) مباعش — يظهر مرة واحدة للصنف
      else if (!productSells && p.stock > 0 && !deadSeen.has(String(p._id))) {
        deadSeen.add(String(p._id));
        const n = (prodListings[p._id] || []).length;
        action = 'dead'; why = `مفيش مبيعات في ${days} يوم${n > 1 ? ` من ${n} إعلانات` : ''} ورصيده ${p.stock}${p.buyPrice ? ` (${r2(p.stock * p.buyPrice)} رأس مال)` : ''} — خفّض السعر أو اعمل عرض أو باندل`;
      }
      else if (r.units > 0 && r.units >= topCut) { action = 'star'; why = 'من أعلى 10% مبيعاً — خلّي المخزون دايماً متاح وفكّر في إعلانات ممولة'; }
      else if (r.prevUnits >= 2 && r.units >= r.prevUnits * 1.5) { action = 'growing'; why = `باع ${r.units} مقابل ${r.prevUnits} — الطلب بيزيد، تابع المخزون`; }
      return {
        sku: r.sku, asin: r.asin, name: r.name || p?.name || '', units: r.units, prevUnits: r.prevUnits, trend, revenue: r2(r.revenue),
        profit, margin: profit !== null && r.revenue ? r2(profit / r.revenue * 100) : null, returnRate, refunded: r.refunded, fin,
        lastSale: last, product: p ? { _id: p._id, name: p.name, stock: p.stock, listings: (prodListings[p._id] || []).length } : null,
        daysLeft, suggestedQty, action, why, packQty, parts: kit.length > 1 || packQty > 1 ? kit.map(k => `${k.p.name} ×${k.qty}`) : null, isStar: r.units > 0 && r.units >= topCut,
      };
    });

    // أصناف عندها رصيد ومالهاش ولا إعلان
    const listed = new Set(Object.keys(prodListings));
    const noListing = products.filter(p => p.active !== false && p.stock > 0 && !listed.has(String(p._id)))
      .map(p => ({ sku: '', name: p.name, units: 0, product: { _id: p._id, name: p.name, stock: p.stock, listings: 0 }, action: 'no_listing', why: `رصيده ${p.stock} ومالوش إعلان على أمازون — اعمل له إعلان أو اربطه بإعلان موجود`, value: r2(p.stock * (p.buyPrice || 0)) }));

    const all = [...out, ...noListing].sort((a, b) => LISTING_ACTIONS[a.action].order - LISTING_ACTIONS[b.action].order || b.units - a.units);
    const count = (a) => all.filter(r => r.action === a).length;
    // الملخص المالي للفترة: كل سطور المعاملات (بالـ SKU + الرسوم العامة زي الاشتراك والشحن)
    const F = { sales: 0, refunds: 0, ship: 0, promo: 0, selling: 0, fba: 0, otherFees: 0, other: 0, general: 0, transfers: 0, net: 0, cogs: 0, orders: 0, refundCount: 0 };
    const generalByType = {};
    for (const t of txs) if (t.date >= since) {
      if (t.kind === 'order') F.orders++; if (t.kind === 'refund') F.refundCount++;
      if (t.kind === 'refund') F.refunds += t.productSales; else F.sales += t.productSales;
      F.ship += t.shippingCredits; F.promo += t.promoRebates; F.selling += t.sellingFees; F.fba += t.fulfillmentFees; F.otherFees += t.otherFees; F.other += t.other; F.net += t.total;
    }
    for (const t of await AmazonTransaction.find({ date: { $gte: since }, sku: '' }).select('type kind description total').lean()) {
      if (t.kind === 'transfer') { F.transfers += -t.total; continue; }
      F.general += t.total; F.net += t.total;
      const k = t.description || t.type; generalByType[k] = (generalByType[k] || 0) + t.total;
    }
    F.cogs = out.reduce((t, r) => t + (r.fin?.cogs || 0), 0);
    const fin = { ...Object.fromEntries(Object.entries(F).map(([k, v]) => [k, r2(v)])), profit: r2(F.net - F.cogs), fees: r2(F.selling + F.fba + F.otherFees),
      general: r2(F.general), generalByType: Object.entries(generalByType).map(([k, v]) => ({ name: k, total: r2(v) })).filter(g => g.total).sort((a, b) => a.total - b.total),
      missingCost: out.filter(r => r.fin && r.product && !kitCost(r.sku, r.asin) && r.units).length };
    const deadValue = r2(products.filter(p => p.stock > 0 && !prodUnits[p._id]).reduce((t, p) => t + p.stock * (p.buyPrice || 0), 0));
    res.json({
      days, rows: all, actions: LISTING_ACTIONS, fin,
      kpi: {
        listings: out.length, active: out.filter(r => r.units > 0).length, units: out.reduce((t, r) => t + r.units, 0),
        revenue: r2(out.reduce((t, r) => t + r.revenue, 0)), counts: Object.fromEntries(Object.keys(LISTING_ACTIONS).map(k => [k, count(k)])),
        deadValue, hasOrders: orders.length > 0, hasTx: txs.some(t => t.date >= since), stars: out.filter(r => r.isStar).length,
      },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// 7.6) تنبيه «اقفل الإعلان»: الإعلانات اللي رصيدها خلص أو قرّب يخلص
// المتاح للإعلان = أقل (رصيد المكوّن ÷ كميته في الإعلان) — يشمل الباكدج ×2 والأطقم
// ═══════════════════════════════════════════════════════════════
const ALERT_KEY = 'listing_alerts';
async function alertState() {
  const Setting = require('../models/Setting');
  const v = (await Setting.findOne({ key: ALERT_KEY }).lean())?.value || {};
  return { min: Number.isFinite(+v.min) ? +v.min : 2, closed: Array.isArray(v.closed) ? v.closed : [] };
}
async function saveAlertState(st) {
  const Setting = require('../models/Setting');
  await Setting.findOneAndUpdate({ key: ALERT_KEY }, { key: ALERT_KEY, value: st }, { upsert: true });
}
// النتيجة بتتحفظ دقيقة (الرئيسية وصفحة الإعلانات بيطلبوها كتير) — بتتمسح مع أي تغيير في التنبيهات
let alertsCache = null;
async function listingAlerts(fresh = false) {
  if (!fresh && alertsCache && Date.now() - alertsCache.at < 60e3) return alertsCache.data;
  const data = await computeListingAlerts();
  alertsCache = { at: Date.now(), data };
  return data;
}
async function computeListingAlerts() {
  const st = await alertState();
  const { parts, products } = await buildResolver();
  const maps = await AmazonSkuMap.find().select('sku').lean();
  // الإعلان «شغال» = اتطلب في آخر ACTIVE_DAYS يوم (الإعلانات اللي مابتبيعش غالباً مقفولة أصلاً)
  const ACTIVE_DAYS = 60, now = Date.now(), since = new Date(now - ACTIVE_DAYS * 864e5), d30 = new Date(now - 30 * 864e5);
  const [ords, txs] = await Promise.all([
    AmazonOrder.find({ purchaseDate: { $gte: since }, stage: { $ne: 'cancelled' } }).select('sku qty purchaseDate').lean(),
    AmazonTransaction.find({ date: { $gte: since }, kind: 'order', sku: { $ne: '' } }).select('sku qty date').lean(),
  ]);
  const sold = {}, soldTx = {}, last = {};
  const add = (bag, sku, qty, date) => { const k = sku.toLowerCase(); if (date >= d30) bag[k] = (bag[k] || 0) + qty; if (!last[k] || date > last[k]) last[k] = date; };
  for (const o of ords) add(sold, o.sku, o.qty, o.purchaseDate);
  for (const t of txs) add(soldTx, t.sku, t.qty, t.date);
  const skus = new Map();
  for (const p of products) if (p.sku && p.active !== false) skus.set(p.sku.trim().toLowerCase(), p.sku.trim());
  for (const m of maps) skus.set(m.sku.trim().toLowerCase(), m.sku.trim());
  const closed = new Map(st.closed.map(c => [String(c.sku).toLowerCase(), c]));
  const toClose = [], toOpen = [];
  let quiet = 0;
  for (const [k, sku] of skus) {
    const ps = parts(sku);
    if (!ps.length || ps.some(x => x.p.active === false)) continue;
    const per = ps.map(x => ({ x, can: Math.floor(Math.max(0, x.p.stock) / x.qty) }));
    const neck = per.reduce((a, b) => b.can < a.can ? b : a);
    const row = {
      sku, available: neck.can, name: ps.length === 1 && ps[0].qty === 1 ? ps[0].p.name : ps.map(x => `${x.p.name}${x.qty > 1 ? ' ×' + x.qty : ''}`).join(' + '),
      neck: ps.length > 1 || ps[0].qty > 1 ? `${neck.x.p.name} (رصيده ${neck.x.p.stock})` : null, stock: neck.x.p.stock, productId: neck.x.p._id,
      sold30: Math.max(sold[k] || 0, soldTx[k] || 0), lastSale: last[k] || null,
    };
    const c = closed.get(k);
    if (c) { if (row.available > st.min) toOpen.push({ ...row, closedAt: c.at, closedBy: c.by }); }
    else if (row.available <= st.min) { if (row.lastSale) toClose.push(row); else quiet++; }
  }
  // اللي بيبيع الأول (الأخطر إنه يتطلب)، وبعدين الأقل رصيداً
  toClose.sort((a, b) => b.sold30 - a.sold30 || a.available - b.available);
  toOpen.sort((a, b) => b.sold30 - a.sold30);
  return { min: st.min, toClose, toOpen, closedCount: st.closed.length, quiet, activeDays: ACTIVE_DAYS };
}
router.get('/listing-alerts', auth, permit('amazon', 'amazon:read'), async (req, res) => {
  try { res.json(await listingAlerts()); } catch (e) { res.status(500).json({ message: e.message }); }
});
// action: close = «قفلته على أمازون» | open = «فتحته تاني» | min = تغيير الحد
router.post('/listing-alerts', auth, permit('amazon'), async (req, res) => {
  try {
    const st = await alertState();
    const { action, skus = [] } = req.body;
    const set = new Set(skus.map(x => String(x).toLowerCase()));
    if (action === 'close') {
      const have = new Set(st.closed.map(c => String(c.sku).toLowerCase()));
      for (const sku of skus) if (!have.has(String(sku).toLowerCase())) st.closed.push({ sku: String(sku), at: new Date(), by: req.user.name });
    } else if (action === 'open') st.closed = st.closed.filter(c => !set.has(String(c.sku).toLowerCase()));
    else if (action === 'min') st.min = Math.max(0, Math.min(50, Math.round(+req.body.min || 0)));
    else return res.status(400).json({ message: 'إجراء غير معروف' });
    await saveAlertState(st);
    const msg = action === 'close' ? `تم تسجيل قفل ${skus.length} إعلان` : action === 'open' ? `تم تسجيل فتح ${skus.length} إعلان` : `حد التنبيه: ${st.min}`;
    res.json({ message: msg, ...(await listingAlerts(true)) });
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
    const { resolve, mult, parts, kitCost, products } = await buildResolver();
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
      t.units += l.qty * (p ? mult(l.sku) : 1); t.sales += l.itemPrice; t.skus.add(l.sku);
    }
    const topProducts = Object.values(top).sort((a, b) => b.units - a.units).slice(0, 10)
      .map(t => ({ ...t, sales: r2(t.sales), skus: [...t.skus] }));

    // النواقص: تحت حد التنبيه أو المخزون مش هيكفي 14 يوم بمعدل البيع الحالي
    const sold = {};
    for (const l of lines) for (const x of parts(l.sku, l.asin)) sold[x.p._id] = (sold[x.p._id] || 0) + l.qty * x.qty;
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
      const kit = parts(l.sku, l.asin);
      if (!kit.length) o.items.push({ name: l.productName || l.sku, qty: l.qty });
      for (const x of kit) {
        o.items.push({ name: x.p.name, qty: l.qty * x.qty });
        if (x.p.stock < l.qty * x.qty) o.short = true;   // المخزون مش مكفي الطلب
      }
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
module.exports.listingAlerts = listingAlerts;
module.exports.importOrders = importOrders;
module.exports.importTransactions = importTransactions;
module.exports._test = { num, parseDate, mapHeaders, stageFromAmazon, kindFromType, ORDER_ALIASES, TX_ALIASES };
