import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CameraScanner from '../components/CameraScanner';
import toast from 'react-hot-toast';
import { IconBuildingWarehouse, IconId, IconMail, IconLock, IconScan, IconCamera, IconLogin2, IconEye, IconEyeOff } from '@tabler/icons-react';
import { Tile } from '../components/Icon';

const MODE_KEY = 'erp_login_mode';
const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' };

// الدخول: مسح كارت الموظف أو البريد وكلمة المرور
export default function Login() {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(MODE_KEY) || 'card'; } catch { return 'card'; } });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [cam, setCam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 900); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const { login, loginCard } = useAuth();
  const nav = useNavigate();
  const cardRef = useRef();
  const timer = useRef();
  // لو الاسكانر مابيبعتش Enter: أول ما يتكتب كود كارت كامل (EMP + أرقام) ندخل لوحدنا
  const AR = { 'ث': 'E', 'ة': 'M', 'ح': 'P', 'ُ': 'E', '’': 'M', '؛': 'P' };
  const looksLikeCard = (v) => /^EMP\d{4,}$/i.test([...String(v).trim()].map(c => AR[c] || c).join('').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const onCardChange = (v) => {
    setCode(v);
    clearTimeout(timer.current);
    if (looksLikeCard(v)) timer.current = setTimeout(() => submitCard(v), 250);
  };

  useEffect(() => { try { localStorage.setItem(MODE_KEY, mode); } catch { /* */ } if (mode === 'card') setTimeout(() => cardRef.current?.focus(), 50); }, [mode]);

  const done = (u) => { toast.success(`مرحباً ${u.name}`); nav('/'); };
  const fail = (err) => toast.error(err.response?.data?.message || 'خطأ في تسجيل الدخول');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try { done(await login(email, password)); } catch (err) { fail(err); } finally { setLoading(false); }
  };
  const submitCard = async (c = code) => {
    const v = String(c).trim();
    if (!v || loading) return;
    setLoading(true); setCam(false);
    try { done(await loginCard(v)); } catch (err) { fail(err); setCode(''); cardRef.current?.focus(); } finally { setLoading(false); }
  };

  const tab = (k, label, Ico) => (
    <button type="button" onClick={() => setMode(k)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: mode === k ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent', color: mode === k ? '#fff' : 'var(--sub)' }}><Ico size={18} stroke={1.8} />{label}</button>
  );
  const primaryBtn = { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: 13, color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };
  const FEATURES = [['📦', 'المخزون والجرد', 'أرصدة لحظية وتنبيهات النواقص'], ['📣', 'أمازون والإعلانات', 'الأرباح والرسوم وأداء كل إعلان'], ['🚚', 'الشحنات والتسليم', 'تجهيز ومطابقة مع تقارير أمازون'], ['📈', 'التقارير المالية', 'المبيعات والمصروفات وصافي الربح']];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex' }}>
      {/* لوحة البراند — تختفي على الموبايل */}
      {wide && (
        <div style={{ flex: '0 0 46%', position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '44px 48px', color: '#e0e7ff' }}>
          <div style={{ position: 'absolute', top: -120, left: -120, width: 360, height: 360, borderRadius: '50%', background: '#818cf81f' }} />
          <div style={{ position: 'absolute', bottom: -140, right: -80, width: 420, height: 420, borderRadius: '50%', background: '#a78bfa14' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: '#ffffff1a', border: '1px solid #ffffff26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconBuildingWarehouse size={26} stroke={1.7} /></div>
            <div><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: .5 }}>SMART FOR TRADING</div><div style={{ fontSize: 12, color: '#a5b4fc' }}>نظام الإدارة</div></div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.4, marginBottom: 10, color: '#fff' }}>كل شغلك في مكان واحد</div>
            <div style={{ fontSize: 14, color: '#c7d2fe', marginBottom: 30, lineHeight: 1.8 }}>المخزون والمبيعات وأمازون والشحنات — بأرقام لحظية</div>
            <div style={{ display: 'grid', gap: 16 }}>
              {FEATURES.map(([ic, t, d]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Tile icon={ic} size={42} />
                  <div><div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{t}</div><div style={{ fontSize: 12, color: '#a5b4fc' }}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#818cf8', position: 'relative' }}>© {new Date().getFullYear()} SMART FOR TRADING</div>
        </div>
      )}

      {/* الدخول */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {!wide && (
            <div style={{ textAlign: 'center', marginBottom: 26 }}>
              <div style={{ width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', marginBottom: 10 }}><IconBuildingWarehouse size={32} stroke={1.7} /></div>
              <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)' }}>SMART FOR TRADING</div>
            </div>
          )}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--text)' }}>تسجيل الدخول</div>
            <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 4 }}>أهلاً بيك — اختار طريقة الدخول</div>
          </div>
          <div style={{ display: 'flex', gap: 6, background: 'var(--card)', border: '1px solid var(--border)', padding: 4, borderRadius: 10, marginBottom: 24 }}>
            {tab('card', 'كارت الموظف', IconId)}
            {tab('email', 'البريد وكلمة المرور', IconMail)}
          </div>

          {mode === 'card' ? (
            <div>
              <div style={{ border: '2px dashed #6366f166', borderRadius: 14, padding: '20px 16px 16px', textAlign: 'center', marginBottom: 14, background: '#6366f10a' }}>
                <div style={{ color: '#818cf8', marginBottom: 8 }}><IconScan size={40} stroke={1.5} /></div>
                <div style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 12 }}>امسح كارت الموظف بالاسكانر أو كاميرا الموبايل</div>
                <input ref={cardRef} value={code} onChange={e => onCardChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); clearTimeout(timer.current); submitCard(); } }} autoComplete="off"
                  placeholder="EMP0001" disabled={loading}
                  style={{ ...inp, fontSize: 22, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 2, direction: 'ltr', border: '2px solid #6366f1', padding: '12px' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setCam(true)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><IconCamera size={18} stroke={1.8} />الكاميرا</button>
                <button type="button" onClick={() => submitCard()} disabled={loading || !code.trim()} style={{ ...primaryBtn, flex: 2, cursor: 'pointer', opacity: loading || !code.trim() ? 0.6 : 1 }}>
                  {loading ? 'جاري الدخول...' : <><IconLogin2 size={18} stroke={1.9} />دخول</>}
                </button>
              </div>
              <CameraScanner open={cam} onClose={() => setCam(false)} onScan={(v) => { setCode(v); submitCard(v); }} title="امسح كارت الموظف" />
            </div>
          ) : (
            <form onSubmit={submit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 }}>البريد الإلكتروني</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex' }}><IconMail size={18} stroke={1.7} /></span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" placeholder="name@company.com" style={{ ...inp, paddingRight: 40 }} />
                </div>
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 }}>كلمة المرور</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex' }}><IconLock size={18} stroke={1.7} /></span>
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" style={{ ...inp, paddingRight: 40, paddingLeft: 40 }} />
                  <button type="button" onClick={() => setShowPw(v => !v)} title={showPw ? 'إخفاء' : 'إظهار'} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>{showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}</button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={{ ...primaryBtn, width: '100%', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'جاري الدخول...' : <><IconLogin2 size={18} stroke={1.9} />تسجيل الدخول</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
