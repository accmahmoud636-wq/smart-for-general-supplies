import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Card, Btn, Modal, PageHeader, Table, fmt, fmtDate, C_THEME as C } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { normAr } from '../components/ProductPicker';
import { IconExternalLink, IconSearch, IconStar, IconPencil, IconTrash } from '@tabler/icons-react';

// ═══ رصد السوق: صفحات الترند المباشرة + قائمة متابعة المنتجات الرائجة ═══
const BS = 'https://www.amazon.eg/gp/bestsellers';
const LINKS = [
  ['أمازون مصر', [
    ['الأكثر مبيعاً — كل الأقسام', BS],
    ['المنزل والمطبخ', `${BS}/home`],
    ['أدوات المطبخ', `${BS}/home/21863850031`],
    ['أواني الطهي', `${BS}/home/21863844031`],
    ['تنظيم المطبخ', `${BS}/home/21864034031`],
    ['السيارات', `${BS}/automotive`],
    ['إكسسوارات السيارات', `${BS}/automotive/21805227031`],
    ['الأكثر صعوداً (آخر 24 ساعة)', 'https://www.amazon.eg/gp/movers-and-shakers'],
    ['الإصدارات الجديدة', 'https://www.amazon.eg/gp/new-releases'],
    ['الأكثر طلباً في قوائم الأمنيات', 'https://www.amazon.eg/gp/most-wished-for'],
  ]],
  ['مصادر أخرى', [
    ['نون مصر', 'https://www.noon.com/egypt-ar/'],
    ['Google Trends — مصر', 'https://trends.google.com/trending?geo=EG'],
    ['مكتبة إعلانات فيسبوك — مصر', 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=EG'],
  ]],
];
const STATUS = {
  idea:     ['فكرة', '#818cf8'],
  sample:   ['طلبت عينة', '#f59e0b'],
  added:    ['أضفته لمخزوني', '#10b981'],
  rejected: ['مستبعد', '#64748b'],
};
const EMPTY = { name: '', category: '', price: '', rating: '', reviews: '', rank: '', source: 'أمازون مصر', url: '', note: '' };
const amzSearch = (q) => `https://www.amazon.eg/s?k=${encodeURIComponent(q)}`;
const noonSearch = (q) => `https://www.noon.com/egypt-ar/search/?q=${encodeURIComponent(q)}`;
const open = (u) => window.open(u, '_blank', 'noopener');

export default function Market() {
  const { can } = useAuth();
  const edit = can('amazon');
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const [look, setLook] = useState('');
  const [form, setForm] = useState(null);     // null | { ...EMPTY, _id? }

  const load = () => api.get('/market').then(r => setItems(r.data)).catch(e => toast.error(e.response?.data?.message || 'تعذّر التحميل'));
  useEffect(() => { load(); }, []);

  const setStatus = async (it, status) => {
    setItems(xs => xs.map(x => x._id === it._id ? { ...x, status } : x));
    try { await api.put(`/market/${it._id}`, { status }); } catch { toast.error('تعذّر الحفظ'); load(); }
  };
  const save = async () => {
    if (!form.name.trim()) return toast.error('اسم المنتج مطلوب');
    try {
      if (form._id) await api.put(`/market/${form._id}`, form); else await api.post('/market', form);
      toast.success(form._id ? 'تم التعديل' : 'تمت الإضافة لقائمة المتابعة'); setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'تعذّر الحفظ'); }
  };
  const del = async (it) => {
    if (!confirm(`حذف «${it.name}» من قائمة المتابعة؟`)) return;
    try { await api.delete(`/market/${it._id}`); setItems(xs => xs.filter(x => x._id !== it._id)); } catch { toast.error('تعذّر الحذف'); }
  };

  const counts = (items || []).reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
  const words = normAr(q).split(' ').filter(Boolean);
  const shown = (items || []).filter(x => (filter === 'all' ? true : filter === 'active' ? x.status !== 'rejected' : x.status === filter)
    && (!words.length || words.every(w => normAr(`${x.name} ${x.category} ${x.source} ${x.note}`).includes(w))));
  const inp = { background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, outline: 'none' };

  const cols = [
    { key: 'name', title: 'المنتج', render: (v, r) => (
      <div style={{ minWidth: 220, maxWidth: 360, whiteSpace: 'normal' }}>
        <div style={{ fontWeight: 600 }}>{v}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{[r.rank, r.source, fmtDate(r.createdAt)].filter(Boolean).join(' · ')}</div>
        {r.note && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{r.note}</div>}
      </div>) },
    { key: 'category', title: 'الفئة', render: v => v || '—' },
    { key: 'price', title: 'السعر', render: v => v ? `${fmt(v)} ج.م` : '—' },
    { key: 'rating', title: 'التقييم', render: (v, r) => v ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconStar size={14} color="#fbbf24" />{v} <span style={{ color: C.muted, fontSize: 11 }}>({Number(r.reviews).toLocaleString('en')})</span></span> : '—' },
    { key: 'status', title: 'الحالة', render: (v, r) => edit
      ? <select value={v} onChange={e => setStatus(r, e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12, color: STATUS[v][1], borderColor: STATUS[v][1] + '66' }}>
          {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      : <span style={{ color: STATUS[v][1] }}>{STATUS[v][0]}</span> },
    { key: '_id', title: '', render: (_, r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {r.url && <Btn size="sm" variant="ghost" title="فتح صفحة المصدر" onClick={() => open(r.url)}><IconExternalLink size={15} /></Btn>}
        <Btn size="sm" variant="ghost" title="بحث عن المنتج في أمازون مصر" onClick={() => open(amzSearch(r.name))}><IconSearch size={15} /></Btn>
        {edit && <Btn size="sm" variant="ghost" title="تعديل" onClick={() => setForm({ ...EMPTY, ...r, price: r.price || '', rating: r.rating || '', reviews: r.reviews || '' })}><IconPencil size={15} /></Btn>}
        {edit && <Btn size="sm" variant="ghost" title="حذف" onClick={() => del(r)}><IconTrash size={15} color="#f87171" /></Btn>}
      </div>) },
  ];

  return (
    <div>
      <PageHeader title="رصد السوق" icon="🔥" actions={edit && <Btn onClick={() => setForm({ ...EMPTY })}>+ إضافة منتج للمتابعة</Btn>} />

      {/* صفحات الترند المباشرة */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>صفحات الترند المباشرة</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>تفتح الصفحة الأصلية في تبويب جديد بترتيبها الحالي — تتحدث صفحات «الأكثر مبيعاً» على أمازون كل ساعة.</div>
        {LINKS.map(([group, links]) => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>{group}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {links.map(([l, u]) => (
                <button key={u} onClick={() => open(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--bg)', color: C.text, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {l}<IconExternalLink size={14} color={C.muted} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <input value={look} onChange={e => setLook(e.target.value)} onKeyDown={e => e.key === 'Enter' && look.trim() && open(amzSearch(look.trim()))}
            placeholder="ابحث عن منتج لمعرفة الأسعار والمنافسين…" style={{ ...inp, flex: 1, minWidth: 220 }} />
          <Btn variant="ghost" disabled={!look.trim()} onClick={() => open(amzSearch(look.trim()))}>🔍 في أمازون مصر</Btn>
          <Btn variant="ghost" disabled={!look.trim()} onClick={() => open(noonSearch(look.trim()))}>🔍 في نون</Btn>
        </div>
      </Card>

      {/* قائمة المتابعة */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {[['active', `المتابَعة (${(items || []).length - (counts.rejected || 0)})`], ...Object.entries(STATUS).map(([k, [l]]) => [k, `${l} (${counts[k] || 0})`]), ['all', `الكل (${(items || []).length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: `1px solid ${filter === k ? C.accent : C.border}`, background: filter === k ? C.accent + '22' : 'transparent', color: filter === k ? 'var(--text)' : C.sub }}>{l}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث في القائمة…" style={{ ...inp, marginRight: 'auto', minWidth: 200, padding: '6px 12px' }} />
      </div>
      <Card style={{ padding: 0 }}>
        {items === null ? <div style={{ padding: 24, textAlign: 'center', color: C.muted }}>جارٍ التحميل…</div>
          : shown.length ? <Table columns={cols} data={shown} maxHeight="calc(100vh - 220px)" />
          : <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>لا توجد منتجات هنا — أضف منتجاً تراه رائجاً من زر «إضافة منتج للمتابعة»</div>}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'تعديل منتج' : 'إضافة منتج للمتابعة'} width={560}>
        {form && (() => {
          const f = (k, label, props = {}) => (
            <label style={{ display: 'block', ...(props.full ? { gridColumn: '1 / -1' } : {}) }}>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>{label}</div>
              <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} {...props} full={undefined} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
            </label>);
          return (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {f('name', 'اسم المنتج *', { full: true, autoFocus: true })}
              {f('category', 'الفئة')}
              {f('source', 'المصدر')}
              {f('price', 'السعر (ج.م)', { type: 'number' })}
              {f('rank', 'الترتيب (مثال: #3 أدوات المطبخ)')}
              {f('rating', 'التقييم (من 5)', { type: 'number', step: '0.1' })}
              {f('reviews', 'عدد التقييمات', { type: 'number' })}
              {f('url', 'رابط المنتج أو الصفحة', { full: true, dir: 'ltr', placeholder: 'https://www.amazon.eg/…' })}
              {f('note', 'ملاحظات (المورد، السعر المتوقع…)', { full: true })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 16 }}>
              <Btn onClick={save}>💾 حفظ</Btn>
              <Btn variant="ghost" onClick={() => setForm(null)}>إلغاء</Btn>
            </div>
          </>);
        })()}
      </Modal>
    </div>
  );
}
