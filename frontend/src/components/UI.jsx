import { Tile } from './Icon';
import { IconDeviceFloppy, IconTrash, IconPencil, IconPlus, IconCamera, IconSearch, IconDownload, IconUpload, IconTag, IconVolume, IconX, IconCopy, IconPrinter, IconArrowRight, IconCheck, IconBarcode, IconHistory, IconSend, IconExternalLink, IconEraser } from '@tabler/icons-react';
// ─── Shared UI Components ────────────────────────────────────────────────────
// ─── المظهر ─────────────────────────────────────────────────────
export const ACCENTS = {
  violet: { label: 'بنفسجي',        accent: '#6366f1', accent2: '#8b5cf6', light: '#818cf8' },
  blue:   { label: 'أزرق',          accent: '#3b82f6', accent2: '#06b6d4', light: '#60a5fa' },
  green:  { label: 'أخضر',          accent: '#10b981', accent2: '#059669', light: '#34d399' },
  amazon: { label: 'برتقالي أمازون', accent: '#f59e0b', accent2: '#ea580c', light: '#fbbf24' },
  pink:   { label: 'وردي',          accent: '#ec4899', accent2: '#a855f7', light: '#f472b6' },
  red:    { label: 'أحمر',          accent: '#ef4444', accent2: '#b91c1c', light: '#f87171' },
};
export const BASES = {
  navy:  { label: 'كحلي',  bg: '#0f172a', card: '#1e293b', border: '#334155', sidebar: '#0d1826' },
  black: { label: 'أسود',  bg: '#0a0a0a', card: '#171717', border: '#2e2e2e', sidebar: '#050505' },
  gray:  { label: 'رمادي', bg: '#18181b', card: '#27272a', border: '#3f3f46', sidebar: '#111113' },
  green: { label: 'زيتي',  bg: '#0b1712', card: '#14261e', border: '#24443a', sidebar: '#07110d' },
};
// الوضع الفاتح — كل جهاز يختار فاتح أو غامق من زرار ☀️/🌙
const LIGHT = { bg: '#f4f6fa', card: '#ffffff', border: '#e2e8f0', sidebar: '#ffffff', text: '#0f172a', sub: '#475569', muted: '#94a3b8', hover: '#0f172a0a', light: true };
const DARK_TEXT = { text: '#e2e8f0', sub: '#94a3b8', muted: '#64748b', hover: '#ffffff0d', light: false };
export const MODE_KEY = 'erp_mode';
export function getMode() { try { return localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } }
export function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch { /* */ } window.location.reload(); }
export const THEME_KEY = 'erp_theme';
export function themeColors(t = {}, mode = 'dark') {
  const a = ACCENTS[t.accent] || ACCENTS.violet;
  const b = mode === 'light' ? LIGHT : { ...(BASES[t.base] || BASES.navy), ...DARK_TEXT };
  // في الفاتح: لون النص المختار يبقى الغامق عشان يتقري
  return { bg: b.bg, card: b.card, border: b.border, sidebar: b.sidebar, text: b.text, sub: b.sub, muted: b.muted, hover: b.hover, isLight: b.light,
    accent: a.accent, accent2: a.accent2, accentLight: mode === 'light' ? a.accent : a.light };
}
let savedTheme = {};
try { savedTheme = JSON.parse(localStorage.getItem(THEME_KEY)) || {}; } catch { /* */ }
export const THEME = { appName: 'SMART FOR TRADING', appSub: 'نظام الإدارة', currency: 'ج.م', ...savedTheme };
const C = { ...themeColors(savedTheme, getMode()) };
try {   // نفس الألوان كمتغيرات CSS عشان كل الصفحات تتلون
  const r = document.documentElement.style;
  r.setProperty('--bg', C.bg); r.setProperty('--card', C.card); r.setProperty('--border', C.border);
  r.setProperty('--text', C.text); r.setProperty('--sub', C.sub); r.setProperty('--muted', C.muted); r.setProperty('--hover', C.hover); r.setProperty('--sidebar', C.sidebar);
  r.setProperty('color-scheme', C.isLight ? 'light' : 'dark');
  r.setProperty('--accent', C.accent); r.setProperty('--accent2', C.accent2); r.setProperty('--accent-light', C.accentLight);
  document.body.style.background = C.bg;
} catch { /* */ }

export function Card({ children, style = {} }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>;
}

// أيقونة الزرار: من الرمز في أوله أو من أول كلمة — كل الأزرار بنفس نمط الأيقونات
const BTN_EMOJI = { '💾': IconDeviceFloppy, '🗑️': IconTrash, '🗑': IconTrash, '✏️': IconPencil, '+': IconPlus, '➕': IconPlus, '📷': IconCamera, '🔍': IconSearch,
  '⬇': IconDownload, '📤': IconUpload, '⬆': IconUpload, '🏷️': IconTag, '🔊': IconVolume, '✖': IconX, '✕': IconX, '📋': IconCopy, '🖨️': IconPrinter, '→': IconArrowRight, '📥': IconDownload, '✓': IconCheck };
const BTN_WORD = [[/^حفظ/, IconDeviceFloppy], [/^حذف/, IconTrash], [/^تعديل/, IconPencil], [/^طباعة/, IconPrinter], [/^رجوع/, IconArrowRight], [/^توليد/, IconBarcode],
  [/^تنزيل/, IconDownload], [/^رفع/, IconUpload], [/^سجل/, IconHistory], [/^ترحيل/, IconSend], [/^تأكيد/, IconCheck], [/^فتح/, IconExternalLink], [/^مسح/, IconEraser]];
