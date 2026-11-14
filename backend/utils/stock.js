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

// ═══ المتوسط المرجح ═══════════════════════════════════════════
// استلام كمية بتكلفة وحدة: سعر الشراء الجديد = (الرصيد × السعر الحالي + الكمية × التكلفة) ÷ (الرصيد + الكمية)
// الطقم: التكلفة بتتوزع على مكوناته بنسبة تكلفتها الحالية. بيرجّع سجل [{product, qty, unit}] عشان الحذف يرجّع السعر
const r4 = (n) => Math.round(n * 10000) / 10000;
async function averageIn(productId, qty, unitCost) {
  const p = await Product.findById(productId);
  if (!p || !(qty > 0) || !(unitCost >= 0)) return [];
  if (p.isKit && p.components?.length) {
    const comps = await Product.find({ _id: { $in: p.components.map(c => c.product) } }).select('buyPrice').lean();
    const parts = p.components.map(c => ({ id: c.product, q: c.qty || 1, cost: comps.find(x => String(x._id) === String(c.product))?.buyPrice || 0 }));
    const base = parts.reduce((t, c) => t + c.cost * c.q, 0);
    const out = [];
    for (const c of parts) {
      const share = base ? c.cost * c.q / base : 1 / parts.length;      // نصيب المكوّن من تكلفة الطقم
      out.push(...await averageIn(c.id, qty * c.q, unitCost * share / c.q));
    }
    return out;
  }
  const before = Math.max(0, p.stock);
  p.buyPrice = before > 0 ? r4((before * (p.buyPrice || 0) + qty * unitCost) / (before + qty)) : r4(unitCost);
  await p.save();
  return [{ product: p._id, qty, unit: r4(unitCost) }];
}
// عكس الاستلام (حذف فاتورة شراء): بيشيل أثر الكمية وتكلفتها من المتوسط
async function averageOut(log = []) {
  for (const l of log) {
    const p = await Product.findById(l.product);
    if (!p) continue;
    const cur = Math.max(0, p.stock), rest = cur - l.qty;
    if (rest > 0) {
      const v = (cur * (p.buyPrice || 0) - l.qty * l.unit) / rest;
      if (v > 0) { p.buyPrice = r4(v); await p.save(); }
    }
  }
}

// تكلفة الصنف: الطقم = مجموع تكلفة مكوناته
async function costOf(product) {
  const p = product?.isKit !== undefined ? product : await Product.findById(product).lean();
  if (!p) return 0;
  if (!p.isKit || !p.components?.length) return p.buyPrice || 0;
  const comps = await Product.find({ _id: { $in: p.components.map(c => c.product) } }).select('buyPrice').lean();
  return p.components.reduce((t, c) => t + (comps.find(x => String(x._id) === String(c.product))?.buyPrice || 0) * (c.qty || 1), 0);
}

module.exports = { moveStock, costOf, averageIn, averageOut };
