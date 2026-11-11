const router = require('express').Router();
const { Product, Category, Supplier, Customer, StockMovement } = require('../models/index');
const { auth, permit } = require('../middleware/auth');

// ═══════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════
const catRouter = require('express').Router();

catRouter.get('/', auth, async (req, res) => {
  const cats = await Category.find().sort('name');
  res.json(cats);
});
catRouter.post('/', auth, permit('categories'), async (req, res) => {
  try { res.status(201).json(await Category.create(req.body)); }
  catch(e){ res.status(400).json({ message: e.message }); }
});
catRouter.put('/:id', auth, permit('categories'), async (req, res) => {
  res.json(await Category.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
catRouter.delete('/:id', auth, permit('categories'), async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ message: 'تم الحذف' });
});

// ═══════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════
const supRouter = require('express').Router();

supRouter.get('/', auth, async (req, res) => {
  const sups = await Supplier.find().sort('name');
  res.json(sups);
});
supRouter.post('/', auth, permit('suppliers'), async (req, res) => {
  try { res.status(201).json(await Supplier.create(req.body)); }
  catch(e){ res.status(400).json({ message: e.message }); }
});
supRouter.put('/:id', auth, permit('suppliers'), async (req, res) => {
  res.json(await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
supRouter.delete('/:id', auth, permit('suppliers'), async (req, res) => {
  await Supplier.findByIdAndDelete(req.params.id);
  res.json({ message: 'تم الحذف' });
});

// ═══════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════
const custRouter = require('express').Router();

// العملاء الأساسيين (منصات البيع) بيتضافوا مرة واحدة — ولو اتحذفوا بعد كده مايرجعوش
const DEFAULT_CUSTOMERS = [['أمازون', 'amazon'], ['نون', 'noon'], ['جوميا', 'jumia']];
let seeded = false;
async function seedCustomers() {
  if (seeded) return;
  const Setting = require('../models/Setting');
  if (!(await Setting.findOne({ key: 'customers_seeded' }).lean())) {
    for (const [name, platform] of DEFAULT_CUSTOMERS)
      if (!(await Customer.findOne({ $or: [{ platform }, { name }] }).lean())) await Customer.create({ name, platform });
    await Setting.findOneAndUpdate({ key: 'customers_seeded' }, { key: 'customers_seeded', value: true }, { upsert: true });
  }
  seeded = true;
}
const PLATFORM_ORDER = { amazon: 0, noon: 1, jumia: 2, other: 3 };

custRouter.get('/', auth, async (req, res) => {
  await seedCustomers();
  const custs = await Customer.find().lean();
  res.json(custs.sort((a, b) => (PLATFORM_ORDER[a.platform] ?? 3) - (PLATFORM_ORDER[b.platform] ?? 3) || String(a.createdAt).localeCompare(String(b.createdAt))));
});
custRouter.post('/', auth, permit('customers'), async (req, res) => {
  try { res.status(201).json(await Customer.create(req.body)); }
  catch(e){ res.status(400).json({ message: e.message }); }
});
custRouter.put('/:id', auth, permit('customers'), async (req, res) => {
  res.json(await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});
custRouter.delete('/:id', auth, permit('customers'), async (req, res) => {
  await Customer.findByIdAndDelete(req.params.id);
  res.json({ message: 'تم الحذف' });
});

// ═══════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════
const prodRouter = require('express').Router();

// ─── الباركود ────────────────────────────────────────────────
// باركود داخلي EAN-13 يبدأ بـ 200 (نطاق مخصص للاستخدام الداخلي في المحلات)
const eanCheck = (d12) => {
  const sum = d12.split('').reduce((s, d, i) => s + (+d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
};
async function nextBarcodes(count) {
  const last = await Product.find({ barcode: /^200\d{10}$/ }).select('barcode').lean();
  let max = last.reduce((m, p) => Math.max(m, parseInt(p.barcode.slice(3, 12))), 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const d12 = '200' + String(++max).padStart(9, '0');
    out.push(d12 + eanCheck(d12));
  }
  return out;
}
async function barcodeTaken(code, exceptId) {
  if (!code) return false;
  const q = { barcode: code };
  if (exceptId) q._id = { $ne: exceptId };
  return !!(await Product.exists(q));
}

// بحث بالباركود (أو SKU / ASIN) — للاسكانر
prodRouter.get('/barcode/:code', auth, async (req, res) => {
  const code = String(req.params.code).trim();
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = new RegExp('^' + esc + '$', 'i');
  const p = await Product.findOne({ active: { $ne: false }, $or: [{ barcode: code }, { sku: exact }, { asin: exact }] }).lean();
  if (!p) {
    // يمكن يكون SKU إعلان أمازون مربوط بالصنف
    const { AmazonSkuMap } = require('../models/amazon');
    const m = await AmazonSkuMap.findOne({ sku: exact }).lean();
    const mp = m && await Product.findOne({ _id: m.product, active: { $ne: false } }).lean();
    if (mp) return res.json(mp);
    return res.status(404).json({ message: 'باركود غير مسجل: ' + code });
  }
  res.json(p);
});

// توليد باركود لكل المنتجات اللي ملهاش
prodRouter.post('/barcodes/generate', auth, permit('products'), async (req, res) => {
  try {
    const missing = await Product.find({ $or: [{ barcode: '' }, { barcode: null }, { barcode: { $exists: false } }] }).sort('createdAt');
    const codes = await nextBarcodes(missing.length);
    for (let i = 0; i < missing.length; i++) { missing[i].barcode = codes[i]; await missing[i].save(); }
    res.json({ message: `تم توليد ${missing.length} باركود`, count: missing.length });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

prodRouter.get('/barcodes/new', auth, async (req, res) => {
  res.json({ barcode: (await nextBarcodes(1))[0] });
});

prodRouter.get('/', auth, async (req, res) => {
  const { search, category, lowStock } = req.query;
  let q = {};
  if (search) q.$or = [{ name: new RegExp(search,'i') }, { sku: new RegExp(search,'i') }, { asin: new RegExp(search,'i') }];
  if (category) q.category = category;
  let query = Product.find(q).populate('category','name color').populate('supplier','name');
  if (lowStock === 'true') query = query.where('stock').lte(mongoose.Types.Decimal128.fromString('0') || 0);
  const products = await Product.find(q).populate('category','name color').populate('supplier','name').sort('-createdAt');
  const result = lowStock === 'true' ? products.filter(p => p.stock <= p.minStock) : products;
  res.json(result);
});

prodRouter.get('/low-stock', auth, async (req, res) => {
  const products = await Product.find({ active: true }).populate('category','name');
  res.json(products.filter(p => p.stock <= p.minStock));
});

prodRouter.get('/:id', auth, async (req, res) => {
  const p = await Product.findById(req.params.id).populate('category').populate('supplier');
  res.json(p);
});

prodRouter.post('/', auth, permit('products'), async (req, res) => {
  try {
    const body = { ...req.body, barcode: String(req.body.barcode || '').trim() };
    if (!body.barcode) body.barcode = (await nextBarcodes(1))[0];          // باركود تلقائي
    else if (await barcodeTaken(body.barcode)) return res.status(400).json({ message: 'الباركود مستخدم لصنف آخر' });
    res.status(201).json(await Product.create(body));
  }
  catch(e){ res.status(400).json({ message: e.message }); }
});

prodRouter.put('/:id', auth, permit('products'), async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.barcode !== undefined) {
      body.barcode = String(body.barcode || '').trim();
      if (await barcodeTaken(body.barcode, req.params.id)) return res.status(400).json({ message: 'الباركود مستخدم لصنف آخر' });
    }
    res.json(await Product.findByIdAndUpdate(req.params.id, body, { new: true }));
  } catch(e){ res.status(400).json({ message: e.message }); }
});

prodRouter.delete('/:id', auth, permit('products'), async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ message: 'تمت الأرشفة' });
});

// Stock adjustment
prodRouter.post('/:id/adjust', auth, permit('stock'), async (req, res) => {
  try {
    const { qty, reason } = req.body;
    const product = await Product.findById(req.params.id);
    const before = product.stock;
    const after = before + qty;
    product.stock = after;
    await product.save();
    await StockMovement.create({ product: product._id, type: qty > 0 ? 'in' : 'out', qty: Math.abs(qty), before, after, reason: reason || 'تسوية يدوية', createdBy: req.user._id });
    res.json({ message: 'تمت التسوية', stock: after });
  } catch(e){ res.status(400).json({ message: e.message }); }
});

module.exports = { prodRouter, catRouter, supRouter, custRouter };
