import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { Card, Btn, Badge, Table, PageHeader, StatCard, fmtDate, C_THEME as C } from '../components/UI';
import { beep, printLabels } from '../utils/barcode';
import { readReportFile } from '../utils/parseReport';
import CameraScanner from '../components/CameraScanner';
import { PhotoStrip } from '../components/Photos';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const TYPES = {
  sale:   { label: 'مبيعات', color: '#10b981', icon: '' },
  return: { label: 'مرتجع',  color: '#ef4444', icon: '' },
};
const DEST = {
  main:    { label: 'المخزن الرئيسي', color: '#10b981' },
  damaged: { label: 'مخزن التوالف',   color: '#f59e0b' },
};
const sameRow = (a, b) => a.product === b.product && a.type === b.type && (a.dest || 'main') === (b.dest || 'main');
const RESULT = {
  matched: { label: 'مطابقة', color: '#10b981' },
  diff:    { label: 'يوجد فروقات', color: '#ef4444' },
};
const err = (e) => e.response?.data?.message || e.message || 'خطأ';

// ═══════════════════════════════════════════════════════════
// الصفحة: قائمة الشحنات ← شحنة (مسح) ← مطابقة | الموظفين
// ═══════════════════════════════════════════════════════════
export default function Shipments() {
  // روابط من الرئيسية: ?new=1 شحنة جديدة، ?open=ID يفتح شحنة، ?status=draft فلتر
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState(() => sp.get('new') ? { name: 'edit' } : { name: 'list' });
  const open = (s) => setView({ name: s.status === 'draft' ? 'edit' : 'match', id: s._id });
  useEffect(() => {
    const id = sp.get('open');
    if (id) api.get(`/shipments/${id}`).then(r => open(r.data)).catch(() => {});
    if (sp.get('new')) setView({ name: 'edit' });
    if (sp.get('new') || id) setSp({}, { replace: true });
  }, [sp.get('new'), sp.get('open')]);

  return (
    <div>
      {view.name === 'list' && <ShipmentList onNew={() => setView({ name: 'edit' })} onOpen={open} initialFilter={sp.get('status') || ''} />}
      {view.name === 'edit' && <ShipmentEditor id={view.id} onBack={() => setView({ name: 'list' })} onPosted={(id) => setView({ name: 'match', id })} />}
      {view.name === 'match' && <ShipmentMatch id={view.id} onBack={() => setView({ name: 'list' })} />}
    </div>
  );
}

