// ═══════════════════════════════════════════════════════════════
// المساعد الذكي — شات داخل المنصة يفهم الأوامر وينفذها
// القراءة بتتنفذ على طول، أي تعديل بيتجهز كـ «إجراء» ومايتنفذش غير بعد ضغط «تأكيد»
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const mongoose = require('mongoose');
const { Product, Supplier, Purchase, StockMovement, Expense, Category } = require('../models/index');
const { Damaged } = require('../models/damaged');
const { Shipment } = require('../models/shipment');
const { AmazonSkuMap } = require('../models/amazon');
const Setting = require('../models/Setting');
const { auth, superAdmin } = require('../middleware/auth');

const DEFAULT_MODEL = 'claude-haiku-5-5';
const MODELS = { 'claude-haiku-5-5': 'Haiku — سريع واقتصادي', 'claude-sonnet-5-5': 'Sonnet — أدق في الفهم' };

// ─── الإجراءات المعلّقة (بانتظار التأكيد) ───────────────────────
const actionSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tool:    { type: String, required: true },
  input:   { type: mongoose.Schema.Types.Mixed },
  title:   String,
  lines:   [String],
  status:  { type: String, enum: ['pending', 'done', 'cancelled', 'failed'], default: 'pending' },
  result:  String,
}, { timestamps: true });
const AssistantAction = mongoose.models.AssistantAction || mongoose.model('AssistantAction', actionSchema);

// ─── أدوات مساعدة ──────────────────────────────────────────────
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const money = (n) => r2(n).toLocaleString('en-US') ;
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}\s.-]/gu, ' ').replace(/\s+/g, ' ').trim();
const isId = (v) => mongoose.isValidObjectId(v);

async function config() {
  const s = await Setting.findOne({ key: 'assistant' }).lean();
  const v = s?.value || {};
  return { apiKey: v.apiKey || process.env.ANTHROPIC_API_KEY || '', model: v.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL };
}

async function getProduct(id) {
  if (!isId(id)) throw new Error('معرّف الصنف غير صحيح — استخدم find_products أولاً');
  const p = await Product.findById(id);
  if (!p) throw new Error('الصنف غير موجود');
  return p;
}
const brief = (p) => ({ id: String(p._id), name: p.name, sku: p.sku || '', barcode: p.barcode || '', stock: p.stock, buyPrice: p.buyPrice, sellPrice: p.sellPrice, minStock: p.minStock });

async function findSupplier(name) {
  const n = norm(name);
  if (!n) return null;
  const all = await Supplier.find().select('name').lean();
  return all.find(s => norm(s.name) === n) || all.find(s => norm(s.name).includes(n) || n.includes(norm(s.name))) || null;
}

