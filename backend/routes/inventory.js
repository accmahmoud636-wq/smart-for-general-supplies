// ═══════════════════════════════════════════════════════════════
// جرد المخزون + الرصيد الافتتاحي
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, StockMovement } = require('../models/index');
const { InventoryCount } = require('../models/inventory');
const { auth, permit } = require('../middleware/auth');

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const summary = (lines) => {
  let plus = 0, minus = 0, plusVal = 0, minusVal = 0, diffItems = 0;
  for (const l of lines) {
    const d = l.counted - l.system;
    if (d) diffItems++;
    if (d > 0) { plus += d; plusVal += d * l.cost; } else if (d < 0) { minus += -d; minusVal += -d * l.cost; }
  }
  return { items: lines.length, diffItems, plus, minus, plusVal: r2(plusVal), minusVal: r2(minusVal), net: r2(plusVal - minusVal) };
};

router.get('/', auth, permit('stock:read'), async (req, res) => {
  const list = await InventoryCount.find().populate('createdBy', 'name').populate('postedBy', 'name').sort('-createdAt').limit(200).lean();
  res.json(list.map(c => ({ ...c, lines: undefined, summary: summary(c.lines), lineCount: c.lines.length })));
});

router.get('/:id', auth, permit('stock:read'), async (req, res) => {
  const c = await InventoryCount.findById(req.params.id).populate('createdBy', 'name').populate('postedBy', 'name').lean();
  if (!c) return res.status(404).json({ message: 'الجرد غير موجود' });
  // للمسودة: نحدّث رصيد النظام الحالي عشان الفرق يبقى صح وقت الترحيل
  if (c.status === 'draft' && c.lines.length) {
    const ps = new Map((await Product.find({ _id: { $in: c.lines.map(l => l.product) } }).select('stock buyPrice').lean()).map(p => [String(p._id), p]));
    c.lines = c.lines.map(l => ({ ...l, system: ps.get(String(l.product))?.stock ?? l.system, cost: ps.get(String(l.product))?.buyPrice ?? l.cost }));
  }
  res.json({ ...c, summary: summary(c.lines) });
});

const cleanLines = async (lines) => {
  const ids = [...new Set((lines || []).map(l => String(l.product)).filter(Boolean))];
  const ps = new Map((await Product.find({ _id: { $in: ids }, isKit: { $ne: true } }).select('name barcode stock buyPrice').lean()).map(p => [String(p._id), p]));
  const seen = new Set();
  return (lines || []).filter(l => ps.has(String(l.product)) && !seen.has(String(l.product)) && seen.add(String(l.product))).map(l => {
    const p = ps.get(String(l.product));
    return { product: p._id, name: p.name, barcode: p.barcode, system: p.stock, counted: Math.max(0, Math.round(+l.counted || 0)), cost: p.buyPrice || 0 };
  });
};

router.post('/', auth, permit('stock'), async (req, res) => {
  try {
    const last = await InventoryCount.find({ no: /^INV-\d+$/ }).select('no').lean();
    const n = last.reduce((m, c) => Math.max(m, parseInt(c.no.slice(4))), 0) + 1;
    const c = await InventoryCount.create({ no: 'INV-' + String(n).padStart(4, '0'), title: String(req.body.title || '').slice(0, 80), notes: req.body.notes || '', lines: await cleanLines(req.body.lines), createdBy: req.user._id });
    res.status(201).json(c);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/:id', auth, permit('stock'), async (req, res) => {
  try {
    const c = await InventoryCount.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'الجرد غير موجود' });
    if (c.status !== 'draft') return res.status(400).json({ message: 'تم ترحيل الجرد — لا يمكن تعديله' });
    if (req.body.lines) c.lines = await cleanLines(req.body.lines);
    if (req.body.title !== undefined) c.title = String(req.body.title).slice(0, 80);
    if (req.body.notes !== undefined) c.notes = req.body.notes;
    await c.save();
    res.json(c);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/:id', auth, permit('stock'), async (req, res) => {
  const c = await InventoryCount.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'الجرد غير موجود' });
  if (c.status !== 'draft') return res.status(400).json({ message: 'لا يمكن حذف جرد مُرحّل' });
  await c.deleteOne();
  res.json({ message: 'تم حذف المسودة' });
});

// الترحيل: كل صنف رصيده يتظبط على الكمية الفعلية (الفرق محسوب على الرصيد وقت الترحيل)
router.post('/:id/post', auth, permit('stock'), async (req, res) => {
  try {
    const c = await InventoryCount.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'الجرد غير موجود' });
    if (c.status !== 'draft') return res.status(400).json({ message: 'تم ترحيل الجرد مسبقاً' });
    if (!c.lines.length) return res.status(400).json({ message: 'الجرد لا يحتوي على أصناف' });
    const final = [];
    for (const l of c.lines) {
      const p = await Product.findById(l.product);
      if (!p) continue;
      const before = p.stock, diff = l.counted - before;
      final.push({ product: p._id, name: p.name, barcode: p.barcode, system: before, counted: l.counted, cost: p.buyPrice || 0 });
      if (!diff) continue;
      p.stock = l.counted;
      await p.save();
      await StockMovement.create({ product: p._id, type: 'adjust', qty: Math.abs(diff), before, after: p.stock, reason: `جرد ${c.no} — ${diff > 0 ? 'زيادة' : 'عجز'} ${Math.abs(diff)}`, reference: c.no, createdBy: req.user._id });
    }
    c.lines = final;
    c.result = summary(final);
    c.status = 'posted'; c.postedAt = new Date(); c.postedBy = req.user._id;
    await c.save();
    const s = c.result;
    res.json({ message: `تم ترحيل الجرد ${c.no}: ${s.diffItems} صنف به فرق — زيادة ${s.plus} وعجز ${s.minus}`, count: c });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── الرصيد الافتتاحي: تحديد الكمية والتكلفة لأصناف كتير مرة واحدة ───
router.post('/opening', auth, permit('stock'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    let changed = 0;
    for (const r of rows) {
      const p = await Product.findById(r.product);
      if (!p || p.isKit) continue;
      const qty = r.qty === '' || r.qty === undefined || r.qty === null ? null : Math.round(+r.qty);
      const cost = r.cost === '' || r.cost === undefined || r.cost === null ? null : r2(+r.cost);
      let touched = false;
      if (cost !== null && Number.isFinite(cost) && cost !== p.buyPrice) { p.buyPrice = cost; touched = true; }
      if (qty !== null && Number.isFinite(qty) && qty !== p.stock) {
        const before = p.stock; p.stock = qty; touched = true;
        await StockMovement.create({ product: p._id, type: 'adjust', qty: Math.abs(qty - before), before, after: qty, reason: 'رصيد افتتاحي', reference: 'OPENING', createdBy: req.user._id });
      }
      if (touched) { await p.save(); changed++; }
    }
    res.json({ message: `تم تحديث الرصيد الافتتاحي لـ ${changed} صنف`, changed });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
