// ═══════════════════════════════════════════════════════════════
// تحريك المخزون من مكان واحد — بيفهم الصنف المركب (الطقم)
// الطقم مالوش رصيد: أي حركة عليه بتتوزع على مكوناته (كل مكوّن × كميته)
// ═══════════════════════════════════════════════════════════════
const { Product, StockMovement } = require('../models/index');

/**
 * delta موجب = إضافة للمخزون، سالب = خصم
 * opts: { type: 'in'|'out'|'return'|'adjust', reason, reference, userId }
 * بيرجّع الحركات اللي اتعملت [{ product, name, before, after, qty }]
 */
async function moveStock(productId, delta, opts = {}) {
  const p = await Product.findById(productId);
  if (!p) return [];
  if (p.isKit && p.components?.length) {
    const out = [];
    for (const c of p.components) {
      out.push(...await moveStock(c.product, delta * (c.qty || 1), { ...opts, reason: `${opts.reason || ''} (طقم: ${p.name})`.trim(), _nested: true }));
    }
    return out;
  }
  const before = p.stock;
  p.stock = before + delta;
  await p.save();
  await StockMovement.create({
    product: p._id, type: opts.type || (delta < 0 ? 'out' : 'in'), qty: Math.abs(delta), before, after: p.stock,
    reason: opts.reason || '', reference: opts.reference || '', createdBy: opts.userId,
  });
  return [{ product: p._id, name: p.name, before, after: p.stock, qty: Math.abs(delta) }];
}

// تكلفة الصنف: الطقم = مجموع تكلفة مكوناته
async function costOf(product) {
  const p = product?.isKit !== undefined ? product : await Product.findById(product).lean();
  if (!p) return 0;
  if (!p.isKit || !p.components?.length) return p.buyPrice || 0;
  const comps = await Product.find({ _id: { $in: p.components.map(c => c.product) } }).select('buyPrice').lean();
  return p.components.reduce((t, c) => t + (comps.find(x => String(x._id) === String(c.product))?.buyPrice || 0) * (c.qty || 1), 0);
}

module.exports = { moveStock, costOf };