// ─── تعريف الأدوات ─────────────────────────────────────────────
// perm: الصلاحية المطلوبة — المستخدم بيشوف بس الأدوات اللي مسموحله بيها
const TOOLS = {
  // ── قراءة ──
  find_products: {
    perm: 'products:read',
    description: 'البحث عن صنف بالاسم أو جزء منه أو SKU أو الباركود أو ASIN. استخدمها دائماً قبل أي عملية على صنف للحصول على id.',
    schema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } }, required: ['query'] },
    async run({ query, limit = 8 }) {
      const q = norm(query);
      const words = q.split(' ').filter(Boolean);
      const all = await Product.find({ active: { $ne: false } }).select('name sku barcode asin stock buyPrice sellPrice minStock').lean();
      const exact = all.filter(p => [p.sku, p.barcode, p.asin].some(v => v && norm(v) === q));
      const map = await AmazonSkuMap.findOne({ sku: String(query).trim() }).lean();
      if (map) { const p = all.find(x => String(x._id) === String(map.product)); if (p) exact.push(p); }
      const scored = all.map(p => {
        const n = norm(p.name + ' ' + (p.sku || ''));
        const hit = words.filter(w => n.includes(w)).length;
        return { p, s: hit / words.length + (n.startsWith(words[0] || '') ? 0.05 : 0) };
      }).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).map(x => x.p);
      const out = [...new Map([...exact, ...scored].map(p => [String(p._id), p])).values()].slice(0, Math.min(limit, 20));
      return out.length ? out.map(brief) : 'لا توجد نتائج — جرّب كلمة أقصر أو اسأل المستخدم عن اسم الصنف كما هو في النظام';
    }
  },
  low_stock: {
    perm: 'products:read',
    description: 'الأصناف التي نفد رصيدها أو أقل من حد الطلب.',
    schema: { type: 'object', properties: {} },
    async run() {
      const all = await Product.find({ active: { $ne: false } }).select('name stock minStock').lean();
      return {
        out: all.filter(p => p.stock <= 0).slice(0, 40).map(p => ({ name: p.name, stock: p.stock })),
        low: all.filter(p => p.stock > 0 && p.stock <= (p.minStock || 0)).slice(0, 40).map(p => ({ name: p.name, stock: p.stock, minStock: p.minStock })),
      };
    }
  },
  inventory_summary: {
    perm: 'products:read',
    description: 'ملخص المخزون: عدد الأصناف وإجمالي القطع وقيمة المخزون بسعر الشراء، والأصناف بدون سعر شراء.',
    schema: { type: 'object', properties: {} },
    async run() {
      const all = await Product.find({ active: { $ne: false } }).select('stock buyPrice').lean();
      return { products: all.length, units: all.reduce((t, p) => t + Math.max(0, p.stock), 0), value: r2(all.reduce((t, p) => t + Math.max(0, p.stock) * (p.buyPrice || 0), 0)), withoutCost: all.filter(p => !p.buyPrice).length };
    }
  },
  product_movements: {
    perm: 'stock:read',
    description: 'آخر حركات المخزون لصنف (شراء، خروج لأمازون، مرتجع، تسوية).',
    schema: { type: 'object', properties: { productId: { type: 'string' }, limit: { type: 'integer' } }, required: ['productId'] },
    async run({ productId, limit = 15 }) {
      const p = await getProduct(productId);
      const m = await StockMovement.find({ product: p._id }).sort('-createdAt').limit(Math.min(limit, 50)).lean();
      return { product: p.name, stock: p.stock, movements: m.map(x => ({ date: x.createdAt.toISOString().slice(0, 10), type: x.type, qty: x.qty, after: x.after, reason: x.reason, ref: x.reference })) };
    }
  },
  find_suppliers: {
    perm: 'suppliers:read',
    description: 'قائمة الموردين أو البحث عن مورد بالاسم، مع الرصيد المستحق لهم.',
    schema: { type: 'object', properties: { query: { type: 'string' } } },
    async run({ query = '' }) {
      const n = norm(query);
      const all = await Supplier.find().select('name phone balance').lean();
      return all.filter(s => !n || norm(s.name).includes(n)).slice(0, 20).map(s => ({ name: s.name, phone: s.phone, balance: s.balance }));
    }
  },
  operations_status: {
    perm: 'shipments:read',
    description: 'حالة التشغيل: الشحنات المسودة، الشحنات بانتظار المطابقة، شحنات بها فروقات، والمرتجعات التالفة قيد المراجعة.',
    schema: { type: 'object', properties: {} },
    async run() {
      const s = await Shipment.find({ $or: [{ status: 'draft' }, { 'match.result': { $ne: 'matched' } }] }).select('no status match.fileName match.result').lean();
      const d = await Damaged.find({ status: { $in: ['pending', 'claimed'] } }).select('name qty status').lean();
      return {
        drafts: s.filter(x => x.status === 'draft').map(x => x.no),
        toMatch: s.filter(x => x.status === 'posted' && !x.match?.fileName).map(x => x.no),
        diff: s.filter(x => x.status === 'posted' && x.match?.result === 'diff').map(x => x.no),
        damagedPending: d.filter(x => x.status === 'pending').map(x => `${x.name} ×${x.qty}`),
        damagedClaimed: d.filter(x => x.status === 'claimed').map(x => `${x.name} ×${x.qty}`),
      };
    }
  },

  // ── تعديل (يحتاج تأكيد) ──
  record_purchase: {
    perm: 'purchases', write: true,
    description: 'تسجيل فاتورة شراء: يزيد رصيد الأصناف ويحدّث سعر الشراء (متوسط مرجّح) ويسجل حركة مخزون. المورد اختياري (افتراضي «مورد نقدي»). paid = المبلغ المدفوع (افتراضي كامل المبلغ).',
    schema: { type: 'object', properties: {
      supplierName: { type: 'string' },
      items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, qty: { type: 'number' }, unitPrice: { type: 'number' } }, required: ['productId', 'qty', 'unitPrice'] } },
      paid: { type: 'number' }, notes: { type: 'string' } }, required: ['items'] },
    async preview({ supplierName, items = [], paid }) {
      if (!items.length) throw new Error('لا توجد أصناف');
      const lines = []; let total = 0;
      for (const it of items) {
        if (!(+it.qty > 0) || !(+it.unitPrice >= 0)) throw new Error('الكمية والسعر يجب أن تكون أرقاماً موجبة');
        const p = await getProduct(it.productId);
        const avg = p.stock > 0 ? (p.stock * (p.buyPrice || 0) + it.qty * it.unitPrice) / (p.stock + +it.qty) : +it.unitPrice;
        total += it.qty * it.unitPrice;
        lines.push(`${p.name}: ${it.qty} × ${money(it.unitPrice)} = ${money(it.qty * it.unitPrice)} — الرصيد ${p.stock} ← ${p.stock + +it.qty}، سعر الشراء ${money(p.buyPrice)} ← ${money(avg)}`);
      }
      const sup = supplierName ? await findSupplier(supplierName) : null;
      lines.push(`المورد: ${sup ? sup.name : supplierName ? `${supplierName} (مورد جديد)` : 'مورد نقدي'}`);
      const pd = paid === undefined ? total : +paid;
      lines.push(`الإجمالي ${money(total)} — المدفوع ${money(pd)}${total - pd > 0 ? ` — المتبقي للمورد ${money(total - pd)}` : ''}`);
      return { title: 'فاتورة شراء', lines };
    },
    async exec({ supplierName, items, paid, notes = '' }, user) {
      let sup = supplierName ? await findSupplier(supplierName) : await findSupplier('مورد نقدي');
      if (!sup) sup = await Supplier.create({ name: supplierName || 'مورد نقدي' });
      const last = await Purchase.findOne({ invoiceNo: /^PO-/ }).sort('-invoiceNo').select('invoiceNo').lean();
      const invoiceNo = 'PO-' + String(last ? parseInt(last.invoiceNo.slice(3)) + 1 : 1).padStart(5, '0');
      const rows = items.map(i => ({ product: i.productId, qty: +i.qty, price: +i.unitPrice, total: r2(i.qty * i.unitPrice) }));
      const total = r2(rows.reduce((t, i) => t + i.total, 0));
      const pd = paid === undefined ? total : r2(paid);
      await Purchase.create({ invoiceNo, supplier: sup._id, items: rows, subtotal: total, total, paid: pd, status: pd >= total ? 'paid' : pd > 0 ? 'partial' : 'received', notes: notes || 'سُجّلت من المساعد الذكي', createdBy: user._id });
      for (const i of rows) {
        const p = await Product.findById(i.product);
        if (p.isKit) { await require('../utils/stock').moveStock(p._id, i.qty, { type: 'in', reason: 'فاتورة شراء', reference: invoiceNo, userId: user._id }); continue; }
        const before = p.stock;
        if (before > 0) p.buyPrice = r2((before * (p.buyPrice || 0) + i.qty * i.price) / (before + i.qty)); else p.buyPrice = i.price;
        p.stock += i.qty;
        await p.save();
        await StockMovement.create({ product: p._id, type: 'in', qty: i.qty, before, after: p.stock, reason: 'فاتورة شراء', reference: invoiceNo, createdBy: user._id });
      }
      if (total > pd) await Supplier.findByIdAndUpdate(sup._id, { $inc: { balance: total - pd } });
      return `تم تسجيل فاتورة الشراء ${invoiceNo} بإجمالي ${money(total)}`;
    }
  },
  update_product: {
    perm: 'products', write: true,
    description: 'تعديل بيانات كارت صنف: الاسم أو سعر الشراء أو سعر البيع أو حد الطلب أو SKU أو الباركود.',
    schema: { type: 'object', properties: { productId: { type: 'string' }, name: { type: 'string' }, buyPrice: { type: 'number' }, sellPrice: { type: 'number' }, minStock: { type: 'number' }, sku: { type: 'string' }, barcode: { type: 'string' } }, required: ['productId'] },
    FIELDS: { name: 'الاسم', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', minStock: 'حد الطلب', sku: 'SKU', barcode: 'الباركود' },
    async preview(input) {
      const p = await getProduct(input.productId);
      const lines = Object.entries(this.FIELDS).filter(([k]) => input[k] !== undefined && input[k] !== null).map(([k, l]) => `${l}: ${p[k] ?? '—'} ← ${input[k]}`);
      if (!lines.length) throw new Error('لا توجد تعديلات');
      return { title: `تعديل بطاقة الصنف «${p.name}»`, lines };
    },
    async exec(input) {
      const p = await getProduct(input.productId);
      for (const k of Object.keys(this.FIELDS)) if (input[k] !== undefined && input[k] !== null) p[k] = input[k];
      await p.save();
      return `تم تعديل بطاقة الصنف «${p.name}»`;
    }
  },
  set_stock: {
    perm: 'stock', write: true,
    description: 'تسوية رصيد صنف بعد جرد (يضبط الرصيد على رقم معين) مع ذكر السبب.',
    schema: { type: 'object', properties: { productId: { type: 'string' }, newStock: { type: 'number' }, reason: { type: 'string' } }, required: ['productId', 'newStock'] },
    async preview({ productId, newStock, reason }) {
      const p = await getProduct(productId);
      if (p.isKit) throw new Error('رصيد الصنف المركب يُحتسب من مكوناته — يُرجى تسوية رصيد المكونات');
      if (!Number.isFinite(+newStock)) throw new Error('الرصيد غير صحيح');
      return { title: `تسوية رصيد «${p.name}»`, lines: [`الرصيد ${p.stock} ← ${newStock} (فرق ${newStock - p.stock > 0 ? '+' : ''}${newStock - p.stock})`, `السبب: ${reason || 'جرد'}`] };
    },
    async exec({ productId, newStock, reason }, user) {
      const p = await getProduct(productId);
      const before = p.stock;
      p.stock = Math.round(+newStock);
      await p.save();
      await StockMovement.create({ product: p._id, type: 'adjust', qty: Math.abs(p.stock - before), before, after: p.stock, reason: reason || 'تسوية جرد (المساعد الذكي)', reference: 'ADJ', createdBy: user._id });
      return `تم ضبط رصيد «${p.name}» على ${p.stock}`;
    }
  },
  create_product: {
    perm: 'products', write: true,
    description: 'إضافة صنف جديد (يأخذ باركود داخلي تلقائياً). استخدمها فقط إذا تأكدت بـ find_products أن الصنف غير موجود.',
    schema: { type: 'object', properties: { name: { type: 'string' }, buyPrice: { type: 'number' }, sellPrice: { type: 'number' }, stock: { type: 'number' }, minStock: { type: 'number' }, category: { type: 'string' }, sku: { type: 'string' } }, required: ['name'] },
    async preview(i) {
      if (!String(i.name || '').trim()) throw new Error('اسم الصنف مطلوب');
      return { title: 'صنف جديد', lines: [`الاسم: ${i.name}`, `سعر الشراء ${money(i.buyPrice)} — سعر البيع ${money(i.sellPrice)}`, `الرصيد الافتتاحي ${i.stock || 0}${i.category ? ` — الفئة ${i.category}` : ''}${i.sku ? ` — SKU ${i.sku}` : ''}`] };
    },
    async exec(i, user) {
      let category;
      if (i.category) {
        const cats = await Category.find().lean();
        category = cats.find(c => norm(c.name) === norm(i.category))?._id || (await Category.create({ name: i.category }))._id;
      }
      const codes = await Product.find({ barcode: /^200\d{10}$/ }).select('barcode').lean();
      const n = codes.reduce((m, p) => Math.max(m, parseInt(p.barcode.slice(3, 12))), 0) + 1;
      const d12 = '200' + String(n).padStart(9, '0');
      const barcode = d12 + ((10 - (d12.split('').reduce((s, d, k) => s + (+d) * (k % 2 ? 3 : 1), 0) % 10)) % 10);
      const p = await Product.create({ name: i.name.trim(), buyPrice: +i.buyPrice || 0, sellPrice: +i.sellPrice || 0, stock: Math.round(+i.stock || 0), minStock: i.minStock ?? 5, category, sku: i.sku || undefined, barcode });
      if (p.stock) await StockMovement.create({ product: p._id, type: 'adjust', qty: p.stock, before: 0, after: p.stock, reason: 'رصيد افتتاحي (المساعد الذكي)', reference: 'NEW', createdBy: user._id });
      return `تمت إضافة الصنف «${p.name}» — الباركود ${barcode}`;
    }
  },
  add_expense: {
    perm: 'expenses', write: true,
    description: 'تسجيل مصروف (تغليف، شحن، إيجار، رواتب، إعلانات، ...). paymentMethod: cash | bank | card | other.',
    schema: { type: 'object', properties: { amount: { type: 'number' }, category: { type: 'string' }, description: { type: 'string' }, paymentMethod: { type: 'string', enum: ['cash', 'bank', 'card', 'other'] } }, required: ['amount', 'category'] },
    async preview(i) {
      if (!(+i.amount > 0)) throw new Error('المبلغ غير صحيح');
      return { title: 'مصروف جديد', lines: [`${i.category}: ${money(i.amount)}`, i.description ? `البيان: ${i.description}` : null, `طريقة الدفع: ${({ cash: 'نقدي', bank: 'تحويل بنكي', card: 'بطاقة', other: 'أخرى' })[i.paymentMethod || 'cash']}`].filter(Boolean) };
    },
    async exec(i, user) {
      await Expense.create({ category: i.category, amount: r2(i.amount), description: i.description || '', paymentMethod: i.paymentMethod || 'cash', reference: 'المساعد الذكي', createdBy: user._id });
      return `تم تسجيل مصروف ${i.category} بمبلغ ${money(i.amount)}`;
    }
  },
};

