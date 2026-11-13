import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Modal, Btn, C_THEME as C } from './UI';
import ProductPicker from './ProductPicker';

// محتوى الإعلان: الإعلان ممكن يكون «2 حجر» (صنف × 2) أو طقم من أصناف مختلفة
// map: { sku, product, qty, components: [{ product, qty }] }
export default function KitModal({ open, onClose, sku, map, products = [], onSaved }) {
  const [rows, setRows] = useState([]);      // [{ product, qty }] — الأول هو الأساسي
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRows(map ? [{ product: map.product, qty: map.qty || 1 }, ...(map.components || []).map(c => ({ product: c.product, qty: c.qty || 1 }))] : []);
  }, [open, map]);

  const byId = (id) => products.find(p => p._id === id);
  const add = (id) => { if (rows.some(r => r.product === id)) return toast.error('الصنف موجود في الإعلان'); setRows([...rows, { product: id, qty: 1 }]); };
  const setQty = (i, q) => setRows(rows.map((r, k) => k === i ? { ...r, qty: Math.max(1, Math.round(+q || 1)) } : r));
  const remove = (i) => setRows(rows.filter((_, k) => k !== i));
  const cost = rows.reduce((t, r) => t + (byId(r.product)?.buyPrice || 0) * r.qty, 0);

  const save = async () => {
    if (!rows.length) return toast.error('أضف صنفاً واحداً على الأقل');
    setBusy(true);
    try {
      await api.post('/amazon/skus/map', { sku, product: rows[0].product, qty: rows[0].qty, components: rows.slice(1), force: true });
      toast.success('تم حفظ محتوى الإعلان'); onSaved?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.message || 'خطأ'); }
    setBusy(false);
  };

  const summary = rows.map(r => `${r.qty > 1 ? r.qty + ' × ' : ''}${byId(r.product)?.name || '؟'}`).join(' + ');
  return (
    <Modal open={open} onClose={onClose} title="محتوى الإعلان" width={600}>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12, lineHeight: 1.8 }}>
        الإعلان <b dir="ltr" style={{ fontFamily: 'monospace', color: '#fbbf24' }}>{sku}</b> — حدّد الأصناف اللي بتخرج من المخزون لما يتباع <b>إعلان واحد</b>.
        مثال: «2 حجر» = حجر × 2، أو «حجر + ليفة» = صنفين × 1.
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
        {rows.map((r, i) => {
          const p = byId(r.product);
          return (
            <div key={r.product} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${C.border}44` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p?.name || 'صنف غير موجود'} {i === 0 && <span style={{ fontSize: 10, color: C.muted }}>(الأساسي)</span>}</div>
                <div style={{ fontSize: 11, color: C.muted }}>الرصيد {p?.stock ?? '—'} · التكلفة {p?.buyPrice || 0}</div>
              </div>
              <span style={{ fontSize: 12, color: C.sub }}>الكمية</span>
              <input type="number" min="1" value={r.qty} onChange={e => setQty(i, e.target.value)} style={{ width: 64, textAlign: 'center', background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px', color: C.text, fontSize: 15, fontWeight: 700 }} />
              <button onClick={() => remove(i)} title="إزالة" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          );
        })}
        {!rows.length && <div style={{ padding: 14, fontSize: 13, color: C.muted }}>لا توجد أصناف بعد</div>}
        <div style={{ padding: 10 }}><ProductPicker products={products.filter(p => !rows.some(r => r.product === p._id))} onSelect={add} width={'100%'} placeholder="+ أضف صنف للإعلان (ابحث بالاسم أو SKU)" /></div>
      </div>
      {rows.length > 0 && (
        <div style={{ fontSize: 13, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, lineHeight: 1.8 }}>
          بيع إعلان واحد = <b>{summary}</b><br />
          <span style={{ color: C.muted }}>تكلفة الإعلان الواحد: {Math.round(cost * 100) / 100}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>إلغاء</Btn>
        <Btn onClick={save} disabled={busy || !rows.length}>{busy ? '⏳' : 'حفظ'}</Btn>
      </div>
    </Modal>
  );
}
