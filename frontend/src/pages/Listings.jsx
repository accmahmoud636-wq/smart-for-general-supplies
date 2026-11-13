import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, Badge, PageHeader, StatCard, Table, fmt, fmtDate, THEME, C_THEME as C } from '../components/UI';
import { normAr } from '../components/ProductPicker';
import toast from 'react-hot-toast';
import { readReportFile } from '../utils/parseReport';

const CUR = THEME.currency || 'ج.م';
// الإجراءات اللي محتاجة تتعمل — بالترتيب حسب الأهمية
const FOCUS = ['restock', 'loss', 'returns', 'unmapped', 'declining', 'dead', 'no_listing'];
const ICONS = { restock: '📦', loss: '💸', returns: '↩️', unmapped: '🔗', declining: '📉', dead: '💤', no_listing: '➕', star: '⭐', growing: '📈', ok: '✔️' };

// تفصيل مالي: المبيعات ← الرسوم ← صافي أمازون ← التكلفة ← الربح
function FinLines({ f, compact }) {
  const L = [
    ['المبيعات', f.sales, '#e2e8f0', true],
    ['المرتجعات (المبالغ المستردة)', f.refunds],
    ['رسوم الشحن المحصّلة', f.ship],
    ['الخصومات والعروض', f.promo],
    ['عمولة البيع (Selling fees)', f.selling],
    ['رسوم الشحن والتنفيذ (FBA / Easy Ship)', f.fba],
    ['رسوم معاملات أخرى', f.otherFees],
    ['أخرى', f.other],
    ...(f.general !== undefined ? [['رسوم عامة (اشتراك، شحن، إلغاء...)', f.general]] : []),
  ].filter(([, v, , keep]) => keep || v);
  const row = (l, v, c, b) => (
    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: compact ? '3px 0' : '5px 0', fontSize: compact ? 12 : 13, borderTop: b ? `1px dashed ${C.border}` : 'none', fontWeight: b ? 800 : 400 }}>
      <span style={{ color: b ? C.text : C.sub }}>{l}</span><span style={{ color: c || (v < 0 ? '#f87171' : v > 0 ? '#10b981' : C.muted), direction: 'ltr' }}>{fmt(v)}</span>
    </div>);
  return (<div>
    {L.map(([l, v, c]) => row(l, v, c))}
    {row('صافي المحوّل من أمازون', f.net, '#a5b4fc', true)}
    {row('تكلفة البضاعة المباعة', -f.cogs)}
    {row('صافي الربح', f.profit, f.profit < 0 ? '#f87171' : '#10b981', true)}
  </div>);
}

