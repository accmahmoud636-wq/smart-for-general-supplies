const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT and attach user to request
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'غير مصرح — الرجاء تسجيل الدخول' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.active) return res.status(401).json({ message: 'الحساب غير نشط' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Token غير صالح' });
  }
};

// Permission guard
const permit = (...perms) => (req, res, next) => {
  for (const perm of perms) {
    if (req.user.hasPermission(perm)) return next();
  }
  res.status(403).json({ message: 'ليس لديك صلاحية للقيام بهذا الإجراء' });
};

// Superadmin only
const superAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'للمدير العام فقط' });
  next();
};

module.exports = { auth, permit, superAdmin };
