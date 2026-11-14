// ═══════════════════════════════════════════════════════════════
// إدارة البيانات: تصفير + استيراد الأصناف من Excel/CSV
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, Category, Supplier, StockMovement, Sale, Purchase, Expense } = require('../models/index');
const { Shipment } = require('../models/shipment');
const { Damaged, DamagedPhoto } = require('../models/damaged');
const { AmazonOrder, AmazonTransaction, AmazonSkuMap } = require('../models/amazon');
const { auth, permit, superAdmin } = require('../middleware/auth');
const { mapHeaders, num } = require('./amazon')._test;

// ─── التصفير (مدير النظام بس) ───────────────────────────────────
const SCOPES = {
  products:  { label: 'الأصناف والمخزون',       models: [Product] },
  movements: { label: 'حركات المخزون والجرد',    models: [StockMovement, require('../models/inventory').InventoryCount] },
  shipments: { label: 'الشحنات ومخزن التوالف',   models: [Shipment, Damaged, DamagedPhoto] },
  amazon:    { label: 'بيانات أمازون وربط SKU',   models: [AmazonOrder, AmazonTransaction, AmazonSkuMap] },
  sales:     { label: 'فواتير البيع',              models: [Sale] },
  purchases: { label: 'فواتير الشراء',             models: [Purchase] },
  expenses:  { label: 'المصروفات',                models: [Expense] },
};

router.get('/counts', auth, superAdmin, async (req, res) => {
  const out = {};
  for (const [k, s] of Object.entries(SCOPES)) {
    out[k] = { label: s.label, count: (await Promise.all(s.models.map(m => m.countDocuments()))).reduce((a, b) => a + b, 0) };
  }
  res.json(out);
});

