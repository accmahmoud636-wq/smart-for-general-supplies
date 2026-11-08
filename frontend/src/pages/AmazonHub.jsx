import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { readReportFile } from '../utils/parseReport';
import { Card, Btn, Badge, Input, Table, PageHeader, StatCard, fmt, fmtDate, C_THEME as C } from '../components/UI';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const CUR = 'ج.م';
const money = (v) => <span style={{ color: v < 0 ? '#f87171' : C.text, fontWeight: 600 }}>{fmt(v)}</span>;

const STAGES = {
  new:       { label: 'جديد',        color: '#3b82f6' },
  packed:    { label: 'مجهّز',       color: '#8b5cf6' },
  shipped:   { label: 'تم الشحن',    color: '#f59e0b' },
  delivered: { label: 'تم التسليم',  color: '#10b981' },
  returned:  { label: 'مرتجع',       color: '#ef4444' },
  cancelled: { label: 'ملغي',        color: '#64748b' },
};

const RECON = {
  matched:           { label: 'مطابق',              color: '#10b981' },
  diff:              { label: 'فرق في المبلغ',       color: '#ef4444' },
  pending:           { label: 'بانتظار التسوية',     color: '#3b82f6' },
  overdue:           { label: 'متأخر +21 يوم',       color: '#f97316' },
  refunded:          { label: 'مسترجع',             color: '#a855f7' },
  cancelled:         { label: 'ملغي',               color: '#64748b' },
  cancelled_charged: { label: 'ملغي وعليه حركة',     color: '#eab308' },
};

const LEVELS = {
  urgent: { label: 'اطلب الآن', color: '#ef4444' },
  soon:   { label: 'قريباً',    color: '#f59e0b' },
  ok:     { label: 'كافي',      color: '#10b981' },
  slow:   { label: 'بدون مبيعات', color: '#64748b' },
};

const TABS = [
  ['overview', '📊 نظرة عامة'],
  ['orders', '📦 الطلبات'],
  ['upload', '⬆️ رفع التقارير'],
  ['dispatch', '⚖️ مطابقة الخروج'],
  ['profit', '💰 ربحية المنتجات'],
  ['recon', '🧾 التسويات'],
  ['reorder', '🔄 إعادة الطلب'],
  ['skus', '🔗 ربط SKU'],
];

function DateFilter({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ width: 160 }}><Input label="من" type="date" value={value.from} onChange={v => onChange({ ...value, from: v })} /></div>
      <div style={{ width: 160 }}><Input label="إلى" type="date" value={value.to} onChange={v => onChange({ ...value, to: v })} /></div>
    </div>
  );
}

