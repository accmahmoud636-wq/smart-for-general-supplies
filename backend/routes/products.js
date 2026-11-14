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
  const code = require('../utils/kbd').fixLayout(req.params.code);   // لو الكيبورد عربي وقت المسح
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = new RegExp('^' + esc + '$', 'i');
  const p = await Product.findOne({ active: { $ne: false }, $or: [{ barcode: code }, { sku: exact }, { asin: exact }] }).lean();
  if (!p) {
    // يمكن يكون SKU إعلان أمازون مربوط بالصنف
    const { AmazonSkuMap } = require('../models/amazon');
    const m = await AmazonSkuMap.findOne({ sku: exact }).lean();
    const mp = m && await Product.findOne({ _id: m.product, active: { $ne: false } }).lean();
    if (mp) {
      // مسح ملصق إعلان باكدج/طقم = كل مكوّن بكميته
      const comps = (m.components || []).length ? await Product.find({ _id: { $in: m.components.map(c => c.product) } }).select('name barcode stock').lean() : [];
      const parts = [{ _id: mp._id, name: mp.name, barcode: mp.barcode, stock: mp.stock, qty: m.qty || 1 },
        ...(m.components || []).map(c => { const x = comps.find(p => String(p._id) === String(c.product)); return x && { _id: x._id, name: x.name, barcode: x.barcode, stock: x.stock, qty: c.qty || 1 }; }).filter(Boolean)];
      return res.json({ ...mp, packQty: m.qty || 1, packSku: m.sku, parts });
    }
    return res.status(404).json({ message: 'باركود غير مسجل: ' + code });
  }
  res.json((await withKitStock([p]))[0]);
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
  const result = await withKitStock(lowStock === 'true' ? products.filter(p => p.stock <= p.minStock) : products);
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

// الصنف المركب: مكونات صالحة (لحد 6، من غير تكرار، ومن غير الصنف نفسه أو أطقم جوه أطقم)
async function cleanKit(body, selfId) {
  if (body.isKit === undefined && body.components === undefined) return null;
  if (!body.isKit) { body.isKit = false; body.components = []; return null; }
  const seen = new Set();
  const comps = (Array.isArray(body.components) ? body.components : [])
    .map(c => ({ product: String(c.product?._id || c.product || ''), qty: Math.max(1, Math.round(+c.qty || 1)) }))
    .filter(c => c.product && c.product !== String(selfId || '') && !seen.has(c.product) && seen.add(c.product));
  if (!comps.length) return 'اختر مكونات الصنف المركب (قطعة واحدة على الأقل)';
  if (comps.length > 6) return 'الحد الأقصى 6 مكونات للصنف المركب';
  const found = await Product.find({ _id: { $in: comps.map(c => c.product) } }).select('isKit').lean();
  if (found.length !== comps.length) return 'أحد المكونات غير موجود';
  if (found.some(p => p.isKit)) return 'لا يمكن إضافة صنف مركب داخل صنف مركب';
  body.components = comps; body.stock = 0;            // الرصيد بيتحسب من المكونات
  return null;
}
// رصيد الصنف المركب المتاح = أقل (رصيد المكوّن ÷ كميته)
async function withKitStock(list) {
  const kits = list.filter(p => p.isKit && p.components?.length);
  if (!kits.length) return list;
  const ids = [...new Set(kits.flatMap(k => k.components.map(c => String(c.product?._id || c.product))))];
  const comps = new Map((await Product.find({ _id: { $in: ids } }).select('name stock buyPrice').lean()).map(p => [String(p._id), p]));
  return list.map(p => {
    if (!p.isKit) return p;
    const o = p.toObject ? p.toObject() : { ...p };
    const parts = (o.components || []).map(c => ({ ...c, item: comps.get(String(c.product?._id || c.product)) })).filter(c => c.item);
    o.stock = parts.length ? Math.max(0, Math.min(...parts.map(c => Math.floor(c.item.stock / c.qty)))) : 0;
    o.kitCost = parts.reduce((t, c) => t + (c.item.buyPrice || 0) * c.qty, 0);
    o.components = parts.map(c => ({ product: String(c.item._id), name: c.item.name, stock: c.item.stock, qty: c.qty }));
    return o;
  });
}

