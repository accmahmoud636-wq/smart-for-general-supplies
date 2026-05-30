const router = require('express').Router();
const { Purchase, Product, StockMovement, Supplier } = require('../models/index');
const { auth, permit } = require('../middleware/auth');

// Auto invoice number
async function nextInvoiceNo(prefix) {
  const last = await Purchase.findOne({ invoiceNo: new RegExp(`^${prefix}`) }).sort('-invoiceNo');
  const num = last ? parseInt(last.invoiceNo.replace(prefix,'')) + 1 : 1;
  return prefix + String(num).padStart(5,'0');
}

// GET all purchases
router.get('/', auth, permit('purchases','purchases:read'), async (req, res) => {
  try {
    const { status, supplier, from, to } = req.query;
    let q = {};
    if (status) q.status = status;
    if (supplier) q.supplier = supplier;
    if (from || to) q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to) q.date.$lte = new Date(to);
    const purchases = await Purchase.find(q).populate('supplier','name').populate('items.product','name sku').sort('-date');
    res.json(purchases);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

// GET single
router.get('/:id', auth, permit('purchases','purchases:read'), async (req, res) => {
  try {
    const p = await Purchase.findById(req.params.id).populate('supplier').populate('items.product').populate('createdBy','name');
    res.json(p);
  } catch(e){ res.status(500).json({ message: e.message }); }
});

// POST create purchase
router.post('/', auth, permit('purchases'), async (req, res) => {
  try {
    const invoiceNo = await nextInvoiceNo('PO-');
    const purchase = await Purchase.create({ ...req.body, invoiceNo, createdBy: req.user._id });

    // Update stock and supplier balance
    for (const item of purchase.items) {
      const prod = await Product.findById(item.product);
      const before = prod.stock;
      prod.stock += item.qty;
      await prod.save();
      await StockMovement.create({ product: item.product, type: 'in', qty: item.qty, before, after: prod.stock, reason: 'فاتورة شراء', reference: invoiceNo, createdBy: req.user._id });
    }
    if (purchase.total > purchase.paid) {
      await Supplier.findByIdAndUpdate(purchase.supplier, { $inc: { balance: purchase.total - purchase.paid } });
    }
    res.status(201).json(purchase);
  } catch(e){ res.status(400).json({ message: e.message }); }
});

// PUT update status/payment
router.put('/:id', auth, permit('purchases'), async (req, res) => {
  try {
    const p = await Purchase.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(p);
  } catch(e){ res.status(400).json({ message: e.message }); }
});

module.exports = router;