function Chips({ items, value, onChange, counts = {} }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
      <Chip active={!value} onClick={() => onChange('')} color={C.accent}>الكل</Chip>
      {Object.entries(items).map(([k, s]) => (
        <Chip key={k} active={value === k} onClick={() => onChange(k)} color={s.color}>
          {s.label}{counts[k] !== undefined && ` (${counts[k]})`}
        </Chip>
      ))}
    </div>
  );
}
const Chip = ({ active, onClick, color, children }) => (
  <button onClick={onClick} style={{ background: active ? color + '33' : 'transparent', border: `1px solid ${active ? color : C.border}`, color: active ? color : C.sub, borderRadius: 20, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{children}</button>
);

// ═══════════════════════════════════════════════════════════
export default function AmazonHub() {
  const { can } = useAuth();
  const canEdit = can('amazon');
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const loadSummary = () => api.get('/amazon/summary').then(r => setSummary(r.data)).catch(() => {});
  useEffect(() => { loadSummary(); }, []);
  const st = summary?.stages || {};

  return (
    <div>
      <PageHeader title="مركز أمازون" icon="🛒" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="طلبات جديدة" value={st.new || 0} icon="🆕" color="#3b82f6" />
        <StatCard label="مجهّزة للشحن" value={st.packed || 0} icon="📦" color="#8b5cf6" />
        <StatCard label="تم الشحن" value={st.shipped || 0} icon="🚚" color="#f59e0b" />
        <StatCard label="بانتظار الترحيل" value={summary?.toPost || 0} icon="🧾" color="#ec4899" sub="طلبات مشحونة بدون فاتورة" />
        <StatCard label="آخر تقرير معاملات" value={summary?.lastTxDate ? fmtDate(summary.lastTxDate) : '—'} icon="📅" color="#10b981" />
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18, overflowX: 'auto' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.accent : 'transparent'}`, color: tab === k ? '#818cf8' : C.sub, padding: '10px 14px', cursor: 'pointer', fontWeight: tab === k ? 700 : 500, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab go={setTab} />}
      {tab === 'orders' && <OrdersTab canEdit={canEdit} onChange={loadSummary} />}
      {tab === 'upload' && <UploadTab canEdit={canEdit} onDone={loadSummary} goSkus={() => setTab('skus')} />}
      {tab === 'dispatch' && <DispatchTab />}
      {tab === 'profit' && <ProfitTab />}
      {tab === 'recon' && <ReconTab />}
      {tab === 'reorder' && <ReorderTab />}
      {tab === 'skus' && <SkusTab canEdit={canEdit} />}
    </div>
  );
}

// ═══ الطلبات ════════════════════════════════════════════════
function OrdersTab({ canEdit, onChange }) {
  const [data, setData] = useState({ orders: [], counts: {} });
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [sel, setSel] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState([]);

  const load = () => api.get('/amazon/orders', { params: { stage, search, ...range } })
    .then(r => { setData(r.data); setSel(new Set()); }).catch(() => toast.error('خطأ في تحميل الطلبات'));
  useEffect(() => { load(); }, [stage, range.from, range.to]);

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = data.orders.length > 0 && sel.size === data.orders.length;

  const setStageFor = async (to) => {
    if (!sel.size) return toast.error('اختار طلبات الأول');
    if (to === 'returned' && !confirm('تسجيل مرتجع؟ الطلبات المرحّلة هترجع كميتها للمخزون')) return;
    try { const r = await api.put('/amazon/orders/stage', { ids: [...sel], stage: to }); toast.success(r.data.message); load(); onChange(); }
    catch (e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };

  const [deduct, setDeduct] = useState(() => { try { return localStorage.getItem('erp_post_deduct') === '1'; } catch { return false; } });
  const toggleDeduct = (v) => { setDeduct(v); try { localStorage.setItem('erp_post_deduct', v ? '1' : '0'); } catch { /* */ } };

  const postSales = async () => {
    setBusy(true);
    try { const r = await api.post('/amazon/orders/post-sales', { deductStock: deduct }); toast.success(r.data.message); setSkipped(r.data.skipped || []); load(); onChange(); }
    catch (e) { toast.error(e.response?.data?.message || 'خطأ'); }
    setBusy(false);
  };

  const cols = [
    { key: '_sel', title: <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(data.orders.map(o => o._id)))} />,
      render: (_, r) => <input type="checkbox" checked={sel.has(r._id)} onChange={() => toggle(r._id)} onClick={e => e.stopPropagation()} /> },
    { key: 'orderId', title: 'رقم الطلب', render: v => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { key: 'purchaseDate', title: 'التاريخ', render: v => fmtDate(v) },
    { key: 'sku', title: 'SKU', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: C.muted, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.product?.name || <span style={{ color: '#f87171' }}>غير مربوط</span>}</div></div> },
    { key: 'qty', title: 'الكمية' },
    { key: 'itemPrice', title: `السعر (${CUR})`, render: v => money(v) },
    { key: 'city', title: 'المدينة' },
    { key: 'product', title: 'المتاح', render: v => v ? <span style={{ color: v.stock <= 0 ? '#f87171' : C.text }}>{v.stock}</span> : '—' },
    { key: 'stage', title: 'المرحلة', render: v => <Badge color={STAGES[v]?.color}>{STAGES[v]?.label}</Badge> },
    { key: 'sale', title: 'الفاتورة', render: v => v ? <Badge color="#10b981">{v.invoiceNo}</Badge> : '—' },
  ];

  return (
    <div>
      <Chips items={STAGES} value={stage} onChange={setStage} counts={data.counts} />
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}><Input label="بحث" value={search} onChange={setSearch} placeholder="رقم الطلب / SKU / المدينة" /></div>
          <div style={{ marginBottom: 14 }}><Btn variant="ghost" onClick={load}>🔍 بحث</Btn></div>
          <DateFilter value={range} onChange={setRange} />
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>المحدد ({sel.size}):</span>
            <Btn size="sm" variant="ghost" onClick={() => setStageFor('packed')}>📦 مجهّز</Btn>
            <Btn size="sm" variant="warning" onClick={() => setStageFor('shipped')}>🚚 تم الشحن</Btn>
            <Btn size="sm" variant="success" onClick={() => setStageFor('delivered')}>✅ تم التسليم</Btn>
            <Btn size="sm" variant="danger" onClick={() => setStageFor('returned')}>↩️ مرتجع</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setStageFor('cancelled')}>✖ ملغي</Btn>
            <div style={{ marginRight: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: C.sub }} title="سيبها مش متعلّمة لو بتخرّج البضاعة بشاشة «خروج لأمازون» — عشان المخزون ما يتخصمش مرتين">
                <input type="checkbox" checked={deduct} onChange={e => toggleDeduct(e.target.checked)} /> اخصم من المخزون كمان
              </label>
              <Btn size="sm" onClick={postSales} disabled={busy}>{busy ? '⏳...' : '🧾 ترحيل المشحون لفواتير بيع'}</Btn>
            </div>
          </div>
        )}
      </Card>
      {skipped.length > 0 && (
        <Card style={{ marginBottom: 14, borderColor: '#f59e0b55' }}>
          <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>⚠️ طلبات لم تُرحّل ({skipped.length})</div>
          {skipped.slice(0, 20).map(s => <div key={s.orderId} style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}><span style={{ fontFamily: 'monospace' }}>{s.orderId}</span> — {s.reason}</div>)}
        </Card>
      )}
      <Card style={{ padding: 0 }}><Table columns={cols} data={data.orders} onRow={canEdit ? r => toggle(r._id) : undefined} /></Card>
    </div>
  );
}

// ═══ رفع التقارير ════════════════════════════════════════════
function UploadTab({ canEdit, onDone, goSkus }) {
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState([]);

  const upload = async (kind, file) => {
    if (!file) return;
    setBusy(kind);
    try {
      const rows = await readReportFile(file);
      if (rows.length < 2) throw new Error('الملف فاضي');
      const r = await api.post(`/amazon/upload/${kind}`, { rows });
      toast.success(r.data.message);
      setLog(l => [{ ok: true, file: file.name, msg: r.data.message }, ...l]);
      onDone();
    } catch (e) {
      const d = e.response?.data;
      const msg = d?.message || e.message;
      toast.error(msg);
      setLog(l => [{ ok: false, file: file.name, msg, headers: d?.headers }, ...l]);
    }
    setBusy('');
  };

  if (!canEdit) return <Card>ليس لديك صلاحية رفع التقارير</Card>;

  const Box = ({ kind, title, icon, how }) => (
    <Card>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.9, marginBottom: 14 }}>{how}</div>
      <label style={{ display: 'block', border: `2px dashed ${C.border}`, borderRadius: 10, padding: 22, textAlign: 'center', cursor: 'pointer', color: C.sub }}>
        {busy === kind ? '⏳ جاري الرفع...' : '📁 اختار ملف CSV أو TXT'}
        <input type="file" accept=".csv,.txt,.tsv" style={{ display: 'none' }} disabled={!!busy} onChange={e => { upload(kind, e.target.files[0]); e.target.value = ''; }} />
      </label>
    </Card>
  );

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, marginBottom: 14 }}>
        <Box kind="orders" icon="📦" title="تقرير الطلبات"
          how={<>Seller Central ← Reports ← Fulfillment ← <b>All Orders</b> (Order Date) ← Download.<br />ينزل ملف TXT — ارفعه زي ما هو. إعادة رفع نفس الطلب بتحدّثه بدون تكرار.</>} />
        <Box kind="transactions" icon="💳" title="تقرير المعاملات (التسوية)"
          how={<>Seller Central ← Reports ← Payments ← <b>Date Range Reports</b> ← Transaction ← Generate ← CSV.<br />فيه المبيعات والرسوم وصافي المدفوع لكل طلب. التكرار بيتشال تلقائياً.</>} />
      </div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.sub }}>
          💡 بعد الرفع راجع تبويب <a onClick={goSkus} style={{ color: '#818cf8', cursor: 'pointer' }}>ربط SKU</a> — أي SKU مش مربوط بمنتج مش هيتحسب له تكلفة ولا هيتخصم من المخزون.
        </div>
      </Card>
      {log.map((l, i) => (
        <Card key={i} style={{ marginBottom: 8, borderColor: l.ok ? '#10b98155' : '#ef444455' }}>
          <div style={{ fontWeight: 600, color: l.ok ? '#10b981' : '#f87171' }}>{l.ok ? '✅' : '❌'} {l.file}</div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>{l.msg}</div>
          {l.headers && <div style={{ fontSize: 11, color: C.muted, marginTop: 6, direction: 'ltr', textAlign: 'left' }}>الأعمدة الموجودة: {l.headers.join(' | ')}</div>}
        </Card>
      ))}
    </div>
  );
}

// ═══ الربحية ═════════════════════════════════════════════════
function ProfitTab() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/amazon/profitability', { params: range }).then(r => setData(r.data)).catch(() => toast.error('خطأ')); }, [range.from, range.to]);
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const t = data.totals;

  const cols = [
    { key: 'sku', title: 'SKU / المنتج', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: r.product ? C.muted : '#f87171' }}>{r.product?.name || 'غير مربوط'}</div></div> },
    { key: 'netUnits', title: 'صافي الوحدات', render: (v, r) => <span>{v}{r.unitsRefunded > 0 && <span style={{ color: '#f87171', fontSize: 11 }}> (مرتجع {r.unitsRefunded})</span>}</span> },
    { key: 'sales', title: 'المبيعات', render: money },
    { key: 'refunds', title: 'المرتجعات', render: money },
    { key: 'fees', title: 'رسوم أمازون', render: (v, r) => <span>{money(v)} <span style={{ fontSize: 11, color: C.muted }}>{r.feePct}%</span></span> },
    { key: 'net', title: 'الصافي من أمازون', render: money },
    { key: 'unitCost', title: 'تكلفة الوحدة', render: v => v ? fmt(v) : <Badge color="#f59e0b">بدون تكلفة</Badge> },
    { key: 'cogs', title: 'تكلفة البضاعة', render: money },
    { key: 'profit', title: 'صافي الربح', render: v => <span style={{ color: v >= 0 ? '#10b981' : '#f87171', fontWeight: 800 }}>{fmt(v)}</span> },
    { key: 'profitPerUnit', title: 'ربح الوحدة', render: money },
    { key: 'margin', title: 'الهامش', render: v => <Badge color={v >= 20 ? '#10b981' : v >= 0 ? '#f59e0b' : '#ef4444'}>{v}%</Badge> },
  ];

  return (
    <div>
      <DateFilter value={range} onChange={setRange} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 14 }}>
        <StatCard label="المبيعات" value={fmt(t.sales)} icon="💵" color="#3b82f6" sub={`${t.units} وحدة — ${CUR}`} />
        <StatCard label="رسوم أمازون" value={fmt(t.fees)} icon="🏷️" color="#f59e0b" sub={t.sales ? `${(Math.abs(t.fees) / t.sales * 100).toFixed(1)}% من المبيعات` : ''} />
        <StatCard label="تكلفة البضاعة" value={fmt(t.cogs)} icon="📦" color="#8b5cf6" />
        <StatCard label="رسوم عامة (اشتراك/إعلانات)" value={fmt(t.generalFees)} icon="📣" color="#ec4899" />
        <StatCard label="صافي الربح النهائي" value={fmt(t.finalProfit)} icon="📈" color={t.finalProfit >= 0 ? '#10b981' : '#ef4444'} sub={`محوّل لحسابك: ${fmt(Math.abs(t.transfers))}`} />
      </div>
      {t.missingCost > 0 && <Card style={{ marginBottom: 14, borderColor: '#f59e0b55', color: '#f59e0b', fontSize: 13 }}>⚠️ {t.missingCost} منتج بدون سعر شراء أو غير مربوط — الربح بتاعه محسوب بدون تكلفة. صحّح سعر الشراء من صفحة المنتجات أو اربط الـ SKU.</Card>}
      <Card style={{ padding: 0 }}><Table columns={cols} data={data.rows} /></Card>
    </div>
  );
}

// ═══ التسويات ════════════════════════════════════════════════
function ReconTab() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [status, setStatus] = useState('');
  const [view, setView] = useState('orders');
  useEffect(() => { api.get('/amazon/reconciliation', { params: range }).then(r => setData(r.data)).catch(() => toast.error('خطأ')); }, [range.from, range.to]);
  useEffect(() => { api.get('/amazon/settlements').then(r => setSettlements(r.data)).catch(() => {}); }, []);
  const rows = useMemo(() => (data?.rows || []).filter(r => !status || r.status === status), [data, status]);
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;

  const orderCols = [
    { key: 'orderId', title: 'رقم الطلب', render: v => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { key: 'date', title: 'التاريخ', render: v => fmtDate(v) },
    { key: 'skus', title: 'SKU' },
    { key: 'expected', title: 'المتوقع (سعر الطلب)', render: money },
    { key: 'settled', title: 'المبيعات في التسوية', render: money },
    { key: 'diff', title: 'الفرق', render: v => <span style={{ color: Math.abs(v) > 1 ? '#f87171' : C.muted, fontWeight: 700 }}>{fmt(v)}</span> },
    { key: 'fees', title: 'الرسوم', render: money },
    { key: 'refunds', title: 'مرتجع', render: money },
    { key: 'net', title: 'الصافي المدفوع', render: money },
    { key: 'settlementIds', title: 'رقم التسوية', render: v => <span style={{ fontSize: 11 }}>{v || '—'}</span> },
    { key: 'status', title: 'الحالة', render: v => <Badge color={RECON[v]?.color}>{RECON[v]?.label}</Badge> },
  ];
  const setCols = [
    { key: 'settlementId', title: 'رقم التسوية', render: v => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { key: 'from', title: 'من', render: v => fmtDate(v) },
    { key: 'to', title: 'إلى', render: v => fmtDate(v) },
    { key: 'sales', title: 'المبيعات', render: money },
    { key: 'refunds', title: 'المرتجعات', render: money },
    { key: 'fees', title: 'رسوم الطلبات', render: money },
    { key: 'otherFees', title: 'رسوم أخرى', render: money },
    { key: 'net', title: 'الصافي', render: v => <span style={{ fontWeight: 800, color: '#10b981' }}>{fmt(v)}</span> },
    { key: 'transfer', title: 'المحوّل للبنك', render: money },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <Chip active={view === 'orders'} onClick={() => setView('orders')} color={C.accent}>مطابقة الطلبات</Chip>
        <Chip active={view === 'settlements'} onClick={() => setView('settlements')} color={C.accent}>ملخص الدفعات ({settlements.length})</Chip>
        {data.missingOrders.length > 0 && <Chip active={view === 'missing'} onClick={() => setView('missing')} color="#f59e0b">معاملات بدون طلب ({data.missingOrders.length})</Chip>}
      </div>
      {view === 'orders' && <>
        <DateFilter value={range} onChange={setRange} />
        <Chips items={RECON} value={status} onChange={setStatus} counts={data.counts} />
        <Card style={{ padding: 0 }}><Table columns={orderCols} data={rows} /></Card>
      </>}
      {view === 'settlements' && <Card style={{ padding: 0 }}><Table columns={setCols} data={settlements.map(s => ({ ...s, _id: s.settlementId }))} /></Card>}
      {view === 'missing' && <Card style={{ padding: 0 }}>
        <div style={{ padding: 14, fontSize: 13, color: C.sub }}>طلبات ظهرت في التسوية ومش موجودة في تقرير الطلبات — ارفع تقرير طلبات يغطي الفترة دي.</div>
        <Table columns={[{ key: 'orderId', title: 'رقم الطلب' }, { key: 'date', title: 'التاريخ', render: v => fmtDate(v) }, { key: 'net', title: 'الصافي', render: money }]} data={data.missingOrders.map(m => ({ ...m, _id: m.orderId }))} />
      </Card>}
    </div>
  );
}

// ═══ إعادة الطلب ═════════════════════════════════════════════
function ReorderTab() {
  const [p, setP] = useState({ days: '30', lead: '14', cover: '30' });
  const [data, setData] = useState(null);
  const [level, setLevel] = useState('');
  const load = () => api.get('/amazon/reorder', { params: p }).then(r => setData(r.data)).catch(() => toast.error('خطأ'));
  useEffect(() => { load(); }, []);
  const rows = (data?.rows || []).filter(r => !level || r.level === level);
  const counts = (data?.rows || []).reduce((c, r) => (c[r.level] = (c[r.level] || 0) + 1, c), {});
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  const cols = [
    { key: 'name', title: 'المنتج', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: C.muted }}>{r.sku}</div></div> },
    { key: 'stock', title: 'المخزون الحالي' },
    { key: 'unitsSold', title: `مباع آخر ${data?.params.days || ''} يوم` },
    { key: 'perDay', title: 'معدل يومي' },
    { key: 'daysLeft', title: 'يكفي (يوم)', render: v => v === null ? '∞' : <span style={{ fontWeight: 700, color: v <= (data?.params.lead || 0) ? '#f87171' : C.text }}>{v}</span> },
    { key: 'suggestedQty', title: 'الكمية المقترحة', render: v => v ? <span style={{ fontWeight: 800, color: '#818cf8' }}>{v}</span> : '—' },
    { key: 'cost', title: `التكلفة (${CUR})`, render: v => v ? fmt(v) : '—' },
    { key: 'level', title: 'الحالة', render: v => <Badge color={LEVELS[v].color}>{LEVELS[v].label}</Badge> },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 150 }}><Input label="احسب على آخر (يوم)" type="number" value={p.days} onChange={v => setP({ ...p, days: v })} /></div>
          <div style={{ width: 150 }}><Input label="مدة التوريد (يوم)" type="number" value={p.lead} onChange={v => setP({ ...p, lead: v })} /></div>
          <div style={{ width: 150 }}><Input label="تغطية بعد الوصول (يوم)" type="number" value={p.cover} onChange={v => setP({ ...p, cover: v })} /></div>
          <div style={{ marginBottom: 14 }}><Btn onClick={load}>🔄 احسب</Btn></div>
          <div style={{ marginBottom: 14, marginRight: 'auto', fontSize: 13, color: C.sub }}>إجمالي تكلفة الشراء المقترح: <b style={{ color: '#fff' }}>{fmt(totalCost)} {CUR}</b></div>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>الكمية المقترحة = المعدل اليومي × (مدة التوريد + التغطية) − المخزون الحالي</div>
      </Card>
      {data?.unmapped?.length > 0 && <Card style={{ marginBottom: 14, borderColor: '#f59e0b55', color: '#f59e0b', fontSize: 13 }}>⚠️ SKUs غير مربوطة ومش داخلة في الحساب: {data.unmapped.join('، ')}</Card>}
      <Chips items={LEVELS} value={level} onChange={setLevel} counts={counts} />
      <Card style={{ padding: 0 }}><Table columns={cols} data={rows} /></Card>
    </div>
  );
}

// ═══ ربط SKU ═════════════════════════════════════════════════
function SkusTab({ canEdit }) {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const load = () => api.get('/amazon/skus').then(r => setList(r.data)).catch(() => toast.error('خطأ'));
  useEffect(() => { load(); api.get('/products').then(r => setProducts(r.data.filter(p => p.active !== false))).catch(() => {}); }, []);

  const map = async (sku, product) => {
    if (!product) return;
    try { await api.post('/amazon/skus/map', { sku, product }); toast.success('تم الربط'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };
  const unmap = async (sku) => { await api.delete(`/amazon/skus/map/${encodeURIComponent(sku)}`); toast.success('تم فك الربط'); load(); };
  const unmapped = list.filter(s => !s.product).length;

  const cols = [
    { key: 'sku', title: 'SKU أمازون', render: v => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v}</span> },
    { key: 'asin', title: 'ASIN' },
    { key: 'name', title: 'الاسم في أمازون', render: v => <span style={{ fontSize: 12, color: C.sub, display: 'inline-block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || '—'}</span> },
    { key: 'units', title: 'الوحدات' },
    { key: 'product', title: 'المنتج في النظام', render: (v, r) => v
      ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Badge color="#10b981">{v.name}</Badge>{r.manual && canEdit && <Btn size="sm" variant="ghost" onClick={() => unmap(r.sku)}>فك</Btn>}</div>
      : canEdit
        ? <select defaultValue="" onChange={e => map(r.sku, e.target.value)} style={{ background: '#0f172a', border: '1px solid #f8717155', borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, maxWidth: 240 }}>
            <option value="">— اختار المنتج —</option>
            {products.map(p => <option key={p._id} value={p._id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
          </select>
        : <Badge color="#ef4444">غير مربوط</Badge> },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub }}>
        الربط التلقائي بيتم لو الـ SKU أو الـ ASIN متسجل في صفحة المنتجات. الباقي اربطه يدوي هنا مرة واحدة.
        {unmapped > 0 && <b style={{ color: '#f87171' }}> — {unmapped} غير مربوط</b>}
      </Card>
      <Card style={{ padding: 0 }}><Table columns={cols} data={list.map(s => ({ ...s, _id: s.sku }))} /></Card>
    </div>
  );
}

// ═══ نظرة عامة ═══════════════════════════════════════════════
function OverviewTab({ go }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/amazon/overview').then(r => setD(r.data)).catch(() => toast.error('خطأ في تحميل النظرة العامة')); }, []);
  if (!d) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const P = ({ title, v, color }) => (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmt(v.sales)} <span style={{ fontSize: 12, color: C.muted }}>{CUR}</span></div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{v.orders} طلب · {v.units} قطعة</div>
    </Card>
  );
  const shortCount = d.pendingOrders.filter(o => o.short).length;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
        <P title="مبيعات النهارده" v={d.today} color="#10b981" />
        <P title="آخر 7 أيام" v={d.week} color="#3b82f6" />
        <P title="آخر 30 يوم" v={d.month} color="#8b5cf6" />
        <StatCard label="قيمة المخزون (بالتكلفة)" value={fmt(d.stockValue)} icon="📦" color="#f59e0b" sub={`${d.productsCount} صنف`} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>📈 المبيعات اليومية — آخر 30 يوم</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={d.daily}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" stroke={C.muted} fontSize={10} />
            <YAxis stroke={C.muted} fontSize={10} />
            <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, color: C.text }} formatter={(v, n) => [n === 'sales' ? fmt(v) + ' ' + CUR : v, n === 'sales' ? 'المبيعات' : 'القطع']} />
            <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>🚚 مستني يتشحن ({d.pendingOrders.length})</span>
            <a onClick={() => go('orders')} style={{ color: '#818cf8', cursor: 'pointer', fontSize: 12 }}>كل الطلبات ←</a>
          </div>
          {shortCount > 0 && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠️ {shortCount} طلب المخزون مش مكفيه</div>}
          {d.pendingOrders.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>مفيش طلبات منتظرة 👌</div>}
          {d.pendingOrders.slice(0, 12).map(o => (
            <div key={o.orderId} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}33`, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.orderId}</span>
                <span>{o.short && <Badge color="#ef4444">ناقص</Badge>} <Badge color={STAGES[o.stage].color}>{STAGES[o.stage].label}</Badge></span>
              </div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{o.items.map(i => `${i.name} ×${i.qty}`).join(' · ')} — {fmtDate(o.date)}</div>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>⚠️ أصناف ناقصة أو قربت تخلص ({d.lowStock.length})</span>
            <a onClick={() => go('reorder')} style={{ color: '#818cf8', cursor: 'pointer', fontSize: 12 }}>إعادة الطلب ←</a>
          </div>
          {d.lowStock.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>المخزون تمام 👌</div>}
          {d.lowStock.slice(0, 12).map(p => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}33`, fontSize: 13 }}>
              <span>{p.name}</span>
              <span>
                <b style={{ color: p.stock <= 0 ? '#f87171' : '#fbbf24' }}>{p.stock <= 0 ? 'خلص' : `باقي ${p.stock}`}</b>
                {p.daysLeft !== null && p.stock > 0 && <span style={{ color: C.muted, fontSize: 11 }}> · يكفي {p.daysLeft} يوم</span>}
              </span>
            </div>
          ))}
        </Card>

        <Card style={{ gridColumn: '1/-1' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🏆 الأكثر مبيعاً — آخر 30 يوم (مجموع كل إعلانات الصنف)</div>
          <Table columns={[
            { key: 'name', title: 'الصنف', render: (v, r) => <span style={{ fontWeight: 600, color: r.mapped ? C.text : '#f87171' }}>{v}{!r.mapped && ' (غير مربوط)'}</span> },
            { key: 'skus', title: 'الإعلانات (SKU)', render: v => <span style={{ fontSize: 11, color: C.sub }}>{v.length > 1 ? <Badge color="#8b5cf6">{v.length} إعلانات</Badge> : null} {v.join('، ')}</span> },
            { key: 'units', title: 'قطع مباعة' },
            { key: 'sales', title: `المبيعات (${CUR})`, render: money },
            { key: 'stock', title: 'المخزون', render: v => v ?? '—' },
          ]} data={d.topProducts.map((t, i) => ({ ...t, _id: i }))} />
        </Card>
      </div>
    </div>
  );
}

// ═══ مطابقة الخروج مع الطلبات ════════════════════════════════
const DSTAT = {
  matched: { label: 'مطابق', color: '#10b981' },
  short:   { label: 'مطلوب أكتر من اللي خرج', color: '#ef4444' },
  over:    { label: 'خرج أكتر من المطلوب', color: '#f59e0b' },
};
function DispatchTab() {
  const d0 = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const [range, setRange] = useState({ from: d0, to: new Date().toISOString().slice(0, 10) });
  const [data, setData] = useState(null);
  const [st, setSt] = useState('');
  useEffect(() => { api.get('/amazon/dispatch-compare', { params: range }).then(r => setData(r.data)).catch(() => toast.error('خطأ')); }, [range.from, range.to]);
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const t = data.totals;
  const rows = data.rows.filter(r => !st || r.status === st);
  const counts = { matched: t.matched, short: t.short, over: t.over };

  return (
    <div>
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        بيقارن القطع اللي خرجت من شاشة <b>«🚚 خروج لأمازون»</b> مع الكميات المطلوبة في <b>تقرير الطلبات</b> لنفس الفترة (بتاريخ الطلب).
        الطلبات الملغية مش محسوبة. لو بتشحن طلبات آخر اليوم تاني يوم، وسّع الفترة يوم.
      </Card>
      <DateFilter value={range} onChange={setRange} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 14 }}>
        <StatCard label="قطع مطلوبة في الطلبات" value={t.ordered} icon="🧾" color="#3b82f6" sub={`${t.orders} طلب`} />
        <StatCard label="قطع خرجت بالاسكانر" value={t.dispatched} icon="🚚" color="#8b5cf6" />
        <StatCard label="الفرق" value={t.dispatched - t.ordered} icon="⚖️" color={t.dispatched === t.ordered ? '#10b981' : '#ef4444'} sub={t.dispatched === t.ordered ? 'كله مطابق 👌' : t.dispatched > t.ordered ? 'خرج زيادة' : 'خرج ناقص'} />
      </div>
      {data.unmapped.length > 0 && <Card style={{ marginBottom: 14, borderColor: '#f59e0b55', color: '#f59e0b', fontSize: 13 }}>⚠️ SKUs في الطلبات مش مربوطة بصنف — مش داخلة في المقارنة: {data.unmapped.map(u => `${u.sku} (${u.qty})`).join('، ')} — اربطها من تبويب «ربط SKU»</Card>}
      <Chips items={DSTAT} value={st} onChange={setSt} counts={counts} />
      <Card style={{ padding: 0 }}>
        <Table columns={[
          { key: 'name', title: 'الصنف', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: C.muted }}>{r.skus.join('، ')}</div></div> },
          { key: 'ordered', title: 'مطلوب' },
          { key: 'dispatched', title: 'خرج' },
          { key: 'diff', title: 'الفرق', render: v => <span style={{ fontWeight: 800, fontSize: 15, color: v === 0 ? '#10b981' : v > 0 ? '#f59e0b' : '#ef4444' }}>{v > 0 ? '+' + v : v}</span> },
          { key: 'stock', title: 'المخزون الحالي', render: v => v ?? '—' },
          { key: 'orderIds', title: 'الطلبات', render: v => <span style={{ fontSize: 11, color: C.sub }}>{v.length ? `${v.length} طلب` : '—'}</span> },
          { key: 'status', title: 'الحالة', render: v => <Badge color={DSTAT[v].color}>{DSTAT[v].label}</Badge> },
        ]} data={rows} />
      </Card>
    </div>
  );
}
