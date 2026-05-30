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

custRouter.get('/', auth, async (req, res) => {
  const custs = await Customer.find().sort('-createdAt');
  res.json(custs);
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
  try { res.status(201).json(await Product.create(req.body)); }
  catch(e){ res.status(400).json({ message: e.message }); }
});

prodRouter.put('/:id', auth, permit('products'), async (req, res) => {
  res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});

prodRouter.delete('/:id', auth, permit('products'), async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { active: false });
  res.json({ message: 'تم الأرشفة' });
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
    res.json({ message: 'تم التسوية', stock: after });
  } catch(e){ res.status(400).json({ message: e.message }); }
});

module.exports = { prodRouter, catRouter, supRouter, custRouter };
