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

module.exports = router;
