const router = require('express').Router();
const { Sale, Product, StockMovement, Customer } = require('../models/index');
const { auth, permit } = require('../middleware/auth');

async function nextInvoiceNo() {
  const last = await Sale.findOne({ invoiceNo: /^SO-/ }).sort('-invoiceNo');
  const num = last ? parseInt(last.invoiceNo.replace('SO-','')) + 1 : 1;
  return 'SO-' + String(num).padStart(5,'0');
}

router.get('/', auth, permit('sales','sales:read'), async (req, res) => {
  try {
    const { status, platform, from, to } = req.query;
    let q = {};
    if (status) q.status = status;
    if (platform) q.platform = platform;
    if (from || to) q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to) q.date.$lte = new Date(to);
    const sales = await Sale.find(q).populate('customer','name').populate('items.product','name sku').sort('-date');
    res.json(sales);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

router.get('/:id', auth, permit('sales','sales:read'), async (req, res) => {
  try {
    const s = await Sale.findById(req.params.id).populate('customer').populate('items.product').populate('createdBy','name');
    res.json(s);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

router.post('/', auth, permit('sales'), async (req, res) => {
  try {
    const invoiceNo = await nextInvoiceNo();
    // Snapshot cost prices
    const items = [];
    for (const item of req.body.items) {
      const prod = await Product.findById(item.product);
      items.push({ ...item, cost: prod.buyPrice });
    }
    const sale = await Sale.create({ ...req.body, items, invoiceNo, createdBy: req.user._id });

    // Deduct stock
    for (const item of sale.items) {
      const prod = await Product.findById(item.product);
      const before = prod.stock;
      prod.stock -= item.qty;
      await prod.save();
      await StockMovement.create({ product: item.product, type: 'out', qty: item.qty, before, after: prod.stock, reason: 'فاتورة مبيعات', reference: invoiceNo, createdBy: req.user._id });
    }
    res.status(201).json(sale);
  } catch(e){ res.status(400).json({ message: e.message }); }
});

router.put('/:id', auth, permit('sales'), async (req, res) => {
  try {
    const s = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(s);
  } catch(e){ res.status(400).json({ message: e.message }); }
});

module.exports = router;