const allowedTools = (user) => Object.entries(TOOLS).filter(([, t]) => user.hasPermission(t.perm));

function systemPrompt(user, currency) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ || 'Africa/Cairo' });
  return `أنت المساعد الذكي داخل نظام SMART FOR TRADING لإدارة مخزون وحسابات متجر على أمازون مصر (Seller Flex).
المستخدم الحالي: ${user.name}. التاريخ: ${today}. العملة: ${currency}.

القواعد:
- رد بالعربية المصرية المهنية، باختصار ووضوح. بدون جداول Markdown؛ استخدم أسطر قصيرة أو نقاط.
- قبل أي عملية على صنف، ابحث عنه بـ find_products واستخدم الـ id الراجع. لا تخترع id أبداً.
- إذا أعاد البحث أكثر من صنف محتمل ولم يكن الاختيار واضحاً، اعرض الأسماء على المستخدم واسأله أيها يقصد قبل تجهيز العملية.
- إذا كانت معلومة ضرورية ناقصة (مثل السعر أو الكمية)، اسأل عنها بسؤال واحد قصير.
- أدوات التعديل لا تُنفّذ فوراً: تُجهّز العملية وتظهر للمستخدم بطاقة بزر «تأكيد». بعد تجهيزها قل جملة قصيرة مثل «جهّزت العملية — راجعها واضغط تأكيد». لا تقل أبداً إنها تمت.
- «اشتريت» أو «جالي بضاعة» = record_purchase. «الجرد طلع» أو «الرصيد الفعلي» = set_stock. «غيّر السعر» = update_product.
- إذا طُلب شيء لا تملك له أداة، قل ذلك بوضوح واقترح الصفحة المناسبة في النظام.`;
}

