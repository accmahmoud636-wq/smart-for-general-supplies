import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Card, Btn, Badge, Table, fmt, fmtDate, THEME, C_THEME as C } from '../components/UI';
import ProductPicker, { normAr } from '../components/ProductPicker';
import { beep } from '../utils/barcode';
import { useAuth } from '../context/AuthContext';

const CUR = THEME.currency || 'ج.م';
const err = (e) => e.response?.data?.message || e.message || 'خطأ';
const inp = { background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none' };

// ═══ جرد المخزون ═══════════════════════════════════════════════
export function StockCount() {
  const [open, setOpen] = useState(null);       // null = القائمة، 'new' أو id
  return open ? <CountEditor id={open === 'new' ? null : open} onBack={() => setOpen(null)} /> : <CountList onOpen={setOpen} />;
}

function CountList({ onOpen }) {
  const { can } = useAuth();
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/inventory').then(r => setList(r.data)).catch(e => toast.error(err(e))); }, []);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <b>جرد المخزون</b>
        {can('stock') && <Btn onClick={() => onOpen('new')}>+ جرد جديد</Btn>}
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={[
          { key: 'no', title: 'رقم الجرد', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#818cf8' }}>{v}</span> },
          { key: 'title', title: 'الوصف', render: v => v || '—' },
          { key: 'createdAt', title: 'التاريخ', render: v => fmtDate(v) },
          { key: 'lineCount', title: 'الأصناف' },
          { key: 'summary', title: 'الفروقات', render: (s, r) => {
            const x = r.status === 'posted' ? r.result || s : s;
            return x.diffItems ? <span style={{ fontSize: 12 }}><span style={{ color: '#10b981' }}>+{x.plus}</span> / <span style={{ color: '#f87171' }}>−{x.minus}</span> <span style={{ color: C.muted }}>({fmt(x.net)} {CUR})</span></span> : <span style={{ color: C.muted }}>لا فروقات</span>;
          } },
          { key: 'status', title: 'الحالة', render: v => <Badge color={v === 'posted' ? '#10b981' : '#f59e0b'}>{v === 'posted' ? 'مُرحّل' : 'مسودة'}</Badge> },
          { key: 'createdBy', title: 'بواسطة', render: v => v?.name || '—' },
          { key: '_id', title: '', render: (id) => <Btn size="sm" variant="ghost" onClick={() => onOpen(id)}>فتح</Btn> },
        ]} data={list} />
        {!list.length && <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 13 }}>لا توجد عمليات جرد بعد — ابدأ بـ «+ جرد جديد»</div>}
      </Card>
    </div>
  );
}

