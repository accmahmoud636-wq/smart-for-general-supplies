// ═══════════════════════════════════════════════════════════════
// المتصلين الآن + سجل النشاط
// ═══════════════════════════════════════════════════════════════
const Activity = require('../models/activity');
const User = require('../models/User');

const ONLINE_MS = 2 * 60 * 1000;       // آخر ظهور خلال دقيقتين = أونلاين
const seenCache = new Map();           // userId → آخر مرة اتكتبت في الداتابيز (عشان مانكتبش مع كل طلب)

async function touch(user) {
  const id = String(user._id), now = Date.now();
  if (now - (seenCache.get(id) || 0) < 45 * 1000) return;
  seenCache.set(id, now);
  await User.updateOne({ _id: user._id }, { $set: { lastSeen: new Date(now) } }).catch(() => {});
}

// وصف العملية من المسار — الأنماط الأدق الأول
const RULES = [
  ['POST', /^\/api\/auth\/login-card/, 'تسجيل دخول بالكارت'],
  ['POST', /^\/api\/auth\/login/, 'تسجيل دخول'],
  ['POST', /^\/api\/auth\/logout/, 'تسجيل خروج'],
  ['POST', /^\/api\/shipments\/[^/]+\/post/, 'ترحيل شحنة'],
  ['POST', /^\/api\/shipments\/[^/]+\/match/, 'مطابقة شحنة مع أمازون'],
  ['POST', /^\/api\/shipments\/employees/, 'إضافة موظف'],
  ['PUT', /^\/api\/shipments\/employees/, 'تعديل موظف'],
  ['POST', /^\/api\/shipments$/, 'إنشاء شحنة'],
  ['PUT', /^\/api\/shipments\//, 'تعديل شحنة'],
  ['DELETE', /^\/api\/shipments\//, 'حذف شحنة'],
  ['POST', /^\/api\/sales$/, 'فاتورة بيع'],
  ['DELETE', /^\/api\/sales\//, 'حذف فاتورة بيع'],
  ['PUT', /^\/api\/sales\//, 'تعديل فاتورة بيع'],
  ['POST', /^\/api\/purchases$/, 'فاتورة شراء'],
  ['DELETE', /^\/api\/purchases\//, 'حذف فاتورة شراء'],
  ['PUT', /^\/api\/purchases\//, 'تعديل فاتورة شراء'],
  ['POST', /^\/api\/expenses/, 'تسجيل مصروف'],
  ['DELETE', /^\/api\/expenses/, 'حذف مصروف'],
  ['POST', /^\/api\/products\/[^/]+\/adjust/, 'تسوية رصيد صنف'],
  ['POST', /^\/api\/products\/barcodes/, 'توليد باركود'],
  ['POST', /^\/api\/products$/, 'إضافة صنف'],
  ['PUT', /^\/api\/products\//, 'تعديل صنف'],
  ['DELETE', /^\/api\/products\//, 'حذف صنف'],
  ['POST', /^\/api\/admin\/products\/import/, 'استيراد أصناف'],
  ['POST', /^\/api\/inventory\/opening/, 'رصيد افتتاحي'],
  ['POST', /^\/api\/inventory\/[^/]+\/post/, 'ترحيل جرد'],
  ['POST', /^\/api\/inventory$/, 'إنشاء جرد'],
  ['PUT', /^\/api\/inventory\//, 'تعديل جرد'],
  ['DELETE', /^\/api\/inventory\//, 'حذف مسودة جرد'],
  ['POST', /^\/api\/admin\/reset/, '⚠️ حذف بيانات'],
  ['POST', /^\/api\/admin\/restore/, '⚠️ استرجاع نسخة احتياطية'],
  ['GET', /^\/api\/admin\/backup$/, 'تنزيل نسخة احتياطية'],
  ['POST', /^\/api\/amazon\/upload\/orders/, 'رفع تقرير الطلبات'],
  ['POST', /^\/api\/amazon\/upload\/transactions/, 'رفع تقرير المعاملات'],
  ['POST', /^\/api\/amazon\/skus\/map/, 'ربط SKU'],
  ['DELETE', /^\/api\/amazon\/skus\/map/, 'فك ربط SKU'],
  ['POST', /^\/api\/damaged\/[^/]+\/action/, 'قرار مرتجع تالف'],
  ['POST', /^\/api\/assistant\/actions\/[^/]+\/confirm/, 'تنفيذ أمر من المساعد'],
  ['POST', /^\/api\/users$/, 'إضافة مستخدم'],
  ['PUT', /^\/api\/users\//, 'تعديل مستخدم'],
  ['DELETE', /^\/api\/users\//, 'حذف مستخدم'],
  ['POST', /^\/api\/customers/, 'إضافة عميل'],
  ['POST', /^\/api\/suppliers/, 'إضافة مورد'],
  ['PUT', /^\/api\/settings/, 'تعديل الإعدادات'],
];
const SKIP = /^\/api\/(auth\/ping|assistant\/chat|damaged\/photos|seasons)/;

// ميدلوير عام: بعد ما الطلب يخلص — لو ناجح ومن نوع تعديل يتسجل في السجل
function activityLogger(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => { res.locals.body = body; return json(body); };
  res.on('finish', () => {
    try {
      const path = req.originalUrl.split('?')[0];
      if (res.statusCode >= 400 || SKIP.test(path)) return;
      const rule = RULES.find(([m, re]) => m === req.method && re.test(path));
      if (!rule && req.method === 'GET') return;
      if (!rule && !/^(POST|PUT|DELETE)$/.test(req.method)) return;
      const b = res.locals.body || {};
      const user = req.user || (b.user && { _id: b.user._id, name: b.user.name });
      if (!user) return;
      const ref = b.invoiceNo || b.no || b.shipment?.no || b.count?.no || b.reference || (rule && /صنف|عميل|مورد|مستخدم|موظف/.test(rule[2]) ? b.name : '') || '';
      Activity.create({
        user: user._id, name: user.name, action: rule ? rule[2] : `${req.method} ${path.replace('/api/', '')}`,
        ref: String(ref).slice(0, 80), method: req.method, path, ip: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
      }).catch(() => {});
    } catch { /* السجل مايوقفش الشغل أبداً */ }
  });
  next();
}

// تنضيف السجل الأقدم من 90 يوم (مرة في اليوم)
let lastPrune = 0;
async function prune() {
  if (Date.now() - lastPrune < 864e5) return;
  lastPrune = Date.now();
  await Activity.deleteMany({ at: { $lt: new Date(Date.now() - 90 * 864e5) } }).catch(() => {});
}

module.exports = { touch, activityLogger, prune, ONLINE_MS };
