// ═══════════════════════════════════════════════════════════════
// خروج البضاعة بالاسكانر — طلب أمازون أو صرف يدوي
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, StockMovement } = require('../models/index');
const { AmazonOrder } = require('../models/amazon');
const { auth, permit } = require('../middleware/auth');
const { postOrderGroup, buildResolver } = require('./amazon');

// تحميل طلب أمازون عشان نطابق عليه
router.get('/order/:orderId', auth, permit('amazon', 'stock'), async (req, res) => {
  try {
    const orderId = String(req.params.orderId).trim();
    const lines = await AmazonOrder.find({ orderId }).lean();
    if (!lines.length) return res.status(404).json({ message: 'الطلب غير موجود — يُرجى رفع تقرير الطلبات أولاً: ' + orderId });
    const { resolve } = await buildResolver();
    res.json({
      orderId,
      posted: lines.some(l => l.sale),
      stage: lines[0].stage,
      lines: lines.map(l => {
        const p = resolve(l.sku, l.asin);
        return { _id: l._id, sku: l.sku, qty: l.qty, name: l.productName, stage: l.stage,
          product: p ? { _id: p._id, name: p.name, stock: p.stock } : null };
      })
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// تأكيد خروج طلب أمازون: لازم الممسوح = المطلوب بالظبط
router.post('/issue/amazon', auth, permit('amazon', 'stock'), async (req, res) => {
  try {
    const { orderId, scanned = {} } = req.body;      // scanned: { productId: qty }
    const lines = await AmazonOrder.find({ orderId });
    if (!lines.length) return res.status(404).json({ message: 'الطلب غير موجود' });
    if (lines.some(l => l.sale)) return res.status(400).json({ message: 'تم إخراج هذا الطلب مسبقاً' });
    const active = lines.filter(l => l.stage !== 'cancelled');
    if (!active.length) return res.status(400).json({ message: 'الطلب ملغي' });

    const { resolve } = await buildResolver();
    const need = {};
    for (const l of active) {
      const p = resolve(l.sku, l.asin);
      if (!p) return res.status(400).json({ message: 'SKU غير مربوط بمنتج: ' + l.sku });
      need[p._id] = (need[p._id] || 0) + l.qty;
    }
    const ids = new Set([...Object.keys(need), ...Object.keys(scanned)]);
    const wrong = [...ids].filter(id => (need[id] || 0) !== (+scanned[id] || 0));
    if (wrong.length) return res.status(400).json({ message: 'الأصناف الممسوحة غير مطابقة للطلب', wrong });

    for (const l of active) if (l.stage === 'new' || l.stage === 'packed') l.stage = 'shipped';
    const r = await postOrderGroup(orderId, active, resolve, req.user._id);
    if (r.reason) return res.status(400).json({ message: r.reason });
    res.json({ message: `✅ خرج الطلب — فاتورة ${r.sale.invoiceNo}`, invoiceNo: r.sale.invoiceNo });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// طلب أمازون مش موجود في التقرير: يتسجل من الأصناف الممسوحة ويطلع فاتورة
router.post('/issue/amazon-new', auth, permit('amazon', 'stock'), async (req, res) => {
  try {
    const orderId = String(req.body.orderId || '').trim();
    const { scanned = {}, prices = {} } = req.body;     // { productId: qty }, { productId: unitPrice }
    if (!orderId) return res.status(400).json({ message: 'رقم الطلب مطلوب' });
    if (await AmazonOrder.exists({ orderId })) return res.status(400).json({ message: 'الطلب موجود بالفعل — يُرجى مسحه مرة أخرى من البداية' });
    const ids = Object.keys(scanned).filter(id => +scanned[id] > 0);
    if (!ids.length) return res.status(400).json({ message: 'يُرجى مسح الأصناف أولاً' });
    const prods = await Product.find({ _id: { $in: ids } }).lean();
    const lines = [];
    for (const p of prods) {
      const qty = +scanned[p._id];
      const unit = prices[p._id] !== undefined && prices[p._id] !== '' ? +prices[p._id] : (p.sellPrice || 0);
      lines.push(await AmazonOrder.create({
        orderId, sku: p.sku || p.barcode || String(p._id), productName: p.name, qty,
        itemPrice: Math.round(unit * qty * 100) / 100, purchaseDate: new Date(),
        amazonStatus: 'يدوي', stage: 'shipped', product: p._id, manual: true
      }));
    }
    const { resolve } = await buildResolver();
    const r = await postOrderGroup(orderId, lines, resolve, req.user._id);
    if (r.reason) { await AmazonOrder.deleteMany({ _id: { $in: lines.map(l => l._id) } }); return res.status(400).json({ message: r.reason }); }
    res.json({ message: `✅ خرج الطلب — فاتورة ${r.sale.invoiceNo}`, invoiceNo: r.sale.invoiceNo });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// صرف يدوي (بيع مباشر / تالف / عينة ...) — يخصم المخزون ويسجل الحركة
router.post('/issue/manual', auth, permit('stock', 'amazon'), async (req, res) => {
  try {
    const { items = [], reason = 'صرف بالاسكانر' } = req.body;   // [{ product, qty }]
    if (!items.length) return res.status(400).json({ message: 'لا توجد أصناف' });
    const ref = 'OUT-' + Date.now().toString(36).toUpperCase();
    const prods = await Product.find({ _id: { $in: items.map(i => i.product) } });
    const short = items.filter(i => { const p = prods.find(x => String(x._id) === String(i.product)); return !p || p.stock < i.qty; });
    if (short.length && !req.body.allowNegative)
      return res.status(400).json({ message: 'الكمية أكبر من المخزون المتاح', short: short.map(s => s.product) });
    for (const i of items) {
      const p = prods.find(x => String(x._id) === String(i.product));
      const before = p.stock;
      p.stock -= +i.qty;
      await p.save();
      await StockMovement.create({ product: p._id, type: 'out', qty: +i.qty, before, after: p.stock, reason, reference: ref, createdBy: req.user._id });
    }
    res.json({ message: `✅ تم صرف ${items.length} صنف — مرجع ${ref}`, reference: ref });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
