// ═══════════════════════════════════════════════════════════════
// ذاكرة مؤقتة للنتائج الثقيلة (الرئيسية، الإعلانات، التقارير...)
// أي عملية حفظ/تعديل/حذف ناجحة في أي مكان → الذاكرة كلها تتمسح، فالأرقام دايماً صحيحة
// ═══════════════════════════════════════════════════════════════
let version = 0;
const store = new Map();            // key → { v, at, body }
const MAX = 80;

const bump = () => { version++; store.clear(); if (process.env.CACHE_DEBUG) console.log('cache bump', version); };

// يمسح الذاكرة بعد أي كتابة ناجحة (ماعدا تسجيل الدخول والـ ping)
function invalidator(req, res, next) {
  if (req.method !== 'GET' && !req.path.startsWith('/api/auth')) res.on('finish', () => { if (res.statusCode < 400) bump(); });
  next();
}

// لنتايج داخلية (زي فهرس الأصناف) بتتحسب أكتر من مرة في نفس اللحظة
async function memo(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.v === version && Date.now() - hit.at < ttlMs) return hit.promise;
  const v = version;
  const promise = fn();
  store.set(key, { v, at: Date.now(), promise });
  promise.catch(() => store.delete(key));
  return promise;
}

// كاش لرد الـ GET كله — المفتاح فيه توكن المستخدم (كل مستخدم بصلاحياته)
function responseCache(ttlMs) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = 'R|' + (req.headers.authorization || '') + '|' + req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.v === version && Date.now() - hit.at < ttlMs && hit.body) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Cache', 'HIT');
      return res.send(hit.body);
    }
    const v = version, json = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode < 400 && v === version) {
        const body = JSON.stringify(data);
        if (store.size >= MAX) store.delete(store.keys().next().value);
        store.set(key, { v, at: Date.now(), body });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.send(body);
      }
      return json(data);
    };
    next();
  };
}

module.exports = { bump, invalidator, memo, responseCache };
