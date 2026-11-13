// ═══════════════════════════════════════════════════════════════
// الصفحة الرئيسية: «شغل النهارده» — كل حاجة محتاجة تتعمل في مكان واحد
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { Product } = require('../models/index');
const { Shipment } = require('../models/shipment');
const { Damaged } = require('../models/damaged');
const { AmazonOrder, AmazonTransaction } = require('../models/amazon');
const { auth } = require('../middleware/auth');
const { buildResolver } = require('./amazon');

router.get('/', auth, async (req, res) => {
  try {
    const can = (p) => req.user.hasPermission(p);
    const out = {};

    if (can('shipments:read')) {
      const recent = (await Shipment.find({ $or: [{ status: 'draft' }, { status: 'posted', 'match.result': { $ne: 'matched' } }] })
        .populate('employee', 'name').populate('customer', 'name platform').sort('-createdAt').limit(100).lean())
        // المطابقة بتقرير أمازون: شحنات أمازون بس (أو القديمة اللي من غير عميل)
        .filter(s => s.status === 'draft' || !s.customer || s.customer.platform === 'amazon');
      const brief = (s) => ({ _id: s._id, no: s.no, employee: s.employee?.name, customer: s.customer?.name, date: s.createdAt, qty: s.items.reduce((t, i) => t + i.qty, 0) });
      out.shipments = {
        drafts: recent.filter(s => s.status === 'draft').map(brief),
        toMatch: recent.filter(s => s.status === 'posted' && !s.match?.fileName).map(brief),
        diff: recent.filter(s => s.status === 'posted' && s.match?.result === 'diff').map(brief),
        damaged: (await Damaged.find({ status: 'pending' }).select('name qty shipmentNo').sort('-createdAt').limit(100).lean())
          .map(d => ({ _id: d._id, name: d.name, qty: d.qty, no: d.shipmentNo })),
      };
    }

    if (can('products:read')) {
      const prods = await Product.find({ active: { $ne: false } }).select('name stock minStock').lean();
      out.stock = {
        out: prods.filter(p => p.stock <= 0).map(p => ({ _id: p._id, name: p.name, stock: p.stock })),
        low: prods.filter(p => p.stock > 0 && p.stock <= (p.minStock || 0)).map(p => ({ _id: p._id, name: p.name, stock: p.stock, minStock: p.minStock })),
      };
    }

    if (can('amazon:read')) {
      const { resolve } = await buildResolver();
      const [txSkus, orderSkus] = await Promise.all([
        AmazonTransaction.distinct('sku', { sku: { $ne: '' }, kind: { $in: ['order', 'refund'] } }),
        AmazonOrder.distinct('sku')
      ]);
      const unmapped = [...new Set([...txSkus, ...orderSkus])].filter(s => s && !resolve(s));
      const since = new Date(Date.now() - 7 * 864e5);
      const refunds = await AmazonTransaction.find({ kind: 'refund', date: { $gte: since } }).select('date orderId description qty total').sort('-date').lean();
      out.amazon = {
        unmapped: unmapped.length,
        refunds: refunds.map(r => ({ date: r.date, orderId: r.orderId, name: r.description, qty: Math.abs(r.qty), amount: Math.round(r.total * 100) / 100 })),
      };
    }
    if (req.user.role === 'superadmin') {
      const Setting = require('../models/Setting');
      const last = (await Setting.findOne({ key: 'last_backup' }).lean())?.value;
      out.backup = { last: last?.at || null, days: last ? Math.floor((Date.now() - new Date(last.at)) / 864e5) : null };
    }
    res.json(out);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// تصنيف المخزون: كل قسم — حجمه في المخزون مقابل حجمه في المبيعات
// ═══════════════════════════════════════════════════════════════
router.get('/categories', auth, async (req, res) => {
  try {
    if (!req.user.hasPermission('products:read')) return res.status(403).json({ message: 'لا تملك الصلاحية' });
    const { Category } = require('../models/index');
    const days = Math.min(365, Math.max(7, +req.query.days || 30));
    const since = new Date(Date.now() - days * 864e5);
    const r2 = (n) => Math.round((n || 0) * 100) / 100;
    const [cats, { resolve, parts, products }, orders] = await Promise.all([
      Category.find().lean(),
      buildResolver(),
      AmazonOrder.find({ purchaseDate: { $gte: since }, stage: { $ne: 'cancelled' } }).select('sku asin qty itemPrice').lean(),
    ]);
    const full = await Product.find({ active: { $ne: false }, isKit: { $ne: true } }).select('category stock minStock buyPrice').lean();
    const catOf = new Map(full.map(p => [String(p._id), p.category ? String(p.category) : 'none']));

    const sold = {};      // productId → { units, revenue }
    for (const o of orders) {
      const kit = parts(o.sku, o.asin); if (!kit.length) continue;
      const share = o.itemPrice / kit.length;           // إيراد الطقم بيتقسم على مكوناته
      for (const k of kit) { const x = (sold[k.p._id] ||= { units: 0, revenue: 0 }); x.units += o.qty * k.qty; x.revenue += share; }
    }
    const G = {};
    const g = (id) => (G[id] ||= { _id: id, products: 0, inStock: 0, out: 0, low: 0, units: 0, value: 0, noCost: 0, selling: 0, soldUnits: 0, revenue: 0, deadValue: 0, outSelling: 0 });
    for (const p of full) {
      const x = g(catOf.get(String(p._id)));
      const s = sold[p._id];
      x.products++;
      if (p.stock > 0) { x.inStock++; x.units += p.stock; x.value += p.stock * (p.buyPrice || 0); } else x.out++;
      if (p.stock > 0 && p.stock <= (p.minStock || 0)) x.low++;
      if (!p.buyPrice) x.noCost++;
      if (s) { x.selling++; x.soldUnits += s.units; x.revenue += s.revenue; if (p.stock <= 0) x.outSelling++; }
      else if (p.stock > 0) x.deadValue += p.stock * (p.buyPrice || 0);
    }
    const T = Object.values(G).reduce((t, x) => ({ products: t.products + x.products, value: t.value + x.value, revenue: t.revenue + x.revenue, soldUnits: t.soldUnits + x.soldUnits, deadValue: t.deadValue + x.deadValue }), { products: 0, value: 0, revenue: 0, soldUnits: 0, deadValue: 0 });
    const names = new Map(cats.map(c => [String(c._id), c]));

    const rows = Object.values(G).map(x => {
      const c = names.get(x._id);
      const valueShare = T.value ? x.value / T.value * 100 : 0;
      const salesShare = T.revenue ? x.revenue / T.revenue * 100 : 0;
      const productShare = T.products ? x.products / T.products * 100 : 0;
      const perDay = x.soldUnits / days;
      const cover = perDay ? Math.round(x.units / perDay) : null;
      // التشخيص: مقارنة نصيب القسم من المبيعات بنصيبه من رأس المال
      let status = 'balanced', insight = '';
      if (!T.revenue) { status = 'nodata'; insight = 'ارفع تقرير الطلبات لعرض أداء القسم'; }
      else if (!T.value) { insight = x.revenue ? `${salesShare.toFixed(0)}% من المبيعات — أضف أسعار الشراء لمقارنة رأس المال` : `مفيش مبيعات في ${days} يوم`; status = x.revenue ? 'balanced' : 'frozen'; }
      else if (!x.revenue && !x.units) { status = 'nodata'; insight = `مفيش رصيد ولا مبيعات في ${days} يوم — قرر: تشتري للقسم ولا تقفله`; }
      else if (!x.revenue && x.value > 0) { status = 'frozen'; insight = `مفيش مبيعات في ${days} يوم — ${Math.round(x.value).toLocaleString('en')} رأس مال متجمد`; }
      else if (salesShare >= Math.max(valueShare, 1) * 1.5) { status = 'engine'; insight = `بيجيب ${salesShare.toFixed(0)}% من المبيعات بـ ${valueShare.toFixed(0)}% بس من رأس المال — كبّر القسم وزوّد أصنافه`; }
      else if (valueShare >= 5 && salesShare <= valueShare * 0.5) { status = 'heavy'; insight = `شايل ${valueShare.toFixed(0)}% من رأس المال ومبيعاته ${salesShare.toFixed(0)}% بس — خفّض الشراء وصفّي الراكد`; }
      else insight = 'أداء متوازن مع حجمه في المخزون';
      const alerts = [];
      if (x.outSelling) alerts.push(`${x.outSelling} صنف بيبيع ورصيده خلص`);
      if (x.low) alerts.push(`${x.low} تحت حد الطلب`);
      if (x.noCost) alerts.push(`${x.noCost} بدون سعر شراء`);
      return {
        _id: x._id, name: c?.name || 'بدون فئة', color: c?.color || '#64748b',
        products: x.products, inStock: x.inStock, out: x.out, low: x.low, units: x.units, value: r2(x.value),
        selling: x.selling, soldUnits: x.soldUnits, revenue: r2(x.revenue), deadValue: r2(x.deadValue),
        valueShare: r2(valueShare), salesShare: r2(salesShare), productShare: r2(productShare),
        sellThrough: x.products ? Math.round(x.selling / x.products * 100) : 0, cover, status, insight, alerts,
      };
    }).sort((a, b) => b.products - a.products);

    // عناوين سريعة للصفحة
    const headlines = [];
    if (T.revenue) {
      const top = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
      if (top?.revenue && rows.length > 1) headlines.push({ icon: '🏆', text: `«${top.name}» أكبر قسم مبيعاً: ${top.salesShare.toFixed(0)}% من الإيراد` });
      const engines = rows.length > 1 ? rows.filter(r => r.status === 'engine') : [];
      if (engines.length) headlines.push({ icon: '⚡', text: `أقسام بتبيع أكتر من حجمها: ${engines.map(r => r.name).join('، ')} — فرصة للتوسع` });
      const top3 = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 3).reduce((t, r) => t + r.salesShare, 0);
      if (rows.length > 3 && top3 >= 75) headlines.push({ icon: '⚖️', text: `${top3.toFixed(0)}% من مبيعاتك من 3 أقسام بس — نوّع عشان تقلل المخاطرة` });
    }
    const frozen = [...rows].sort((a, b) => b.deadValue - a.deadValue)[0];
    if (frozen?.deadValue > 0) headlines.push({ icon: '🧊', text: `أكبر رأس مال راكد في «${frozen.name}»: ${Math.round(frozen.deadValue).toLocaleString('en')} في أصناف ماباعتش` });
    const noCost = rows.reduce((t, r) => t + (r.alerts.find(a => a.includes('بدون سعر شراء')) ? parseInt(r.alerts.find(a => a.includes('بدون سعر شراء'))) : 0), 0);
    if (noCost) headlines.push({ icon: '🏷️', text: `${noCost} صنف بدون سعر شراء — قيمة المخزون والربحية مش دقيقة لحد ما تكملهم` });

    res.json({ days, rows, totals: { ...T, value: r2(T.value), revenue: r2(T.revenue), deadValue: r2(T.deadValue), categories: rows.length }, headlines });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
