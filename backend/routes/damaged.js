// ═══════════════════════════════════════════════════════════════
// مخزن التوالف — المرتجعات التالفة وصورها وقرار كل واحدة
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, StockMovement } = require('../models/index');
const { Damaged, DamagedPhoto, DAMAGED_STATUSES } = require('../models/damaged');
const { auth, permit } = require('../middleware/auth');

const READ = permit('stock:read', 'shipments:read');
const CAN = permit('stock', 'shipments');
const MAX_PHOTO = 3 * 1024 * 1024;   // بعد الضغط المفروض أقل بكتير

// ─── الصور ──────────────────────────────────────────────────────
router.post('/photos', auth, CAN, async (req, res) => {
  try {
    const data = String(req.body.data || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) return res.status(400).json({ message: 'صيغة الصورة غير مدعومة' });
    if (data.length > MAX_PHOTO) return res.status(400).json({ message: 'حجم الصورة كبير' });
    const p = await DamagedPhoto.create({ data, size: data.length, createdBy: req.user._id });
    res.status(201).json({ _id: p._id });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/photos/:id', auth, READ, async (req, res) => {
  const p = await DamagedPhoto.findById(req.params.id).lean();
  if (!p) return res.status(404).json({ message: 'الصورة غير موجودة' });
  res.set('Cache-Control', 'private, max-age=86400').json({ _id: p._id, data: p.data });
});

// ─── القائمة والملخص ────────────────────────────────────────────
router.get('/', auth, READ, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const list = await Damaged.find(q).populate('employee', 'name').sort('-createdAt').limit(500).lean();
  const all = await Damaged.find().select('status qty unitCost reimbursed').lean();
  const sum = {};
  for (const k of Object.keys(DAMAGED_STATUSES)) sum[k] = { count: 0, qty: 0, value: 0 };
  let reimbursed = 0;
  for (const d of all) {
    const s = sum[d.status]; s.count++; s.qty += d.qty; s.value += d.qty * (d.unitCost || 0);
    reimbursed += d.reimbursed || 0;
  }
  res.json({ list, summary: sum, reimbursed, statuses: DAMAGED_STATUSES });
});

// تعديل الملاحظة/الصور
router.put('/:id', auth, CAN, async (req, res) => {
  const d = await Damaged.findById(req.params.id);
  if (!d) return res.status(404).json({ message: 'السجل غير موجود' });
  if (req.body.note !== undefined) d.note = String(req.body.note);
  if (Array.isArray(req.body.photos)) d.photos = req.body.photos;
  if (req.body.claimNo !== undefined) d.claimNo = String(req.body.claimNo).trim();
  await d.save();
  res.json(d);
});

// ─── القرار: مطالبة / تعويض / إعدام / إرجاع للمخزون ─────────────
router.post('/:id/action', auth, CAN, async (req, res) => {
  try {
    const d = await Damaged.findById(req.params.id);
    if (!d) return res.status(404).json({ message: 'السجل غير موجود' });
    const { action, note = '' } = req.body;
    const closed = ['written_off', 'restored', 'reimbursed'];
    if (closed.includes(d.status)) return res.status(400).json({ message: 'تم إغلاق هذا السجل مسبقاً' });

    if (action === 'claimed') {
      d.claimNo = String(req.body.claimNo || d.claimNo || '').trim();
    } else if (action === 'reimbursed') {
      d.reimbursed = Math.max(0, +req.body.amount || 0);
    } else if (action === 'restored') {
      // الصنف طلع سليم أو اتصلّح: يرجع للمخزون الرئيسي
      const p = await Product.findById(d.product);
      if (!p) return res.status(400).json({ message: 'الصنف غير موجود' });
      const before = p.stock;
      p.stock += d.qty;
      await p.save();
      await StockMovement.create({ product: p._id, type: 'return', qty: d.qty, before, after: p.stock, reason: 'إرجاع من مخزن التوالف', reference: d.shipmentNo, createdBy: req.user._id });
    } else if (action !== 'written_off' && action !== 'pending') {
      return res.status(400).json({ message: 'إجراء غير معروف' });
    }
    d.status = action;
    d.history.push({ status: action, note, by: req.user._id });
    await d.save();
    res.json({ message: `تم التحديث: ${DAMAGED_STATUSES[action]}`, item: d });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
