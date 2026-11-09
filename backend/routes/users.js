const router = require('express').Router();
const User = require('../models/User');
const { auth, permit, superAdmin } = require('../middleware/auth');
const { ROLES, PERMISSIONS } = require('../models/User');

const cleanPerms = (list) => {
  const ok = new Set(PERMISSIONS.flatMap(p => [p.key, p.key + ':read']));
  return [...new Set((list || []).filter(x => ok.has(x)))];
};

// GET all users (admin+)
router.get('/', auth, permit('all'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort('-createdAt');
    res.json(users.map(u => u.toSafeObject()));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET roles list
router.get('/roles', auth, (req, res) => {
  const roles = Object.entries(ROLES).map(([key, val]) => ({ key, label: val.label, permissions: val.permissions }));
  res.json(roles);
});

// قائمة الصلاحيات (لشاشة الصلاحيات التفصيلية)
router.get('/permissions', auth, (req, res) => res.json(PERMISSIONS));

// POST create user (superadmin / admin)
router.post('/', auth, permit('all'), async (req, res) => {
  try {
    const { name, email, password, role, useCustom, customPermissions } = req.body;
    if (role === 'superadmin' && req.user.role !== 'superadmin')
      return res.status(403).json({ message: 'فقط مدير النظام يمكنه إنشاء مدير نظام آخر' });
    const user = await User.create({ name, email, password, role, useCustom: !!useCustom, customPermissions: cleanPerms(customPermissions) });
    res.status(201).json(user.toSafeObject());
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
    res.status(500).json({ message: e.message });
  }
});

// PUT update user
router.put('/:id', auth, permit('all'), async (req, res) => {
  try {
    const { name, email, role, active, useCustom, customPermissions } = req.body;
    if (role === 'superadmin' && req.user.role !== 'superadmin')
      return res.status(403).json({ message: 'فقط مدير النظام يمكنه تعيين مدير نظام' });
    const update = { name, email, role, active };
    if (useCustom !== undefined) update.useCustom = !!useCustom;
    if (customPermissions !== undefined) update.customPermissions = cleanPerms(customPermissions);
    if (req.body.password) {
      const bcrypt = require('bcryptjs');
      update.password = await bcrypt.hash(req.body.password, 12);
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });   // toSafeObject بيشيل الباسورد
    res.json(user.toSafeObject());
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE user (superadmin only)
router.delete('/:id', auth, superAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ message: 'لا يمكنك حذف حسابك الخاص' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف المستخدم' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