// ─── استدعاء Claude ─────────────────────────────────────────────
async function callClaude(cfg, body) {
  const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j?.error?.message || r.statusText;
    if (r.status === 401) throw new Error('مفتاح API غير صحيح — راجعه من الإعدادات ← المساعد الذكي');
    if (r.status === 429) throw new Error('تم تجاوز حد الاستخدام مؤقتاً — حاول بعد دقيقة');
    if (/credit|billing|balance/i.test(m)) throw new Error('رصيد حساب Anthropic غير كافٍ — اشحن الرصيد من console.anthropic.com');
    throw new Error('خطأ من خدمة الذكاء الاصطناعي: ' + m);
  }
  return j;
}

async function addUsage(u) {
  const month = new Date().toISOString().slice(0, 7);
  const s = await Setting.findOne({ key: 'assistant_usage' }).lean();
  const v = s?.value?.month === month ? s.value : { month, requests: 0, input: 0, output: 0 };
  v.requests++; v.input += (u?.input_tokens || 0) + (u?.cache_read_input_tokens || 0) + (u?.cache_creation_input_tokens || 0); v.output += u?.output_tokens || 0;
  await Setting.findOneAndUpdate({ key: 'assistant_usage' }, { key: 'assistant_usage', value: v }, { upsert: true });
}

