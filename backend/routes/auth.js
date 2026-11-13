const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// حماية من التخمين: 8 محاولات غلط من نفس الجهاز ← قفل 15 دقيقة
const fails = new Map();
const LIMIT = 8, WINDOW = 15 * 60 * 1000;
const ipOf = (req) => (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
const blocked = (req) => { const f = fails.get(ipOf(req)); return f && f.n >= LIMIT && Date.now() - f.t < WINDOW; };
const fail = (req) => { const k = ipOf(req); const f = fails.get(k); fails.set(k, f && Date.now() - f.t < WINDOW ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); };
const TOO_MANY = { message: 'محاولات كثيرة خاطئة — حاول مرة أخرى بعد 15 دقيقة' };

const loginOk = async (res, user) => {
  user.lastLogin = new Date();
  await user.save();
  res.json({ token: sign(user._id), user: user.toSafeObject() });
};

// نبض كل دقيقة من الصفحة المفتوحة (للمتصلين الآن)
router.post('/ping', require('../middleware/auth').auth, (req, res) => res.json({ ok: true }));
// الخروج: يتسجل في السجل ويطلع من «المتصلين»
router.post('/logout', require('../middleware/auth').auth, async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $unset: { lastSeen: 1 } });
  res.json({ ok: true });
});

// POST /api/auth/login-card — الدخول بمسح كارت الموظف
router.post('/login-card', async (req, res) => {
  try {
    if (blocked(req)) return res.status(429).json(TOO_MANY);
    const code = require('../utils/kbd').fixLayout(req.body.code).toUpperCase();   // لو الكيبورد عربي وقت المسح
    if (!code) return res.status(400).json({ message: 'امسح كارت الموظف' });
    const { Employee } = require('../models/shipment');
    const emp = await Employee.findOne({ code, active: true });
    const user = emp?.user && await User.findById(emp.user);
    if (!emp) { fail(req); return res.status(401).json({ message: 'الكارت غير معروف أو موقوف' }); }
    if (!user) { fail(req); return res.status(401).json({ message: `كارت ${emp.name} غير مربوط بحساب دخول — اربطه من الإعدادات ← الموظفون` }); }
    if (!user.active) return res.status(401).json({ message: 'الحساب غير نشط' });
    fails.delete(ipOf(req));
    await loginOk(res, user);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    if (blocked(req)) return res.status(429).json(TOO_MANY);
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'البريد وكلمة المرور مطلوبان' });
    const user = await User.findOne({ email: String(email).trim().toLowerCase() }) || await User.findOne({ email });
    if (!user || !user.active) { fail(req); return res.status(401).json({ message: 'بيانات غير صحيحة أو الحساب غير نشط' }); }
    const ok = await user.comparePassword(password);
    if (!ok) { fail(req); return res.status(401).json({ message: 'كلمة المرور غير صحيحة' }); }
    fails.delete(ipOf(req));
    return loginOk(res, user);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  res.json(req.user.toSafeObject());
});

// POST /api/auth/change-password
router.post('/change-password', auth, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    const ok = await user.comparePassword(current);
    if (!ok) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'تم تغيير كلمة المرور' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
