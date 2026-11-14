import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Card, Btn, fmtDate, C_THEME as C } from './UI';
import { useAuth } from '../context/AuthContext';

// تنبيه «اقفل الإعلان»: الإعلانات اللي رصيدها خلص أو قرّب يخلص — وإعلانات رجع لها رصيد تتفتح تاني
export default function ListingAlerts({ innerRef }) {
  const { can } = useAuth();
  const [d, setD] = useState(null);
  const [sel, setSel] = useState([]);
  const [tab, setTab] = useState('close');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/amazon/listing-alerts').then(r => setD(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d || (!d.toClose.length && !d.toOpen.length && tab === 'close' && !d.closedCount)) return null;

  const list = tab === 'close' ? d.toClose : d.toOpen;
  const act = async (action, skus, extra = {}) => {
    setBusy(true);
    try { const { data } = await api.post('/amazon/listing-alerts', { action, skus, ...extra }); setD(data); setSel([]); toast.success(data.message); }
    catch (e) { toast.error(e.response?.data?.message || 'خطأ'); }
    setBusy(false);
  };
  const copy = (skus) => { navigator.clipboard?.writeText(skus.join('\n')); toast.success(`تم نسخ ${skus.length} SKU`); };
  const allSel = list.length && sel.length === list.length;
  const color = tab === 'close' ? '#ef4444' : '#10b981';

  return (
    <Card style={{ marginBottom: 16, borderColor: color + '66' }}>
      <div ref={innerRef} style={{ scrollMarginTop: 70 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {[['close', `🛑 اقفل الإعلانات دي (${d.toClose.length})`, '#ef4444'], ['open', `✅ رجع لها رصيد — افتحها (${d.toOpen.length})`, '#10b981']].map(([k, l, c]) => (
          <button key={k} onClick={() => { setTab(k); setSel([]); }} style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, fontSize: 13, background: tab === k ? c + '22' : 'transparent', border: `1px solid ${tab === k ? c : C.border}`, color: tab === k ? c : C.sub }}>{l}</button>
        ))}
        <span style={{ marginRight: 'auto', fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
          نبّهني لما المتاح يبقى
          <select value={d.min} disabled={!can('amazon') || busy} onChange={e => act('min', [], { min: e.target.value })} style={{ background: 'var(--bg)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 6px' }}>
            {[0, 1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n === 0 ? 'صفر' : `${n} أو أقل`}</option>)}
          </select>
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.8 }}>
        {tab === 'close'
          ? <>إعلانات اتطلبت في آخر {d.activeDays} يوم ورصيدها خلص أو قرّب يخلص. صفّر كميتها في Seller Flex عشان محدش يطلبها، وبعدين دوس «قفلته».{d.quiet > 0 && <span> ({d.quiet} إعلان تاني رصيده خلص بس مااتطلبش من {d.activeDays} يوم — غالباً مقفول أصلاً.)</span>}</>
          : 'الإعلانات دي اتقفلت قبل كده ودلوقتي رجع لها رصيد. رجّع كميتها على أمازون، وبعدين دوس «فتحته».'}
      </div>
      {!list.length ? <div style={{ padding: 14, textAlign: 'center', color: '#10b981', fontSize: 13 }}>✓ لا توجد إعلانات هنا</div> : <>
        {can('amazon') && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: C.sub, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!allSel} onChange={e => setSel(e.target.checked ? list.map(r => r.sku) : [])} /> تحديد الكل</label>
            <Btn size="sm" variant="ghost" onClick={() => copy(sel.length ? sel : list.map(r => r.sku))}>📋 نسخ {sel.length ? `${sel.length} ` : 'كل '}SKU</Btn>
            {sel.length > 0 && <Btn size="sm" variant={tab === 'close' ? 'danger' : 'success'} disabled={busy} onClick={() => act(tab, sel)}>{tab === 'close' ? `قفلتهم (${sel.length})` : `فتحتهم (${sel.length})`}</Btn>}
          </div>
        )}
        <div style={{ maxHeight: 360, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
          {list.map(r => (
            <div key={r.sku} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.border}33` }}>
              {can('amazon') && <input type="checkbox" checked={sel.includes(r.sku)} onChange={e => setSel(s => e.target.checked ? [...s, r.sku] : s.filter(x => x !== r.sku))} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  <span onClick={() => copy([r.sku])} title="نسخ" style={{ fontFamily: 'monospace', cursor: 'pointer', color: '#a5b4fc' }}>{r.sku} 📋</span>
                  {r.neck && <span> · الناقص: {r.neck}</span>}
                  {r.closedAt && <span> · اتقفل {fmtDate(r.closedAt)}{r.closedBy ? ` — ${r.closedBy}` : ''}</span>}
                </div>
              </div>
              {r.sold30 > 0 ? <span title="مبيعات آخر 30 يوم" style={{ fontSize: 11, color: '#f59e0b', whiteSpace: 'nowrap' }}>🔥 باع {r.sold30} في 30 يوم</span>
                : r.lastSale && <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>آخر طلب {fmtDate(r.lastSale)}</span>}
              <span style={{ width: 70, textAlign: 'center', fontWeight: 800, color: r.available <= 0 ? '#ef4444' : r.available <= d.min ? '#f59e0b' : '#10b981' }}>{r.available <= 0 ? 'خلص' : `متاح ${r.available}`}</span>
              {can('amazon') && <Btn size="sm" variant="ghost" disabled={busy} onClick={() => act(tab, [r.sku])}>{tab === 'close' ? 'قفلته ✓' : 'فتحته ✓'}</Btn>}
            </div>
          ))}
        </div>
      </>}
    </Card>
  );
}
