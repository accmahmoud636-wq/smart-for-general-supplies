// ═══ EXPENSES ═══════════════════════════════════════════════
const expRouter = require('express').Router();
const { Expense, StockMovement, Product, Sale, Purchase } = require('../models/index');
const { auth, permit } = require('../middleware/auth');

expRouter.get('/', auth, permit('expenses','expenses:read'), async (req, res) => {
  try {
    const { from, to, category } = req.query;
    let q = {};
    if (category) q.category = category;
    if (from || to) { q.date = {}; if (from) q.date.$gte = new Date(from); if (to) q.date.$lte = new Date(to); }
    const exps = await Expense.find(q).populate('createdBy','name').sort('-date');
    res.json(exps);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

expRouter.post('/', auth, permit('expenses'), async (req, res) => {
  try { res.status(201).json(await Expense.create({ ...req.body, createdBy: req.user._id })); }
  catch(e){ res.status(400).json({ message: e.message }); }
});

expRouter.put('/:id', auth, permit('expenses'), async (req, res) => {
  res.json(await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true }));
});

expRouter.delete('/:id', auth, permit('expenses'), async (req, res) => {
  await Expense.findByIdAndDelete(req.params.id);
  res.json({ message: 'تم الحذف' });
});

// ═══ STOCK ════════════════════════════════════════════════════
const stockRouter = require('express').Router();

stockRouter.get('/', auth, async (req, res) => {
  try {
    const { product, type } = req.query;
    let q = {};
    if (product) q.product = product;
    if (type) q.type = type;
    const movements = await StockMovement.find(q).populate('product','name sku').populate('createdBy','name').sort('-createdAt').limit(500);
    res.json(movements);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

// ═══ REPORTS ══════════════════════════════════════════════════
const reportsRouter = require('express').Router();

reportsRouter.get('/dashboard', auth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalProducts, lowStockProducts, monthSales, monthPurchases, monthExpenses, totalSales, totalPurchases] = await Promise.all([
      Product.countDocuments({ active: true }),
      Product.find({ active: true }).then(ps => ps.filter(p => p.stock <= p.minStock).length),
      Sale.find({ date: { $gte: startOfMonth }, status: { $ne: 'cancelled' } }),
      Purchase.find({ date: { $gte: startOfMonth } }),
      Expense.find({ date: { $gte: startOfMonth } }),
      Sale.find({ status: { $ne: 'cancelled' } }),
      Purchase.find()
    ]);

    const monthRevenue = monthSales.reduce((s, inv) => s + inv.total, 0);
    const monthCOGS = monthSales.reduce((s, inv) => s + inv.items.reduce((ss, item) => ss + (item.cost * item.qty), 0), 0);
    const monthExpTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const monthProfit = monthRevenue - monthCOGS - monthExpTotal;

    // Inventory value
    const products = await Product.find({ active: true });
    const inventoryValue = products.reduce((s, p) => s + p.stock * p.buyPrice, 0);

    // Last 6 months sales chart
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const sales = await Sale.find({ date: { $gte: d, $lte: end }, status: { $ne: 'cancelled' } });
      const exps = await Expense.find({ date: { $gte: d, $lte: end } });
      chartData.push({
        month: d.toLocaleString('ar-EG', { month: 'short', year: '2-digit' }),
        revenue: sales.reduce((s, inv) => s + inv.total, 0),
        expenses: exps.reduce((s, e) => s + e.amount, 0)
      });
    }

    res.json({ totalProducts, lowStockProducts, monthRevenue, monthProfit, monthExpTotal, inventoryValue, chartData });
  } catch(e){ res.status(500).json({ message: e.message }); }
});

reportsRouter.get('/profit-loss', auth, permit('reports'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const q = {};
    if (from || to) { q.date = {}; if (from) q.date.$gte = new Date(from); if (to) q.date.$lte = new Date(to); }
    const sales = await Sale.find({ ...q, status: { $ne: 'cancelled' } });
    const expenses = await Expense.find(q);
    const revenue = sales.reduce((s, inv) => s + inv.total, 0);
    const cogs = sales.reduce((s, inv) => s + inv.items.reduce((ss, i) => ss + i.cost * i.qty, 0), 0);
    const grossProfit = revenue - cogs;
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;
    const amazonFees = sales.reduce((s, inv) => s + (inv.amazonFees || 0), 0);
    res.json({ revenue, cogs, grossProfit, totalExpenses, amazonFees, netProfit, salesCount: sales.length });
  } catch(e){ res.status(500).json({ message: e.message }); }
});

reportsRouter.get('/inventory', auth, async (req, res) => {
  try {
    const products = await Product.find({ active: true }).populate('category','name').populate('supplier','name');
    const data = products.map(p => ({
      _id: p._id, name: p.name, sku: p.sku, stock: p.stock,
      buyPrice: p.buyPrice, sellPrice: p.sellPrice,
      value: p.stock * p.buyPrice, minStock: p.minStock, lowStock: p.stock <= p.minStock,
      category: p.category?.name, supplier: p.supplier?.name
    }));
    const totalValue = data.reduce((s, p) => s + p.value, 0);
    res.json({ products: data, totalValue, lowStockCount: data.filter(p => p.lowStock).length });
  } catch(e){ res.status(500).json({ message: e.message }); }
});

reportsRouter.get('/top-products', auth, async (req, res) => {
  try {
    const sales = await Sale.find({ status: { $ne: 'cancelled' } }).populate('items.product','name');
    const map = {};
    sales.forEach(s => s.items.forEach(item => {
      const id = item.product?._id?.toString();
      if (!id) return;
      if (!map[id]) map[id] = { name: item.product.name, qty: 0, revenue: 0, profit: 0 };
      map[id].qty += item.qty;
      map[id].revenue += item.total;
      map[id].profit += (item.price - item.cost) * item.qty;
    }));
    const top = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    res.json(top);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

module.exports = { expRouter, stockRouter, reportsRouter };
