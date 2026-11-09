// ═══════════════════════════════════════════════════════════════
// إدارة البيانات: تصفير + استيراد الأصناف من Excel/CSV
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, Category, Supplier, StockMovement, Sale, Purchase, Expense } = require('../models/index');
const { Shipment } = require('../models/shipment');
const { AmazonOrder, AmazonTransaction, AmazonSkuMap } = require('../models/amazon');
const { auth, permit, superAdmin } = require('../middleware/auth');
const { mapHeaders, num } = require('./amazon')._test;

// ─── التصفير (مدير النظام بس) ───────────────────────────────────
const SCOPES = {
  products:  { label: 'الأصناف والمخزون',       models: [Product] },
  movements: { label: 'حركات المخزون',           models: [StockMovement] },
  shipments: { label: 'الشحنات',                 models: [Shipment] },
  amazon:    { label: 'بيانات أمازون وربط SKU',   models: [AmazonOrder, AmazonTransaction, AmazonSkuMap] },
  sales:     { label: 'فواتير البيع',              models: [Sale] },
  purchases: { label: 'فواتير الشراء',             models: [Purchase] },
  expenses:  { label: 'المصروفات',                models: [Expense] },
};

router.get('/counts', auth, superAdmin, async (req, res) => {
  const out = {};
  for (const [k, s] of Object.entries(SCOPES)) {
    out[k] = { label: s.label, count: (await Promise.all(s.models.map(m => m.countDocuments()))).reduce((a, b) => a + b, 0) };
  }
  res.json(out);
});

