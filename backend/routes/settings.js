const router = require('express').Router();
const Setting = require('../models/Setting');
const { auth, permit } = require('../middleware/auth');

const THEME_DEFAULT = { accent: 'violet', base: 'navy', appName: 'SMART FOR TRADING', appSub: 'نظام الإدارة', currency: 'ج.م' };

// المظهر — أي مستخدم داخل محتاجه عشان الشاشة تتلون
router.get('/theme', auth, async (req, res) => {
  const s = await Setting.findOne({ key: 'theme' }).lean();
  res.json({ ...THEME_DEFAULT, ...(s?.value || {}) });
});

router.put('/theme', auth, permit('settings'), async (req, res) => {
  const { accent, base, appName, appSub, currency } = req.body;
  const value = { ...THEME_DEFAULT };
  if (currency) value.currency = String(currency).slice(0, 8);
  if (accent) value.accent = String(accent).slice(0, 20);
  if (base) value.base = String(base).slice(0, 20);
  if (appName !== undefined) value.appName = String(appName).slice(0, 40) || THEME_DEFAULT.appName;
  if (appSub !== undefined) value.appSub = String(appSub).slice(0, 40);
  await Setting.findOneAndUpdate({ key: 'theme' }, { key: 'theme', value }, { upsert: true });
  res.json(value);
});

module.exports = router;
