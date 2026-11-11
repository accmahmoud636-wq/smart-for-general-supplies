import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card, Btn, Badge, PageHeader, StatCard, fmt, fmtDate, THEME, C_THEME as C } from '../components/UI';
import { PhotoStrip } from '../components/Photos';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const CUR = THEME.currency || 'ج.م';
const ST = {
  pending:     { label: 'قيد المراجعة',          color: '#f59e0b' },
  claimed:     { label: 'مطالبة أمازون',          color: '#3b82f6' },
  reimbursed:  { label: 'تم التعويض',            color: '#10b981' },
  written_off: { label: 'إعدام',                 color: '#ef4444' },
  restored:    { label: 'أُعيد للمخزون الرئيسي',   color: '#64748b' },
};
const err = (e) => e.response?.data?.message || e.message || 'خطأ';

// ═══ مخزن التوالف ═════════════════════════════════════════════
export default function Damaged() {
  const { can } = useAuth();
  const edit = can('stock') || can('shipments');
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState('open');

  const load = () => api.get('/damaged').then(r => setD(r.data)).catch(e => toast.error(err(e)));
  useEffect(() => { load(); }, []);

  const act = async (it, action) => {
    const body = { action };
    if (action === 'claimed') {
      const c = prompt('رقم مطالبة SAFE-T (اختياري):', it.claimNo || '');
      if (c === null) return; body.claimNo = c;
    } else if (action === 'reimbursed') {
      const a = prompt(`مبلغ التعويض من أمازون (${CUR}):`, '');
      if (a === null) return; body.amount = +a || 0;
    } else if (action === 'written_off') {
      if (!confirm(`إعدام ${it.qty} × «${it.name}»؟\nتُحتسب خسارة بقيمة ${fmt(it.qty * it.unitCost)} ${CUR}.`)) return;
    } else if (action === 'restored') {
      if (!confirm(`إرجاع ${it.qty} × «${it.name}» إلى المخزون الرئيسي؟\nيُستخدم إذا ثبت أن الصنف سليم أو تم إصلاحه.`)) return;
    }
    try { const { data } = await api.post(`/damaged/${it._id}/action`, body); toast.success(data.message); load(); }
    catch (e) { toast.error(err(e)); }
  };
  const save = async (it, patch) => {
    setD(x => ({ ...x, list: x.list.map(r => r._id === it._id ? { ...r, ...patch } : r) }));
    try { await api.put(`/damaged/${it._id}`, patch); } catch (e) { toast.error(err(e)); load(); }
  };

  if (!d) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const S = d.summary;
  const list = d.list.filter(r => filter === 'all' ? true : filter === 'open' ? ['pending', 'claimed'].includes(r.status) : r.status === filter);

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="مخزن التوالف" icon="⚠️" />
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        المرتجع التالف يُحدَّد من شاشة الشحنة قبل الترحيل، ولا يُضاف إلى المخزون الرئيسي. لكل سجل قرار واحد:
        <b> مطالبة أمازون</b> (إذا وصل المرتجع تالفاً من العميل) ثم <b>تم التعويض</b>، أو <b>إعدام</b> (خسارة بسعر الشراء)، أو <b>إرجاع للمخزون</b> إذا ثبت أنه سليم.
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 14 }}>
        <StatCard label="قيد المراجعة" value={S.pending.qty} icon="⏳" color={ST.pending.color} sub={`${S.pending.count} سجل · قيمة ${fmt(S.pending.value)}`} />
        <StatCard label="مطالبات أمازون مفتوحة" value={S.claimed.qty} icon="📨" color={ST.claimed.color} sub={`قيمة ${fmt(S.claimed.value)}`} />
        <StatCard label="تعويضات مستلمة" value={fmt(d.reimbursed)} icon="✅" color={ST.reimbursed.color} sub={`${S.reimbursed.qty} وحدة`} />
        <StatCard label="خسائر الإعدام" value={fmt(S.written_off.value)} icon="🗑️" color={ST.written_off.color} sub={`${S.written_off.qty} وحدة`} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['open', 'المفتوحة'], ...Object.entries(ST).map(([k, v]) => [k, v.label]), ['all', 'الكل']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ background: filter === k ? '#6366f133' : 'transparent', border: `1px solid ${filter === k ? '#6366f1' : C.border}`, color: filter === k ? '#a5b4fc' : C.sub, borderRadius: 20, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{l}</button>
        ))}
      </div>

      {!list.length && <Card style={{ textAlign: 'center', color: C.muted, padding: 30 }}>لا توجد سجلات</Card>}
      {list.map(it => {
        const s = ST[it.status];
        const open = ['pending', 'claimed'].includes(it.status);
        return (
          <Card key={it._id} style={{ marginBottom: 10, borderRight: `4px solid ${s.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{it.name} <span style={{ color: s.color }}>× {it.qty}</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                  الشحنة {it.shipmentNo} · {fmtDate(it.createdAt)} · {it.employee?.name || '—'} · القيمة {fmt(it.qty * it.unitCost)} {CUR}
                  {it.claimNo && <> · مطالبة <span dir="ltr" style={{ fontFamily: 'monospace' }}>{it.claimNo}</span></>}
                  {it.reimbursed > 0 && <> · تعويض {fmt(it.reimbursed)} {CUR}</>}
                </div>
              </div>
              <span style={{ whiteSpace: 'nowrap' }}><Badge color={s.color}>{s.label}</Badge></span>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <PhotoStrip ids={it.photos} onChange={edit && open ? (photos) => save(it, { photos }) : null} size={64} />
              {edit && open
                ? <input defaultValue={it.note} onBlur={e => e.target.value !== it.note && save(it, { note: e.target.value })} placeholder="وصف التلف"
                    style={{ flex: 1, minWidth: 200, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                : it.note && <div style={{ flex: 1, fontSize: 13, color: C.sub, paddingTop: 6 }}>{it.note}</div>}
            </div>

            {edit && open && (
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {it.status === 'pending' && <Btn size="sm" onClick={() => act(it, 'claimed')}>مطالبة أمازون</Btn>}
                {it.status === 'claimed' && <Btn size="sm" variant="success" onClick={() => act(it, 'reimbursed')}>تم التعويض</Btn>}
                <Btn size="sm" variant="danger" onClick={() => act(it, 'written_off')}>إعدام</Btn>
                <Btn size="sm" variant="ghost" onClick={() => act(it, 'restored')}>إرجاع للمخزون الرئيسي</Btn>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
