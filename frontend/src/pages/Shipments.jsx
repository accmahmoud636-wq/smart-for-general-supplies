import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { Card, Btn, Badge, Table, PageHeader, StatCard, fmtDate, C_THEME as C } from '../components/UI';
import { beep, printLabels } from '../utils/barcode';
import { readReportFile } from '../utils/parseReport';
import CameraScanner from '../components/CameraScanner';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const TYPES = {
  sale:   { label: 'مبيعات', color: '#10b981', icon: '🟢' },
  return: { label: 'مرتجع',  color: '#ef4444', icon: '🔴' },
};
const RESULT = {
  matched: { label: '✅ مطابق', color: '#10b981' },
  diff:    { label: '❌ فيه فرق', color: '#ef4444' },
};
const err = (e) => e.response?.data?.message || e.message || 'خطأ';

// ═══════════════════════════════════════════════════════════
// الصفحة: قائمة الشحنات ← شحنة (مسح) ← مطابقة | الموظفين
// ═══════════════════════════════════════════════════════════
export default function Shipments() {
  const [view, setView] = useState({ name: 'list' });   // list | edit {id} | match {id} | employees
  const open = (s) => setView({ name: s.status === 'draft' ? 'edit' : 'match', id: s._id });

  return (
    <div>
      {view.name === 'list' && <ShipmentList onNew={() => setView({ name: 'edit' })} onOpen={open} />}
      {view.name === 'edit' && <ShipmentEditor id={view.id} onBack={() => setView({ name: 'list' })} onPosted={(id) => setView({ name: 'match', id })} />}
      {view.name === 'match' && <ShipmentMatch id={view.id} onBack={() => setView({ name: 'list' })} />}
    </div>
  );
}

// ═══ قائمة الشحنات ═══════════════════════════════════════════
function ShipmentList({ onNew, onOpen }) {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('');
  useEffect(() => { api.get('/shipments', { params: { status: filter } }).then(r => setList(r.data)).catch(e => toast.error(err(e))); }, [filter]);
  const drafts = list.filter(s => s.status === 'draft').length;

  return (
    <div>
      <PageHeader title="الشحنات والبضاعة المسلّمة" icon="📦" actions={[
        <Btn key="new" onClick={onNew}>+ شحنة جديدة</Btn>
      ]} />
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        <b>الخطوات:</b> ① شحنة جديدة ← امسح كارت الموظف ← امسح الأصناف (مبيعات أو مرتجع) ← 💾 حفظ
        &nbsp;② ✅ ترحيل (المبيعات تتخصم من المخزون والمرتجع يرجع)
        &nbsp;③ ارفع ملف أمازون والنظام يطابق كل صنف.
      </Card>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['', 'الكل'], ['draft', `مسودات${filter === '' && drafts ? ` (${drafts})` : ''}`], ['posted', 'مرحّلة']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ background: filter === k ? '#6366f133' : 'transparent', border: `1px solid ${filter === k ? '#6366f1' : C.border}`, color: filter === k ? '#a5b4fc' : C.sub, borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{l}</button>
        ))}
      </div>
      <Card style={{ padding: 0 }}>
        <Table onRow={onOpen} columns={[
          { key: 'no', title: 'رقم الشحنة', render: v => <b style={{ fontFamily: 'monospace' }}>{v}</b> },
          { key: 'createdAt', title: 'التاريخ', render: v => fmtDate(v) },
          { key: 'employee', title: 'الموظف', render: v => v?.name || <span style={{ color: '#f87171' }}>—</span> },
          { key: 'saleQty', title: '🟢 مبيعات', render: v => v ? <b>{v}</b> : '—' },
          { key: 'returnQty', title: '🔴 مرتجع', render: v => v ? <b style={{ color: '#f87171' }}>{v}</b> : '—' },
          { key: 'status', title: 'الحالة', render: v => v === 'draft' ? <Badge color="#f59e0b">📝 مسودة</Badge> : <Badge color="#3b82f6">✅ مرحّلة</Badge> },
          { key: 'match', title: 'المطابقة', render: (v, r) => r.status === 'draft' ? '—' : v ? <Badge color={RESULT[v.result]?.color}>{RESULT[v.result]?.label}</Badge> : <Badge color="#64748b">⬆️ ارفع ملف أمازون</Badge> },
        ]} data={list} />
      </Card>
    </div>
  );
}

