import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CameraScanner from '../components/CameraScanner';
import toast from 'react-hot-toast';

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
  const { login, loginCard } = useAuth();
  const nav = useNavigate();
  const cardRef = useRef();

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

  const tab = (k, label) => (
    <button type="button" onClick={() => setMode(k)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: mode === k ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'transparent', color: mode === k ? '#fff' : 'var(--sub)' }}>{label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 12 }}>📈</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--text)' }}>SMART FOR TRADING</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg)', padding: 4, borderRadius: 10, marginBottom: 22 }}>
            {tab('card', '🪪 كارت الموظف')}
            {tab('email', '✉️ البريد وكلمة المرور')}
          </div>

          {mode === 'card' ? (
            <div>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--sub)', marginBottom: 14 }}>امسح كارت الموظف بالاسكانر أو بكاميرا الموبايل</div>
              <input ref={cardRef} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitCard()} autoComplete="off"
                placeholder="EMP0001" disabled={loading}
                style={{ ...inp, fontSize: 22, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 2, direction: 'ltr', border: '2px solid #6366f1', padding: '14px' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setCam(true)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, padding: 12, color: 'var(--text)', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>📷 الكاميرا</button>
                <button type="button" onClick={() => submitCard()} disabled={loading || !code.trim()} style={{ flex: 2, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: loading || !code.trim() ? 0.6 : 1 }}>
                  {loading ? '⏳ جاري الدخول...' : '🔑 دخول'}
                </button>
              </div>
              <CameraScanner open={cam} onClose={() => setCam(false)} onScan={(v) => { setCode(v); submitCard(v); }} title="امسح كارت الموظف" />
            </div>
          ) : (
            <form onSubmit={submit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 }}>البريد الإلكتروني</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" style={inp} />
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 }}>كلمة المرور</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" style={inp} />
              </div>
              <button type="submit" disabled={loading}
                style={{ width: '100%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '13px', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? '⏳ جاري الدخول...' : '🔑 تسجيل الدخول'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
