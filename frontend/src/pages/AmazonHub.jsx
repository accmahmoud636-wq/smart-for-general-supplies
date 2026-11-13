import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Table, PageHeader, StatCard, fmt, fmtDate, C_THEME as C, THEME } from '../components/UI';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import ProductPicker from '../components/ProductPicker';
import KitModal from '../components/KitModal';

const CUR = THEME.currency || 'ج.م';
const money = (v) => <span style={{ color: v < 0 ? '#f87171' : C.text, fontWeight: 600 }}>{fmt(v)}</span>;

const STAGES = {
  new:       { label: 'جديد',        color: '#3b82f6' },
  packed:    { label: 'مُجهّز',       color: '#8b5cf6' },
  shipped:   { label: 'تم الشحن',    color: '#f59e0b' },
  delivered: { label: 'تم التسليم',  color: '#10b981' },
  returned:  { label: 'مرتجع',       color: '#ef4444' },
  cancelled: { label: 'ملغي',        color: 'var(--muted)' },
};

const RECON = {
  matched:           { label: 'مطابق',              color: '#10b981' },
  diff:              { label: 'فرق في المبلغ',       color: '#ef4444' },
  pending:           { label: 'بانتظار التسوية',     color: '#3b82f6' },
  overdue:           { label: 'متأخر (أكثر من 21 يوماً)',       color: '#f97316' },
  refunded:          { label: 'مسترجع',             color: '#a855f7' },
  cancelled:         { label: 'ملغي',               color: 'var(--muted)' },
  cancelled_charged: { label: 'ملغي وعليه قيود مالية',     color: '#eab308' },
};

const LEVELS = {
  urgent: { label: 'طلب عاجل', color: '#ef4444' },
  soon:   { label: 'قريباً',    color: '#f59e0b' },
  ok:     { label: 'كافٍ',      color: '#10b981' },
  slow:   { label: 'بدون مبيعات', color: 'var(--muted)' },
};

