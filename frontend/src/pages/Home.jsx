import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../utils/api';
import { Card, Btn, fmt, fmtDate, C_THEME as C, THEME } from '../components/UI';

const CUR = THEME.currency || 'ج.م';
import { useAuth } from '../context/AuthContext';

// ═══════════════════════════════════════════════════════════
// الرئيسية: شغل النهارده فوق — والأرقام تحت
// ═══════════════════════════════════════════════════════════
export default function Home() {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const [h, setH] = useState(null);
  const [ov, setOv] = useState(null);
  useEffect(() => {
    api.get('/home').then(r => setH(r.data)).catch(() => setH({}));
    if (can('amazon:read')) api.get('/amazon/overview').then(r => setOv(r.data)).catch(() => {});
  }, []);

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const s = h?.shipments, st = h?.stock, a = h?.amazon;

  // المهام: كل واحدة ليها عدد ومكان تروحله
  const tasks = h ? [
    s && { n: s.drafts.length, icon: '📝', color: '#f59e0b', title: 'شحنات مسودة', hint: 'لسه ما اترحّلتش — كمّل المسح ورحّلها', go: '/shipments?status=draft', list: s.drafts.map(x => `${x.no} · ${x.employee || '—'} · ${x.qty} قطعة`) },
    s && { n: s.toMatch.length, icon: '⬆️', color: '#3b82f6', title: 'شحنات مستنية ملف أمازون', hint: 'اترحّلت — ارفع ملف المعاملات وطابقها', go: s.toMatch[0] ? `/shipments?open=${s.toMatch[0]._id}` : '/shipments', list: s.toMatch.map(x => `${x.no} · ${fmtDate(x.date)}`) },
    s && { n: s.diff.length, icon: '❌', color: '#ef4444', title: 'مطابقات فيها فرق', hint: 'اللي اتضرب مش زي ملف أمازون — راجعها', go: s.diff[0] ? `/shipments?open=${s.diff[0]._id}` : '/shipments', list: s.diff.map(x => `${x.no} · ${fmtDate(x.date)}`) },
    st && { n: st.out.length, icon: '🚫', color: '#ef4444', title: 'أصناف خلصت', hint: 'المخزون صفر أو بالسالب', go: '/amazon?tab=reorder', list: st.out.map(p => `${p.name} (${p.stock})`) },
    st && { n: st.low.length, icon: '⚠️', color: '#f59e0b', title: 'أصناف قربت تخلص', hint: 'تحت حد التنبيه', go: '/amazon?tab=reorder', list: st.low.map(p => `${p.name} — باقي ${p.stock}`) },
    a && { n: a.unmapped, icon: '🔗', color: '#8b5cf6', title: 'SKU مش مربوط بصنف', hint: 'من غير ربط مفيش ربحية ولا مخزون صح', go: '/amazon?tab=skus', list: [] },
    a && { n: a.refunds.length, icon: '↩️', color: '#ec4899', title: 'مرتجعات آخر ٧ أيام', hint: 'اتأكد إن القطع رجعت وامسحها كمرتجع', go: '/amazon?tab=recon', list: a.refunds.map(r => `${(r.name || '').slice(0, 40)} ×${r.qty} · ${fmt(r.amount)}`) },
  ].filter(Boolean) : [];
  const open = tasks.filter(t => t.n > 0);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{hello}، {user?.name?.split(' ')[0]} 👋</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('shipments') && <Btn size="lg" onClick={() => nav('/shipments?new=1')}>➕ شحنة جديدة</Btn>}
          {can('shipments:read') && <Btn size="lg" variant="ghost" onClick={() => nav('/shipments')}>📦 الشحنات</Btn>}
        </div>
      </div>

      {/* شغل النهارده */}
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>✅ شغل النهارده</div>
      {!h ? <Card style={{ color: C.muted }}>⏳</Card>
        : !open.length ? <Card style={{ textAlign: 'center', padding: 28, color: '#10b981', fontWeight: 700 }}>كله تمام 👌 مفيش حاجة مستنياك</Card>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12, marginBottom: 22 }}>
            {open.map(t => (
              <div key={t.title} onClick={() => nav(t.go)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRight: `4px solid ${t.color}`, borderRadius: 12, padding: 14, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{t.icon}</span>
                  <span style={{ flex: 1, fontWeight: 700 }}>{t.title}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{t.n}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, margin: '6px 0' }}>{t.hint}</div>
                {t.list.slice(0, 3).map((l, i) => <div key={i} style={{ fontSize: 12, color: C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>• {l}</div>)}
                {t.list.length > 3 && <div style={{ fontSize: 11, color: C.muted }}>+ {t.list.length - 3} كمان</div>}
                <div style={{ fontSize: 12, color: C.accentLight, marginTop: 6, fontWeight: 700 }}>افتح ←</div>
              </div>
            ))}
          </div>}

      {/* الأرقام */}
      {ov && <>
        <div style={{ fontWeight: 800, fontSize: 15, margin: '6px 0 10px' }}>📈 الأرقام</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
          {[['النهارده', ov.today, '#10b981'], ['آخر ٧ أيام', ov.week, '#3b82f6'], ['آخر ٣٠ يوم', ov.month, '#8b5cf6']].map(([l, v, color]) => (
            <Card key={l} style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>مبيعات {l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{fmt(v.sales)} <span style={{ fontSize: 12, color: C.muted }}>{CUR}</span></div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{v.orders} طلب · {v.units} قطعة</div>
            </Card>
          ))}
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>قيمة المخزون (بالتكلفة)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{fmt(ov.stockValue)}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{ov.productsCount} صنف</div>
          </Card>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>المبيعات اليومية — آخر ٣٠ يوم</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={ov.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" stroke={C.muted} fontSize={10} />
                <YAxis stroke={C.muted} fontSize={10} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, color: C.text }} formatter={(v) => [fmt(v) + ' ' + CUR, 'المبيعات']} />
                <Bar dataKey="sales" fill={C.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>🏆 الأكثر مبيعاً (٣٠ يوم)</div>
            {!ov.topProducts.length && <div style={{ color: C.muted, fontSize: 13 }}>لسه مفيش مبيعات</div>}
            {ov.topProducts.slice(0, 7).map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}55`, fontSize: 13 }}>
                <span style={{ width: 20, color: C.muted }}>{i + 1}</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: t.mapped ? C.text : '#f87171' }}>{t.name}</span>
                <b>{t.units}</b><span style={{ color: C.muted, fontSize: 11 }}>قطعة</span>
              </div>
            ))}
          </Card>
        </div>
      </>}
    </div>
  );
}