// ═══ شاشة المسح ═══════════════════════════════════════════════
function ShipmentEditor({ id: initialId, onBack, onPosted }) {
  const [id, setId] = useState(initialId);
  const [no, setNo] = useState('');
  const [employee, setEmployee] = useState(null);
  const [items, setItemsState] = useState([]);      // { product, name, barcode, stock, qty, type }
  const itemsRef = useRef([]);
  const setItems = (v) => { itemsRef.current = v; setItemsState(v); };
  const [mode, setMode] = useState('sale');
  const [employees, setEmployees] = useState([]);
  const [code, setCode] = useState('');
  const [flash, setFlash] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [short, setShort] = useState(null);
  const ref = useRef();

  useEffect(() => {
    api.get('/shipments/employees').then(r => setEmployees(r.data.filter(e => e.active))).catch(() => {});
    if (initialId) api.get(`/shipments/${initialId}`).then(({ data: s }) => {
      setNo(s.no); setEmployee(s.employee || null);
      setItems(s.items.map(i => ({ product: i.product?._id, name: i.product?.name || i.name, barcode: i.product?.barcode || i.barcode, stock: i.product?.stock, qty: i.qty, type: i.type })));
    }).catch(e => toast.error(err(e)));
  }, [initialId]);
  useEffect(() => { ref.current?.focus(); }, [employee, mode]);
  useEffect(() => {   // تحذير لو قفلت الصفحة من غير حفظ
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const say = (ok, text) => { beep(ok); setFlash({ ok, text }); };

  const addItem = (p, type) => {
    const list = [...itemsRef.current];
    const i = list.findIndex(x => x.product === p._id && x.type === type);
    if (i >= 0) { list[i] = { ...list[i], qty: list[i].qty + 1 }; list.unshift(list.splice(i, 1)[0]); }
    else list.unshift({ product: p._id, name: p.name, barcode: p.barcode, stock: p.stock, qty: 1, type });
    setItems(list); setDirty(true);
    return list[0].qty;
  };

  const onScan = async (raw) => {
    const fromCam = typeof raw === 'string';
    const v = (fromCam ? raw : code).trim();
    if (!fromCam) setCode('');
    if (!v) return;
    const emp = employees.find(e => e.code === v.toUpperCase());
    if (emp) {
      if (employee && employee._id !== emp._id && itemsRef.current.length) { say(false, `❌ الشحنة دي بتاعة ${employee.name} — افتح شحنة جديدة لـ ${emp.name}`); return; }
      setEmployee(emp); setDirty(true);
      say(true, `👤 ${emp.name} — امسح الأصناف`);
      return;
    }
    if (!employee) { say(false, '❌ امسح كارت الموظف الأول'); return; }
    try {
      const { data: p } = await api.get(`/products/barcode/${encodeURIComponent(v)}`);
      const q = addItem(p, mode);
      say(true, `${TYPES[mode].icon} ${p.name} — ${TYPES[mode].label} (${q})`);
    } catch (e) { say(false, '❌ ' + err(e)); }
  };

  const setQty = (idx, q) => { const l = [...items]; l[idx] = { ...l[idx], qty: Math.max(0, q) }; setItems(l.filter(x => x.qty > 0)); setDirty(true); };
  const setType = (idx, type) => {
    const l = [...items];
    const cur = l[idx];
    const j = l.findIndex((x, k) => k !== idx && x.product === cur.product && x.type === type);
    if (j >= 0) { l[j] = { ...l[j], qty: l[j].qty + cur.qty }; l.splice(idx, 1); }
    else l[idx] = { ...cur, type };
    setItems(l); setDirty(true);
  };

  const save = async (quiet) => {
    if (!employee) { say(false, '❌ امسح كارت الموظف الأول'); return null; }
    setBusy(true);
    try {
      const body = { employee: employee._id, items: items.map(i => ({ product: i.product, qty: i.qty, type: i.type })) };
      const { data } = id ? await api.put(`/shipments/${id}`, body) : await api.post('/shipments', body);
      setId(data._id); setNo(data.no); setDirty(false);
      if (!quiet) toast.success(`💾 اتحفظت ${data.no}`);
      return data._id;
    } catch (e) { toast.error(err(e)); return null; }
    finally { setBusy(false); }
  };

  const post = async (force = false) => {
    if (!items.length) { say(false, '❌ الشحنة فاضية'); return; }
    if (!force && !confirm(`ترحيل الشحنة؟\n🟢 مبيعات: ${saleQty} قطعة (هتتخصم من المخزون)\n🔴 مرتجع: ${returnQty} قطعة (هترجع للمخزون)\n\nبعد الترحيل مينفعش تتعدل.`)) return;
    const sid = await save(true);
    if (!sid) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/shipments/${sid}/post`, { force });
      toast.success(data.message);
      onPosted(sid);
    } catch (e) {
      if (e.response?.status === 409) setShort(e.response.data.short);
      else toast.error(err(e));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!id) { onBack(); return; }
    if (!confirm('تمسح المسودة دي؟')) return;
    await api.delete(`/shipments/${id}`).then(() => { toast.success('اتمسحت'); onBack(); }).catch(e => toast.error(err(e)));
  };

  const back = () => { if (dirty && !confirm('فيه تعديلات مش محفوظة — تخرج من غير حفظ؟')) return; onBack(); };
  const saleQty = items.filter(i => i.type === 'sale').reduce((s, i) => s + i.qty, 0);
  const returnQty = items.filter(i => i.type === 'return').reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title={no ? `شحنة ${no}` : 'شحنة جديدة'} icon="📦" actions={[
        <Btn key="b" variant="ghost" onClick={back}>→ رجوع</Btn>
      ]} />

      {/* الموظف */}
      <Card style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, borderColor: employee ? '#10b98155' : '#f59e0b88' }}>
        <span style={{ fontSize: 28 }}>👤</span>
        {employee
          ? <div><div style={{ fontSize: 12, color: C.muted }}>الموظف</div><div style={{ fontWeight: 800, fontSize: 18 }}>{employee.name} <span style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{employee.code}</span></div></div>
          : <div style={{ fontWeight: 700, color: '#fbbf24' }}>امسح كارت الموظف الأول</div>}
      </Card>

      {/* نوع المسح */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {Object.entries(TYPES).map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 800, background: mode === k ? t.color + '33' : 'transparent', border: `2px solid ${mode === k ? t.color : C.border}`, color: mode === k ? t.color : C.sub }}>
            {t.icon} امسح كـ {t.label}
          </button>
        ))}
      </div>

      {flash && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 10, fontWeight: 700, fontSize: 15, background: flash.ok ? '#10b98122' : '#ef444422', border: `1px solid ${flash.ok ? '#10b981' : '#ef4444'}`, color: flash.ok ? '#34d399' : '#f87171' }}>{flash.text}</div>
      )}

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={ref} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && onScan()} autoFocus
            placeholder={employee ? `امسح باركود الصنف (${TYPES[mode].label})` : 'امسح كارت الموظف'}
            style={{ flex: 1, background: 'var(--bg)', border: `2px solid ${employee ? TYPES[mode].color : '#f59e0b'}`, borderRadius: 10, padding: '14px 16px', color: '#fff', fontSize: 20, outline: 'none', fontFamily: 'monospace', direction: 'ltr', textAlign: 'center' }} />
          <button onClick={() => setCam(true)} title="مسح بالكاميرا" style={{ flexShrink: 0, width: 64, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, fontSize: 26, cursor: 'pointer' }}>📷</button>
        </div>
        <CameraScanner open={cam} onClose={() => setCam(false)} onScan={onScan} message={flash} continuous title={employee ? `امسح كـ ${TYPES[mode].label}` : 'امسح كارت الموظف'} />
      </Card>

      {/* الأصناف */}
      <Card style={{ padding: 0, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
          <b>الأصناف ({items.length})</b>
          <span style={{ fontSize: 13 }}><Badge color="#10b981">🟢 مبيعات {saleQty}</Badge> <Badge color="#ef4444">🔴 مرتجع {returnQty}</Badge></span>
        </div>
        {!items.length && <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>لسه مفيش أصناف — ابدأ المسح</div>}
        {items.map((it, i) => (
          <div key={it.product + it.type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.border}33`, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 700 }}>{it.name}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}><span dir="ltr">{it.barcode}</span>{it.stock !== undefined && ` · مخزون ${it.stock}`}</div>
            </div>
            <select value={it.type} onChange={e => setType(i, e.target.value)} style={{ background: TYPES[it.type].color + '22', border: `1px solid ${TYPES[it.type].color}`, color: TYPES[it.type].color, borderRadius: 8, padding: '8px 10px', fontWeight: 700, fontSize: 13 }}>
              <option value="sale">🟢 مبيعات</option>
              <option value="return">🔴 مرتجع</option>
            </select>
            <Btn size="sm" variant="ghost" onClick={() => setQty(i, it.qty - 1)}>−</Btn>
            <input type="number" value={it.qty} onChange={e => setQty(i, +e.target.value)} style={{ width: 64, textAlign: 'center', background: 'var(--card)', border: `1px solid ${C.border}`, borderRadius: 6, padding: 6, color: '#fff', fontSize: 16, fontWeight: 800 }} />
            <Btn size="sm" variant="ghost" onClick={() => setQty(i, it.qty + 1)}>+</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setQty(i, 0)}>🗑️</Btn>
          </div>
        ))}
      </Card>

      {short && (
        <Card style={{ marginBottom: 12, borderColor: '#ef444488' }}>
          <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 8 }}>⚠️ المخزون مش مكفي:</div>
          {short.map(s => <div key={s.product} style={{ fontSize: 13, marginBottom: 4 }}>{s.name} — ناقص {s.missing}</div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn variant="danger" onClick={() => { setShort(null); post(true); }}>رحّل برضه (المخزون هيبقى بالسالب)</Btn>
            <Btn variant="ghost" onClick={() => setShort(null)}>إلغاء</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="lg" variant="ghost" onClick={() => save()} disabled={busy || !employee}>💾 حفظ {dirty && '•'}</Btn>
        <Btn size="lg" variant="success" onClick={() => post()} disabled={busy || !items.length || !employee} style={{ flex: 1 }}>✅ ترحيل الشحنة</Btn>
        <Btn size="lg" variant="danger" onClick={remove} disabled={busy}>🗑️</Btn>
      </div>
    </div>
  );
}