const TABS = [
  ['overview', 'نظرة عامة'],
  ['orders', 'الطلبات'],
  ['profit', 'ربحية المنتجات'],
  ['recon', 'التسويات'],
  ['reorder', 'إعادة الطلب'],
  ['skus', 'ربط رموز SKU'],
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
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const setTab = (t) => setSp({ tab: t });
  const [summary, setSummary] = useState(null);
  const loadSummary = () => api.get('/amazon/summary').then(r => setSummary(r.data)).catch(() => {});
  useEffect(() => { loadSummary(); }, []);
  const st = summary?.stages || {};

  return (
    <div>
      <PageHeader title="مركز أمازون" icon="🛒" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="طلبات جديدة" value={st.new || 0} icon="🆕" color="#3b82f6" />
        <StatCard label="جاهزة للشحن" value={st.packed || 0} icon="📦" color="#8b5cf6" />
        <StatCard label="تم الشحن" value={st.shipped || 0} icon="🚚" color="#f59e0b" />
        <StatCard label="بانتظار الترحيل" value={summary?.toPost || 0} icon="🧾" color="#ec4899" sub="طلبات مشحونة دون فاتورة" />
        <StatCard label="آخر تقرير معاملات" value={summary?.lastTxDate ? fmtDate(summary.lastTxDate) : '—'} icon="📅" color="#10b981" />
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18, overflowX: 'auto' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.accent : 'transparent'}`, color: tab === k ? '#818cf8' : C.sub, padding: '10px 14px', cursor: 'pointer', fontWeight: tab === k ? 700 : 500, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab go={setTab} />}
      {tab === 'orders' && <OrdersTab canEdit={canEdit} onChange={loadSummary} />}
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
    if (!sel.size) return toast.error('يُرجى تحديد الطلبات أولاً');
    if (to === 'returned' && !confirm('تأكيد تسجيل المرتجع؟ ستُعاد كميات الطلبات المُرحّلة إلى المخزون.')) return;
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
          <div style={{ flex: 1, minWidth: 200 }}><Input label="بحث" value={search} onChange={setSearch} placeholder="رقم الطلب أو SKU أو المدينة" /></div>
          <div style={{ marginBottom: 14 }}><Btn variant="ghost" onClick={load}>بحث</Btn></div>
          <DateFilter value={range} onChange={setRange} />
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>العناصر المحددة ({sel.size}):</span>
            <Btn size="sm" variant="ghost" onClick={() => setStageFor('packed')}>مُجهّز</Btn>
            <Btn size="sm" variant="warning" onClick={() => setStageFor('shipped')}>تم الشحن</Btn>
            <Btn size="sm" variant="success" onClick={() => setStageFor('delivered')}>تم التسليم</Btn>
            <Btn size="sm" variant="danger" onClick={() => setStageFor('returned')}>مرتجع</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setStageFor('cancelled')}>ملغي</Btn>
            <div style={{ marginRight: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: C.sub }} title="اترك الخيار غير محدد إذا كانت البضاعة تُصرف عبر شاشة «الشحنات والتسليم» لتجنّب الخصم المزدوج">
                <input type="checkbox" checked={deduct} onChange={e => toggleDeduct(e.target.checked)} /> الخصم من المخزون أيضاً
              </label>
              <Btn size="sm" onClick={postSales} disabled={busy}>{busy ? 'جارٍ الترحيل...' : 'ترحيل الطلبات المشحونة إلى فواتير البيع'}</Btn>
            </div>
          </div>
        )}
      </Card>
      {skipped.length > 0 && (
        <Card style={{ marginBottom: 14, borderColor: '#f59e0b55' }}>
          <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>طلبات لم تُرحَّل ({skipped.length})</div>
          {skipped.slice(0, 20).map(s => <div key={s.orderId} style={{ fontSize: 12, color: C.sub, marginBottom: 3 }}><span style={{ fontFamily: 'monospace' }}>{s.orderId}</span> — {s.reason}</div>)}
        </Card>
      )}
      <Card style={{ padding: 0 }}><Table columns={cols} data={data.orders} onRow={canEdit ? r => toggle(r._id) : undefined} /></Card>
    </div>
  );
}

// ═══ الربحية ═════════════════════════════════════════════════
function ProfitTab() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/amazon/profitability', { params: range }).then(r => setData(r.data)).catch(() => toast.error('تعذّر تحميل البيانات')); }, [range.from, range.to]);
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const t = data.totals;

  const cols = [
    { key: 'sku', title: 'SKU / الصنف', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: r.product ? C.muted : '#f87171' }}>{r.product?.name || 'غير مربوط'}</div></div> },
    { key: 'netUnits', title: 'صافي الوحدات', render: (v, r) => <span>{v}{r.unitsRefunded > 0 && <span style={{ color: '#f87171', fontSize: 11 }}> (مرتجع {r.unitsRefunded})</span>}</span> },
    { key: 'sales', title: 'المبيعات', render: money },
    { key: 'refunds', title: 'المرتجعات', render: money },
    { key: 'fees', title: 'رسوم أمازون', render: (v, r) => <span>{money(v)} <span style={{ fontSize: 11, color: C.muted }}>{r.feePct}%</span></span> },
    { key: 'net', title: 'الصافي من أمازون', render: money },
    { key: 'unitCost', title: 'تكلفة الوحدة', render: v => v ? fmt(v) : <Badge color="#f59e0b">التكلفة غير مسجّلة</Badge> },
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
        <StatCard label="رسوم عامة (اشتراك وإعلانات)" value={fmt(t.generalFees)} icon="📣" color="#ec4899" />
        <StatCard label="صافي الربح النهائي" value={fmt(t.finalProfit)} icon="📈" color={t.finalProfit >= 0 ? '#10b981' : '#ef4444'} sub={`المحوَّل إلى الحساب البنكي: ${fmt(Math.abs(t.transfers))}`} />
      </div>
      {t.missingCost > 0 && <Card style={{ marginBottom: 14, borderColor: '#f59e0b55', color: '#f59e0b', fontSize: 13 }}>{t.missingCost} صنف دون سعر شراء أو غير مرتبط، وقد احتُسب ربحه دون تكلفة. يُرجى استكمال سعر الشراء أو ربط رمز SKU.</Card>}
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
  useEffect(() => { api.get('/amazon/reconciliation', { params: range }).then(r => setData(r.data)).catch(() => toast.error('تعذّر تحميل البيانات')); }, [range.from, range.to]);
  useEffect(() => { api.get('/amazon/settlements').then(r => setSettlements(r.data)).catch(() => {}); }, []);
  const rows = useMemo(() => (data?.rows || []).filter(r => !status || r.status === status), [data, status]);
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;

  const orderCols = [
    { key: 'orderId', title: 'رقم الطلب', render: v => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { key: 'date', title: 'التاريخ', render: v => fmtDate(v) },
    { key: 'skus', title: 'SKU' },
    { key: 'expected', title: 'القيمة المتوقعة', render: money },
    { key: 'settled', title: 'المبيعات في التسوية', render: money },
    { key: 'diff', title: 'الفرق', render: v => <span style={{ color: Math.abs(v) > 1 ? '#f87171' : C.muted, fontWeight: 700 }}>{fmt(v)}</span> },
    { key: 'fees', title: 'الرسوم', render: money },
    { key: 'refunds', title: 'المرتجعات', render: money },
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
    { key: 'transfer', title: 'المحوَّل إلى البنك', render: money },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <Chip active={view === 'orders'} onClick={() => setView('orders')} color={C.accent}>مطابقة الطلبات</Chip>
        <Chip active={view === 'settlements'} onClick={() => setView('settlements')} color={C.accent}>ملخص الدفعات ({settlements.length})</Chip>
        {data.missingOrders.length > 0 && <Chip active={view === 'missing'} onClick={() => setView('missing')} color="#f59e0b">معاملات دون طلب مطابق ({data.missingOrders.length})</Chip>}
      </div>
      {view === 'orders' && <>
        <DateFilter value={range} onChange={setRange} />
        <Chips items={RECON} value={status} onChange={setStatus} counts={data.counts} />
        <Card style={{ padding: 0 }}><Table columns={orderCols} data={rows} /></Card>
      </>}
      {view === 'settlements' && <Card style={{ padding: 0 }}><Table columns={setCols} data={settlements.map(s => ({ ...s, _id: s.settlementId }))} /></Card>}
      {view === 'missing' && <Card style={{ padding: 0 }}>
        <div style={{ padding: 14, fontSize: 13, color: C.sub }}>طلبات وردت في تقرير المعاملات ولا توجد في تقرير الطلبات.</div>
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
  const load = () => api.get('/amazon/reorder', { params: p }).then(r => setData(r.data)).catch(() => toast.error('تعذّر تحميل البيانات'));
  useEffect(() => { load(); }, []);
  const rows = (data?.rows || []).filter(r => !level || r.level === level);
  const counts = (data?.rows || []).reduce((c, r) => (c[r.level] = (c[r.level] || 0) + 1, c), {});
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);

  const cols = [
    { key: 'name', title: 'المنتج', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: C.muted }}>{r.sku}</div></div> },
    { key: 'stock', title: 'المخزون الحالي' },
    { key: 'unitsSold', title: `المبيعات آخر ${data?.params.days || ''} يوماً` },
    { key: 'perDay', title: 'المعدل اليومي' },
    { key: 'daysLeft', title: 'التغطية (يوم)', render: v => v === null ? '∞' : <span style={{ fontWeight: 700, color: v <= (data?.params.lead || 0) ? '#f87171' : C.text }}>{v}</span> },
    { key: 'suggestedQty', title: 'الكمية المقترحة', render: v => v ? <span style={{ fontWeight: 800, color: '#818cf8' }}>{v}</span> : '—' },
    { key: 'cost', title: `التكلفة (${CUR})`, render: v => v ? fmt(v) : '—' },
    { key: 'level', title: 'الحالة', render: v => <Badge color={LEVELS[v].color}>{LEVELS[v].label}</Badge> },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 150 }}><Input label="فترة الاحتساب (يوم)" type="number" value={p.days} onChange={v => setP({ ...p, days: v })} /></div>
          <div style={{ width: 150 }}><Input label="مدة التوريد (يوم)" type="number" value={p.lead} onChange={v => setP({ ...p, lead: v })} /></div>
          <div style={{ width: 150 }}><Input label="التغطية بعد الاستلام (يوم)" type="number" value={p.cover} onChange={v => setP({ ...p, cover: v })} /></div>
          <div style={{ marginBottom: 14 }}><Btn onClick={load}>احتساب</Btn></div>
          <div style={{ marginBottom: 14, marginRight: 'auto', fontSize: 13, color: C.sub }}>إجمالي تكلفة الشراء المقترح: <b style={{ color: 'var(--text)' }}>{fmt(totalCost)} {CUR}</b></div>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>الكمية المقترحة = المعدل اليومي × (مدة التوريد + التغطية) − المخزون الحالي</div>
      </Card>
      {data?.unmapped?.length > 0 && <Card style={{ marginBottom: 14, borderColor: '#f59e0b55', color: '#f59e0b', fontSize: 13 }}>رموز SKU غير مرتبطة ومستبعدة من الاحتساب: {data.unmapped.join('، ')}</Card>}
      <Chips items={LEVELS} value={level} onChange={setLevel} counts={counts} />
      <Card style={{ padding: 0 }}><Table columns={cols} data={rows} /></Card>
    </div>
  );
}

// ═══ ربط SKU ═════════════════════════════════════════════════
function SkusTab({ canEdit }) {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [maps, setMaps] = useState([]);
  const [kit, setKit] = useState(null);       // sku المفتوح لتعديل محتواه
  const load = () => {
    api.get('/amazon/skus').then(r => setList(r.data)).catch(() => toast.error('تعذّر تحميل البيانات'));
    api.get('/amazon/skus/maps').then(r => setMaps(r.data)).catch(() => {});
  };
  useEffect(() => { load(); api.get('/products').then(r => setProducts(r.data.filter(p => p.active !== false))).catch(() => {}); }, []);
  const mapOf = (sku) => maps.find(m => m.sku.toLowerCase() === sku.toLowerCase());

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
    { key: 'name', title: 'الاسم لدى أمازون', render: v => <span style={{ fontSize: 12, color: C.sub, display: 'inline-block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || '—'}</span> },
    { key: 'units', title: 'الوحدات' },
    { key: 'product', title: 'المنتج في النظام', render: (v, r) => v
      ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {(r.parts || []).length > 1 || r.packQty > 1
            ? <Badge color="#8b5cf6">📦 {r.parts.map(x => `${x.qty > 1 ? x.qty + '× ' : ''}${x.name}`).join(' + ')}</Badge>
            : <Badge color="#10b981">{v.name}</Badge>}
          {canEdit && <Btn size="sm" variant="ghost" onClick={() => setKit(r.sku)} title="الإعلان فيه أكتر من قطعة أو أكتر من صنف">محتوى الإعلان</Btn>}
          {r.manual && canEdit && <Btn size="sm" variant="ghost" onClick={() => unmap(r.sku)}>إلغاء الربط</Btn>}
        </div>
      : canEdit
        ? <ProductPicker products={products} onSelect={(id) => map(r.sku, id)} borderColor="#f8717155" />
        : <Badge color="#ef4444">غير مربوط</Badge> },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub }}>
        يتم الربط تلقائياً عند تسجيل رمز SKU أو ASIN في بطاقة الصنف، ويُربط الباقي يدوياً من هنا مرة واحدة.
        {unmapped > 0 && <b style={{ color: '#f87171' }}> — {unmapped} غير مربوط</b>}
      </Card>
      <Card style={{ padding: 0 }}><Table columns={cols} data={list.map(s => ({ ...s, _id: s.sku }))} /></Card>
      <KitModal open={!!kit} onClose={() => setKit(null)} sku={kit} products={products} onSaved={load}
        map={kit && (mapOf(kit) || (() => { const r = list.find(x => x.sku === kit); return r?.product ? { product: r.product._id, qty: 1, components: [] } : null; })())} />
    </div>
  );
}

// ═══ نظرة عامة ═══════════════════════════════════════════════
function OverviewTab({ go }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/amazon/overview').then(r => setD(r.data)).catch(() => toast.error('تعذّر تحميل البيانات')); }, []);
  if (!d) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const P = ({ title, v, color }) => (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmt(v.sales)} <span style={{ fontSize: 12, color: C.muted }}>{CUR}</span></div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{v.orders} طلب · {v.units} وحدة</div>
    </Card>
  );
  const shortCount = d.pendingOrders.filter(o => o.short).length;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
        <P title="مبيعات اليوم" v={d.today} color="#10b981" />
        <P title="آخر 7 أيام" v={d.week} color="#3b82f6" />
        <P title="آخر 30 يوماً" v={d.month} color="#8b5cf6" />
        <StatCard label="قيمة المخزون (بالتكلفة)" value={fmt(d.stockValue)} icon="📦" color="#f59e0b" sub={`${d.productsCount} صنف`} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>المبيعات اليومية — آخر 30 يوماً</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={d.daily}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="date" stroke={C.muted} fontSize={10} />
            <YAxis stroke={C.muted} fontSize={10} />
            <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, color: C.text }} formatter={(v, n) => [n === 'sales' ? fmt(v) + ' ' + CUR : v, n === 'sales' ? 'المبيعات' : 'الوحدات']} />
            <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>طلبات بانتظار الشحن ({d.pendingOrders.length})</span>
            <a onClick={() => go('orders')} style={{ color: '#818cf8', cursor: 'pointer', fontSize: 12 }}>جميع الطلبات ←</a>
          </div>
          {shortCount > 0 && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{shortCount} طلب لا يغطيه الرصيد المتاح</div>}
          {d.pendingOrders.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>لا توجد طلبات بانتظار الشحن</div>}
          {d.pendingOrders.slice(0, 12).map(o => (
            <div key={o.orderId} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}33`, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.orderId}</span>
                <span>{o.short && <Badge color="#ef4444">رصيد غير كافٍ</Badge>} <Badge color={STAGES[o.stage].color}>{STAGES[o.stage].label}</Badge></span>
              </div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{o.items.map(i => `${i.name} ×${i.qty}`).join(' · ')} — {fmtDate(o.date)}</div>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700 }}>أصناف نفدت أو تحت حد الطلب ({d.lowStock.length})</span>
            <a onClick={() => go('reorder')} style={{ color: '#818cf8', cursor: 'pointer', fontSize: 12 }}>إعادة الطلب ←</a>
          </div>
          {d.lowStock.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>المخزون ضمن المستوى المطلوب</div>}
          {d.lowStock.slice(0, 12).map(p => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}33`, fontSize: 13 }}>
              <span>{p.name}</span>
              <span>
                <b style={{ color: p.stock <= 0 ? '#f87171' : '#fbbf24' }}>{p.stock <= 0 ? 'نفد' : `الرصيد ${p.stock}`}</b>
                {p.daysLeft !== null && p.stock > 0 && <span style={{ color: C.muted, fontSize: 11 }}> · يغطي {p.daysLeft} يوماً</span>}
              </span>
            </div>
          ))}
        </Card>

        <Card style={{ gridColumn: '1/-1' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>الأصناف الأكثر مبيعاً — آخر 30 يوماً (إجمالي جميع إعلانات الصنف)</div>
          <Table columns={[
            { key: 'name', title: 'الصنف', render: (v, r) => <span style={{ fontWeight: 600, color: r.mapped ? C.text : '#f87171' }}>{v}{!r.mapped && ' (غير مربوط)'}</span> },
            { key: 'skus', title: 'الإعلانات (SKU)', render: v => <span style={{ fontSize: 11, color: C.sub }}>{v.length > 1 ? <Badge color="#8b5cf6">{v.length} إعلانات</Badge> : null} {v.join('، ')}</span> },
            { key: 'units', title: 'الوحدات المباعة' },
            { key: 'sales', title: `المبيعات (${CUR})`, render: money },
            { key: 'stock', title: 'المخزون', render: v => v ?? '—' },
          ]} data={d.topProducts.map((t, i) => ({ ...t, _id: i }))} />
        </Card>
      </div>
    </div>
  );
}

