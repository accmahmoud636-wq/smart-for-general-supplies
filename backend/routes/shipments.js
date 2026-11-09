// ═══════════════════════════════════════════════════════════════
// الشحنات / البضاعة المسلّمة
// الموظف يمسح كارته ← يمسح الأصناف (مبيعات أو مرتجع) ← حفظ ← ترحيل ← مطابقة مع ملف أمازون
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product, StockMovement } = require('../models/index');
const { Employee, Shipment } = require('../models/shipment');
const { auth, permit } = require('../middleware/auth');
const amazon = require('./amazon');
const { buildResolver } = amazon;
const { mapHeaders, num, parseDate, kindFromType, stageFromAmazon, ORDER_ALIASES, TX_ALIASES } = amazon._test;

const CAN = permit('shipments');
const READ = permit('shipments:read');
const SALE_REASON = 'خروج لأمازون';      // نفس السبب اللي بيقرأه تبويب «مطابقة الخروج» في مركز أمازون
const RETURN_REASON = 'مرتجع أمازون';

// ─── الموظفين ───────────────────────────────────────────────────
router.get('/employees', auth, async (req, res) => {
  res.json(await Employee.find().sort('name').lean());
});

router.post('/employees', auth, permit('settings'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'اسم الموظف مطلوب' });
    const last = await Employee.find({ code: /^EMP\d+$/ }).select('code').lean();
    const n = last.reduce((m, e) => Math.max(m, parseInt(e.code.slice(3))), 0) + 1;
    res.status(201).json(await Employee.create({ name, code: 'EMP' + String(n).padStart(4, '0') }));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/employees/:id', auth, permit('settings'), async (req, res) => {
  const { name, active } = req.body;
  const upd = {};
  if (name !== undefined) upd.name = String(name).trim();
  if (active !== undefined) upd.active = !!active;
  res.json(await Employee.findByIdAndUpdate(req.params.id, upd, { new: true }));
});

// ─── الشحنات ────────────────────────────────────────────────────
const totals = (items) => ({
  saleQty: items.filter(i => i.type === 'sale').reduce((s, i) => s + i.qty, 0),
  returnQty: items.filter(i => i.type === 'return').reduce((s, i) => s + i.qty, 0),
  lines: items.length
});

router.get('/', auth, READ, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const list = await Shipment.find(q).populate('employee', 'name code').sort('-createdAt').limit(300).lean();
  res.json(list.map(s => ({ ...s, ...totals(s.items), items: undefined, match: s.match?.fileName ? { fileName: s.match.fileName, result: s.match.result, uploadedAt: s.match.uploadedAt } : null })));
});

router.get('/:id', auth, READ, async (req, res) => {
  const s = await Shipment.findById(req.params.id).populate('employee', 'name code').populate('items.product', 'name stock barcode').lean();
  if (!s) return res.status(404).json({ message: 'الشحنة غير موجودة' });
  res.json(s);
});

// تنضيف الأصناف: دمج نفس الصنف ونفس النوع، وشيل الكميات الصفر
async function cleanItems(items = []) {
  const merged = new Map();
  for (const i of items) {
    const qty = Math.floor(+i.qty || 0);
    if (!i.product || qty <= 0) continue;
    const type = i.type === 'return' ? 'return' : 'sale';
    const key = i.product + '|' + type;
    const m = merged.get(key);
    if (m) m.qty += qty; else merged.set(key, { product: i.product, type, qty });
  }
  const list = [...merged.values()];
  const prods = await Product.find({ _id: { $in: list.map(i => i.product) } }).select('name barcode').lean();
  const byId = new Map(prods.map(p => [String(p._id), p]));
  return list.filter(i => byId.has(String(i.product))).map(i => ({ ...i, name: byId.get(String(i.product)).name, barcode: byId.get(String(i.product)).barcode || '' }));
}