function withIcon(children, size) {
  const arr = Array.isArray(children) ? [...children] : [children];
  const first = arr[0];
  if (typeof first !== 'string') return children;
  const t = first.trimStart();
  let Ico = null, rest = t;
  for (const [k, I] of Object.entries(BTN_EMOJI)) if (t.startsWith(k)) { Ico = I; rest = t.slice(k.length).replace(/^\uFE0F/, '').trimStart(); break; }
  if (!Ico) { const w = BTN_WORD.find(([re]) => re.test(t)); if (w) Ico = w[1]; }
  if (!Ico) return children;
  arr[0] = rest;
  return <><Ico size={size} stroke={1.9} style={{ flexShrink: 0 }} />{arr}</>;
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, style = {}, title }) {
  const variants = {
    primary: { background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: '#fff', border: '1px solid transparent' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: '1px solid transparent' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', border: '1px solid transparent' },
    ghost:   { background: 'transparent', color: C.sub, border: `1px solid ${C.border}` },
    warning: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: '1px solid transparent' },
  };
  const sizes = { sm: { padding: '5px 11px', fontSize: 12, gap: 5 }, md: { padding: '8px 16px', fontSize: 14, gap: 7 }, lg: { padding: '11px 22px', fontSize: 15, gap: 8 } };
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{ ...variants[variant], ...sizes[size], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: disabled ? 0.6 : 1, transition: 'opacity .2s, filter .2s', whiteSpace: 'nowrap', ...style }}>
      {withIcon(children, size === 'sm' ? 15 : 17)}
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
        style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, outline: 'none', ...style }}
        onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
    </div>
  );
}

export function Select({ label, value, onChange, options = [], required = false }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>{label}{required && ' *'}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} required={required}
        style={{ width: '100%', background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, outline: 'none', cursor: 'pointer' }}>
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

export function Table({ columns, data, onRow, maxHeight }) {
  // maxHeight: الجدول بيبقى صندوق له سكرول خاص بيه والعناوين ثابتة فوق
  return (
    <div style={{ overflowX: 'auto', ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg)' }}>
            {columns.map(col => (
              <th key={col.key} style={{ ...(maxHeight ? { position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)' } : {}), padding: '10px 14px', textAlign: 'right', color: C.sub, fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: C.muted }}>لا توجد بيانات</td></tr>
          ) : data.map((row, i) => (
            <tr key={row._id || i} onClick={() => onRow?.(row)} style={{ borderBottom: `1px solid ${C.border}22`, cursor: onRow ? 'pointer' : 'default', transition: 'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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

export function StatCard({ label, value, icon, color = '#6366f1', sub, onClick, active }) {
  return (
    <div onClick={onClick} title={onClick ? 'اضغط لعرض القائمة' : undefined} style={{ background: active ? color + '1a' : C.card, border: `1px solid ${active ? color : C.border}`, borderRadius: 12, padding: '18px 20px', cursor: onClick ? 'pointer' : 'default', transition: 'border-color .15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
        </div>
        <Tile icon={icon} size={44} color={color} />
      </div>
    </div>
  );
}

// رأس الصفحة الموحّد: أيقونة + عنوان + وصف قصير + أزرار الإجراءات
const PAGE_SUBTITLES = {
  'الرئيسية': 'ملخص الأداء والمهام المطلوبة اليوم',
  'المواسم': 'التذكير بالمواسم وتجهيز المخزون قبلها',
  'الشحنات والتسليم': 'تجهيز الشحنات وتسليمها لأمازون ومطابقتها بالتقارير',
  'طلبات أمازون': 'متابعة طلبات أمازون من الاستلام حتى الشحن',
  'فواتير المبيعات': 'فواتير البيع المباشر وخصمها من المخزون',
  'العملاء': 'المنصات والعملاء الذين تُسلَّم لهم الشحنات',
  'الإعلانات والأرباح': 'أداء كل إعلان والأرباح ورسوم أمازون والإجراءات المطلوبة',
  'التسويات والدفعات': 'معاملات أمازون والمبالغ المحوّلة إلى حسابك',
  'ربط رموز SKU': 'ربط إعلانات أمازون بأصناف المخزون',
  'إعادة الطلب': 'الأصناف المطلوب شراؤها والكميات المقترحة',
  'المنتجات': 'بطاقات الأصناف والأسعار والأرصدة',
  'جرد المخزون': 'مطابقة الرصيد الفعلي بالنظام وتسوية الفروقات',
  'الرصيد الافتتاحي': 'تسجيل الكميات وتكلفة الوحدة لكل صنف',
  'حركة المخزون': 'سجل كل حركات الإضافة والخصم والتسوية',
  'مخزن التوالف': 'المرتجعات التالفة وقرارات التعامل معها',
  'فواتير الشراء': 'المشتريات من الموردين — تُحدّث التكلفة بالمتوسط المرجح',
  'الموردون': 'بيانات الموردين وأرصدتهم',
  'المصروفات': 'تسجيل ومتابعة المصروفات التشغيلية',
  'التقارير المالية': 'الإيرادات والتكاليف وصافي الربح',
  'تقارير المخزون': 'قيمة المخزون والأرصدة والنواقص',
  'الإعدادات': 'المستخدمون والصلاحيات والبيانات والمظهر',
  'الفئات': 'تصنيف الأصناف إلى أقسام',
};
export function PageHeader({ title, icon, actions, subtitle }) {
  const sub = subtitle ?? PAGE_SUBTITLES[title];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {icon && <Tile icon={icon} size={42} />}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: 21, lineHeight: 1.3, color: 'var(--text)' }}>{title}</h1>
          {sub && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

export const fmt = (n) => new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('ar-SA') : '—';
export const C_THEME = C;
