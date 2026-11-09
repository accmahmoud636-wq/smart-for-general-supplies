import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { C_THEME as C, THEME, THEME_KEY } from './UI';

// الشريط الجانبي: أقسام بالترتيب اللي بيتشغّل بيه الشغل كل يوم
const SECTIONS = [
  { title: null, items: [
    { path: '/',            icon: '📊', label: 'لوحة التحكم',        perm: null },
  ] },
  { title: 'الشحنات والتسليم', items: [
    { path: '/shipments',   icon: '📦', label: 'الشحنات والتسليم',   perm: 'shipments:read' },
  ] },
  { title: 'مركز أمازون', items: [
    { path: '/amazon?tab=overview', icon: '🛒', label: 'نظرة عامة',       perm: 'amazon:read' },
    { path: '/amazon?tab=orders',   icon: '🧾', label: 'طلبات أمازون',     perm: 'amazon:read' },
    { path: '/amazon?tab=profit',   icon: '💰', label: 'ربحية المنتجات',   perm: 'amazon:read' },
    { path: '/amazon?tab=recon',    icon: '🏦', label: 'التسويات والدفعات', perm: 'amazon:read' },
  ] },
  { title: 'المخزون', items: [
    { path: '/products',    icon: '🏷️', label: 'المنتجات',           perm: 'products:read' },
    { path: '/categories',  icon: '🗂️', label: 'الفئات',             perm: 'categories:read' },
    { path: '/amazon?tab=skus',    icon: '🔗', label: 'ربط SKU أمازون',  perm: 'products' },
    { path: '/stock',       icon: '📋', label: 'حركة المخزون',       perm: 'stock:read' },
    { path: '/amazon?tab=reorder', icon: '🔄', label: 'إعادة الطلب',     perm: 'amazon:read' },
    { path: '/purchases',   icon: '📥', label: 'فواتير الشراء',      perm: 'purchases:read' },
    { path: '/suppliers',   icon: '🏭', label: 'الموردين',           perm: 'suppliers:read' },
    { path: '/reports/inventory', icon: '📦', label: 'تقارير المخزون', perm: 'reports:read' },
  ] },
  { title: 'الحسابات', items: [
    { path: '/sales',       icon: '💳', label: 'فواتير البيع',       perm: 'sales:read' },
    { path: '/expenses',    icon: '💸', label: 'المصروفات',          perm: 'expenses:read' },
    { path: '/customers',   icon: '👥', label: 'العملاء',            perm: 'customers:read' },
    { path: '/reports',     icon: '📈', label: 'التقارير المالية',    perm: 'reports:read' },
  ] },
  { title: 'الإعدادات', items: [
    { path: '/settings?tab=employees', icon: '👤', label: 'الموظفين',          perm: 'settings:read' },
    { path: '/settings?tab=users',     icon: '🔐', label: 'المستخدمين والصلاحيات', perm: 'all' },
    { path: '/settings?tab=theme',     icon: '🎨', label: 'المظهر والألوان',    perm: 'settings:read' },
  ] },
];

const ROLE_COLORS = { superadmin: '#f59e0b', admin: '#6366f1', accountant: '#10b981', inventory: '#3b82f6', sales: '#ec4899', viewer: '#64748b' };
const ROLE_LABELS = { superadmin: 'مدير النظام', admin: 'مدير', accountant: 'محاسب', inventory: 'مخزون', sales: 'مبيعات', viewer: 'مشاهد' };
const COLLAPSE_KEY = 'erp_nav_closed';

export default function Layout({ children }) {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768); // مقفولة على الموبايل
  const [closed, setClosed] = useState(() => { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { return {}; } });
  const toggleSection = (t) => { const n = { ...closed, [t]: !closed[t] }; setClosed(n); try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(n)); } catch { /* */ } };

  // المظهر محفوظ على السيرفر — لو اتغير من جهاز تاني نحدّث الشاشة
  useEffect(() => {
    api.get('/settings/theme').then(({ data }) => {
      let local = null; try { local = localStorage.getItem(THEME_KEY); } catch { /* */ }
      const remote = JSON.stringify(data);
      if (local !== remote) { try { localStorage.setItem(THEME_KEY, remote); } catch { /* */ } if (local) window.location.reload(); }
    }).catch(() => {});
  }, []);

  const roleColor = ROLE_COLORS[user?.role] || '#64748b';
  const here = loc.pathname + loc.search;
  const isActive = (path) => {
    if (path.includes('?')) return here === path || (path.endsWith('tab=overview') && here === '/amazon') || (path.endsWith('tab=employees') && here === '/settings');
    return loc.pathname === path;
  };
  const allowed = (perm) => !perm || can(perm) || user?.role === 'superadmin';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {/* Sidebar */}
      <div style={{ width: collapsed ? 64 : 230, background: C.sidebar, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', transition: 'width .25s', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: `linear-gradient(135deg,${C.accent},${C.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🛍️</div>
          {!collapsed && <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{THEME.appName}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{THEME.appSub}</div>
          </div>}
          <button onClick={() => setCollapsed(!collapsed)} style={{ marginRight: 'auto', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 2, flexShrink: 0 }}>{collapsed ? '‹' : '›'}</button>
        </div>

        {/* الأقسام */}
        <nav style={{ flex: 1, padding: '8px 8px' }}>
          {SECTIONS.map((sec, si) => {
            const items = sec.items.filter(n => allowed(n.perm));
            if (!items.length) return null;
            const isClosed = sec.title && closed[sec.title] && !items.some(n => isActive(n.path));
            return (
              <div key={si} style={{ marginBottom: 6 }}>
                {sec.title && (collapsed
                  ? <div style={{ height: 1, background: C.border, margin: '8px 6px' }} />
                  : <div onClick={() => toggleSection(sec.title)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 10px 4px', fontSize: 11, fontWeight: 800, color: C.accentLight, letterSpacing: .3, cursor: 'pointer', userSelect: 'none' }}>
                      <span>{sec.title}</span><span style={{ color: C.muted, fontSize: 10 }}>{isClosed ? '◂' : '▾'}</span>
                    </div>)}
                {!isClosed && items.map(n => {
                  const active = isActive(n.path);
                  return (
                    <div key={n.path} onClick={() => nav(n.path)} title={collapsed ? n.label : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 1, background: active ? C.accent + '22' : 'transparent', color: active ? C.accentLight : C.sub, transition: 'all .15s', fontWeight: active ? 700 : 400 }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#ffffff08'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                      <span style={{ fontSize: 17, flexShrink: 0 }}>{n.icon}</span>
                      {!collapsed && <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{n.label}</span>}
                      {!collapsed && active && <div style={{ marginRight: 'auto', width: 4, height: 4, borderRadius: '50%', background: C.accentLight }} />}
                    </div>
                  );
                })}
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
              <div style={{ fontSize: 10, color: roleColor }}>{ROLE_LABELS[user?.role]}{user?.useCustom && ' · صلاحيات مخصصة'}</div>
            </div>}
          </div>
          <button onClick={logout} style={{ width: '100%', background: '#ef444422', border: '1px solid #ef444433', borderRadius: 6, padding: '6px', color: '#f87171', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span>🚪</span>{!collapsed && 'تسجيل الخروج'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: window.innerWidth < 768 ? '14px 10px' : '24px', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