router.post('/', auth, CAN, async (req, res) => {
  try {
    const last = await Shipment.findOne({ no: /^SH-/ }).sort('-no').select('no').lean();
    const no = 'SH-' + String(last ? parseInt(last.no.slice(3)) + 1 : 1).padStart(5, '0');
    const s = await Shipment.create({
      no, employee: req.body.employee || undefined, notes: req.body.notes || '',
      items: await cleanItems(req.body.items), createdBy: req.user._id
    });
    res.status(201).json(s);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put('/:id', auth, CAN, async (req, res) => {
  try {
    const s = await Shipment.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    if (s.status !== 'draft') return res.status(400).json({ message: 'لا يمكن تعديل شحنة مُرحّلة' });
    if (req.body.employee !== undefined) s.employee = req.body.employee || undefined;
    if (req.body.notes !== undefined) s.notes = req.body.notes;
    if (req.body.items) s.items = await cleanItems(req.body.items);
    await s.save();
    res.json(s);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete('/:id', auth, CAN, async (req, res) => {
  const s = await Shipment.findById(req.params.id);
  if (!s) return res.status(404).json({ message: 'الشحنة غير موجودة' });
  if (s.status !== 'draft') return res.status(400).json({ message: 'لا يمكن حذف شحنة مُرحّلة' });
  await s.deleteOne();
  res.json({ message: 'تم الحذف' });
});

// ترحيل: المبيعات تتخصم من المخزون والمرتجع يرجع
router.post('/:id/post', auth, CAN, async (req, res) => {
  try {
    const s = await Shipment.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    if (s.status !== 'draft') return res.status(400).json({ message: 'تم ترحيل الشحنة مسبقاً' });
    if (!s.employee) return res.status(400).json({ message: 'يلزم تسجيل الموظف أولاً' });
    if (!s.items.length) return res.status(400).json({ message: 'الشحنة لا تحتوي على أصناف' });

    const prods = await Product.find({ _id: { $in: s.items.map(i => i.product) } });
    const byId = new Map(prods.map(p => [String(p._id), p]));
    // الرصيد بعد المرتجع والمبيعات لكل صنف
    const after = {};
    for (const i of s.items) {
      const id = String(i.product);
      after[id] ??= byId.get(id)?.stock ?? 0;
      after[id] += i.type === 'return' ? i.qty : -i.qty;
    }
    const short = Object.entries(after).filter(([, v]) => v < 0).map(([id, v]) => ({ product: id, name: byId.get(id)?.name, missing: -v }));
    if (short.length && !req.body.force)
      return res.status(409).json({ message: 'الرصيد غير كافٍ لبعض الأصناف', short });

    // المرتجع الأول عشان الرصيد ما يقعش بالسالب من غير داعي
    const ordered = [...s.items].sort((a, b) => (a.type === 'return' ? 0 : 1) - (b.type === 'return' ? 0 : 1));
    for (const i of ordered) {
      const p = byId.get(String(i.product));
      if (!p) continue;
      const before = p.stock;
      p.stock += i.type === 'return' ? i.qty : -i.qty;
      await p.save();
      await StockMovement.create({
        product: p._id, type: i.type === 'return' ? 'return' : 'out', qty: i.qty, before, after: p.stock,
        reason: i.type === 'return' ? RETURN_REASON : SALE_REASON, reference: s.no, createdBy: req.user._id
      });
    }
    s.status = 'posted'; s.postedAt = new Date(); s.postedBy = req.user._id;
    await s.save();
    res.json({ message: `تم ترحيل الشحنة ${s.no}`, shipment: s });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── المطابقة مع ملف أمازون ─────────────────────────────────────
// يقبل تقرير المعاملات (Order / Refund) أو تقرير الطلبات (All Orders)
function readAmazonFile(rows) {
  const tx = mapHeaders(rows, TX_ALIASES, ['type', 'total']);
  const ord = !tx && mapHeaders(rows, ORDER_ALIASES, ['orderId', 'sku']);
  if (!tx && !ord) return null;
  const { headerRow, idx } = tx || ord;
  const get = (r, f) => idx[f] !== undefined ? String(r[idx[f]] ?? '').trim() : '';
  const by = {};
  const orders = {};
  let from = null, to = null;
  for (const r of rows.slice(headerRow + 1)) {
    const sku = get(r, 'sku');
    if (!sku) continue;
    const qty = Math.abs(num(get(r, 'qty'))) || (tx ? 0 : 1);
    const d = parseDate(get(r, tx ? 'date' : 'purchaseDate'));
    if (d) { if (!from || d < from) from = d; if (!to || d > to) to = d; }
    const g = (by[sku] ||= { sku, name: tx ? get(r, 'description') : get(r, 'productName'), sale: 0, ret: 0, orders: 0 });
    if (tx) {
      const kind = kindFromType(get(r, 'type'));
      if (kind === 'order') { g.sale += qty; (orders[sku] ||= new Set()).add(get(r, 'orderId')); }
      else if (kind === 'refund') g.ret += qty;
    } else {
      const stage = stageFromAmazon(get(r, 'status'));
      if (stage === 'cancelled') continue;
      if (stage === 'returned') g.ret += qty;
      else { g.sale += qty; (orders[sku] ||= new Set()).add(get(r, 'orderId')); }
    }
  }
  const amazonRows = Object.values(by).map(g => ({ ...g, orders: orders[g.sku]?.size || 0 })).filter(g => g.sale || g.ret);
  return { fileType: tx ? 'transactions' : 'orders', amazon: amazonRows, from, to };
}

// يحسب المطابقة لكل صنف: اللي اتضرب بالاسكانر قصاد اللي في ملف أمازون
async function computeMatch(s) {
  const { resolve } = await buildResolver();
  const rows = {};
  const row = (id, name) => (rows[id] ||= { product: id, name, scannedSale: 0, amazonSale: 0, scannedReturn: 0, amazonReturn: 0, skus: [] });
  for (const i of s.items) {
    const r = row(String(i.product?._id || i.product), i.product?.name || i.name);
    if (i.type === 'return') r.scannedReturn += i.qty; else r.scannedSale += i.qty;
  }
  const unmapped = [];
  for (const a of s.match?.amazon || []) {
    const p = resolve(a.sku);
    if (!p) { unmapped.push(a); continue; }
    const r = row(String(p._id), p.name);
    r.amazonSale += a.sale; r.amazonReturn += a.ret;
    r.skus.push(a.sku);
  }
  const list = Object.values(rows).map(r => {
    const saleDiff = r.scannedSale - r.amazonSale;
    const returnDiff = r.scannedReturn - r.amazonReturn;
    return { ...r, saleDiff, returnDiff, status: !saleDiff && !returnDiff ? 'matched' : 'diff' };
  }).sort((a, b) => (a.status === 'diff' ? 0 : 1) - (b.status === 'diff' ? 0 : 1) || a.name.localeCompare(b.name, 'ar'));
  const sum = (k) => list.reduce((t, r) => t + r[k], 0);
  const summary = {
    products: list.length, matched: list.filter(r => r.status === 'matched').length, diff: list.filter(r => r.status === 'diff').length,
    unmapped: unmapped.length, unmappedQty: unmapped.reduce((t, u) => t + u.sale + u.ret, 0),
    scannedSale: sum('scannedSale'), amazonSale: sum('amazonSale'), scannedReturn: sum('scannedReturn'), amazonReturn: sum('amazonReturn')
  };
  const result = summary.diff === 0 && summary.unmapped === 0 ? 'matched' : 'diff';
  return { rows: list, unmapped, summary, result };
}

router.post('/:id/match', auth, CAN, async (req, res) => {
  try {
    const s = await Shipment.findById(req.params.id).populate('items.product', 'name');
    if (!s) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    if (s.status !== 'posted') return res.status(400).json({ message: 'يلزم ترحيل الشحنة قبل المطابقة' });
    const file = readAmazonFile(req.body.rows || []);
    if (!file) return res.status(400).json({ message: 'تعذّرت قراءة الملف — يُرجى رفع تقرير المعاملات أو تقرير الطلبات من أمازون', headers: (req.body.rows?.[0] || []).slice(0, 30) });
    // نفس الملف بيتسجل كمان في مركز أمازون (الطلبات/المعاملات) عشان الربحية والتسويات — من غير تكرار
    const rows = req.body.rows || [];
    const imported = file.fileType === 'transactions' ? await amazon.importTransactions(rows) : await amazon.importOrders(rows);
    s.match = { fileName: req.body.fileName || '', fileType: file.fileType, uploadedAt: new Date(), from: file.from, to: file.to, amazon: file.amazon, result: null };
    const m = await computeMatch(s);
    s.match.result = m.result;
    await s.save();
    res.json({ ...m, imported: imported?.message, match: { fileName: s.match.fileName, fileType: s.match.fileType, from: s.match.from, to: s.match.to, uploadedAt: s.match.uploadedAt } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// إعادة حساب المطابقة (بعد ربط SKU مثلاً) من غير رفع الملف تاني
router.get('/:id/match', auth, READ, async (req, res) => {
  try {
    const s = await Shipment.findById(req.params.id).populate('items.product', 'name');
    if (!s) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    if (!s.match?.fileName) return res.json(null);
    const m = await computeMatch(s);
    if (s.match.result !== m.result) { s.match.result = m.result; await s.save(); }
    res.json({ ...m, match: { fileName: s.match.fileName, fileType: s.match.fileType, from: s.match.from, to: s.match.to, uploadedAt: s.match.uploadedAt } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
