import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, Btn, Badge, PageHeader, C_THEME as C } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const err = (e) => e.response?.data?.message || e.message || 'خطأ';
export const fmtDay = (d, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => new Date(d + 'T00:00:00').toLocaleDateString('ar-EG', opts);
// يوم واحد / يومين / 5 أيام / 15 يوم
export const daysAr = (n) => n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوم`;

// ═══ شريط التذكير (أعلى كل الصفحات) ═══════════════════════════
const HIDE_KEY = 'erp_season_hide';
export function SeasonBanner() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const today = new Date().toISOString().slice(0, 10);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === today; } catch { return false; } });
  useEffect(() => { api.get('/seasons/upcoming').then(r => setList(r.data)).catch(() => {}); }, []);
  if (hidden || !list.length) return null;
  const hide = () => { try { localStorage.setItem(HIDE_KEY, today); } catch { /* */ } setHidden(true); };

  return (
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.slice(0, 2).map((s, i) => {
        const left = s.active ? Math.max(0, s.duration + s.daysLeft) : s.daysLeft;
        return (
          <div key={s.id} onClick={() => nav('/seasons')} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, cursor: 'pointer', background: `linear-gradient(90deg, ${s.color}26, ${s.color}0d)`, border: `1px solid ${s.color}66` }}>
            <span style={{ fontSize: 26 }}>{s.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {s.active ? <>موسم {s.name} بدأ — باقي {daysAr(left)} على نهايته</> : <>باقي <span style={{ color: s.color, fontSize: 18 }}>{daysAr(s.daysLeft)}</span> على {s.name}</>}
              </div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtDay(s.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                {!s.active && s.prepBy && (s.prepBy <= today ? ' · وقت تجهيز المخزون بدأ' : ` · جهّز المخزون قبل ${fmtDay(s.prepBy, { day: 'numeric', month: 'long' })}`)}
                {' · '}{s.ideas.slice(0, 2).join('، ')}
              </div>
            </div>
            <span style={{ fontSize: 12, color: s.color, fontWeight: 700, whiteSpace: 'nowrap' }}>الأفكار ←</span>
            {i === 0 && <button onClick={(e) => { e.stopPropagation(); hide(); }} title="إخفاء حتى الغد" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>}
          </div>
        );
      })}
      {list.length > 2 && <div onClick={() => nav('/seasons')} style={{ fontSize: 12, color: C.sub, cursor: 'pointer' }}>+ {list.length - 2} موسم آخر قريب</div>}
    </div>
  );
}

// ═══ صفحة المواسم ═════════════════════════════════════════════
export default function Seasons() {
  const { can } = useAuth();
  const edit = can('settings');
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = () => api.get('/seasons').then(r => setList(r.data.seasons)).catch(e => toast.error(err(e)));
  useEffect(() => { load(); }, []);

  const put = async (s, body) => { try { await api.put(`/seasons/${s.key}`, body); load(); } catch (e) { toast.error(err(e)); } };
  const changeDate = (s) => {
    const v = prompt(`تاريخ ${s.name} (بصيغة YYYY-MM-DD)\nاتركه فارغاً للرجوع للتاريخ المحسوب (${s.original || s.date})`, s.date);
    if (v === null) return;
    put(s, { id: s.id, date: v.trim() });
  };
  const addCustom = async () => {
    try { await api.post('/seasons/custom', form); toast.success('تمت إضافة الموسم'); setForm(null); load(); }
    catch (e) { toast.error(err(e)); }
  };
  const delCustom = async (s) => { if (!confirm(`حذف «${s.name}»؟`)) return; await api.delete(`/seasons/custom/${s.key}`); load(); };

  if (!list) return <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>⏳</div>;
  const inp = { background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 10px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ maxWidth: 980 }}>
      <PageHeader title="المواسم" icon="🗓️" actions={edit ? [<Btn key="a" onClick={() => setForm(form ? null : { name: '', date: '', lead: 30, ideas: '', yearly: true })}>{form ? 'إلغاء' : '+ موسم خاص'}</Btn>] : []} />
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        يظهر تذكير أعلى الشاشة قبل كل موسم بـ 30 يوماً مع عدّ تنازلي يومي، ومعه أفكار المنتجات وموعد تجهيز المخزون.
        التواريخ الهجرية محسوبة بتقويم أم القرى وقد تختلف يوماً عن إعلان الرؤية في مصر، ومواعيد المدارس تقريبية — يمكن تعديل أي تاريخ.
      </Card>

      {form && (
        <Card style={{ marginBottom: 14 }}>
          <b>موسم خاص</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 10 }}>
            <input style={inp} placeholder="اسم الموسم (مثال: عروض 11.11)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input style={inp} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input style={inp} type="number" min="1" max="120" placeholder="التذكير قبلها بكام يوم" value={form.lead} onChange={e => setForm({ ...form, lead: e.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.sub }}><input type="checkbox" checked={form.yearly} onChange={e => setForm({ ...form, yearly: e.target.checked })} /> يتكرر كل سنة</label>
          </div>
          <textarea style={{ ...inp, width: '100%', boxSizing: 'border-box', marginTop: 10, minHeight: 70 }} placeholder="أفكار المنتجات — كل فكرة في سطر" value={form.ideas} onChange={e => setForm({ ...form, ideas: e.target.value })} />
          <div style={{ marginTop: 10 }}><Btn onClick={addCustom}>حفظ</Btn></div>
        </Card>
      )}

      {list.map(s => {
        const pct = s.active ? 100 : Math.max(0, Math.min(100, 100 - (s.daysLeft / 120) * 100));
        const prepStarted = !s.active && s.prepBy && s.prepBy <= today;
        return (
          <Card key={s.id} style={{ marginBottom: 12, borderRight: `4px solid ${s.color}`, opacity: s.enabled ? 1 : 0.55 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 34, lineHeight: 1 }}>{s.icon}</div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 17 }}>{s.name}</b>
                  {s.active && <Badge color="#10b981">الموسم الآن</Badge>}
                  {s.soon && <Badge color={s.color}>التذكير مفعّل</Badge>}
                  {prepStarted && <Badge color="#f59e0b">وقت تجهيز المخزون</Badge>}
                  {s.overridden && <Badge color="#64748b">تاريخ معدّل</Badge>}
                  {s.custom && <Badge color="#6366f1">موسم خاص</Badge>}
                </div>
                <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>
                  {fmtDay(s.date)}{s.hijri && <span style={{ color: C.muted }}> (تقريبي ± يوم)</span>}
                  {s.prepBy && !s.active && <> · جهّز المخزون قبل {fmtDay(s.prepBy, { day: 'numeric', month: 'long' })}</>}
                </div>
                {s.tip && <div style={{ fontSize: 13, color: C.sub, marginTop: 8, lineHeight: 1.7 }}>💡 {s.tip}</div>}
                {s.ideas.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {s.ideas.map(x => <span key={x} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 14, background: s.color + '1a', border: `1px solid ${s.color}44`, color: C.text }}>{x}</span>)}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', minWidth: 110 }}>
                {s.active
                  ? <div style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>شغّال الآن</div>
                  : <><div style={{ fontSize: 34, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.daysLeft}</div><div style={{ fontSize: 12, color: C.muted }}>{s.daysLeft === 1 ? 'يوم' : s.daysLeft <= 10 ? 'أيام' : 'يوم'} متبقٍ</div></>}
                <div style={{ height: 5, background: C.border, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: s.color }} /></div>
              </div>
            </div>
            {edit && (
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <Btn size="sm" variant="ghost" onClick={() => put(s, { enabled: !s.enabled })}>{s.enabled ? 'إيقاف التذكير' : 'تفعيل التذكير'}</Btn>
                {!s.custom && <Btn size="sm" variant="ghost" onClick={() => changeDate(s)}>تعديل التاريخ</Btn>}
                {s.custom && <Btn size="sm" variant="ghost" onClick={() => delCustom(s)}>حذف</Btn>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
