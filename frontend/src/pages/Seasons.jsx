import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Card, Btn, Badge, PageHeader, C_THEME as C } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import ProductPicker from '../components/ProductPicker';

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
    <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 8 }}>
        {list.map(s => {
          const left = s.active ? Math.max(0, s.duration + s.daysLeft) : s.daysLeft;
          return (
            <div key={s.id} onClick={() => nav('/seasons')} title="عرض أفكار الموسم" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, cursor: 'pointer', background: `linear-gradient(90deg, ${s.color}26, ${s.color}0d)`, border: `1px solid ${s.color}66`, minWidth: 0 }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.active ? <>{s.name} — <span style={{ color: s.color }}>شغّال الآن</span></> : <>باقي <span style={{ color: s.color, fontSize: 16 }}>{daysAr(s.daysLeft)}</span> على {s.name}</>}
                </div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.active ? `باقي ${daysAr(left)} على نهايته` : fmtDay(s.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                  {!s.active && s.prepBy && s.prepBy <= today && ' · وقت تجهيز المخزون'}
                  {s.lowCount > 0 && <span style={{ color: '#f87171', fontWeight: 700 }}> · {s.lowCount} أصناف رصيدها منخفض</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={hide} title="إخفاء حتى الغد" style={{ alignSelf: 'flex-start', background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: 'pointer', fontSize: 13, width: 30, height: 30, flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ═══ صفحة المواسم ═════════════════════════════════════════════
export default function Seasons() {
  const { can } = useAuth();
  const edit = can('settings');
  const canItems = can('settings') || can('products');
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState({});        // المواسم المفتوح فيها قسم الأصناف
  const [idea, setIdea] = useState({});
  const today = new Date().toISOString().slice(0, 10);

  const load = () => api.get('/seasons').then(r => setList(r.data.seasons)).catch(e => toast.error(err(e)));
  useEffect(() => { load(); if (canItems) api.get('/products').then(r => setProducts(r.data.filter(p => p.active !== false))).catch(() => {}); }, []);
  const addProduct = async (s, id) => { try { await api.post(`/seasons/${s.key}/products`, { product: id }); load(); } catch (e) { toast.error(err(e)); } };
  const delProduct = async (s, id) => { await api.delete(`/seasons/${s.key}/products/${id}`); load(); };
  const addIdea = async (s) => { const t = (idea[s.key] || '').trim(); if (!t) return; try { await api.post(`/seasons/${s.key}/ideas`, { text: t }); setIdea({ ...idea, [s.key]: '' }); load(); } catch (e) { toast.error(err(e)); } };
  const delIdea = async (s, text) => { await api.delete(`/seasons/${s.key}/ideas`, { data: { text } }); load(); };

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
            <input style={inp} type="number" min="1" max="120" placeholder="مدة التذكير قبل الموسم (بالأيام)" value={form.lead} onChange={e => setForm({ ...form, lead: e.target.value })} />
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                  {s.ideas.map(x => <span key={x} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 14, background: s.color + '1a', border: `1px solid ${s.color}44`, color: C.text }}>{x}</span>)}
                  {s.myIdeas.map(x => (
                    <span key={'m' + x} style={{ fontSize: 12, padding: '4px 6px 4px 10px', borderRadius: 14, background: '#10b9811a', border: '1px solid #10b98166', color: C.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ★ {x}{canItems && <button onClick={() => delIdea(s, x)} title="حذف" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>}
                    </span>
                  ))}
                  {canItems && (
                    <input value={idea[s.key] || ''} onChange={e => setIdea({ ...idea, [s.key]: e.target.value })} onKeyDown={e => e.key === 'Enter' && addIdea(s)}
                      placeholder="+ فكرة خاصة بك (Enter)" style={{ fontSize: 12, padding: '5px 10px', borderRadius: 14, border: `1px dashed ${C.border}`, background: 'transparent', color: C.text, outline: 'none', width: 170 }} />
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'center', minWidth: 110 }}>
                {s.active
                  ? <div style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>شغّال الآن</div>
                  : <><div style={{ fontSize: 34, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.daysLeft}</div><div style={{ fontSize: 12, color: C.muted }}>{s.daysLeft === 1 ? 'يوم' : s.daysLeft <= 10 ? 'أيام' : 'يوم'} متبقٍ</div></>}
                <div style={{ height: 5, background: C.border, borderRadius: 3, marginTop: 8, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: s.color }} /></div>
              </div>
            </div>
            {/* أصناف الموسم من المخزون */}
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <button onClick={() => setOpen({ ...open, [s.key]: !open[s.key] })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, fontWeight: 700, fontSize: 14, padding: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{open[s.key] ? '▾' : '◂'}</span> أصناف الموسم ({s.products.length})
                {s.lowCount > 0 && <Badge color="#ef4444">{s.lowCount} رصيدها منخفض</Badge>}
              </button>
              {open[s.key] && (
                <div style={{ marginTop: 10 }}>
                  {canItems && <div style={{ marginBottom: 10 }}><ProductPicker products={products.filter(p => !s.products.some(x => x._id === p._id))} onSelect={(id) => addProduct(s, id)} width={360} placeholder="ابحث عن صنف لإضافته للموسم..." /></div>}
                  {!s.products.length && <div style={{ fontSize: 13, color: C.muted }}>لم تُضف أصناف لهذا الموسم بعد — ابحث عن الصنف وأضفه لمتابعة رصيده قبل الموسم.</div>}
                  {s.products.map(p => (
                    <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}44`, fontSize: 13 }}>
                      <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                      <span style={{ color: C.muted, fontSize: 12 }}>سعر البيع {p.sellPrice || '—'}</span>
                      <span style={{ minWidth: 90, textAlign: 'center' }}>{p.low ? <Badge color="#ef4444">الرصيد {p.stock}</Badge> : <Badge color="#10b981">الرصيد {p.stock}</Badge>}</span>
                      {canItems && <button onClick={() => delProduct(s, p._id)} title="إزالة من الموسم" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}>✕</button>}
                    </div>
                  ))}
                </div>
              )}
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
