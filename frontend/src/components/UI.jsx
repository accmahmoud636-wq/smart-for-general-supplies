// ─── Shared UI Components ────────────────────────────────────────────────────
const C = { bg: '#0f172a', card: '#1e293b', border: '#334155', muted: '#64748b', text: '#e2e8f0', sub: '#94a3b8', accent: '#6366f1' };

export function Card({ children, style = {} }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>;
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, style = {} }) {
  const variants = {
    primary: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: C.sub, border: `1px solid ${C.border}` },
    warning: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none' },
  };
  const sizes = { sm: { padding: '5px 12px', fontSize: 12 }, md: { padding: '8px 16px', fontSize: 14 }, lg: { padding: '11px 22px', fontSize: 15 } };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...variants[variant], ...sizes[size], borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: disabled ? 0.6 : 1, transition: 'opacity .2s', ...style }}>
      {children}
    </button>
  );
}

export function Badge({ children, color = '#6366f1' }) {
  return <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</span>;
}

export function Input({ label, value, onChange, type = 'text', placeholder = '', required = false, style = {} }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>{label}{required && ' *'}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
        style={{ width: '100%', background: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, outline: 'none', ...style }}
        onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
    </div>
  );
}

export function Select({ label, value, onChange, options = [], required = false }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>{label}{required && ' *'}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} required={required}
        style={{ width: '100%', background: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, outline: 'none', cursor: 'pointer' }}>
        <option value="">-- اختر --</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

export function Table({ columns, data, onRow }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#0f172a' }}>
            {columns.map(col => (
              <th key={col.key} style={{ padding: '10px 14px', textAlign: 'right', color: C.sub, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: C.muted }}>لا توجد بيانات</td></tr>
          ) : data.map((row, i) => (
            <tr key={row._id || i} onClick={() => onRow?.(row)} style={{ borderBottom: `1px solid ${C.border}22`, cursor: onRow ? 'pointer' : 'default', transition: 'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {columns.map(col => (
                <td key={col.key} style={{ padding: '11px 14px', color: C.text, whiteSpace: 'nowrap' }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatCard({ label, value, icon, color = '#6366f1', sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{icon}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, icon, actions }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 20 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
    </div>
  );
}

export const fmt = (n) => new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-SA') : '—';
export const C_THEME = C;