// ═══ قائمة الشحنات ═══════════════════════════════════════════
function ShipmentList({ onNew, onOpen, initialFilter = '' }) {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState(initialFilter);
  useEffect(() => { api.get('/shipments', { params: { status: filter } }).then(r => setList(r.data)).catch(e => toast.error(err(e))); }, [filter]);
  const drafts = list.filter(s => s.status === 'draft').length;

  return (
    <div>
      <PageHeader title="الشحنات والتسليم" icon="📦" actions={[
        <Btn key="new" onClick={onNew}>+ شحنة جديدة</Btn>
      ]} />
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        <b>دورة العمل:</b> ١. إنشاء شحنة وتسجيل الموظف ثم مسح الأصناف (مبيعات أو مرتجعات) وحفظها.
        &nbsp;٢. ترحيل الشحنة: تُخصم المبيعات من المخزون، وتُضاف المرتجعات السليمة إليه، وتُحوَّل التالفة إلى مخزن التوالف.
        &nbsp;٣. رفع تقرير أمازون لمطابقة الكميات صنفاً بصنف.
      </Card>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['', 'الكل'], ['draft', `مسودات${filter === '' && drafts ? ` (${drafts})` : ''}`], ['posted', 'مُرحّلة']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ background: filter === k ? '#6366f133' : 'transparent', border: `1px solid ${filter === k ? '#6366f1' : C.border}`, color: filter === k ? '#a5b4fc' : C.sub, borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{l}</button>
        ))}
      </div>
      <Card style={{ padding: 0 }}>
        <Table onRow={onOpen} columns={[
          { key: 'no', title: 'رقم الشحنة', render: v => <b style={{ fontFamily: 'monospace' }}>{v}</b> },
          { key: 'createdAt', title: 'التاريخ', render: v => fmtDate(v) },
          { key: 'employee', title: 'الموظف', render: v => v?.name || <span style={{ color: '#f87171' }}>—</span> },
          { key: 'saleQty', title: 'مبيعات', render: v => v ? <b>{v}</b> : '—' },
          { key: 'returnQty', title: 'مرتجعات', render: (v, r) => v ? <span><b style={{ color: '#f87171' }}>{v}</b>{r.damagedQty > 0 && <span style={{ fontSize: 11, color: '#f59e0b' }}> (تالف {r.damagedQty})</span>}</span> : '—' },
          { key: 'status', title: 'الحالة', render: v => v === 'draft' ? <Badge color="#f59e0b">مسودة</Badge> : <Badge color="#3b82f6">مُرحّلة</Badge> },
          { key: 'match', title: 'المطابقة', render: (v, r) => r.status === 'draft' ? '—' : v ? <Badge color={RESULT[v.result]?.color}>{RESULT[v.result]?.label}</Badge> : <Badge color="#64748b">بانتظار تقرير أمازون</Badge> },
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
      setItems(s.items.map(i => ({ product: i.product?._id, name: i.product?.name || i.name, barcode: i.product?.barcode || i.barcode, stock: i.product?.stock, qty: i.qty, type: i.type, dest: i.dest || 'main', note: i.note || '', photos: i.photos || [] })));
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
    const row = { product: p._id, name: p.name, barcode: p.barcode, stock: p.stock, qty: 1, type, dest: 'main', note: '', photos: [] };
    const i = list.findIndex(x => sameRow(x, row));
    if (i >= 0) { list[i] = { ...list[i], qty: list[i].qty + 1 }; list.unshift(list.splice(i, 1)[0]); }
    else list.unshift(row);
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
      if (employee && employee._id !== emp._id && itemsRef.current.length) { say(false, `هذه الشحنة مسجّلة باسم ${employee.name} — يُرجى إنشاء شحنة جديدة لـ ${emp.name}`); return; }
      setEmployee(emp); setDirty(true);
      say(true, `الموظف: ${emp.name} — يمكنك بدء مسح الأصناف`);
      return;
    }
    if (!employee) { say(false, 'يُرجى مسح بطاقة الموظف أولاً'); return; }
    try {
      const { data: p } = await api.get(`/products/barcode/${encodeURIComponent(v)}`);
      const q = addItem(p, mode);
      say(true, `${TYPES[mode].icon} ${p.name} — ${TYPES[mode].label} (${q})`);
    } catch (e) { say(false, '❌ ' + err(e)); }
  };

  const setQty = (idx, q) => { const l = [...items]; l[idx] = { ...l[idx], qty: Math.max(0, q) }; setItems(l.filter(x => x.qty > 0)); setDirty(true); };
  // نقل سطر (أو جزء منه) لنوع/مخزن تاني — ولو فيه سطر مطابق يندمج معاه
  const moveRow = (idx, patch, qty) => {
    const l = [...items];
    const cur = l[idx];
    const n = Math.min(cur.qty, Math.max(1, qty ?? cur.qty));
    const target = { ...cur, ...patch, qty: n };
    if (target.dest !== 'damaged') { target.note = ''; target.photos = []; }
    if (n < cur.qty) l[idx] = { ...cur, qty: cur.qty - n }; else l.splice(idx, 1);
    const j = l.findIndex(x => sameRow(x, target));
    if (j >= 0) l[j] = { ...l[j], qty: l[j].qty + n, photos: [...(l[j].photos || []), ...(target.photos || [])] };
    else l.splice(Math.min(idx, l.length), 0, target);
    setItems(l); setDirty(true);
  };
  const setType = (idx, type) => moveRow(idx, { type, dest: 'main' });
  const setDest = (idx, dest) => {
    const cur = items[idx];
    let n = cur.qty;
    if (dest === 'damaged' && cur.qty > 1) {
      const a = prompt(`عدد الوحدات التالفة من «${cur.name}» (من ${cur.qty}):`, cur.qty);
      if (a === null) return;
      n = Math.floor(+a);
      if (!(n >= 1)) return;
    }
    moveRow(idx, { dest }, n);
  };
  const patchRow = (idx, patch) => { const l = [...items]; l[idx] = { ...l[idx], ...patch }; setItems(l); setDirty(true); };

  const save = async (quiet) => {
    if (!employee) { say(false, 'يُرجى مسح بطاقة الموظف أولاً'); return null; }
    setBusy(true);
    try {
      const body = { employee: employee._id, items: items.map(i => ({ product: i.product, qty: i.qty, type: i.type, dest: i.dest, note: i.note, photos: i.photos })) };
      const { data } = id ? await api.put(`/shipments/${id}`, body) : await api.post('/shipments', body);
      setId(data._id); setNo(data.no); setDirty(false);
      if (!quiet) toast.success(`تم حفظ الشحنة ${data.no}`);
      return data._id;
    } catch (e) { toast.error(err(e)); return null; }
    finally { setBusy(false); }
  };

  const post = async (force = false) => {
    if (!items.length) { say(false, 'الشحنة لا تحتوي على أصناف'); return; }
    if (!force && !confirm(`تأكيد ترحيل الشحنة؟\nالمبيعات: ${saleQty} وحدة (تُخصم من المخزون)\nالمرتجعات السليمة: ${returnQty - damagedQty} وحدة (تُضاف إلى المخزون الرئيسي)${damagedQty ? `\nالمرتجعات التالفة: ${damagedQty} وحدة (تُحوَّل إلى مخزن التوالف)` : ''}\n\nلا يمكن تعديل الشحنة بعد الترحيل.`)) return;
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
    if (!confirm('هل تريد حذف هذه المسودة؟')) return;
    await api.delete(`/shipments/${id}`).then(() => { toast.success('تم الحذف'); onBack(); }).catch(e => toast.error(err(e)));
  };

  const back = () => { if (dirty && !confirm('توجد تعديلات غير محفوظة. هل تريد الخروج دون حفظ؟')) return; onBack(); };
  const saleQty = items.filter(i => i.type === 'sale').reduce((s, i) => s + i.qty, 0);
  const returnQty = items.filter(i => i.type === 'return').reduce((s, i) => s + i.qty, 0);
  const damagedQty = items.filter(i => i.type === 'return' && i.dest === 'damaged').reduce((s, i) => s + i.qty, 0);

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title={no ? `شحنة ${no}` : 'شحنة جديدة'} icon="📦" actions={[
        <Btn key="b" variant="ghost" onClick={back}>رجوع</Btn>
      ]} />

      {/* الموظف */}
      <Card style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, borderColor: employee ? '#10b98155' : '#f59e0b88' }}>
        <span style={{ fontSize: 28 }}>👤</span>
        {employee
          ? <div><div style={{ fontSize: 12, color: C.muted }}>الموظف</div><div style={{ fontWeight: 800, fontSize: 18 }}>{employee.name} <span style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{employee.code}</span></div></div>
          : <div style={{ fontWeight: 700, color: '#fbbf24' }}>يُرجى مسح بطاقة الموظف للبدء</div>}
      </Card>

      {/* نوع المسح */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {Object.entries(TYPES).map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: 14, borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 800, background: mode === k ? t.color + '33' : 'transparent', border: `2px solid ${mode === k ? t.color : C.border}`, color: mode === k ? t.color : C.sub }}>
            تسجيل {t.label}
          </button>
        ))}
      </div>

      {flash && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 10, fontWeight: 700, fontSize: 15, background: flash.ok ? '#10b98122' : '#ef444422', border: `1px solid ${flash.ok ? '#10b981' : '#ef4444'}`, color: flash.ok ? '#34d399' : '#f87171' }}>{flash.text}</div>
      )}

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={ref} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && onScan()} autoFocus
            placeholder={employee ? `امسح باركود الصنف (${TYPES[mode].label})` : 'امسح بطاقة الموظف'}
            style={{ flex: 1, background: 'var(--bg)', border: `2px solid ${employee ? TYPES[mode].color : '#f59e0b'}`, borderRadius: 10, padding: '14px 16px', color: 'var(--text)', fontSize: 20, outline: 'none', fontFamily: 'monospace', direction: 'ltr', textAlign: 'center' }} />
          <button onClick={() => setCam(true)} title="مسح بالكاميرا" style={{ flexShrink: 0, width: 64, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, fontSize: 26, cursor: 'pointer' }}>📷</button>
        </div>
        <CameraScanner open={cam} onClose={() => setCam(false)} onScan={onScan} message={flash} continuous title={employee ? `تسجيل ${TYPES[mode].label}` : 'مسح بطاقة الموظف'} />
      </Card>

      {/* الأصناف: المبيعات ثم المرتجعات */}
      {['sale', 'return'].map(type => {
        const rows = items.map((it, i) => ({ it, i })).filter(x => x.it.type === type);
        const qty = rows.reduce((t, x) => t + x.it.qty, 0);
        const T = TYPES[type];
        return (
          <Card key={type} style={{ padding: 0, marginBottom: 12, borderTop: `3px solid ${T.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
              <b style={{ color: T.color }}>{type === 'sale' ? 'المبيعات' : 'المرتجعات'}</b>
              <span style={{ fontSize: 13, color: C.sub }}>{rows.length} صنف · {qty} وحدة{type === 'return' && damagedQty > 0 && <> · <b style={{ color: DEST.damaged.color }}>تالف {damagedQty}</b></>}</span>
            </div>
            {!rows.length && <div style={{ padding: 18, textAlign: 'center', color: C.muted, fontSize: 13 }}>{type === 'sale' ? 'لم تُسجّل مبيعات بعد' : 'لا توجد مرتجعات'}</div>}
            {rows.map(({ it, i }) => (
              <div key={it.product + it.type + it.dest} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}33`, background: it.dest === 'damaged' ? '#f59e0b0d' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700 }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}><span dir="ltr">{it.barcode}</span>{it.stock !== undefined && ` · الرصيد ${it.stock}`}</div>
                </div>
                <select value={it.type} onChange={e => setType(i, e.target.value)} title="نقل إلى" style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.sub, borderRadius: 8, padding: '7px 8px', fontSize: 12 }}>
                  <option value="sale">مبيعات</option>
                  <option value="return">مرتجع</option>
                </select>
                <Btn size="sm" variant="ghost" onClick={() => setQty(i, it.qty - 1)}>−</Btn>
                <input type="number" value={it.qty} onChange={e => setQty(i, +e.target.value)} style={{ width: 64, textAlign: 'center', background: 'var(--card)', border: `1px solid ${C.border}`, borderRadius: 6, padding: 6, color: 'var(--text)', fontSize: 16, fontWeight: 800 }} />
                <Btn size="sm" variant="ghost" onClick={() => setQty(i, it.qty + 1)}>+</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setQty(i, 0)}>🗑️</Btn>
              </div>
              {type === 'return' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {Object.entries(DEST).map(([k, d]) => (
                    <button key={k} onClick={() => it.dest !== k && setDest(i, k)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: it.dest === k ? d.color + '26' : 'transparent', border: `1px solid ${it.dest === k ? d.color : C.border}`, color: it.dest === k ? d.color : C.muted }}>
                      {it.dest === k ? '● ' : ''}{d.label}
                    </button>
                  ))}
                </div>
              )}
              {it.dest === 'damaged' && (
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <PhotoStrip ids={it.photos} onChange={(photos) => patchRow(i, { photos })} />
                  <input value={it.note} onChange={e => patchRow(i, { note: e.target.value })} placeholder="وصف التلف (كسر، علبة مفتوحة، ناقص قطعة...)"
                    style={{ flex: 1, minWidth: 200, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                </div>
              )}
              </div>
            ))}
          </Card>
        );
      })}

      {short && (
        <Card style={{ marginBottom: 12, borderColor: '#ef444488' }}>
          <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 8 }}>الرصيد غير كافٍ للأصناف التالية:</div>
          {short.map(s => <div key={s.product} style={{ fontSize: 13, marginBottom: 4 }}>{s.name} — العجز {s.missing}</div>)}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn variant="danger" onClick={() => { setShort(null); post(true); }}>ترحيل رغم العجز (رصيد سالب)</Btn>
            <Btn variant="ghost" onClick={() => setShort(null)}>إلغاء</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="lg" variant="ghost" onClick={() => save()} disabled={busy || !employee}>حفظ {dirty && '•'}</Btn>
        <Btn size="lg" variant="success" onClick={() => post()} disabled={busy || !items.length || !employee} style={{ flex: 1 }}>ترحيل الشحنة</Btn>
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
      if (data.result === 'matched') toast.success('المطابقة تامة');
      if (data.imported) toast(`تم تحديث بيانات مركز أمازون: ${data.imported}`, { duration: 5000 });
    } catch (e) { beep(false); toast.error(err(e)); }
    setBusy(false);
  };

  const mapSku = async (sku, product) => {
    if (!product) return;
    try { await api.post('/amazon/skus/map', { sku, product }); toast.success('تم الربط'); load(); }
    catch (e) { toast.error(err(e)); }
  };
  const createProduct = async (u) => {
    const name = prompt('اسم الصنف الجديد:', u.name?.slice(0, 80) || u.sku);
    if (!name) return;
    try {
      const { data } = await api.post('/products', { name, sku: u.sku, buyPrice: 0, sellPrice: 0, stock: 0 });
      toast.success('تم إنشاء الصنف — يُرجى استكمال سعر الشراء والرصيد من صفحة المنتجات');
      setProducts(p => [...p, data]); load();
    } catch (e) { toast.error(err(e)); }
  };

  if (!s) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const sum = m?.summary;

  return (
    <div>
      <PageHeader title={`مطابقة شحنة ${s.no}`} icon="⚖️" actions={[<Btn key="b" variant="ghost" onClick={onBack}>رجوع إلى الشحنات</Btn>]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
        <StatCard label="الموظف" value={s.employee?.name || '—'} icon="👤" color="#8b5cf6" sub={s.postedAt ? `تاريخ الترحيل ${fmtDate(s.postedAt)}` : ''} />
        <StatCard label="المبيعات المسجّلة" value={s.items.filter(i => i.type === 'sale').reduce((t, i) => t + i.qty, 0)} icon="📦" color="#10b981" />
        <StatCard label="المرتجعات المسجّلة" value={s.items.filter(i => i.type === 'return').reduce((t, i) => t + i.qty, 0)} icon="↩️" color="#ef4444"
          sub={(() => { const d = s.items.filter(i => i.type === 'return' && i.dest === 'damaged').reduce((t, i) => t + i.qty, 0); return d ? `منها ${d} تالف (مخزن التوالف)` : ''; })()} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>رفع تقرير أمازون</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.8 }}>
          تقرير المعاملات (Payments ← Date Range Reports ← Transaction) أو تقرير الطلبات (All Orders) — CSV أو TXT أو Excel.
          تُقارن الطلبات (Order) بالمبيعات والمرتجعات (Refund) بالمرتجعات، ويُحدَّث مركز أمازون من نفس الملف.
        </div>
        <label style={{ display: 'block', border: `2px dashed ${C.border}`, borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer', color: C.sub }}>
          {busy ? 'جارٍ المطابقة...' : m ? `${m.match.fileName} — اضغط لرفع ملف آخر` : 'اختيار الملف'}
          <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" style={{ display: 'none' }} disabled={busy} onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </Card>

      {m && <>
        <div style={{ padding: 18, borderRadius: 12, marginBottom: 14, textAlign: 'center', fontSize: 20, fontWeight: 800, background: m.result === 'matched' ? '#10b98122' : '#ef444422', border: `2px solid ${m.result === 'matched' ? '#10b981' : '#ef4444'}`, color: m.result === 'matched' ? '#34d399' : '#f87171' }}>
          {m.result === 'matched' ? 'مطابقة تامة — الكميات المسجّلة تطابق تقرير أمازون' : `${sum.diff ? `فروقات في ${sum.diff} صنف` : ''}${sum.diff && sum.unmapped ? ' — ' : ''}${sum.unmapped ? `${sum.unmapped} رمز SKU غير مرتبط` : ''}`}
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 6, color: C.sub }}>
            المبيعات: مسجّل {sum.scannedSale} / أمازون {sum.amazonSale} — المرتجعات: مسجّل {sum.scannedReturn} / أمازون {sum.amazonReturn}
            {m.match.from && <> — فترة التقرير من {fmtDate(m.match.from)} إلى {fmtDate(m.match.to)}</>}
          </div>
        </div>

        {[
          { key: 'sale', title: 'المبيعات', color: '#10b981', mine: 'scannedSale', amz: 'amazonSale', diff: 'saleDiff', label: 'Order' },
          { key: 'return', title: 'المرتجعات', color: '#ef4444', mine: 'scannedReturn', amz: 'amazonReturn', diff: 'returnDiff', label: 'Refund' },
        ].map(sec => {
          const rows = m.rows.filter(r => r[sec.mine] || r[sec.amz]);
          const bad = rows.filter(r => r[sec.diff] !== 0).length;
          return (
            <Card key={sec.key} style={{ padding: 0, marginBottom: 14, borderTop: `3px solid ${sec.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ color: sec.color }}>{sec.title} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>({sec.label} في تقرير أمازون)</span></b>
                <span style={{ fontSize: 13, color: C.sub }}>
                  مسجّل {rows.reduce((t, r) => t + r[sec.mine], 0)} / أمازون {rows.reduce((t, r) => t + r[sec.amz], 0)}
                  {' '}{rows.length ? (bad ? <Badge color="#ef4444">فروقات في {bad} صنف</Badge> : <Badge color="#10b981">مطابقة</Badge>) : null}
                </span>
              </div>
              {!rows.length ? <div style={{ padding: 18, textAlign: 'center', color: C.muted, fontSize: 13 }}>لا توجد {sec.title}</div> : (
                <Table columns={[
                  { key: 'name', title: 'الصنف', render: (v, r) => <div><div style={{ fontWeight: 700 }}>{v}</div>{r.skus.length > 0 && <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>{r.skus.join(' , ')}</div>}</div> },
                  { key: sec.mine, title: 'مسجّل', render: v => <b>{v}</b> },
                  { key: sec.amz, title: 'أمازون', render: v => <b>{v}</b> },
                  { key: sec.diff, title: 'الفرق', render: v => <Diff v={v} /> },
                  { key: '_st', title: 'الحالة', render: (_, r) => r[sec.diff] === 0 ? <Badge color="#10b981">مطابق</Badge> : <Badge color="#ef4444">{r[sec.diff] > 0 ? `زيادة ${r[sec.diff]}` : `عجز ${-r[sec.diff]}`}</Badge> },
                ]} data={rows.map(r => ({ ...r, _id: r.product + sec.key }))} />
              )}
            </Card>
          );
        })}

        {m.unmapped.length > 0 && (
          <Card style={{ padding: 0, borderColor: '#f59e0b66' }}>
            <div style={{ padding: 14, fontSize: 13, color: '#fbbf24' }}>
              يوجد {m.unmapped.length} رمز SKU في تقرير أمازون ({sum.unmappedQty} وحدة) غير مرتبط بأصناف النظام. يُربط كل رمز مرة واحدة، وتُحدَّث المطابقة تلقائياً.
            </div>
            <Table columns={[
              { key: 'name', title: 'الصنف لدى أمازون', render: (v, r) => <div style={{ maxWidth: 320, whiteSpace: 'normal' }}><div style={{ fontSize: 12 }}>{v?.slice(0, 90)}</div><div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>{r.sku}</div></div> },
              { key: 'sale', title: 'مبيعات', render: v => v || '—' },
              { key: 'ret', title: 'مرتجعات', render: v => v || '—' },
              { key: 'sku', title: 'الربط بصنف', render: (v, r) => (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select defaultValue="" onChange={e => mapSku(v, e.target.value)} style={{ background: 'var(--bg)', border: '1px solid #f59e0b55', borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, maxWidth: 200 }}>
                    <option value="">— اختر الصنف —</option>
                    {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                  {can('products') && <Btn size="sm" variant="ghost" onClick={() => createProduct(r)}>+ صنف جديد</Btn>}
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
    try { const { data } = await api.post('/shipments/employees', { name }); toast.success(`تمت الإضافة — الكود ${data.code}`); setName(''); load(); }
    catch (e) { toast.error(err(e)); }
  };
  const toggle = async (e) => { await api.put(`/shipments/employees/${e._id}`, { active: !e.active }); load(); };
  const printCards = (emps) => printLabels(emps.map(e => ({ name: e.name, barcode: e.code, copies: 1 })), '50x25', { showName: true });

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Btn variant="ghost" onClick={() => printCards(list.filter(e => e.active))}>طباعة جميع البطاقات</Btn>
      </div>
      {edit && <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="اسم الموظف"
            style={{ flex: 1, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none' }} />
          <Btn onClick={add}>+ إضافة</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>يُخصَّص لكل موظف رمز باركود (EMP0001 …) يُطبع على بطاقة ويُمسح عند بدء كل شحنة.</div>
      </Card>}
      <Card style={{ padding: 0 }}>
        <Table columns={[
          { key: 'name', title: 'الاسم', render: (v, r) => <span style={{ fontWeight: 700, opacity: r.active ? 1 : 0.5 }}>{v}</span> },
          { key: 'code', title: 'الكود', render: v => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
          { key: 'active', title: 'الحالة', render: v => <Badge color={v ? '#10b981' : '#64748b'}>{v ? 'نشط' : 'موقوف'}</Badge> },
          { key: '_id', title: '', render: (_, r) => <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant="ghost" onClick={() => printCards([r])}>طباعة البطاقة</Btn>
            {edit && <Btn size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? 'إيقاف' : 'تفعيل'}</Btn>}
          </div> },
        ]} data={list} />
      </Card>
    </div>
  );
}
