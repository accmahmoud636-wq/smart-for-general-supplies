import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

// الجلسة بتتحفظ في sessionStorage: بتفضل مع تحديث الصفحة، وبتنتهي لما التاب أو المتصفح يتقفل
// (نشيل أي جلسة قديمة كانت محفوظة دائماً في localStorage)
try { localStorage.removeItem('erp_token'); localStorage.removeItem('erp_user'); } catch { /* */ }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('erp_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('erp_token');
    if (token) {
      api.get('/auth/me').then(r => { setUser(r.data); sessionStorage.setItem('erp_user', JSON.stringify(r.data)); })
        .catch(() => { sessionStorage.removeItem('erp_token'); sessionStorage.removeItem('erp_user'); setUser(null); })
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    sessionStorage.setItem('erp_token', data.token);
    sessionStorage.setItem('erp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const loginCard = async (code) => {
    const { data } = await api.post('/auth/login-card', { code });
    sessionStorage.setItem('erp_token', data.token);
    sessionStorage.setItem('erp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    sessionStorage.removeItem('erp_token');
    sessionStorage.removeItem('erp_user');
    setUser(null);
  };

  // الصلاحيات الفعلية جاية من السيرفر (الدور أو الصلاحيات المخصصة للمستخدم)
  const can = (perm) => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    const perms = user.permissions || [];
    if (perms.includes('all') || perms.includes(perm)) return true;
    return perms.includes(perm.split(':')[0]);
  };

  return <AuthContext.Provider value={{ user, login, loginCard, logout, loading, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
