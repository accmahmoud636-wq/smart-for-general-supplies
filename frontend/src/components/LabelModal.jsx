import { useState, useEffect, useMemo } from 'react';
import { Modal, Btn, C_THEME as C } from './UI';
import { LABEL_SIZES, printLabels, barcodeSVG } from '../utils/barcode';
import toast from 'react-hot-toast';
import { normAr } from './ProductPicker';

const SIZE_KEY = 'erp_label_size';

// products: المنتجات المعروضة — initial: { productId: copies }
// maps: ربط SKUs أمازون الإضافية [{ sku, product }] — عشان البحث يلاقي الصنف بأي SKU من إعلاناته
export default function LabelModal({ open, onClose, products = [], initial = {}, maps = [] }) {
  const [copies, setCopies] = useState({});
  const [size, setSize] = useState(() => { try { return localStorage.getItem(SIZE_KEY) || '50x25'; } catch { return '50x25'; } });
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => { if (open) { setCopies(initial); setSearch(''); } }, [open]);

  // فهرس بحث: الاسم + SKU الأساسي + كل SKUs الإعلانات + ASIN + الباركود
  const index = useMemo(() => {
    const extra = {};
    for (const m of maps) (extra[m.product?._id || m.product] ||= []).push(m.sku);
    return products.map(p => ({ p, skus: [p.sku, ...(extra[p._id] || [])].filter(Boolean), k: normAr([p.name, p.sku, p.asin, p.barcode, ...(extra[p._id] || [])].filter(Boolean).join(' ')) }));
  }, [products, maps]);
  const words = normAr(search).split(' ').filter(Boolean);
  const list = useMemo(() => index.filter(x => !words.length || words.every(w => x.k.includes(w)))
    .map(x => ({ ...x.p, _hit: words.length ? x.skus.find(s => words.some(w => normAr(s).includes(w))) : null })), [index, search]);
  const total = Object.values(copies).reduce((s, n) => s + (+n || 0), 0);
  const first = products.find(p => copies[p._id] > 0 && p.barcode);

  const setAll = (fn) => setCopies(c => { const n = { ...c }; list.forEach(p => { n[p._id] = fn(p); }); return n; });

  const doPrint = () => {
    try { localStorage.setItem(SIZE_KEY, size); } catch { /* */ }
    const items = products.filter(p => copies[p._id] > 0).map(p => ({ name: p.name, barcode: p.barcode, price: p.sellPrice, copies: +copies[p._id] }));
    const noCode = items.filter(i => !i.barcode).length;
    if (noCode) toast.error(`${noCode} صنف دون باركود — يُرجى توليد الباركود أولاً`);
    if (printLabels(items, size, { showName, showPrice })) onClose();
  };

  const inp = { background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 13 };

  return (
    <Modal open={open} onClose={onClose} title="طباعة ملصقات الباركود" width={720}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={size} onChange={e => setSize(e.target.value)} style={inp}>
          {Object.entries(LABEL_SIZES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <label style={{ fontSize: 13, color: C.sub }}><input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} /> اسم المنتج</label>
        <label style={{ fontSize: 13, color: C.sub }}><input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} /> السعر</label>
      </div>

      {first && (
        <div style={{ background: '#fff', borderRadius: 8, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#000' }}>
          {showName && <div style={{ fontWeight: 700, fontSize: 13 }}>{first.name}</div>}
          <div style={{ maxWidth: 260 }} dangerouslySetInnerHTML={{ __html: barcodeSVG(first.barcode, { height: 45 }) }} />
          {showPrice && <div style={{ fontWeight: 700, fontSize: 12 }}>{Number(first.sellPrice || 0).toFixed(2)}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو أي SKU أو الباركود" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <Btn size="sm" variant="ghost" onClick={() => setAll(() => 1)}>ملصق لكل صنف</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setAll(p => Math.max(0, p.stock || 0))}>حسب الرصيد</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setAll(() => 0)}>تصفير</Btn>
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
        {list.map(p => (
          <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.border}33` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: p.barcode ? C.muted : '#f87171', fontFamily: 'monospace' }}>{p.barcode || 'دون باركود'} · الرصيد {p.stock}{p._hit && <span style={{ color: '#f59e0b' }}> · SKU {p._hit}</span>}</div>
            </div>
            <input type="number" min="0" value={copies[p._id] ?? ''} placeholder="0" onChange={e => setCopies({ ...copies, [p._id]: e.target.value })} style={{ ...inp, width: 80, textAlign: 'center' }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 13, color: C.sub }}>إجمالي الملصقات: <b style={{ color: 'var(--text)' }}>{total}</b></span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>إلغاء</Btn>
          <Btn onClick={doPrint} disabled={!total}>طباعة</Btn>
        </div>
      </div>
    </Modal>
  );
}
