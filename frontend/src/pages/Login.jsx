import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('مرحباً بك!');
      nav('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطأ في تسجيل الدخول');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 12 }}>🛍️</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>Amazon ERP</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>نظام إدارة المخزون والحسابات</div>
        </div>

        {/* Card */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 32 }}>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@erp.com"
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>كلمة المرور</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none' }} />
            </div>
            <button type="submit" disabled={loading}
              style={{ width: '100%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none', borderRadius: 10, padding: '13px', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '⏳ جاري الدخول...' : '🔑 تسجيل الدخول'}
            </button>
          </form>
          <div style={{ marginTop: 20, padding: 12, background: '#0f172a', borderRadius: 8, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
            افتراضي: admin@erp.com / admin123
          </div>
        </div>
      </div>
    </div>
  );
}
