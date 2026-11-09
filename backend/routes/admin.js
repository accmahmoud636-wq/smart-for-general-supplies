// ═══════════════════════════════════════════════════════════════
// إدارة البيانات: تصفير + استيراد الأصناف من Excel/CSV
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, Category, Supplier, StockMovement } = require('../models/index');
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
    if (req.body.confirm !== 'امسح') return res.status(400).json({ message: 'اكتب كلمة «امسح» للتأكيد' });
    const scopes = (req.body.scopes || []).filter(k => SCOPES[k]);
    if (!scopes.length) return res.status(400).json({ message: 'اختار حاجة تتمسح' });
    const done = {};
    for (const k of scopes) {
      let n = 0;
      for (const m of SCOPES[k].models) n += (await m.deleteMany({})).deletedCount || 0;
      done[k] = n;
    }
    res.json({ message: '✅ اتمسح: ' + scopes.map(k => `${SCOPES[k].label} (${done[k]})`).join('، '), done });
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
  return { items, columns: Object.keys(idx) };
}

// معاينة: إيه اللي اتفهم من الملف قبل ما يتسجل
router.post('/products/preview', auth, permit('products'), async (req, res) => {
  const out = readProducts(req.body.rows || []);
  if (!out) return res.status(400).json({ message: 'مش لاقي عمود اسم الصنف — لازم يبقى فيه عمود اسمه «الاسم» أو «اسم الصنف» أو Name', headers: (req.body.rows?.[0] || []).slice(0, 30) });
  const existing = await Product.find().select('name sku barcode').lean();
  const key = (p) => [p.sku && 's:' + p.sku.toLowerCase(), p.barcode && 'b:' + p.barcode, 'n:' + p.name.trim().toLowerCase()].filter(Boolean);
  const known = new Set(existing.flatMap(key));
  const items = out.items.map(it => ({ ...it, exists: key(it).some(k => known.has(k)) }));
  res.json({ columns: out.columns, items, total: items.length, newCount: items.filter(i => !i.exists).length });
});

router.post('/products/import', auth, permit('products'), async (req, res) => {
  try {
    const out = readProducts(req.body.rows || []);
    if (!out) return res.status(400).json({ message: 'مش لاقي عمود اسم الصنف' });
    const cats = new Map((await Category.find().lean()).map(c => [c.name.trim().toLowerCase(), c._id]));
    const sups = new Map((await Supplier.find().lean()).map(s => [s.name.trim().toLowerCase(), s._id]));
    const catId = async (n) => { if (!n) return undefined; const k = n.toLowerCase(); if (!cats.has(k)) cats.set(k, (await Category.create({ name: n }))._id); return cats.get(k); };
    const supId = async (n) => { if (!n) return undefined; const k = n.toLowerCase(); if (!sups.has(k)) sups.set(k, (await Supplier.create({ name: n }))._id); return sups.get(k); };

    // باركود داخلي للي ملهوش
    const lastCodes = await Product.find({ barcode: /^200\d{10}$/ }).select('barcode').lean();
    let maxCode = lastCodes.reduce((m, p) => Math.max(m, parseInt(p.barcode.slice(3, 12))), 0);
    const newBarcode = () => { const d12 = '200' + String(++maxCode).padStart(9, '0'); return d12 + eanCheck(d12); };

    let created = 0, updated = 0, mapped = 0;
    const errors = [];
    for (const it of out.items) {
      try {
        let p = (it.sku && await Product.findOne({ sku: it.sku })) || (it.barcode && await Product.findOne({ barcode: it.barcode }))
          || await Product.findOne({ name: it.name });
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
        if (p) { Object.assign(p, data); updated++; }
        else { p = new Product({ buyPrice: 0, sellPrice: 0, stock: 0, ...data }); if (!p.barcode) p.barcode = newBarcode(); created++; }
        if (it.stock !== null) p.stock = it.stock;
        await p.save();
        if (it.stock !== null && it.stock !== before)
          await StockMovement.create({ product: p._id, type: 'adjust', qty: Math.abs(it.stock - before), before, after: it.stock, reason: 'رصيد افتتاحي (استيراد)', reference: 'IMPORT', createdBy: req.user._id });
        for (const sku of it.extraSkus) {
          await AmazonSkuMap.findOneAndUpdate({ sku }, { sku, product: p._id }, { upsert: true });
          mapped++;
        }
      } catch (e) { errors.push({ row: it.row, name: it.name, message: e.code === 11000 ? 'SKU أو باركود مكرر مع صنف تاني' : e.message }); }
    }
    res.json({ message: `✅ ${created} صنف جديد، ${updated} اتحدّث${mapped ? `، ${mapped} SKU أمازون اتربط` : ''}${errors.length ? ` — ${errors.length} سطر فيه مشكلة` : ''}`, created, updated, mapped, errors });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
