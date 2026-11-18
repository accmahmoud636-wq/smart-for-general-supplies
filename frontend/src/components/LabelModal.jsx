import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Btn, C_THEME as C } from './UI';
import { LABEL_SIZES, printLabels, barcodeSVG } from '../utils/barcode';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { normAr } from './ProductPicker';

const SIZE_KEY = 'erp_label_size';
const QUEUE_KEY = 'erp_label_queue';   // القائمة القديمة في المتصفح — بتتنقل للقوائم المحفوظة مرة واحدة
export const newListId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const cleanCopies = (c) => Object.fromEntries(Object.entries(c || {}).filter(([, n]) => +n > 0));
// القوائم المحفوظة على السيرفر (مشتركة لكل الأجهزة)
export const loadLabelLists = async () => {
  let ls = (await api.get('/label-lists')).data || [];
  try {
    const old = cleanCopies(JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}'));
    if (Object.keys(old).length) { ls = [...ls, { id: newListId(), name: 'قائمة محفوظة', copies: old }]; await saveLabelLists(ls); }
    localStorage.removeItem(QUEUE_KEY);
  } catch { /* */ }
  return ls;
};
export const saveLabelLists = (ls) => api.put('/label-lists', ls.map(l => ({ ...l, copies: cleanCopies(l.copies) })));
const clean = cleanCopies;

// products: المنتجات — initial: { productId: copies } — maps: ربط SKUs أمازون الإضافية
// list: قائمة محفوظة مفتوحة (تعديلها بيتحفظ تلقائياً عبر onSaveList) — أو null = اختيار جديد غير محفوظ
export default function LabelModal({ open, onClose, products = [], initial = {}, maps = [], list = null, onSaveList }) {
  const [copies, setCopies] = useState({});
  const [size, setSize] = useState(() => { try { return localStorage.getItem(SIZE_KEY) || '50x25'; } catch { return '50x25'; } });
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [search, setSearch] = useState('');
  const [onlySel, setOnlySel] = useState(false);
  const [name, setName] = useState('');
  const saveT = useRef();
  const ready = useRef(false);

  useEffect(() => {
    if (!open) { ready.current = false; return; }
    const c = list ? { ...clean(list.copies), ...initial } : { ...initial };
    setCopies(c); setName(list?.name || ''); setSearch(''); setOnlySel(!!list && Object.keys(clean(c)).length > 0);
    ready.current = true;
  }, [open, list?.id]);
  // القائمة المحفوظة: أي تعديل بيتحفظ لوحده
  useEffect(() => {
    if (!open || !ready.current || !list) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => onSaveList?.({ ...list, name: name.trim() || list.name, copies: clean(copies) }), 500);
  }, [copies, name]);

  const saveAsList = () => {
    const n = prompt('اسم القائمة:', `قائمة ${new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}`);
    if (!n || !n.trim()) return;
    onSaveList?.({ id: newListId(), name: n.trim().slice(0, 60), copies: clean(copies) }, true);
    toast.success(`تم حفظ «${n.trim()}» في القوائم المحفوظة`);
  };

  // فهرس بحث: الاسم + SKU الأساسي + كل SKUs الإعلانات + ASIN + الباركود
  const index = useMemo(() => {
    const extra = {};
    for (const m of maps) (extra[m.product?._id || m.product] ||= []).push(m.sku);
    return products.map(p => ({ p, skus: [p.sku, ...(extra[p._id] || [])].filter(Boolean), k: normAr([p.name, p.sku, p.asin, p.barcode, ...(extra[p._id] || [])].filter(Boolean).join(' ')) }));
  }, [products, maps]);
  const words = normAr(search).split(' ').filter(Boolean);
  const list_ = useMemo(() => index.filter(x => (!onlySel || words.length || +copies[x.p._id] > 0) && (!words.length || words.every(w => x.k.includes(w))))
    .map(x => ({ ...x.p, _hit: words.length ? x.skus.find(s => words.some(w => normAr(s).includes(w))) : null })), [index, search, onlySel, copies]);
  const total = Object.values(copies).reduce((s, n) => s + (+n || 0), 0);
  const selCount = products.filter(p => +copies[p._id] > 0).length;
  const first = products.find(p => copies[p._id] > 0 && p.barcode);

  const setAll = (fn) => setCopies(c => { const n = { ...c }; list_.forEach(p => { n[p._id] = fn(p); }); return n; });

  const doPrint = () => {
    try { localStorage.setItem(SIZE_KEY, size); } catch { /* */ }
    const items = products.filter(p => copies[p._id] > 0).map(p => ({ name: p.name, barcode: p.barcode, price: p.sellPrice, copies: +copies[p._id] }));
    const noCode = items.filter(i => !i.barcode).length;
    if (noCode) toast.error(`${noCode} صنف دون باركود — يُرجى توليد الباركود أولاً`);
    // القائمة بتفضل محفوظة بعد الطباعة عشان تقدر ترجع تطبعها في أي وقت
    if (printLabels(items, size, { showName, showPrice })) toast.success(`تم إرسال ${items.reduce((t, i) => t + i.copies, 0)} ملصق للطباعة`);
  };

  const inp = { background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 13 };

  return (
    <Modal open={open} onClose={onClose} title={list ? `طباعة قائمة «${name || list.name}»` : 'طباعة ملصقات الباركود'} width={740}>
      {list && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: C.accent + '14', border: `1px solid ${C.accent}55` }}>
          <span style={{ fontSize: 13, color: C.sub, whiteSpace: 'nowrap' }}>قائمة محفوظة:</span>
          <input value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 14, fontWeight: 700, padding: '5px 8px' }} />
          <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>تُحفظ التعديلات تلقائياً</span>
        </div>
      )}
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, fontSize: 13, color: C.sub, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={onlySel} onChange={e => setOnlySel(e.target.checked)} /> عرض المختار فقط ({selCount}) — البحث يعرض كل الأصناف</label>
        {selCount > 0 && <button onClick={() => { if (confirm('تفريغ كل الأصناف المختارة؟')) { setCopies({}); setOnlySel(false); } }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>تفريغ الاختيار</button>}
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
        {!products.length && <div style={{ padding: 18, textAlign: 'center', color: C.muted, fontSize: 13 }}>جارٍ تحميل الأصناف…</div>}
        {list_.map(p => (
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
        <span style={{ fontSize: 13, color: C.sub }}>{selCount} صنف — إجمالي الملصقات: <b style={{ color: 'var(--text)' }}>{total}</b></span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>إغلاق</Btn>
          {!list && onSaveList && <Btn variant="ghost" onClick={saveAsList} disabled={!selCount}>💾 حفظ كقائمة</Btn>}
          <Btn onClick={doPrint} disabled={!total}>طباعة</Btn>
        </div>
      </div>
    </Modal>
  );
}