// الفئة والمورد اختياريين: الخانة الفاضية تتحفظ «بدون» بدل ما تعمل خطأ
const cleanRefs = (body, unset) => {
  for (const k of ['category', 'supplier']) {
    if (body[k] === '' || body[k] === null || (typeof body[k] === 'object' && body[k] && !body[k]._id)) { delete body[k]; if (unset) (unset.$unset ||= {})[k] = 1; }
    else if (body[k] && typeof body[k] === 'object') body[k] = body[k]._id;
  }
  return body;
};

prodRouter.post('/', auth, permit('products'), async (req, res) => {
  try {
    const body = cleanRefs({ ...req.body, barcode: String(req.body.barcode || '').trim() });
    const kitErr = await cleanKit(body);
    if (kitErr) return res.status(400).json({ message: kitErr });
    if (!body.barcode) body.barcode = (await nextBarcodes(1))[0];          // باركود تلقائي
    else if (await barcodeTaken(body.barcode)) return res.status(400).json({ message: 'الباركود مستخدم لصنف آخر' });
    res.status(201).json(await Product.create(body));
  }
  catch(e){ res.status(400).json({ message: e.message }); }
});

prodRouter.put('/:id', auth, permit('products'), async (req, res) => {
  try {
    const unset = {};
    const body = cleanRefs({ ...req.body }, unset);
    delete body._id; delete body.createdAt; delete body.updatedAt; delete body.__v; delete body.kitCost;
    const kitErr = await cleanKit(body, req.params.id);
    if (kitErr) return res.status(400).json({ message: kitErr });
    if (body.isKit === undefined && (await Product.exists({ _id: req.params.id, isKit: true }))) delete body.stock;   // رصيد الطقم مايتعدلش يدوي
    if (body.barcode !== undefined) {
      body.barcode = String(body.barcode || '').trim();
      if (await barcodeTaken(body.barcode, req.params.id)) return res.status(400).json({ message: 'الباركود مستخدم لصنف آخر' });
    }
    res.json(await Product.findByIdAndUpdate(req.params.id, { ...body, ...unset }, { new: true }));
  } catch(e){ res.status(400).json({ message: e.message }); }
});

prodRouter.delete('/:id', auth, permit('products'), async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { active: false });
  // رموز SKU بتاعته تتحرر عشان تتربط بصنف تاني من غير «مرتبط بصنف آخر»
  const { AmazonSkuMap } = require('../models/amazon');
  const r = await AmazonSkuMap.deleteMany({ product: req.params.id });
  res.json({ message: 'تمت الأرشفة' + (r.deletedCount ? ` وفك ربط ${r.deletedCount} رمز SKU` : '') });
});

// Stock adjustment
prodRouter.post('/:id/adjust', auth, permit('stock'), async (req, res) => {
  try {
    const { qty, reason } = req.body;
    const product = await Product.findById(req.params.id);
    if (product?.isKit) return res.status(400).json({ message: 'رصيد الصنف المركب بيتحسب من مكوناته — سوّي رصيد المكونات' });
    const before = product.stock;
    const after = before + qty;
    product.stock = after;
    await product.save();
    await StockMovement.create({ product: product._id, type: qty > 0 ? 'in' : 'out', qty: Math.abs(qty), before, after, reason: reason || 'تسوية يدوية', createdBy: req.user._id });
    res.json({ message: 'تمت التسوية', stock: after });
  } catch(e){ res.status(400).json({ message: e.message }); }
});

module.exports = { prodRouter, catRouter, supRouter, custRouter };