// ═══ المطابقة مع ملف أمازون ════════════════════════════════════
function ShipmentMatch({ id, onBack }) {
  const [s, setS] = useState(null);
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const { can } = useAuth();

  const load = () => {
    api.get(`/shipments/${id}`).then(r => setS(r.data)).catch(e => toast.error(err(e)));
    api.get(`/shipments/${id}/match`).then(r => setM(r.data)).catch(() => {});
  };
  useEffect(() => { load(); api.get('/products').then(r => setProducts(r.data.filter(p => p.active !== false))).catch(() => {}); }, [id]);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await readReportFile(file);
      const { data } = await api.post(`/shipments/${id}/match`, { rows, fileName: file.name });
      setM(data);
      beep(data.result === 'matched');
      if (data.result === 'matched') toast.success('✅ كله مطابق');
      if (data.imported) toast(`🛒 اتسجل في مركز أمازون: ${data.imported}`, { duration: 5000 });
    } catch (e) { beep(false); toast.error(err(e)); }
    setBusy(false);
  };

  const mapSku = async (sku, product) => {
    if (!product) return;
    try { await api.post('/amazon/skus/map', { sku, product }); toast.success('اتربط'); load(); }
    catch (e) { toast.error(err(e)); }
  };
  const createProduct = async (u) => {
    const name = prompt('اسم الصنف الجديد:', u.name?.slice(0, 80) || u.sku);
    if (!name) return;
    try {
      const { data } = await api.post('/products', { name, sku: u.sku, buyPrice: 0, sellPrice: 0, stock: 0 });
      toast.success('اتعمل الصنف — ظبط سعر الشراء والمخزون من صفحة المنتجات');
      setProducts(p => [...p, data]); load();
    } catch (e) { toast.error(err(e)); }
  };

  if (!s) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const sum = m?.summary;

  return (
    <div>
      <PageHeader title={`مطابقة شحنة ${s.no}`} icon="⚖️" actions={[<Btn key="b" variant="ghost" onClick={onBack}>→ الشحنات</Btn>]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
        <StatCard label="الموظف" value={s.employee?.name || '—'} icon="👤" color="#8b5cf6" sub={s.postedAt ? `اترحّلت ${fmtDate(s.postedAt)}` : ''} />
        <StatCard label="🟢 مبيعات اتضربت" value={s.items.filter(i => i.type === 'sale').reduce((t, i) => t + i.qty, 0)} icon="📦" color="#10b981" />
        <StatCard label="🔴 مرتجع اتضرب" value={s.items.filter(i => i.type === 'return').reduce((t, i) => t + i.qty, 0)} icon="↩️" color="#ef4444" />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>⬆️ ارفع ملف أمازون</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.8 }}>
          تقرير المعاملات (Payments ← Date Range Reports ← Transaction) أو تقرير الطلبات (All Orders) — CSV أو TXT أو Excel.
          الطلبات (Order) بتتقارن بالمبيعات، والمرتجعات (Refund) بتتقارن بالمرتجع. نفس الملف بيتسجل في مركز أمازون للربحية والتسويات.
        </div>
        <label style={{ display: 'block', border: `2px dashed ${C.border}`, borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer', color: C.sub }}>
          {busy ? '⏳ جاري المطابقة...' : m ? `📄 ${m.match.fileName} — اضغط لرفع ملف تاني` : '📁 اختار الملف'}
          <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" style={{ display: 'none' }} disabled={busy} onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </Card>

      {m && <>
        <div style={{ padding: 18, borderRadius: 12, marginBottom: 14, textAlign: 'center', fontSize: 20, fontWeight: 800, background: m.result === 'matched' ? '#10b98122' : '#ef444422', border: `2px solid ${m.result === 'matched' ? '#10b981' : '#ef4444'}`, color: m.result === 'matched' ? '#34d399' : '#f87171' }}>
          {m.result === 'matched' ? '✅ مطابق — كل اللي اتضرب هو اللي في ملف أمازون' : `❌ ${sum.diff ? `${sum.diff} صنف فيه فرق` : ''}${sum.diff && sum.unmapped ? ' + ' : ''}${sum.unmapped ? `${sum.unmapped} SKU مش مربوط` : ''}`}
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 6, color: C.sub }}>
            مبيعات: اتضرب {sum.scannedSale} / أمازون {sum.amazonSale} — مرتجع: اتضرب {sum.scannedReturn} / أمازون {sum.amazonReturn}
            {m.match.from && <> — الملف من {fmtDate(m.match.from)} لـ {fmtDate(m.match.to)}</>}
          </div>
        </div>

        <Card style={{ padding: 0, marginBottom: 14 }}>
          <Table columns={[
            { key: 'name', title: 'الصنف', render: (v, r) => <div><div style={{ fontWeight: 700 }}>{v}</div>{r.skus.length > 0 && <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>{r.skus.join(' , ')}</div>}</div> },
            { key: 'scannedSale', title: '🟢 اتضرب', render: v => <b>{v}</b> },
            { key: 'amazonSale', title: '🟢 أمازون', render: v => <b>{v}</b> },
            { key: 'saleDiff', title: 'فرق', render: v => <Diff v={v} /> },
            { key: 'scannedReturn', title: '🔴 اتضرب', render: v => v || '—' },
            { key: 'amazonReturn', title: '🔴 أمازون', render: v => v || '—' },
            { key: 'returnDiff', title: 'فرق', render: v => <Diff v={v} /> },
            { key: 'status', title: 'الحالة', render: (v, r) => v === 'matched' ? <Badge color="#10b981">✅ مطابق</Badge> : <Badge color="#ef4444">{explain(r)}</Badge> },
          ]} data={m.rows.map(r => ({ ...r, _id: r.product }))} />
        </Card>

        {m.unmapped.length > 0 && (
          <Card style={{ padding: 0, borderColor: '#f59e0b66' }}>
            <div style={{ padding: 14, fontSize: 13, color: '#fbbf24' }}>
              ⚠️ {m.unmapped.length} SKU في ملف أمازون ({sum.unmappedQty} قطعة) مش مربوطين بأصناف عندك — اربط كل واحد بالصنف بتاعه مرة واحدة والمطابقة هتتحدث لوحدها.
            </div>
            <Table columns={[
              { key: 'name', title: 'الصنف في أمازون', render: (v, r) => <div style={{ maxWidth: 320, whiteSpace: 'normal' }}><div style={{ fontSize: 12 }}>{v?.slice(0, 90)}</div><div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>{r.sku}</div></div> },
              { key: 'sale', title: '🟢', render: v => v || '—' },
              { key: 'ret', title: '🔴', render: v => v || '—' },
              { key: 'sku', title: 'اربطه بـ', render: (v, r) => (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select defaultValue="" onChange={e => mapSku(v, e.target.value)} style={{ background: 'var(--bg)', border: '1px solid #f59e0b55', borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, maxWidth: 200 }}>
                    <option value="">— اختار الصنف —</option>
                    {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                  {can('products') && <Btn size="sm" variant="ghost" onClick={() => createProduct(r)}>➕ صنف جديد</Btn>}
                </div>
              ) },
            ]} data={m.unmapped.map(u => ({ ...u, _id: u.sku }))} />
          </Card>
        )}
      </>}
    </div>
  );
}