router.post('/reset', auth, superAdmin, async (req, res) => {
  try {
    if (req.body.confirm !== 'حذف') return res.status(400).json({ message: 'يُرجى كتابة كلمة «حذف» للتأكيد' });
    const scopes = (req.body.scopes || []).filter(k => SCOPES[k]);
    if (!scopes.length) return res.status(400).json({ message: 'يُرجى تحديد البيانات المطلوب حذفها' });
    const done = {};
    for (const k of scopes) {
      let n = 0;
      for (const m of SCOPES[k].models) n += (await m.deleteMany({})).deletedCount || 0;
      done[k] = n;
    }
    res.json({ message: 'تم حذف: ' + scopes.map(k => `${SCOPES[k].label} (${done[k]})`).join('، '), done });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── استيراد الأصناف ────────────────────────────────────────────
const PRODUCT_ALIASES = {
  name:      ['name', 'product', 'product name', 'item', 'title', 'الاسم', 'اسم الصنف', 'الصنف', 'اسم المنتج', 'المنتج', 'البيان'],
  sku:       ['sku', 'seller sku', 'seller-sku', 'كود', 'الكود', 'كود الصنف', 'رمز sku'],
  asin:      ['asin'],
  barcode:   ['barcode', 'ean', 'upc', 'gtin', 'باركود', 'الباركود'],
  buyPrice:  ['cost', 'buy price', 'purchase price', 'unit cost', 'سعر الشراء', 'التكلفة', 'تكلفة', 'سعر التكلفة', 'الشراء'],
  sellPrice: ['price', 'sell price', 'selling price', 'سعر البيع', 'البيع', 'السعر'],
  stock:     ['qty', 'quantity', 'stock', 'on hand', 'الكمية', 'كمية', 'المخزون', 'الرصيد', 'العدد'],
  minStock:  ['min stock', 'reorder point', 'min', 'حد التنبيه', 'الحد الأدنى', 'حد الطلب'],
  category:  ['category', 'الفئة', 'التصنيف', 'القسم'],
  supplier:  ['supplier', 'vendor', 'المورد', 'المورّد'],
  unit:      ['unit', 'الوحدة'],
  extraSkus: ['other skus', 'amazon skus', 'skus', 'sku أمازون', 'sku امازون', 'skus أمازون', 'إعلانات أمازون'],
};
const clean = (v) => String(v ?? '').trim();
const eanCheck = (d12) => String((10 - (d12.split('').reduce((s, d, i) => s + (+d) * (i % 2 ? 3 : 1), 0) % 10)) % 10);

// ملف أمازون الخام ممكن عمود الاسم يكون من غير عنوان واضح (Column1): نختار العمود اللي أغلبه نص عربي
function guessNameColumn(rows) {
  const found = mapHeaders(rows, PRODUCT_ALIASES, ['sku']);
  if (!found) return null;
  const used = new Set(Object.values(found.idx));
  const sample = rows.slice(found.headerRow + 1, found.headerRow + 200).filter(r => r.some(v => String(v ?? '').trim()));
  const width = Math.max(...sample.map(r => r.length), 0);
  let best = -1, score = 0;
  for (let j = 0; j < width; j++) {
    if (used.has(j)) continue;
    const n = sample.filter(r => /[\u0600-\u06FF]{2,}/.test(String(r[j] ?? ''))).length;
    if (n > score) { score = n; best = j; }
  }
  return best >= 0 && score > 0 && score >= sample.length / 3 ? { headerRow: found.headerRow, idx: { ...found.idx, name: best } } : null;
}

const nameKey = (s) => String(s).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();

function readProducts(rows) {
  const found = mapHeaders(rows, PRODUCT_ALIASES, ['name']) || guessNameColumn(rows);
  if (!found) return null;
  const { headerRow, idx } = found;
  const get = (r, f) => idx[f] !== undefined ? clean(r[idx[f]]) : '';
  // أعمدة SKU إضافية (SKU 2، SKU3، كود 2 ...) — كلها بتتضاف لنفس الكارت
  const hk = (rows[headerRow] || []).map(h => String(h ?? '').toLowerCase().replace(/[\s\-_/().#]+/g, ''));
  const taken = new Set(Object.values(idx));
  // ملحوظة: fnsku (كود ملصق المخزن X00...) مش SKU إعلان — مايتقريش
  const skuCols = hk.map((k, j) => (!taken.has(j) && /^((seller)?sku|كود|رمز|رمزsku)\d+$|^(seller)?sku(2|3|4|5|اضافي|إضافي|other|extra)/.test(k) && !/fnsku|status|price|qty|حالة|سعر/.test(k)) ? j : -1).filter(j => j >= 0);
  const split = (v) => String(v ?? '').split(/[,،;|\n]+/).map(x => x.trim()).filter(Boolean);
  const items = [];
  rows.slice(headerRow + 1).forEach((r, i) => {
    const name = get(r, 'name');
    if (!name) return;
    // خانة SKU فيها أكتر من رمز «A, B, C»: الأول أساسي والباقي إضافي
    let [sku = '', ...moreSkus] = split(get(r, 'sku'));
    const colSkus = skuCols.flatMap(j => split(r[j]));
    if (!sku && colSkus.length) sku = colSkus.shift();
    items.push({
      row: headerRow + i + 2, name,
      sku, asin: get(r, 'asin').toUpperCase(),
      barcode: get(r, 'barcode').replace(/\.0+$/, ''),     // Excel بيحوّل الباركود لرقم عشري أحياناً
      buyPrice: idx.buyPrice !== undefined ? num(get(r, 'buyPrice')) : null,
      sellPrice: idx.sellPrice !== undefined ? num(get(r, 'sellPrice')) : null,
      stock: idx.stock !== undefined ? Math.round(num(get(r, 'stock'))) : null,
      minStock: idx.minStock !== undefined && get(r, 'minStock') !== '' ? Math.round(num(get(r, 'minStock'))) : null,
      category: get(r, 'category'), supplier: get(r, 'supplier'), unit: get(r, 'unit'),
      extraSkus: [...new Set([...moreSkus, ...colSkus, ...split(get(r, 'extraSkus'))])].filter(x => x !== sku),   // «ABC-123×2» = إعلان باكدج فيه قطعتين
    });
  });
  // نفس الصنف متكرر بأكتر من SKU (إعلان لكل SKU في أمازون): يتجمع في كارت واحد
  // أول SKU يبقى الأساسي والباقي يتربط بالصنف
  const groups = new Map();
  for (const it of items) {
    const k = nameKey(it.name);
    const g = groups.get(k);
    if (!g) { groups.set(k, { ...it, extraSkus: [...it.extraSkus] }); continue; }
    if (!g.sku && it.sku) { g.sku = it.sku; g.extraSkus = g.extraSkus.filter(x => x !== it.sku); }
    for (const sku of [it.sku, ...it.extraSkus]) if (sku && sku !== g.sku && !g.extraSkus.includes(sku)) g.extraSkus.push(sku);
    for (const f of ['asin', 'barcode', 'category', 'supplier', 'unit']) if (!g[f] && it[f]) g[f] = it[f];
    for (const f of ['buyPrice', 'sellPrice', 'minStock']) if ((g[f] === null || g[f] === 0) && it[f]) g[f] = it[f];
    if (it.stock !== null) g.stock = (g.stock || 0) + it.stock;
  }
  return { items: [...groups.values()], columns: [...Object.keys(idx), ...(skuCols.length ? [`+${skuCols.length} أعمدة SKU`] : [])], headerRow, rawRows: items.length };
}

// معاينة: إيه اللي اتفهم من الملف قبل ما يتسجل
router.post('/products/preview', auth, permit('products'), async (req, res) => {
  const out = readProducts(req.body.rows || []);
  if (!out) return res.status(400).json({ message: 'لم يُعثر على عمود اسم الصنف — يجب أن يتضمن الملف عموداً بعنوان «اسم الصنف» أو «الاسم» أو Name', headers: (req.body.rows?.[0] || []).slice(0, 30) });
  const existing = await Product.find().select('name sku barcode').lean();
  const key = (p) => [p.sku && 's:' + p.sku.toLowerCase(), p.barcode && 'b:' + p.barcode, 'n:' + p.name.trim().toLowerCase()].filter(Boolean);
  const known = new Set(existing.flatMap(key));
  const items = out.items.map(it => ({ ...it, exists: key(it).some(k => known.has(k)) }));
  res.json({ columns: out.columns, headerRow: out.headerRow, items, total: items.length, rawRows: out.rawRows, newCount: items.filter(i => !i.exists).length });
});

router.post('/products/import', auth, permit('products'), async (req, res) => {
  try {
    // دفعة كلها أسطر فاضية (آخر الملف): مفيش حاجة تتسجل
    if ((req.body.rows || []).filter(r => Array.isArray(r) && r.some(v => String(v ?? '').trim())).length <= 1)
      return res.json({ message: 'لا توجد أصناف', created: 0, updated: 0, mapped: 0, errors: [] });
    const out = readProducts(req.body.rows || []);
    if (!out) return res.status(400).json({ message: 'لم يُعثر على عمود اسم الصنف' });
    const cats = new Map((await Category.find().lean()).map(c => [c.name.trim().toLowerCase(), c._id]));
    const sups = new Map((await Supplier.find().lean()).map(s => [s.name.trim().toLowerCase(), s._id]));
    const catId = async (n) => { if (!n) return undefined; const k = n.toLowerCase(); if (!cats.has(k)) cats.set(k, (await Category.create({ name: n }))._id); return cats.get(k); };
    const supId = async (n) => { if (!n) return undefined; const k = n.toLowerCase(); if (!sups.has(k)) sups.set(k, (await Supplier.create({ name: n }))._id); return sups.get(k); };

    // باركود داخلي للي ملهوش
    const lastCodes = await Product.find({ barcode: /^200\d{10}$/ }).select('barcode').lean();
    let maxCode = lastCodes.reduce((m, p) => Math.max(m, parseInt(p.barcode.slice(3, 12))), 0);
    const newBarcode = () => { const d12 = '200' + String(++maxCode).padStart(9, '0'); return d12 + eanCheck(d12); };

    // كل الأصناف مرة واحدة في الذاكرة بدل بحث لكل سطر (الملفات ممكن تبقى آلاف الأصناف)
    const all = await Product.find().lean();
    const bySku = new Map(), byBarcode = new Map(), byName = new Map();
    const index = (p) => { if (p.sku) bySku.set(p.sku, p); if (p.barcode) byBarcode.set(p.barcode, p); byName.set(nameKey(p.name), p); };
    all.forEach(index);

    let created = 0, updated = 0;
    const errors = [], ops = [], moves = [], mapOps = [], opRow = [];
    for (const it of out.items) {
      try {
        const p = (it.sku && bySku.get(it.sku)) || (it.barcode && byBarcode.get(it.barcode)) || byName.get(nameKey(it.name));
        const data = { name: it.name };
        const extra = [...it.extraSkus];
        // صنف موجود وليه SKU أساسي مختلف: الـ SKU الجديد يتضاف كإعلان إضافي بدل ما يمسح القديم
        if (it.sku) { if (p && p.sku && p.sku !== it.sku) extra.unshift(it.sku); else data.sku = it.sku; }
        if (it.asin) data.asin = it.asin;
        if (it.barcode) data.barcode = it.barcode;
        if (it.buyPrice !== null) data.buyPrice = it.buyPrice;
        if (it.sellPrice !== null) data.sellPrice = it.sellPrice;
        if (it.minStock !== null) data.minStock = it.minStock;
        if (it.unit) data.unit = it.unit;
        if (it.category) data.category = await catId(it.category);
        if (it.supplier) data.supplier = await supId(it.supplier);
        const before = p ? p.stock : 0;
        if (it.stock !== null) data.stock = it.stock;
        let id;
        if (p) {
          id = p._id;
          ops.push({ updateOne: { filter: { _id: id }, update: { $set: data } } }); updated++;
          Object.assign(p, data); index(p);
        } else {
          const doc = new Product({ buyPrice: 0, sellPrice: 0, stock: 0, ...data });
          if (!doc.barcode) doc.barcode = newBarcode();
          id = doc._id;
          ops.push({ insertOne: { document: doc.toObject() } }); created++;
          index(doc.toObject());
        }
        opRow.push(it);
        if (it.stock !== null && it.stock !== before)
          moves.push({ product: id, type: 'adjust', qty: Math.abs(it.stock - before), before, after: it.stock, reason: 'رصيد افتتاحي (استيراد)', reference: 'IMPORT', createdBy: req.user._id });
        for (const raw of [...new Set(extra)]) {
          // الباكدج: «ABC-123×2» أو «ABC-123 x2» — حرف X لازق في آخر الـ SKU (زي 68-J4CS-4TX4) جزء من الرمز مش عدد
          const m = String(raw).match(/^(.+?)\s*(?:[×*]|\s[xX])\s*(\d+)$/);
          const sku = m ? m[1].trim() : raw, qty = m ? Math.max(1, +m[2]) : 1;
          if (sku === (data.sku || p?.sku)) continue;
          mapOps.push({ updateOne: { filter: { sku }, update: { $set: { sku, product: id, qty } }, upsert: true } });
        }
      } catch (e) { errors.push({ row: it.row, name: it.name, message: e.message }); }
    }
    // التسجيل على دفعات — سطر فيه مشكلة ما يوقفش الباقي
    for (let i = 0; i < ops.length; i += 500) {
      try { await Product.bulkWrite(ops.slice(i, i + 500), { ordered: false }); }
      catch (e) {
        for (const we of e.writeErrors || []) {
          const it = opRow[i + we.index];
          if (ops[i + we.index].insertOne) created--; else updated--;
          errors.push({ row: it?.row, name: it?.name, message: we.code === 11000 ? 'رمز SKU أو الباركود مستخدم لصنف آخر' : (we.errmsg || 'خطأ') });
        }
        if (!e.writeErrors) throw e;
      }
    }
    for (let i = 0; i < moves.length; i += 1000) await StockMovement.insertMany(moves.slice(i, i + 1000));
    let mapped = 0;
    for (let i = 0; i < mapOps.length; i += 1000) { await AmazonSkuMap.bulkWrite(mapOps.slice(i, i + 1000), { ordered: false }); mapped += Math.min(1000, mapOps.length - i); }
    res.json({ message: `تمت إضافة ${created} صنف وتحديث ${updated}${mapped ? ` وربط ${mapped} رمز SKU` : ''}${errors.length ? ` — ${errors.length} سطر يحتوي على أخطاء` : ''}`, created, updated, mapped, errors });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── النسخ الاحتياطي والاسترجاع (مدير النظام) ─────────────────────
// ملف JSON واحد فيه كل الجداول — بصيغة EJSON عشان التواريخ والمعرّفات ترجع زي ما هي
const mongoose = require('mongoose');
const Setting = require('../models/Setting');
const { EJSON } = mongoose.mongo.BSON;
const BACKUP_APP = 'smart-for-trading';
const PHOTOS = 'damagedphotos';
const collections = () => {
  const out = {};
  for (const name of mongoose.modelNames()) { const c = mongoose.model(name).collection; out[c.collectionName] = c; }
  return out;
};

router.get('/backup/info', auth, superAdmin, async (req, res) => {
  const last = (await Setting.findOne({ key: 'last_backup' }).lean())?.value || null;
  const counts = {};
  for (const [name, c] of Object.entries(collections())) counts[name] = await c.countDocuments();
  res.json({ last, counts });
});

router.get('/backup', auth, superAdmin, async (req, res) => {
  try {
    const withPhotos = req.query.photos === '1';
    const data = {};
    for (const [name, c] of Object.entries(collections())) {
      if (name === PHOTOS && !withPhotos) continue;
      data[name] = await c.find({}).toArray();
    }
    // مفتاح API المساعد سرّي — مايتحطش في الملف
    if (data.settings) data.settings = data.settings.map(d => d.key === 'assistant' ? { ...d, value: { ...d.value, apiKey: '' } } : d);
    const at = new Date();
    const total = Object.values(data).reduce((t, l) => t + l.length, 0);
    await Setting.findOneAndUpdate({ key: 'last_backup' }, { key: 'last_backup', value: { at, by: req.user.name, records: total, photos: withPhotos } }, { upsert: true });
    const body = EJSON.stringify({ app: BACKUP_APP, version: 1, createdAt: at, createdBy: req.user.name, withPhotos, collections: data }, { relaxed: true });
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="smart-backup-${at.toISOString().slice(0, 10)}.json"` });
    res.send(body);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// الاسترجاع: يستبدل البيانات الحالية بالموجودة في الملف (المستخدمين اختياري عشان ماتتقفلش برة)
router.post('/restore', auth, superAdmin, async (req, res) => {
  try {
    if (req.body.confirm !== 'استرجاع') return res.status(400).json({ message: 'يُرجى كتابة كلمة «استرجاع» للتأكيد' });
    let file;
    try { file = EJSON.parse(typeof req.body.file === 'string' ? req.body.file : JSON.stringify(req.body.file), { relaxed: true }); }
    catch { return res.status(400).json({ message: 'الملف تالف أو ليس نسخة احتياطية' }); }
    if (file?.app !== BACKUP_APP || !file.collections) return res.status(400).json({ message: 'الملف ليس نسخة احتياطية من هذا النظام' });
    const cols = collections();
    const done = {};
    // إعدادات بتخص النظام الحالي وتفضل زي ما هي بعد الاسترجاع
    const KEEP = ['assistant', 'last_backup', 'assistant_usage'];
    const kept = await Setting.find({ key: { $in: KEEP } }).lean();
    if (file.collections.settings) file.collections.settings = file.collections.settings.filter(d => !KEEP.includes(d.key));
    for (const [name, docs] of Object.entries(file.collections)) {
      const c = cols[name];
      if (!c || !Array.isArray(docs)) continue;
      if (name === 'users' && !req.body.includeUsers) continue;
      if (name === PHOTOS && !file.withPhotos) continue;     // نسخة من غير صور: الصور الحالية تفضل زي ما هي
      await c.deleteMany({});
      for (let i = 0; i < docs.length; i += 500) if (docs.slice(i, i + 500).length) await c.insertMany(docs.slice(i, i + 500), { ordered: false });
      done[name] = docs.length;
    }
    for (const d of kept) await Setting.collection.replaceOne({ key: d.key }, d, { upsert: true });
    const total = Object.values(done).reduce((a, b) => a + b, 0);
    res.json({ message: `تم استرجاع ${total} سجل من نسخة ${new Date(file.createdAt).toLocaleDateString('ar-EG')}`, done });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