function CountEditor({ id: initialId, onBack }) {
  const { can } = useAuth();
  const [id, setId] = useState(initialId);
  const [doc, setDoc] = useState(null);
  const [lines, setLines] = useState([]);
  const [title, setTitle] = useState('');
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [code, setCode] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const scanRef = useRef();
  const posted = doc?.status === 'posted';
  const editable = !posted && can('stock');

  const load = (cid) => api.get(`/inventory/${cid}`).then(r => { setDoc(r.data); setLines(r.data.lines); setTitle(r.data.title || ''); setDirty(false); });
  useEffect(() => {
    if (initialId) load(initialId).catch(e => toast.error(err(e)));
    else setDoc({ status: 'draft', no: 'جديد', lines: [] });
    api.get('/products').then(r => setProducts(r.data.filter(p => p.active !== false && !p.isKit))).catch(() => {});
    api.get('/categories').then(r => setCats(r.data)).catch(() => {});
  }, []);
  useEffect(() => { if (editable) scanRef.current?.focus(); }, [doc]);

  const pById = useMemo(() => new Map(products.map(p => [p._id, p])), [products]);
  const addProduct = (p, inc = 0) => {
    setLines(ls => {
      const i = ls.findIndex(l => String(l.product) === String(p._id));
      if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], counted: c[i].counted + inc }; return [c[i], ...c.filter((_, k) => k !== i)]; }
      return [{ product: p._id, name: p.name, barcode: p.barcode, system: p.stock, counted: inc, cost: p.buyPrice || 0 }, ...ls];
    });
    setDirty(true);
  };
  // المسح: كل مسحة = قطعة واحدة
  const scan = async () => {
    const v = code.trim(); setCode('');
    if (!v) return;
    try {
      const { data: p } = await api.get(`/products/barcode/${encodeURIComponent(v)}`);
      if (p.isKit) { beep(false); toast.error('الصنف المركب لا يُجرد — اجرد مكوناته'); return; }
      addProduct(p, 1); beep(true);
    } catch (e) { beep(false); toast.error(err(e)); }
  };
  const addCategory = (catId) => {
    if (!catId) return;
    const list = products.filter(p => catId === 'none' ? !p.category : (p.category?._id || p.category) === catId);
    let n = 0;
    setLines(ls => { const have = new Set(ls.map(l => String(l.product))); const add = list.filter(p => !have.has(p._id)).map(p => ({ product: p._id, name: p.name, barcode: p.barcode, system: p.stock, counted: 0, cost: p.buyPrice || 0 })); n = add.length; return [...ls, ...add]; });
    setDirty(true);
    setTimeout(() => toast.success(`تمت إضافة ${n} صنف — اكتب الكمية الفعلية لكل صنف`), 0);
  };
  const setCounted = (pid, v) => { setLines(ls => ls.map(l => String(l.product) === String(pid) ? { ...l, counted: Math.max(0, Math.round(+v || 0)) } : l)); setDirty(true); };
  const remove = (pid) => { setLines(ls => ls.filter(l => String(l.product) !== String(pid))); setDirty(true); };

  const save = async () => {
    setBusy(true);
    try {
      const body = { title, lines: lines.map(l => ({ product: l.product, counted: l.counted })) };
      const { data } = id ? await api.put(`/inventory/${id}`, body) : await api.post('/inventory', body);
      setId(data._id); await load(data._id); toast.success('تم حفظ الجرد');
      return data._id;
    } catch (e) { toast.error(err(e)); return null; } finally { setBusy(false); }
  };
  const post = async () => {
    const diffs = lines.filter(l => l.counted !== l.system);
    if (!confirm(`ترحيل الجرد؟\n${diffs.length} صنف به فرق — سيتم ضبط رصيدها على الكمية الفعلية.\nلا يمكن تعديل الجرد بعد الترحيل.`)) return;
    const cid = dirty || !id ? await save() : id;
    if (!cid) return;
    setBusy(true);
    try { const { data } = await api.post(`/inventory/${cid}/post`); toast.success(data.message, { duration: 6000 }); await load(cid); }
    catch (e) { toast.error(err(e)); }
    setBusy(false);
  };
  const del = async () => {
    if (!id) return onBack();
    if (!confirm('حذف مسودة الجرد؟')) return;
    try { await api.delete(`/inventory/${id}`); toast.success('تم الحذف'); onBack(); } catch (e) { toast.error(err(e)); }
  };

  if (!doc) return <div style={{ padding: 30, color: C.muted }}>⏳</div>;
  const words = normAr(q).split(' ').filter(Boolean);
  const shown = lines.filter(l => (!onlyDiff || l.counted !== l.system) && (!words.length || words.every(w => normAr(`${l.name} ${l.barcode || ''}`).includes(w))));
  const S = lines.reduce((s, l) => { const d = l.counted - l.system; if (d > 0) { s.plus += d; s.pv += d * l.cost; } if (d < 0) { s.minus -= d; s.mv -= d * l.cost; } if (d) s.n++; return s; }, { plus: 0, minus: 0, pv: 0, mv: 0, n: 0 });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Btn variant="ghost" size="sm" onClick={() => { if (dirty && !confirm('توجد تعديلات غير محفوظة — الخروج؟')) return; onBack(); }}>→ رجوع</Btn>
        <b style={{ fontSize: 16 }}>جرد {doc.no}</b>
        <Badge color={posted ? '#10b981' : '#f59e0b'}>{posted ? `مُرحّل ${fmtDate(doc.postedAt)}${doc.postedBy?.name ? ' — ' + doc.postedBy.name : ''}` : 'مسودة'}</Badge>
        {editable && <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} placeholder="وصف الجرد (مثال: جرد المطبخ — رف 3)" style={{ ...inp, flex: 1, minWidth: 220 }} />}
        {posted && doc.title && <span style={{ color: C.sub }}>{doc.title}</span>}
      </div>

      {editable && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={scanRef} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && scan()} placeholder="📷 امسح الباركود — كل مسحة = قطعة"
              style={{ ...inp, flex: 2, minWidth: 220, border: '2px solid #6366f1', fontSize: 15, padding: '10px 12px' }} />
            <div style={{ flex: 2, minWidth: 220 }}><ProductPicker products={products} onSelect={(pid) => { const p = pById.get(pid); if (p) addProduct(p, 0); }} width="100%" placeholder="أو ابحث عن صنف لإضافته..." /></div>
            <select onChange={e => { addCategory(e.target.value); e.target.value = ''; }} defaultValue="" style={{ ...inp, minWidth: 170 }}>
              <option value="">+ إضافة كل أصناف فئة</option>
              {cats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              <option value="none">بدون فئة</option>
            </select>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
        {[['الأصناف', lines.length, '#6366f1'], ['أصناف بها فرق', S.n, '#f59e0b'], ['زيادة', `+${S.plus} (${fmt(S.pv)})`, '#10b981'], ['عجز', `−${S.minus} (${fmt(S.mv)})`, '#ef4444']].map(([l, v, c]) => (
          <div key={l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: C.muted }}>{l}</div><div style={{ fontWeight: 800, fontSize: 17, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث داخل الجرد..." style={{ ...inp, minWidth: 200 }} />
        <label style={{ fontSize: 13, color: C.sub, display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)} /> الفروقات فقط</label>
      </div>
      <Card style={{ padding: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', padding: '9px 14px', fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, gap: 10 }}>
          <span style={{ flex: 1 }}>الصنف</span><span style={{ width: 80, textAlign: 'center' }}>رصيد النظام</span><span style={{ width: 100, textAlign: 'center' }}>الكمية الفعلية</span><span style={{ width: 70, textAlign: 'center' }}>الفرق</span><span style={{ width: 24 }} />
        </div>
        {shown.slice(0, 500).map(l => {
          const d = l.counted - l.system;
          return (
            <div key={l.product} style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderBottom: `1px solid ${C.border}33`, gap: 10, background: d ? (d > 0 ? '#10b9810d' : '#ef44440d') : 'transparent' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{l.barcode}</div>
              </div>
              <span style={{ width: 80, textAlign: 'center', color: C.sub }}>{l.system}</span>
              <span style={{ width: 100, textAlign: 'center' }}>
                {editable ? <input type="number" min="0" value={l.counted} onChange={e => setCounted(l.product, e.target.value)} onFocus={e => e.target.select()} style={{ ...inp, width: 80, textAlign: 'center', fontWeight: 700, fontSize: 15, padding: '6px' }} /> : <b>{l.counted}</b>}
              </span>
              <b style={{ width: 70, textAlign: 'center', color: d > 0 ? '#10b981' : d < 0 ? '#f87171' : C.muted }}>{d > 0 ? '+' + d : d || '—'}</b>
              <span style={{ width: 24 }}>{editable && <button onClick={() => remove(l.product)} title="إزالة" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>}</span>
            </div>
          );
        })}
        {!shown.length && <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 13 }}>{lines.length ? 'لا توجد نتائج' : 'امسح الأصناف أو ابحث عنها أو أضف فئة كاملة'}</div>}
        {shown.length > 500 && <div style={{ padding: 10, textAlign: 'center', color: C.muted, fontSize: 12 }}>يُعرض أول 500 — استخدم البحث</div>}
      </Card>

      {editable && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="ghost" onClick={save} disabled={busy}>💾 حفظ مسودة</Btn>
          <Btn variant="success" onClick={post} disabled={busy || !lines.length} style={{ flex: 1 }}>ترحيل الجرد وضبط الأرصدة</Btn>
          <Btn variant="danger" onClick={del} disabled={busy}>حذف</Btn>
        </div>
      )}
    </div>
  );
}

// ═══ الرصيد الافتتاحي ══════════════════════════════════════════
export function OpeningBalance() {
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [edits, setEdits] = useState({});        // productId → { qty, cost }
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/products').then(r => setProducts(r.data.filter(p => p.active !== false && !p.isKit))).catch(e => toast.error(err(e)));
  useEffect(() => { load(); api.get('/categories').then(r => setCats(r.data)).catch(() => {}); }, []);

  const words = normAr(q).split(' ').filter(Boolean);
  const list = products.filter(p => (!cat || (cat === 'none' ? !p.category : (p.category?._id || p.category) === cat))
    && (!words.length || words.every(w => normAr(`${p.name} ${p.sku || ''} ${p.barcode || ''}`).includes(w))));
  const set = (p, k, v) => setEdits(e => {
    const cur = { ...(e[p._id] || {}), [k]: v };
    const same = (cur.qty === undefined || +cur.qty === p.stock) && (cur.cost === undefined || +cur.cost === p.buyPrice);
    const n = { ...e }; if (same) delete n[p._id]; else n[p._id] = cur; return n;
  });
  const changed = Object.keys(edits).length;
  const save = async () => {
    if (!confirm(`حفظ الرصيد الافتتاحي لـ ${changed} صنف؟\nسيتم ضبط الكمية وسعر الشراء وتسجيل حركة «رصيد افتتاحي».`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/inventory/opening', { rows: Object.entries(edits).map(([product, v]) => ({ product, ...v })) });
      toast.success(data.message); setEdits({}); await load();
    } catch (e) { toast.error(err(e)); }
    setBusy(false);
  };
  const totalVal = products.reduce((t, p) => { const e = edits[p._id] || {}; const qty = e.qty !== undefined ? +e.qty : p.stock; const cost = e.cost !== undefined ? +e.cost : p.buyPrice; return t + Math.max(0, qty) * (cost || 0); }, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div><b>الرصيد الافتتاحي</b><div style={{ fontSize: 12, color: C.muted }}>قيمة المخزون بعد التعديلات: {fmt(totalVal)} {CUR}</div></div>
        <Btn variant="success" onClick={save} disabled={busy || !changed}>{busy ? '⏳' : `💾 حفظ التعديلات (${changed})`}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو SKU أو الباركود..." style={{ ...inp, flex: 1, minWidth: 220 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={inp}>
          <option value="">كل الفئات</option>
          {cats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          <option value="none">بدون فئة</option>
        </select>
      </div>
      <Card style={{ padding: 0 }}>
        <div style={{ display: 'flex', padding: '9px 14px', fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, gap: 10 }}>
          <span style={{ flex: 1 }}>الصنف ({list.length})</span><span style={{ width: 110, textAlign: 'center' }}>الكمية</span><span style={{ width: 120, textAlign: 'center' }}>سعر الشراء</span><span style={{ width: 100, textAlign: 'center' }}>القيمة</span>
        </div>
        {list.slice(0, 300).map(p => {
          const e = edits[p._id] || {};
          const qty = e.qty !== undefined ? e.qty : p.stock, cost = e.cost !== undefined ? e.cost : p.buyPrice;
          return (
            <div key={p._id} style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', borderBottom: `1px solid ${C.border}33`, gap: 10, background: edits[p._id] ? '#6366f112' : 'transparent' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{p.sku || p.barcode}</div>
              </div>
              <input type="number" value={qty} onChange={ev => set(p, 'qty', ev.target.value)} onFocus={ev => ev.target.select()} style={{ ...inp, width: 110, textAlign: 'center', fontWeight: 700, borderColor: e.qty !== undefined ? '#6366f1' : C.border }} />
              <input type="number" value={cost} onChange={ev => set(p, 'cost', ev.target.value)} onFocus={ev => ev.target.select()} style={{ ...inp, width: 120, textAlign: 'center', borderColor: e.cost !== undefined ? '#6366f1' : (!p.buyPrice ? '#f59e0b88' : C.border) }} />
              <span style={{ width: 100, textAlign: 'center', fontSize: 12, color: C.sub }}>{fmt(Math.max(0, +qty || 0) * (+cost || 0))}</span>
            </div>
          );
        })}
        {list.length > 300 && <div style={{ padding: 10, textAlign: 'center', color: C.muted, fontSize: 12 }}>يُعرض أول 300 صنف — استخدم البحث أو الفئة</div>}
      </Card>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>الخانات المظللة بالبرتقالي: أصناف بدون سعر شراء. الأصناف المركبة لا تظهر هنا لأن رصيدها محسوب من مكوناتها.</div>
    </div>
  );
}