const Diff = ({ v }) => <span style={{ fontWeight: 800, color: v === 0 ? C.muted : v > 0 ? '#f59e0b' : '#ef4444' }}>{v > 0 ? '+' + v : v || '0'}</span>;
function explain(r) {
  const out = [];
  if (r.saleDiff > 0) out.push(`اتضرب ${r.saleDiff} زيادة`);
  if (r.saleDiff < 0) out.push(`ناقص ${-r.saleDiff} ما اتضربش`);
  if (r.returnDiff > 0) out.push(`مرتجع زيادة ${r.returnDiff}`);
  if (r.returnDiff < 0) out.push(`مرتجع ناقص ${-r.returnDiff}`);
  return '❌ ' + out.join(' · ');
}

// ═══ الموظفين ══════════════════════════════════════════════════
export function Employees() {
  const { can } = useAuth();
  const edit = can('settings');
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const load = () => api.get('/shipments/employees').then(r => setList(r.data)).catch(e => toast.error(err(e)));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    try { const { data } = await api.post('/shipments/employees', { name }); toast.success(`اتضاف — الكود ${data.code}`); setName(''); load(); }
    catch (e) { toast.error(err(e)); }
  };
  const toggle = async (e) => { await api.put(`/shipments/employees/${e._id}`, { active: !e.active }); load(); };
  const printCards = (emps) => printLabels(emps.map(e => ({ name: '👤 ' + e.name, barcode: e.code, copies: 1 })), '50x25', { showName: true });

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Btn variant="ghost" onClick={() => printCards(list.filter(e => e.active))}>🖨️ طباعة كل الكروت</Btn>
      </div>
      {edit && <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="اسم الموظف"
            style={{ flex: 1, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none' }} />
          <Btn onClick={add}>+ إضافة</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>كل موظف بياخد كود باركود (EMP0001 …) — اطبع الكارت والموظف يمسحه في أول كل شحنة.</div>
      </Card>}
      <Card style={{ padding: 0 }}>
        <Table columns={[
          { key: 'name', title: 'الاسم', render: (v, r) => <span style={{ fontWeight: 700, opacity: r.active ? 1 : 0.5 }}>{v}</span> },
          { key: 'code', title: 'الكود', render: v => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
          { key: 'active', title: 'الحالة', render: v => <Badge color={v ? '#10b981' : '#64748b'}>{v ? 'شغال' : 'موقوف'}</Badge> },
          { key: '_id', title: '', render: (_, r) => <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant="ghost" onClick={() => printCards([r])}>🖨️ الكارت</Btn>
            {edit && <Btn size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? 'إيقاف' : 'تفعيل'}</Btn>}
          </div> },
        ]} data={list} />
      </Card>
    </div>
  );
}
