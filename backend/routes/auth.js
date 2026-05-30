const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'البريد وكلمة المرور مطلوبان' });
    const user = await User.findOne({ email });
    if (!user || !user.active) return res.status(401).json({ message: 'بيانات غير صحيحة أو الحساب غير نشط' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'كلمة المرور غير صحيحة' });
    user.lastLogin = new Date();
    await user.save();
    res.json({ token: sign(user._id), user: user.toSafeObject() });
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
