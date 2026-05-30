import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { C_THEME as C } from './UI';

const NAV = [
  { path: '/',           icon: '📊', label: 'لوحة التحكم',   perm: null },
  { path: '/products',   icon: '📦', label: 'المنتجات',       perm: 'products:read' },
  { path: '/categories', icon: '🏷️', label: 'الفئات',         perm: 'categories' },
  { path: '/suppliers',  icon: '🏭', label: 'الموردون',       perm: 'suppliers:read' },
  { path: '/customers',  icon: '👥', label: 'العملاء',        perm: 'customers' },
  { path: '/purchases',  icon: '🛒', label: 'فواتير الشراء',  perm: 'purchases:read' },
  { path: '/sales',      icon: '💳', label: 'فواتير البيع',   perm: 'sales:read' },
  { path: '/expenses',   icon: '💸', label: 'المصروفات',      perm: 'expenses:read' },
  { path: '/stock',      icon: '📋', label: 'حركة المخزون',   perm: null },
  { path: '/reports',    icon: '📈', label: 'التقارير',       perm: null },
  { path: '/users',      icon: '👤', label: 'المستخدمون',    perm: 'all' },
];

const ROLE_COLORS = { superadmin: '#f59e0b', admin: '#6366f1', accountant: '#10b981', inventory: '#3b82f6', sales: '#ec4899', viewer: '#64748b' };
const ROLE_LABELS = { superadmin: 'مدير النظام', admin: 'مدير', accountant: 'محاسب', inventory: 'مخزون', sales: 'مبيعات', viewer: 'مشاهد' };

export default function Layout({ children }) {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const roleColor = ROLE_COLORS[user?.role] || '#64748b';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {/* Sidebar */}
      <div style={{ width: collapsed ? 64 : 220, background: '#0d1826', borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', transition: 'width .25s', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🛍️</div>
          {!collapsed && <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', lineHeight: 1.2 }}>Amazon ERP</div>
            <div style={{ fontSize: 10, color: C.muted }}>نظام الإدارة</div>
          </div>}
          <button onClick={() => setCollapsed(!collapsed)} style={{ marginRight: 'auto', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 2, flexShrink: 0 }}>{collapsed ? '‹' : '›'}</button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {NAV.filter(n => !n.perm || can(n.perm) || user?.role === 'superadmin').map(n => {
            const active = loc.pathname === n.path;
            return (
              <div key={n.path} onClick={() => nav(n.path)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2, background: active ? '#6366f122' : 'transparent', color: active ? '#818cf8' : C.sub, transition: 'all .15s', fontWeight: active ? 700 : 400 }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#ffffff08'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>
                {!collapsed && <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{n.label}</span>}
                {!collapsed && active && <div style={{ marginRight: 'auto', width: 4, height: 4, borderRadius: '50%', background: '#818cf8' }} />}
              </div>
            );
          })}
        </nav>

        {/* User info */}
        <div style={{ padding: '12px 12px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: roleColor + '33', border: `2px solid ${roleColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
              {user?.name?.[0]}
            </div>
            {!collapsed && <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ fontSize: 10, color: roleColor }}>{ROLE_LABELS[user?.role]}</div>
            </div>}
          </div>
          <button onClick={logout} style={{ width: '100%', background: '#ef444422', border: '1px solid #ef444433', borderRadius: 6, padding: '6px', color: '#f87171', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>🚪</span>{!collapsed && 'تسجيل الخروج'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