export default function Listings() {
  const nav = useNavigate();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState('focus');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const [det, setDet] = useState(null);

  const load = () => api.get('/amazon/listings', { params: { days } }).then(r => setD(r.data)).catch(e => toast.error(e.response?.data?.message || 'خطأ'));
  useEffect(() => { setD(null); load(); }, [days]);

  // رفع تقرير «كل الطلبات» من أمازون (ولو اترفع ملف معاملات بالغلط بيتسجل برضه)
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await readReportFile(file);
      let r, kind = 'الطلبات';
      try { r = (await api.post('/amazon/upload/orders', { rows })).data; }
      catch (e) {
        if (e.response?.status !== 400) throw e;
        r = (await api.post('/amazon/upload/transactions', { rows })).data; kind = 'المعاملات';
      }
      setLast({ name: file.name, kind, message: r.message });
      toast.success(`تقرير ${kind}: ${r.message}`, { duration: 6000 });
      await load();
    } catch (e) { toast.error(e.response?.data?.message || 'الملف غير مدعوم — يُقبل تقرير All Orders (TXT أو CSV أو Excel)'); }
    setBusy(false);
  };

  const rows = useMemo(() => {
    if (!d) return [];
    const words = normAr(q).split(' ').filter(Boolean);
    return d.rows.filter(r => (filter === 'all' ? true : filter === 'focus' ? FOCUS.includes(r.action) : r.action === filter)
      && (!words.length || words.every(w => normAr(`${r.name} ${r.sku} ${r.product?.name || ''}`).includes(w))));
  }, [d, filter, q]);

  if (!d) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const A = d.actions, K = d.kpi;
  const focusCount = FOCUS.reduce((t, k) => t + K.counts[k], 0);

  const cols = [
    { key: 'name', title: 'الإعلان', render: (v, r) => (
      <div style={{ maxWidth: 320, minWidth: 200, whiteSpace: 'normal' }}>
        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.5 }}>{r.isStar && <span title="من أعلى 10% مبيعاً">⭐ </span>}{r.product?.name || v || '—'}</div>
        {r.sku && <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>{r.sku}{r.product?.listings > 1 ? ` · ${r.product.listings} إعلانات للصنف` : ''}</div>}
      </div>) },
    { key: 'units', title: `المبيعات (${days} يوم)`, render: (v, r) => (
      <div style={{ whiteSpace: 'nowrap' }}>
        <b>{v}</b>
        {r.trend !== null && r.trend !== 0 && r.trend !== undefined && <span style={{ fontSize: 11, marginRight: 6, color: r.trend > 0 ? '#10b981' : '#f87171' }}>{r.trend > 0 ? '▲' : '▼'} {Math.abs(r.trend)}%</span>}
      </div>) },
    { key: 'revenue', title: 'الإيراد', render: v => v ? fmt(v) : '—' },
    { key: 'fin', title: 'رسوم أمازون', render: f => f ? <span style={{ color: '#f87171', direction: 'ltr', display: 'inline-block' }}>{fmt(f.fees)}</span> : '—' },
    { key: 'profit', title: 'صافي الربح', render: (v, r) => v === null || v === undefined ? <span style={{ color: C.muted }}>—</span> : <span onClick={() => setDet(r)} title="اضغط للتفاصيل" style={{ cursor: 'pointer', color: v < 0 ? '#f87171' : '#10b981', fontWeight: 700, borderBottom: '1px dotted' }}>{fmt(v)}{r.margin !== null && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}> ({r.margin}%)</span>}</span> },
    { key: 'returnRate', title: 'المرتجع', render: v => v ? <span style={{ color: v >= 15 ? '#f97316' : C.sub }}>{v}%</span> : '—' },
    { key: 'product', title: 'الرصيد', render: (p, r) => p ? (
      <div style={{ whiteSpace: 'nowrap' }}>
        <b style={{ color: p.stock <= 0 ? '#f87171' : C.text }}>{p.stock}</b>
        {r.daysLeft !== null && r.daysLeft !== undefined && <span style={{ fontSize: 11, color: r.daysLeft <= 14 ? '#f87171' : C.muted }}> · يكفي {r.daysLeft} يوم</span>}
      </div>) : '—' },
    { key: 'lastSale', title: 'آخر بيع', render: v => v ? fmtDate(v) : <span style={{ color: C.muted }}>—</span> },
    { key: 'action', title: 'الإجراء', render: (a, r) => (
      <div style={{ minWidth: 220, maxWidth: 300, whiteSpace: 'normal' }}>
        <Badge color={A[a].color}>{ICONS[a]} {A[a].label}{a === 'restock' && r.suggestedQty ? ` (${r.suggestedQty})` : ''}</Badge>
        {r.why && <div style={{ fontSize: 11, color: C.sub, marginTop: 4, lineHeight: 1.6 }}>{r.why}</div>}
      </div>) },
  ];

  return (
    <div>
      <PageHeader title="الإعلانات" icon="📣" actions={[
        <label key="u" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: 13 }}>
          {busy ? '⏳ جارٍ الرفع...' : '⬆ رفع تقرير (معاملات أو طلبات)'}
          <input type="file" accept=".txt,.csv,.tsv,.xlsx,.xls" style={{ display: 'none' }} disabled={busy} onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} />
        </label>,
        <div key="d" style={{ display: 'flex', gap: 4 }}>
          {[7, 30, 90, 180, 365].map(n => <button key={n} onClick={() => setDays(n)} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: days === n ? '#6366f133' : 'transparent', border: `1px solid ${days === n ? '#6366f1' : C.border}`, color: days === n ? '#a5b4fc' : C.sub }}>{n} يوم</button>)}
        </div>
      ]} />

      {last && (
        <Card style={{ marginBottom: 14, borderColor: '#10b98166', fontSize: 13, color: C.sub }}>
          ✅ آخر رفع: <b>{last.name}</b> (تقرير {last.kind}) — {last.message}. الطلبات المكررة بتتحدّث ومابتتكررش.
        </Card>
      )}
      {!K.hasOrders && !K.hasTx && (
        <Card style={{ marginBottom: 14, borderColor: '#f59e0b66', fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
          لا توجد بيانات أمازون في هذه الفترة. ارفع <b>تقرير المعاملات</b> (Payments ← Reports Repository ← Transaction) أو <b>تقرير كل الطلبات</b> من زر الرفع أعلاه.
          تقرير المعاملات لوحده كفاية: منه المبيعات والربح والمرتجعات.
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="إعلانات باعت" value={K.active}  icon="📣" color="#6366f1" sub={`من ${K.listings.toLocaleString('en')} إعلان · ${K.units} وحدة · ${fmt(K.revenue)} ${CUR}`} />
        <StatCard label="محتاجة كمية" value={K.counts.restock} icon="📦" color="#ef4444" />
        <StatCard label="بتخسر أو مرتجعها عالي" value={K.counts.loss + K.counts.returns} icon="💸" color="#f97316" />
        <StatCard label="إعلانات راكدة" value={K.counts.dead} icon="💤" color="#64748b" sub={K.deadValue ? `رأس مال راكد ${fmt(K.deadValue)}` : ''} />
        <StatCard label="أصناف بدون إعلان" value={K.counts.no_listing} icon="➕" color="#8b5cf6" />
        <StatCard label="الأعلى مبيعاً ⭐" value={K.stars} icon="⭐" color="#10b981" sub="أعلى 10% من الإعلانات اللي باعت" />
      </div>

      {/* الملخص المالي */}
      {d.fin && K.hasTx && (() => { const F = d.fin; return (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <b>💰 الأرباح ورسوم أمازون — آخر {days} يوم</b>
            <span style={{ fontSize: 12, color: C.muted }}>{F.orders} سطر مبيعات · {F.refundCount} مرتجع{F.transfers ? ` · اتحوّل لحسابك ${fmt(F.transfers)} ${CUR}` : ''}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
            {[['المبيعات', F.sales, '#6366f1'], ['رسوم أمازون', F.fees + F.general, '#ef4444', F.sales ? `${Math.round(-(F.fees + F.general) / F.sales * 100)}% من المبيعات` : ''], ['المرتجعات', F.refunds, '#f97316'], ['صافي من أمازون', F.net, '#8b5cf6'], ['تكلفة البضاعة', -F.cogs, '#64748b'], ['صافي الربح', F.profit, F.profit < 0 ? '#ef4444' : '#10b981', F.sales ? `هامش ${Math.round(F.profit / F.sales * 100)}%` : '']].map(([l, v, c, sub]) => (
              <div key={l} style={{ background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: C.muted }}>{l}</div>
                <div style={{ fontWeight: 800, fontSize: 17, color: c, direction: 'ltr', textAlign: 'right' }}>{fmt(v)}</div>
                {sub && <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>}
              </div>))}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#a5b4fc' }}>التفاصيل الكاملة</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, marginTop: 10 }}>
              <FinLines f={F} />
              {F.generalByType.length > 0 && <div><div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>الرسوم العامة (مش على إعلان معيّن)</div>
                {F.generalByType.map(g => <div key={g.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: C.sub }}>{g.name}</span><span style={{ color: '#f87171', direction: 'ltr' }}>{fmt(g.total)}</span></div>)}</div>}
            </div>
          </details>
          {F.missingCost > 0 && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 8 }}>⚠ {F.missingCost} إعلان باع وصنفه مالوش سعر شراء — الربح بتاعه محسوب من غير تكلفة. حدّث الأسعار من الرصيد الافتتاحي.</div>}
        </Card>); })()}

      {det && (
        <div onClick={() => setDet(null)} style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, width: 420, maxWidth: '100%' }}>
            <div style={{ fontWeight: 800, marginBottom: 2 }}>{det.product?.name || det.name}</div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', marginBottom: 10 }}>{det.sku} · باع {det.units} · مرتجع {det.refunded} · آخر {days} يوم</div>
            <FinLines f={det.fin} />
            <button onClick={() => setDet(null)} style={{ marginTop: 12, width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.sub, cursor: 'pointer' }}>إغلاق</button>
          </div>
        </div>
      )}

      {/* مركز الإجراءات */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>المطلوب منك ({focusCount})</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>اضغط على أي بند لعرض إعلاناته.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
          {[...FOCUS, 'star', 'growing'].filter(k => K.counts[k]).map(k => (
            <button key={k} onClick={() => setFilter(k)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'right', background: filter === k ? A[k].color + '26' : 'var(--bg)', border: `1px solid ${filter === k ? A[k].color : C.border}`, color: C.text }}>
              <span style={{ fontSize: 20 }}>{ICONS[k]}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{A[k].label}</span>
              <b style={{ fontSize: 18, color: A[k].color }}>{K.counts[k]}</b>
            </button>
          ))}
          {!focusCount && <div style={{ fontSize: 13, color: '#10b981' }}>✓ لا توجد إجراءات مطلوبة حالياً</div>}
        </div>
        {(K.counts.unmapped > 0) && <div style={{ marginTop: 10, fontSize: 12, color: C.sub }}>الإعلانات غير المربوطة تُربط من <span onClick={() => nav('/amazon?tab=skus')} style={{ color: '#a5b4fc', cursor: 'pointer', textDecoration: 'underline' }}>ربط رموز SKU</span>.</div>}
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['focus', `المطلوب (${focusCount})`], ['all', `الكل (${d.rows.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ background: filter === k ? '#6366f133' : 'transparent', border: `1px solid ${filter === k ? '#6366f1' : C.border}`, color: filter === k ? '#a5b4fc' : C.sub, borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{l}</button>
        ))}
        {!['focus', 'all'].includes(filter) && <Badge color={A[filter].color}>{ICONS[filter]} {A[filter].label} — {rows.length}</Badge>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو SKU..." style={{ marginRight: 'auto', minWidth: 220, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, outline: 'none' }} />
      </div>
      <Card style={{ padding: 0 }}>
        <Table columns={cols} data={rows.slice(0, 500)} />
        {rows.length > 500 && <div style={{ padding: 10, fontSize: 12, color: C.muted, textAlign: 'center' }}>يُعرض أول 500 — استخدم البحث أو الفلاتر</div>}
      </Card>
    </div>
  );
}
