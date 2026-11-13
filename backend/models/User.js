const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// كل الصلاحيات المتاحة — كل واحدة ليها مستويين: x:read = عرض بس، x = عرض وتعديل
const PERMISSIONS = [
  { key: 'shipments',  label: 'الشحنات (التسجيل والحفظ)', group: 'العمليات' },
  // صلاحية منفصلة (من غير «:» عشان صلاحية الشحنات ماتغطّيهاش): ترحيل الشحنة بيخصم من المخزون
  { key: 'shipments_post', label: 'ترحيل الشحنات (خصم المخزون)', group: 'العمليات', toggle: true },
  { key: 'amazon',     label: 'مركز أمازون',           group: 'أمازون' },
  { key: 'products',   label: 'المنتجات وربط SKU',     group: 'المخزون' },
  { key: 'categories', label: 'الفئات',                group: 'المخزون' },
  { key: 'stock',      label: 'حركة المخزون والتسويات', group: 'المخزون' },
  { key: 'purchases',  label: 'فواتير الشراء',          group: 'المخزون' },
  { key: 'suppliers',  label: 'الموردون',               group: 'المخزون' },
  { key: 'sales',      label: 'فواتير البيع',           group: 'الحسابات' },
  { key: 'customers',  label: 'العملاء',               group: 'الحسابات' },
  { key: 'expenses',   label: 'المصروفات',             group: 'الحسابات' },
  { key: 'reports',    label: 'التقارير',              group: 'الحسابات' },
  { key: 'settings',   label: 'الإعدادات (الموظفون والمظهر)', group: 'الإعدادات' },
];

const ROLES = {
  superadmin: {
    label: 'مدير النظام',
    permissions: ['all']
  },
  admin: {
    label: 'مدير',
    permissions: ['products','categories','suppliers','customers','purchases','sales','expenses','stock','reports','amazon','shipments','shipments_post','settings']
  },
  accountant: {
    label: 'محاسب',
    permissions: ['purchases','sales','expenses','reports','products:read','suppliers:read','customers:read','amazon','shipments:read','stock:read']
  },
  inventory: {
    label: 'مسؤول مخزون',
    permissions: ['products','categories','suppliers','stock','purchases','reports:read','amazon','shipments','shipments_post']
  },
  sales: {
    label: 'مبيعات',
    permissions: ['sales','customers','products:read','reports:sales']
  },
  viewer: {
    label: 'مشاهد',
    permissions: ['products:read','sales:read','purchases:read','expenses:read','reports:read','amazon:read','shipments:read','stock:read']
  }
};

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role:     { type: String, enum: Object.keys(ROLES), default: 'viewer' },
  active:   { type: Boolean, default: true },
  avatar:   { type: String, default: '' },
  lastLogin:{ type: Date },
  lastSeen: { type: Date },      // آخر نشاط (للمتصلين الآن)
  // صلاحيات مخصصة: لو مفعّلة بتحل محل صلاحيات الدور
  useCustom:         { type: Boolean, default: false },
  customPermissions: { type: [String], default: [] }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function(pw) {
  return bcrypt.compare(pw, this.password);
};

userSchema.methods.effectivePermissions = function() {
  if (this.role === 'superadmin') return ['all'];
  return this.useCustom ? (this.customPermissions || []) : (ROLES[this.role]?.permissions || []);
};

userSchema.methods.hasPermission = function(perm) {
  const rolePerms = this.effectivePermissions();
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
  obj.permissions = this.effectivePermissions();
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.PERMISSIONS = PERMISSIONS;
