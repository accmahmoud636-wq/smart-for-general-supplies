const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = {
  superadmin: {
    label: 'مدير النظام',
    permissions: ['all']
  },
  admin: {
    label: 'مدير',
    permissions: ['products','categories','suppliers','customers','purchases','sales','expenses','stock','reports']
  },
  accountant: {
    label: 'محاسب',
    permissions: ['purchases','sales','expenses','reports','products:read','suppliers:read','customers:read']
  },
  inventory: {
    label: 'مسؤول مخزون',
    permissions: ['products','categories','suppliers','stock','purchases','reports:inventory']
  },
  sales: {
    label: 'مبيعات',
    permissions: ['sales','customers','products:read','reports:sales']
  },
  viewer: {
    label: 'مشاهد',
    permissions: ['products:read','sales:read','purchases:read','expenses:read','reports']
  }
};

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role:     { type: String, enum: Object.keys(ROLES), default: 'viewer' },
  active:   { type: Boolean, default: true },
  avatar:   { type: String, default: '' },
  lastLogin:{ type: Date }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(pw) {
  return bcrypt.compare(pw, this.password);
};

userSchema.methods.hasPermission = function(perm) {
  const rolePerms = ROLES[this.role]?.permissions || [];
  if (rolePerms.includes('all')) return true;
  if (rolePerms.includes(perm)) return true;
  // Check base permission (e.g. 'products' covers 'products:read')
  const base = perm.split(':')[0];
  return rolePerms.includes(base);
};

userSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  obj.roleLabel = ROLES[this.role]?.label;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
