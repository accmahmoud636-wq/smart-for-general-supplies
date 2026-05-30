import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('erp_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('erp_token');
    if (token) {
      api.get('/auth/me').then(r => { setUser(r.data); localStorage.setItem('erp_user', JSON.stringify(r.data)); })
        .catch(() => { localStorage.removeItem('erp_token'); localStorage.removeItem('erp_user'); setUser(null); })
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('erp_token', data.token);
    localStorage.setItem('erp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    setUser(null);
  };

  const can = (perm) => {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    const rolePerms = { admin: ['products','categories','suppliers','customers','purchases','sales','expenses','stock','reports'], accountant: ['purchases','sales','expenses','reports','products:read','suppliers:read','customers:read'], inventory: ['products','categories','suppliers','stock','purchases'], sales: ['sales','customers'], viewer: [] };
    const perms = rolePerms[user.role] || [];
    if (perms.includes(perm)) return true;
    const base = perm.split(':')[0];
    return perms.includes(base);
  };

  return <AuthContext.Provider value={{ user, login, logout, loading, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