// المحادثة اللي جاية من المتصفح: نتأكد من شكلها ونقصّها من عند رسالة مستخدم
function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  const ok = h.filter(m => m && ['user', 'assistant'].includes(m.role) && (typeof m.content === 'string' || Array.isArray(m.content)));
  let start = Math.max(0, ok.length - 40);
  while (start < ok.length && !(ok[start].role === 'user' && typeof ok[start].content === 'string')) start++;
  return ok.slice(start);
}

// ─── الشات ─────────────────────────────────────────────────────
router.get('/status', auth, async (req, res) => {
  const cfg = await config();
  res.json({ enabled: !!cfg.apiKey });
});

router.post('/chat', auth, async (req, res) => {
  try {
    const cfg = await config();
    if (!cfg.apiKey) return res.status(400).json({ message: 'المساعد غير مفعّل — يُرجى إضافة مفتاح API من الإعدادات ← المساعد الذكي' });
    const text = String(req.body.message || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: 'اكتب رسالتك' });

    const theme = (await Setting.findOne({ key: 'theme' }).lean())?.value || {};
    const tools = allowedTools(req.user);
    const toolDefs = tools.map(([name, t]) => ({ name, description: t.description + (t.write ? ' (تُجهَّز وتنتظر تأكيد المستخدم)' : ''), input_schema: t.schema }));
    if (toolDefs.length) toolDefs[toolDefs.length - 1].cache_control = { type: 'ephemeral' };
    const messages = [...cleanHistory(req.body.history), { role: 'user', content: text }];
    const actions = [];

    for (let step = 0; step < 8; step++) {
      const resp = await callClaude(cfg, {
        model: cfg.model, max_tokens: 1500,
        system: [{ type: 'text', text: systemPrompt(req.user, theme.currency || 'ج.م'), cache_control: { type: 'ephemeral' } }],
        tools: toolDefs, messages,
      });
      addUsage(resp.usage).catch(() => {});
      messages.push({ role: 'assistant', content: resp.content });
      const uses = resp.content.filter(c => c.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || !uses.length) break;

      const results = [];
      for (const u of uses) {
        const t = TOOLS[u.name];
        let out, isError = false;
        try {
          if (!t || !req.user.hasPermission(t.perm)) throw new Error('ليس لديك صلاحية لهذا الإجراء');
          if (t.write) {
            const pv = await t.preview.call(t, u.input || {});
            const a = await AssistantAction.create({ user: req.user._id, tool: u.name, input: u.input, title: pv.title, lines: pv.lines });
            actions.push({ _id: a._id, title: a.title, lines: a.lines, status: 'pending' });
            out = `تم تجهيز العملية «${pv.title}» وتظهر الآن للمستخدم بانتظار ضغط «تأكيد». لم تُنفّذ بعد.`;
          } else {
            out = await t.run(u.input || {});
          }
        } catch (e) { out = 'خطأ: ' + e.message; isError = true; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out), ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }

    const last = messages[messages.length - 1];
    const reply = last.role === 'assistant' ? last.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim() : '';
    res.json({ reply: reply || (actions.length ? 'جهّزت العملية — راجعها واضغط تأكيد.' : ''), actions, history: messages.slice(-40) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// تأكيد أو إلغاء إجراء
router.post('/actions/:id/:op(confirm|cancel)', auth, async (req, res) => {
  try {
    const a = await AssistantAction.findOne({ _id: req.params.id, user: req.user._id });
    if (!a) return res.status(404).json({ message: 'الإجراء غير موجود' });
    if (a.status !== 'pending') return res.status(400).json({ message: 'تم التعامل مع هذا الإجراء مسبقاً' });
    if (req.params.op === 'cancel') { a.status = 'cancelled'; await a.save(); return res.json({ message: 'تم الإلغاء', status: a.status }); }
    const t = TOOLS[a.tool];
    if (!t || !req.user.hasPermission(t.perm)) return res.status(403).json({ message: 'ليس لديك صلاحية لهذا الإجراء' });
    try {
      a.result = await t.exec.call(t, a.input || {}, req.user);
      a.status = 'done';
    } catch (e) { a.result = e.message; a.status = 'failed'; }
    await a.save();
    res.status(a.status === 'done' ? 200 : 400).json({ message: a.result, status: a.status });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ─── الإعدادات (مدير النظام) ────────────────────────────────────
router.get('/config', auth, superAdmin, async (req, res) => {
  const s = (await Setting.findOne({ key: 'assistant' }).lean())?.value || {};
  const key = s.apiKey || process.env.ANTHROPIC_API_KEY || '';
  const usage = (await Setting.findOne({ key: 'assistant_usage' }).lean())?.value || null;
  res.json({ hasKey: !!key, keyHint: key ? key.slice(0, 7) + '…' + key.slice(-4) : '', fromEnv: !s.apiKey && !!process.env.ANTHROPIC_API_KEY, model: s.model || DEFAULT_MODEL, models: MODELS, usage });
});

router.put('/config', auth, superAdmin, async (req, res) => {
  const cur = (await Setting.findOne({ key: 'assistant' }).lean())?.value || {};
  const v = { ...cur };
  if (req.body.apiKey !== undefined) v.apiKey = String(req.body.apiKey).trim();
  if (req.body.model && MODELS[req.body.model]) v.model = req.body.model;
  if (v.apiKey && req.body.apiKey) {
    try { await callClaude({ apiKey: v.apiKey }, { model: v.model || DEFAULT_MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }); }
    catch (e) { return res.status(400).json({ message: e.message }); }
  }
  await Setting.findOneAndUpdate({ key: 'assistant' }, { key: 'assistant', value: v }, { upsert: true });
  res.json({ message: v.apiKey ? 'تم حفظ الإعدادات وتفعيل المساعد' : 'تم إيقاف المساعد' });
});

module.exports = router;
module.exports._tools = TOOLS;
