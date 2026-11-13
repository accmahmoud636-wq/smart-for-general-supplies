import { useState, useRef, useMemo } from 'react';
import { C_THEME as C } from './UI';

// بحث عربي مرن: بيتجاهل الهمزات والتاء المربوطة والتشكيل
export const normAr = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ').trim();

// اختيار صنف بالبحث بدل قائمة طويلة — تكتب جزء من الاسم أو SKU أو الباركود
export default function ProductPicker({ products = [], onSelect, placeholder = 'ابحث باسم الصنف أو SKU أو الباركود...', width = 260, borderColor }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState(null);
  const ref = useRef();

  const index = useMemo(() => products.map(p => ({ p, k: normAr([p.name, p.sku, p.barcode, p.asin].filter(Boolean).join(' ')) })), [products]);
  const results = useMemo(() => {
    const words = normAr(q).split(' ').filter(Boolean);
    if (!words.length) return [];
    return index.filter(x => words.every(w => x.k.includes(w))).slice(0, 30).map(x => x.p);
  }, [q, index]);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom > 260;
    setPos({ left: r.left, width: Math.max(r.width, 320), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
  };
  const pick = (p) => { setQ(''); setOpen(false); onSelect(p._id, p); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); pick(results[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div style={{ position: 'relative', width, maxWidth: '100%' }}>
      <input ref={ref} value={q} placeholder={placeholder}
        onChange={e => { setQ(e.target.value); setHi(0); setOpen(true); place(); }}
        onFocus={() => { setOpen(true); place(); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: `1px solid ${borderColor || C.border}`, borderRadius: 6, padding: '7px 10px', color: C.text, fontSize: 12, outline: 'none' }} />
      {open && q.trim() && pos && (
        <div style={{ position: 'fixed', ...pos, zIndex: 3000, maxHeight: 260, overflowY: 'auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 10px 30px #0007' }}>
          {!results.length && <div style={{ padding: 12, fontSize: 12, color: C.muted }}>لا توجد نتائج — جرّب كلمة أقصر</div>}
          {results.map((p, i) => (
            <div key={p._id} onMouseDown={e => { e.preventDefault(); pick(p); }} onMouseEnter={() => setHi(i)}
              style={{ padding: '8px 12px', cursor: 'pointer', background: i === hi ? '#6366f122' : 'transparent', borderBottom: `1px solid ${C.border}33` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
              <div style={{ fontSize: 11, color: C.muted, direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>
                {[p.sku, p.barcode].filter(Boolean).join(' · ')}{p.stock !== undefined && <span style={{ fontFamily: 'inherit' }}> · الرصيد {p.stock}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// خانة اختيار صنف: لو مختار يظهر اسمه وزرار تغيير، ولو فاضي تظهر خانة البحث
export function ProductSelect({ products = [], value, onChange, showStock, style }) {
  const p = value && products.find(x => x._id === value);
  if (p) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, minWidth: 0, ...style }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}{showStock && <span style={{ fontSize: 11, color: C.muted }}> · مخزون {p.stock}</span>}</span>
      <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>تغيير</button>
    </div>
  );
  return <div style={{ minWidth: 0, ...style }}><ProductPicker products={products} onSelect={(id) => onChange(id)} width="100%" placeholder="اكتب اسم الصنف أو SKU أو الباركود..." /></div>;
}