router.post('/reset', auth, superAdmin, async (req, res) => {
  try {
    if (req.body.confirm !== 'حذف') return res.status(400).json({ message: 'يُرجى كتابة كلمة «حذف» للتأكيد' });
    const scopes = (req.body.scopes || []).filter(k => SCOPES[k]);
    if (!scopes.length) return res.status(400).json({ message: 'يُرجى تحديد البيانات المطلوب حذفها' });
    const done = {};
    for (const k of scopes) {
      let n = 0;
      for (const m of SCOPES[k].models) n += (await m.deleteMany({})).deletedCount || 0;
      done[k] = n;
    }
    res.json({ message: 'تم حذف: ' + scopes.map(k => `${SCOPES[k].label} (${done[k]})`).join('، '), done });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── استيراد الأصناف ────────────────────────────────────────────
const PRODUCT_ALIASES = {
  name:      ['name', 'product', 'product name', 'item', 'title', 'الاسم', 'اسم الصنف', 'الصنف', 'اسم المنتج', 'المنتج', 'البيان'],
  sku:       ['sku', 'seller sku', 'seller-sku', 'كود', 'الكود', 'كود الصنف', 'رمز sku'],
  asin:      ['asin'],
  barcode:   ['barcode', 'ean', 'upc', 'gtin', 'باركود', 'الباركود'],
  buyPrice:  ['cost', 'buy price', 'purchase price', 'unit cost', 'سعر الشراء', 'التكلفة', 'تكلفة', 'سعر التكلفة', 'الشراء'],
  sellPrice: ['price', 'sell price', 'selling price', 'سعر البيع', 'البيع', 'السعر'],
  stock:     ['qty', 'quantity', 'stock', 'on hand', 'الكمية', 'كمية', 'المخزون', 'الرصيد', 'العدد'],
  minStock:  ['min stock', 'reorder point', 'min', 'حد التنبيه', 'الحد الأدنى', 'حد الطلب'],
  category:  ['category', 'الفئة', 'التصنيف', 'القسم'],
  supplier:  ['supplier', 'vendor', 'المورد', 'المورّد'],
  unit:      ['unit', 'الوحدة'],
  extraSkus: ['other skus', 'amazon skus', 'skus', 'sku أمازون', 'sku امازون', 'skus أمازون', 'إعلانات أمازون'],
};
const clean = (v) => String(v ?? '').trim();
const eanCheck = (d12) => String((10 - (d12.split('').reduce((s, d, i) => s + (+d) * (i % 2 ? 3 : 1), 0) % 10)) % 10);

function readProducts(rows) {
  const found = mapHeaders(rows, PRODUCT_ALIASES, ['name']);
  if (!found) return null;
  const { headerRow, idx } = found;
  const get = (r, f) => idx[f] !== undefined ? clean(r[idx[f]]) : '';
  const items = [];
  rows.slice(headerRow + 1).forEach((r, i) => {
    const name = get(r, 'name');
    if (!name) return;
    items.push({
      row: headerRow + i + 2, name,
      sku: get(r, 'sku'), asin: get(r, 'asin').toUpperCase(),
      barcode: get(r, 'barcode').replace(/\.0+$/, ''),     // Excel بيحوّل الباركود لرقم عشري أحياناً
      buyPrice: idx.buyPrice !== undefined ? num(get(r, 'buyPrice')) : null,
      sellPrice: idx.sellPrice !== undefined ? num(get(r, 'sellPrice')) : null,
      stock: idx.stock !== undefined ? Math.round(num(get(r, 'stock'))) : null,
      minStock: idx.minStock !== undefined && get(r, 'minStock') !== '' ? Math.round(num(get(r, 'minStock'))) : null,
      category: get(r, 'category'), supplier: get(r, 'supplier'), unit: get(r, 'unit'),
      extraSkus: get(r, 'extraSkus').split(/[,،;|\n]+/).map(s => s.trim()).filter(Boolean),
    });
  });
  return { items, columns: Object.keys(idx), headerRow };
}

// معاينة: إيه اللي اتفهم من الملف قبل ما يتسجل
router.post('/products/preview', auth, permit('products'), async (req, res) => {
  const out = readProducts(req.body.rows || []);
  if (!out) return res.status(400).json({ message: 'لم يُعثر على عمود اسم الصنف — يجب أن يتضمن الملف عموداً بعنوان «اسم الصنف» أو «الاسم» أو Name', headers: (req.body.rows?.[0] || []).slice(0, 30) });
  const existing = await Product.find().select('name sku barcode').lean();
  const key = (p) => [p.sku && 's:' + p.sku.toLowerCase(), p.barcode && 'b:' + p.barcode, 'n:' + p.name.trim().toLowerCase()].filter(Boolean);
  const known = new Set(existing.flatMap(key));
  const items = out.items.map(it => ({ ...it, exists: key(it).some(k => known.has(k)) }));
  res.json({ columns: out.columns, headerRow: out.headerRow, items, total: items.length, newCount: items.filter(i => !i.exists).length });
});

router.post('/products/import', auth, permit('products'), async (req, res) => {
  try {
    const out = readProducts(req.body.rows || []);
    if (!out) return res.status(400).json({ message: 'لم يُعثر على عمود اسم الصنف' });
    const cats = new Map((await Category.find().lean()).map(c => [c.name.trim().toLowerCase(), c._id]));
    const sups = new Map((await Supplier.find().lean()).map(s => [s.name.trim().toLowerCase(), s._id]));
    const catId = async (n) => { if (!n) return undefined; const k = n.toLowerCase(); if (!cats.has(k)) cats.set(k, (await Category.create({ name: n }))._id); return cats.get(k); };
    const supId = async (n) => { if (!n) return undefined; const k = n.toLowerCase(); if (!sups.has(k)) sups.set(k, (await Supplier.create({ name: n }))._id); return sups.get(k); };

    // باركود داخلي للي ملهوش
    const lastCodes = await Product.find({ barcode: /^200\d{10}$/ }).select('barcode').lean();
    let maxCode = lastCodes.reduce((m, p) => Math.max(m, parseInt(p.barcode.slice(3, 12))), 0);
    const newBarcode = () => { const d12 = '200' + String(++maxCode).padStart(9, '0'); return d12 + eanCheck(d12); };

    // كل الأصناف مرة واحدة في الذاكرة بدل بحث لكل سطر (الملفات ممكن تبقى آلاف الأصناف)
    const all = await Product.find().lean();
    const bySku = new Map(), byBarcode = new Map(), byName = new Map();
    const index = (p) => { if (p.sku) bySku.set(p.sku, p); if (p.barcode) byBarcode.set(p.barcode, p); byName.set(p.name.trim(), p); };
    all.forEach(index);

    let created = 0, updated = 0;
    const errors = [], ops = [], moves = [], mapOps = [], opRow = [];
    for (const it of out.items) {
      try {
        const p = (it.sku && bySku.get(it.sku)) || (it.barcode && byBarcode.get(it.barcode)) || byName.get(it.name);
        const data = { name: it.name };
        if (it.sku) data.sku = it.sku;
        if (it.asin) data.asin = it.asin;
        if (it.barcode) data.barcode = it.barcode;
        if (it.buyPrice !== null) data.buyPrice = it.buyPrice;
        if (it.sellPrice !== null) data.sellPrice = it.sellPrice;
        if (it.minStock !== null) data.minStock = it.minStock;
        if (it.unit) data.unit = it.unit;
        if (it.category) data.category = await catId(it.category);
        if (it.supplier) data.supplier = await supId(it.supplier);
        const before = p ? p.stock : 0;
        if (it.stock !== null) data.stock = it.stock;
        let id;
        if (p) {
          id = p._id;
          ops.push({ updateOne: { filter: { _id: id }, update: { $set: data } } }); updated++;
          Object.assign(p, data); index(p);
        } else {
          const doc = new Product({ buyPrice: 0, sellPrice: 0, stock: 0, ...data });
          if (!doc.barcode) doc.barcode = newBarcode();
          id = doc._id;
          ops.push({ insertOne: { document: doc.toObject() } }); created++;
          index(doc.toObject());
        }
        opRow.push(it);
        if (it.stock !== null && it.stock !== before)
          moves.push({ product: id, type: 'adjust', qty: Math.abs(it.stock - before), before, after: it.stock, reason: 'رصيد افتتاحي (استيراد)', reference: 'IMPORT', createdBy: req.user._id });
        for (const sku of it.extraSkus) mapOps.push({ updateOne: { filter: { sku }, update: { $set: { sku, product: id } }, upsert: true } });
      } catch (e) { errors.push({ row: it.row, name: it.name, message: e.message }); }
    }
    // التسجيل على دفعات — سطر فيه مشكلة ما يوقفش الباقي
    for (let i = 0; i < ops.length; i += 500) {
      try { await Product.bulkWrite(ops.slice(i, i + 500), { ordered: false }); }
      catch (e) {
        for (const we of e.writeErrors || []) {
          const it = opRow[i + we.index];
          if (ops[i + we.index].insertOne) created--; else updated--;
          errors.push({ row: it?.row, name: it?.name, message: we.code === 11000 ? 'رمز SKU أو الباركود مستخدم لصنف آخر' : (we.errmsg || 'خطأ') });
        }
        if (!e.writeErrors) throw e;
      }
    }
    for (let i = 0; i < moves.length; i += 1000) await StockMovement.insertMany(moves.slice(i, i + 1000));
    let mapped = 0;
    for (let i = 0; i < mapOps.length; i += 1000) { await AmazonSkuMap.bulkWrite(mapOps.slice(i, i + 1000), { ordered: false }); mapped += Math.min(1000, mapOps.length - i); }
    res.json({ message: `تمت إضافة ${created} صنف وتحديث ${updated}${mapped ? ` وربط ${mapped} رمز SKU` : ''}${errors.length ? ` — ${errors.length} سطر يحتوي على أخطاء` : ''}`, created, updated, mapped, errors });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
