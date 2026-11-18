// قوائم طباعة الباركود المحفوظة — مشتركة لكل المستخدمين وتظهر على أي جهاز
const router = require('express').Router();
const Setting = require('../models/Setting');
const { auth, permit } = require('../middleware/auth');
const KEY = 'label_lists';

router.get('/', auth, permit('products:read'), async (req, res) => {
  const v = (await Setting.findOne({ key: KEY }).lean())?.value;
  res.json(Array.isArray(v) ? v : []);
});

// حفظ كل القوائم مرة واحدة: [{ id, name, copies: { productId: n } }]
router.put('/', auth, permit('products:read'), async (req, res) => {
  const lists = (Array.isArray(req.body) ? req.body : []).slice(0, 50).map(l => ({
    id: String(l.id || '').slice(0, 40),
    name: String(l.name || 'قائمة').slice(0, 60),
    copies: Object.fromEntries(Object.entries(l.copies || {}).filter(([k, n]) => /^[a-f0-9]{24}$/i.test(k) && +n > 0).slice(0, 2000).map(([k, n]) => [k, Math.min(9999, Math.round(+n))])),
    updatedAt: new Date(),
  })).filter(l => l.id);
  await Setting.findOneAndUpdate({ key: KEY }, { key: KEY, value: lists }, { upsert: true });
  res.json(lists);
});

module.exports = router;
