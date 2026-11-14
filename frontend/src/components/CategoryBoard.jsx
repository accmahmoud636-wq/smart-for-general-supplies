import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { fmt, THEME, C_THEME as C } from './UI';

const CUR = THEME.currency || 'ج.م';
// أيقونة القسم من اسمه
const ICONS = [[/مطبخ|طبخ|اواني|أواني/, '🍳'], [/سيار|عربي/, '🚗'], [/تجميل|عناي|شعر|اظافر|أظافر/, '💄'], [/اطفال|أطفال|العاب|ألعاب|بيبي/, '🧸'], [/الكترون|إلكترون|كهرب|موبايل/, '🔌'],
  [/منزل|بيت|تنظيف|تنظيم/, '🏠'], [/مكتب|مدرس|ادوات مكتبية/, '✏️'], [/رياض|لياق/, '🏋️'], [/صح|طبي/, '🩺'], [/حديق|زراع/, '🌱'], [/حيوان/, '🐾'], [/هدايا|زينة|ديكور/, '🎁'], [/متنوع|اخرى|أخرى|بدون/, '📦']];
const iconOf = (n) => (ICONS.find(([re]) => re.test(n)) || [, '🏷️'])[1];
const STATUS = {
  engine:   { label: '⚡ محرّك نمو',      color: '#10b981' },
  heavy:    { label: '🏋️ رأس مال مرتفع',   color: '#f59e0b' },
  frozen:   { label: '🧊 متجمد',          color: '#64748b' },
  balanced: { label: '⚖️ متوازن',         color: '#3b82f6' },
  nodata:   { label: '○ بدون نشاط',       color: '#64748b' },
};

function Bar({ label, pct, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginTop: 5 }}>
      <span style={{ width: 70, color: C.muted, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4, minWidth: pct > 0 ? 3 : 0 }} />
      </div>
      <b style={{ width: 38, textAlign: 'left', color }}>{pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%</b>
    </div>
  );
}

export default function CategoryBoard() {
  const nav = useNavigate();
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [sort, setSort] = useState('products');
  useEffect(() => { api.get('/home/categories', { params: { days } }).then(r => setD(r.data)).catch(() => setD(false)); }, [days]);
  if (d === false) return null;

  const rows = d ? [...d.rows].sort((a, b) => b[sort] - a[sort]) : [];
  const chip = (on) => ({ padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: on ? '#6366f133' : 'transparent', border: `1px solid ${on ? '#6366f1' : C.border}`, color: on ? '#a5b4fc' : C.sub });

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>تصنيف المخزون</div>
          {d && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{d.totals.categories} قسم · {d.totals.products.toLocaleString('en')} صنف · رأس مال {fmt(d.totals.value)} {CUR}</div>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[['products', 'الأصناف'], ['value', 'رأس المال'], ['revenue', 'المبيعات'], ['deadValue', 'الراكد']].map(([k, l]) => <button key={k} onClick={() => setSort(k)} style={chip(sort === k)}>{l}</button>)}
          <span style={{ width: 8 }} />
          {[30, 90].map(n => <button key={n} onClick={() => setDays(n)} style={chip(days === n)}>{n} يوم</button>)}
        </div>
      </div>

      {!d ? <div style={{ color: C.muted, padding: 20 }}>⏳</div> : <>
        {d.headlines.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8, marginBottom: 12 }}>
            {d.headlines.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--card)', border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ fontSize: 20 }}>{h.icon}</span><span>{h.text}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
          {rows.map(r => {
            const S = STATUS[r.status];
            return (
              <div key={r._id} onClick={() => nav(`/products?category=${r._id}`)} title="عرض أصناف القسم" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, cursor: 'pointer', borderTop: `3px solid ${S.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 26 }}>{iconOf(r.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: S.color, fontWeight: 700 }}>{S.label}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{r.products}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>صنف</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.sub, margin: '10px 0 4px', flexWrap: 'wrap' }}>
                  <span>✅ متاح {r.inStock}</span><span style={{ color: r.out ? '#f87171' : C.sub }}>⛔ نفد {r.out}</span><span>📦 {r.units.toLocaleString('en')} وحدة</span>
                  {r.cover !== null && <span style={{ color: r.cover <= 14 ? '#f87171' : C.sub }}>⏳ يكفي {r.cover} يوم</span>}
                </div>

                <Bar label="من الأصناف" pct={r.productShare} color="#6366f1" />
                <Bar label="من رأس المال" pct={r.valueShare} color="#f59e0b" />
                <Bar label="من المبيعات" pct={r.salesShare} color="#10b981" />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, fontSize: 12 }}>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '7px 9px' }}>
                    <div style={{ color: C.muted, fontSize: 10 }}>قيمة المخزون</div><b>{fmt(r.value)}</b>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '7px 9px' }}>
                    <div style={{ color: C.muted, fontSize: 10 }}>مبيعات {d.days} يوم</div><b>{fmt(r.revenue)}</b> <span style={{ color: C.muted, fontSize: 10 }}>({r.soldUnits} وحدة · {r.sellThrough}% من الأصناف حققت مبيعات)</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: C.sub, marginTop: 10, lineHeight: 1.7 }}>💡 {r.insight}</div>
                {r.alerts.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                    {r.alerts.map(a => <span key={a} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: '#ef444418', border: '1px solid #ef444444', color: '#f87171' }}>{a}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>}
    </div>
  );
}
