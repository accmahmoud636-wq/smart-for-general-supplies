import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Modal, Table, PageHeader, fmtDate, C_THEME as C, ACCENTS, BASES, THEME, THEME_KEY, themeColors } from '../components/UI';
import { Employees } from './Shipments';
import { readReportFile } from '../utils/parseReport';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const TABS = [
  ['employees', 'الموظفون', 'settings:read'],
  ['users', 'المستخدمون والصلاحيات', 'all'],
  ['theme', 'المظهر', 'settings:read'],
  ['data', 'إدارة البيانات', 'products'],
  ['assistant', 'المساعد الذكي', 'all'],
];
const err = (e) => e.response?.data?.message || e.message || 'خطأ';

export default function Settings() {
  const { can, user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tabs = TABS.filter(([, , p]) => can(p) || user?.role === 'superadmin');
  const tab = tabs.some(t => t[0] === sp.get('tab')) ? sp.get('tab') : tabs[0]?.[0];
  if (!tab) return <div style={{ textAlign: 'center', padding: 80, color: C.muted }}>ليس لديك صلاحية الوصول إلى هذه الصفحة</div>;

  return (
    <div>
      <PageHeader title="الإعدادات" icon="⚙️" />
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18, overflowX: 'auto' }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setSp({ tab: k })} style={{ background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.accent : 'transparent'}`, color: tab === k ? C.accentLight : C.sub, padding: '10px 14px', cursor: 'pointer', fontWeight: tab === k ? 700 : 500, fontSize: 14, whiteSpace: 'nowrap' }}>{label}</button>
        ))}
      </div>
      {tab === 'employees' && <Employees />}
      {tab === 'users' && <UsersPerms />}
      {tab === 'theme' && <Theme />}
      {tab === 'data' && <DataTab />}
      {tab === 'assistant' && <AssistantTab />}
    </div>
  );
}

// ═══ المستخدمين والصلاحيات ════════════════════════════════════
const LEVELS = [['none', 'ممنوع', '#64748b'], ['read', 'عرض فقط', '#3b82f6'], ['full', 'عرض وتعديل', '#10b981']];
const levelOf = (perms, key) => perms.includes(key) || perms.includes('all') ? 'full' : perms.includes(key + ':read') ? 'read' : 'none';
const setLevel = (perms, key, lvl) => {
  const out = perms.filter(p => p !== key && p !== key + ':read');
  if (lvl === 'full') out.push(key); else if (lvl === 'read') out.push(key + ':read');
  return out;
};

function UsersPerms() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [form, setForm] = useState(null);     // null = مقفول
  const load = () => {
    api.get('/users').then(r => setUsers(r.data)).catch(e => toast.error(err(e)));
    api.get('/users/roles').then(r => setRoles(r.data)).catch(() => {});
    api.get('/users/permissions').then(r => setPerms(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const roleOf = (k) => roles.find(r => r.key === k);
  const openNew = () => setForm({ name: '', email: '', password: '', role: 'viewer', active: true, useCustom: false, customPermissions: [] });
  const openEdit = (u) => setForm({ _id: u._id, name: u.name, email: u.email, password: '', role: u.role, active: u.active, useCustom: !!u.useCustom, customPermissions: u.useCustom ? (u.customPermissions || []) : (roleOf(u.role)?.permissions || []) });

  const shown = form ? (form.useCustom ? form.customPermissions : (roleOf(form.role)?.permissions || [])) : [];
  const changeLevel = (key, lvl) => setForm(f => ({ ...f, useCustom: true, customPermissions: setLevel(f.useCustom ? f.customPermissions : (roleOf(f.role)?.permissions || []), key, lvl) }));
  const resetToRole = () => setForm(f => ({ ...f, useCustom: false, customPermissions: [] }));

  const save = async () => {
    try {
      const d = { ...form };
      if (!d.password) delete d.password;
      delete d._id;
      if (form._id) await api.put(`/users/${form._id}`, d); else await api.post('/users', d);
      toast.success('تم الحفظ'); setForm(null); load();
    } catch (e) { toast.error(err(e)); }
  };
  const del = async (u) => {
    if (!confirm(`هل تريد حذف المستخدم ${u.name}؟`)) return;
    try { await api.delete(`/users/${u._id}`); toast.success('تم الحذف'); load(); } catch (e) { toast.error(err(e)); }
  };

  const groups = [...new Set(perms.map(p => p.group))];
  const superForm = form?.role === 'superadmin';

  return (
    <div>
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        المستخدم هو من يسجّل الدخول إلى النظام بالبريد الإلكتروني وكلمة المرور. يحدد <b>الدور</b> الصلاحيات الافتراضية، ويمكن تخصيصها
        لكل صفحة: <Badge color="#64748b">ممنوع</Badge> <Badge color="#3b82f6">عرض فقط</Badge> <Badge color="#10b981">عرض وتعديل</Badge>.
        <br />موظفو المستودع الذين يمسحون بطاقات الباركود في الشحنات يُداروا من تبويب «الموظفون» ولا يلزم أن يكونوا مستخدمين.
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Btn onClick={openNew}>+ مستخدم جديد</Btn></div>
      <Card style={{ padding: 0 }}>
        <Table columns={[
          { key: 'name', title: 'الاسم', render: (v, r) => <div><div style={{ fontWeight: 700 }}>{v}{r._id === me?._id && ' (أنت)'}</div><div style={{ fontSize: 11, color: C.muted }}>{r.email}</div></div> },
          { key: 'role', title: 'الدور', render: (v, r) => <span><Badge color="#6366f1">{r.roleLabel || v}</Badge>{r.useCustom && <> <Badge color="#f59e0b">صلاحيات مخصصة</Badge></>}</span> },
          { key: 'active', title: 'الحالة', render: v => <Badge color={v ? '#10b981' : '#ef4444'}>{v ? 'نشط' : 'موقوف'}</Badge> },
          { key: 'lastLogin', title: 'آخر دخول', render: v => fmtDate(v) },
          { key: '_id', title: '', render: (_, r) => <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>تعديل</Btn>
            {me?.role === 'superadmin' && r._id !== me._id && <Btn size="sm" variant="danger" onClick={() => del(r)}>🗑️</Btn>}
          </div> },
        ]} data={users} />
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? `تعديل ${form.name}` : 'مستخدم جديد'} width={720}>
        {form && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Input label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} required />
            <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} required />
            <Input label={form._id ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور'} type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} required={!form._id} />
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>الحالة</label>
              <select value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })} style={sel}>
                <option value="1">نشط</option><option value="0">موقوف (لا يمكنه تسجيل الدخول)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>الدور الوظيفي</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value, useCustom: false, customPermissions: [] })} style={{ ...sel, width: '100%' }}>
              {roles.filter(r => r.key !== 'superadmin' || me?.role === 'superadmin').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>

          {superForm
            ? <Card style={{ fontSize: 13, color: '#fbbf24' }}>يمتلك مدير النظام جميع الصلاحيات، ولا يمكن تخصيصها.</Card>
            : <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: C.bg }}>
                  <b style={{ fontSize: 13 }}>الصلاحيات التفصيلية {form.useCustom ? <Badge color="#f59e0b">مخصصة</Badge> : <Badge color="#64748b">حسب الدور</Badge>}</b>
                  {form.useCustom && <Btn size="sm" variant="ghost" onClick={resetToRole}>استعادة صلاحيات الدور</Btn>}
                </div>
                <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {groups.map(g => <div key={g}>
                    <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 800, color: C.accentLight }}>{g}</div>
                    {perms.filter(p => p.group === g).map(p => {
                      const lvl = levelOf(shown, p.key);
                      return (
                        <div key={p.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 12px', borderTop: `1px solid ${C.border}33`, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13 }}>{p.label}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {LEVELS.map(([k, l, color]) => (
                              <button key={k} onClick={() => changeLevel(p.key, k)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700, background: lvl === k ? color + '33' : 'transparent', border: `1px solid ${lvl === k ? color : C.border}`, color: lvl === k ? color : C.muted }}>{l}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>)}
                </div>
              </div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Btn variant="ghost" onClick={() => setForm(null)}>إلغاء</Btn>
            <Btn onClick={save}>حفظ</Btn>
          </div>
          {form._id === me?._id && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>تُطبَّق التعديلات على صلاحياتك بعد إعادة تسجيل الدخول.</div>}
        </>}
      </Modal>
    </div>
  );
}
const sel = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%' };

// ═══ المظهر والألوان ═══════════════════════════════════════════
function Theme() {
  const { can } = useAuth();
  const edit = can('settings');
  const [t, setT] = useState({ accent: 'violet', base: 'navy', appName: THEME.appName, appSub: THEME.appSub, ...THEME });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/settings/theme').then(r => setT(r.data)).catch(() => {}); }, []);
  const pv = themeColors(t);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put('/settings/theme', t);
      try { localStorage.setItem(THEME_KEY, JSON.stringify(data)); } catch { /* */ }
      toast.success('تم الحفظ — جارٍ تحديث الواجهة');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) { toast.error(err(e)); setBusy(false); }
  };

  const Swatch = ({ on, onClick, children }) => (
    <button onClick={edit ? onClick : undefined} disabled={!edit} style={{ padding: 10, borderRadius: 10, cursor: edit ? 'pointer' : 'default', background: on ? '#ffffff10' : 'transparent', border: `2px solid ${on ? pv.accent : C.border}`, color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 96 }}>{children}</button>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>بيانات النظام</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Input label="اسم النظام" value={t.appName} onChange={v => edit && setT({ ...t, appName: v })} />
          <Input label="الوصف المختصر" value={t.appSub} onChange={v => edit && setT({ ...t, appSub: v })} />
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>العملة</label>
            <select value={t.currency || 'ج.م'} disabled={!edit} onChange={e => setT({ ...t, currency: e.target.value })} style={sel}>
              {[['ج.م', 'جنيه مصري (ج.م)'], ['ر.س', 'ريال سعودي (ر.س)'], ['د.إ', 'درهم إماراتي (د.إ)'], ['$', 'دولار ($)']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>اللون الأساسي</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(ACCENTS).map(([k, a]) => (
            <Swatch key={k} on={t.accent === k} onClick={() => setT({ ...t, accent: k })}>
              <span style={{ width: 40, height: 22, borderRadius: 6, background: `linear-gradient(135deg,${a.accent},${a.accent2})` }} />
              <span style={{ fontSize: 12 }}>{a.label}</span>
            </Swatch>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>لون الخلفية</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(BASES).map(([k, b]) => (
            <Swatch key={k} on={t.base === k} onClick={() => setT({ ...t, base: k })}>
              <span style={{ width: 40, height: 22, borderRadius: 6, background: b.bg, border: `3px solid ${b.card}` }} />
              <span style={{ fontSize: 12 }}>{b.label}</span>
            </Swatch>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>معاينة</div>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${pv.border}`, height: 150 }}>
          <div style={{ flex: 1, background: pv.bg, padding: 14 }}>
            <div style={{ background: pv.card, border: `1px solid ${pv.border}`, borderRadius: 8, padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>بطاقة</span>
              <span style={{ marginRight: 'auto', background: `linear-gradient(135deg,${pv.accent},${pv.accent2})`, color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>زر</span>
            </div>
          </div>
          <div style={{ width: 150, background: pv.sidebar, borderRight: `1px solid ${pv.border}`, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: pv.accentLight, marginBottom: 6 }}>{t.appName}</div>
            <div style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: pv.accent + '22', color: pv.accentLight, fontWeight: 700 }}>الشحنات</div>
            <div style={{ fontSize: 12, padding: '6px 8px', color: C.sub }}>المنتجات</div>
          </div>
        </div>
      </Card>

      {edit
        ? <Btn size="lg" onClick={save} disabled={busy}>حفظ وتطبيق على جميع المستخدمين</Btn>
        : <div style={{ color: C.muted, fontSize: 13 }}>عرض فقط — ليس لديك صلاحية تعديل المظهر</div>}
    </div>
  );
}

// ═══ البيانات: استيراد الأصناف + تصفير ═══════════════════════════
const TEMPLATE_HEAD = ['اسم الصنف', 'SKU', 'ASIN', 'الباركود', 'سعر الشراء', 'سعر البيع', 'الكمية', 'حد التنبيه', 'الفئة', 'المورد', 'SKUs أمازون'];
const COL_LABELS = { name: 'الاسم', sku: 'SKU', asin: 'ASIN', barcode: 'الباركود', buyPrice: 'سعر الشراء', sellPrice: 'سعر البيع', stock: 'الكمية', minStock: 'حد التنبيه', category: 'الفئة', supplier: 'المورد', unit: 'الوحدة', extraSkus: 'SKUs أمازون' };

function DataTab() {
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);   // { done, total }

  const template = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEAD, ['كنكة قهوة 3 فناجين', 'J5-HA7P-GAT0', 'B0XXXXXXX', '', 150, 286, 20, 5, 'مطبخ', 'مورد العتبة', 'MOKA-2, MOKA-RED']]);
    ws['!cols'] = TEMPLATE_HEAD.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'الأصناف');
    XLSX.writeFile(wb, 'نموذج-الأصناف.xlsx');
  };

  const pick = async (file) => {
    if (!file) return;
    setBusy(true); setResult(null); setPv(null);
    try {
      const r = await readReportFile(file);
      setRows(r); setFileName(file.name);
      const { data } = await api.post('/admin/products/preview', { rows: r });
      setPv(data);
    } catch (e) { toast.error(err(e)); setRows(null); }
    setBusy(false);
  };
  const doImport = async () => {
    if (!confirm(`تأكيد استيراد ${pv.total} صنف؟\n(${pv.newCount} جديد، ${pv.total - pv.newCount} للتحديث)`)) return;
    // الملف بيترفع على دفعات صغيرة عشان الملفات الكبيرة ما تقفش في النص
    setBusy(true);
    const head = rows.slice(0, pv.headerRow + 1), body = rows.slice(pv.headerRow + 1);
    const SIZE = 200, sum = { created: 0, updated: 0, mapped: 0, errors: [] };
    setProgress({ done: 0, total: body.length });
    try {
      for (let i = 0; i < body.length; i += SIZE) {
        const { data } = await api.post('/admin/products/import', { rows: [...head, ...body.slice(i, i + SIZE)] });
        sum.created += data.created; sum.updated += data.updated; sum.mapped += data.mapped;
        sum.errors.push(...data.errors.map(e => ({ ...e, row: e.row + i })));
        setProgress({ done: Math.min(i + SIZE, body.length), total: body.length });
      }
      const message = `تمت إضافة ${sum.created} صنف وتحديث ${sum.updated}${sum.mapped ? ` وربط ${sum.mapped} رمز SKU` : ''}${sum.errors.length ? ` — ${sum.errors.length} سطر يحتوي على أخطاء` : ''}`;
      setResult({ ...sum, message }); setPv(null); toast.success(message);
    } catch (e) {
      toast.error(err(e) + ' — تم حفظ ما سبق رفعه، ويمكن إعادة رفع الملف لاستكمال الباقي دون تكرار');
      setResult({ ...sum, message: `توقف الاستيراد بعد ${sum.created + sum.updated} صنف — يُرجى إعادة رفع الملف` });
    }
    setBusy(false); setProgress(null);
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>استيراد الأصناف من Excel</div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.9, marginBottom: 12 }}>
          يُقبل ملف Excel أو CSV يحتوي على عمود <b>اسم الصنف</b> كحد أدنى، ويتعرّف النظام تلقائياً على باقي الأعمدة (SKU، ASIN، الباركود، سعر الشراء، سعر البيع، الكمية، الفئة، المورد) بالعربية أو الإنجليزية.
          يُحدَّث الصنف الموجود (بمطابقة SKU أو الباركود أو الاسم)، ويُنشأ الصنف الجديد مع باركود تلقائي عند عدم توفره. تُسجَّل الكميات كرصيد افتتاحي في حركة المخزون.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: '#fff', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            {busy ? 'جارٍ القراءة...' : 'اختيار ملف الأصناف'}
            <input type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }} disabled={busy} onChange={e => { pick(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <Btn variant="ghost" onClick={template}>تنزيل نموذج Excel</Btn>
        </div>
      </Card>

      {pv && (
        <Card style={{ marginBottom: 14, padding: 0 }}>
          <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{fileName} — {pv.total} صنف{pv.rawRows > pv.total && <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}> (من {pv.rawRows} سطر — الأسطر المتكررة لنفس الصنف جُمعت في كارت واحد بكل رموز SKU)</span>} <Badge color="#10b981">{pv.newCount} جديد</Badge> <Badge color="#3b82f6">{pv.total - pv.newCount} للتحديث</Badge></div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>الأعمدة المعتمدة: {pv.columns.map(c => COL_LABELS[c] || c).join('، ')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setPv(null); setRows(null); }}>إلغاء</Btn>
              <Btn variant="success" onClick={doImport} disabled={busy}>تأكيد الاستيراد</Btn>
            </div>
          </div>
          <Table columns={[
            { key: 'name', title: 'الصنف', render: (v, r) => <span style={{ fontWeight: 600 }}>{v} {r.exists && <Badge color="#3b82f6">موجود</Badge>}</span> },
            { key: 'sku', title: 'SKU', render: v => <span dir="ltr">{v || '—'}</span> },
            { key: 'barcode', title: 'الباركود', render: v => v || <span style={{ color: C.muted, fontSize: 11 }}>تلقائي</span> },
            { key: 'buyPrice', title: 'سعر الشراء', render: v => v ?? '—' },
            { key: 'sellPrice', title: 'سعر البيع', render: v => v ?? '—' },
            { key: 'stock', title: 'الكمية', render: v => v ?? '—' },
            { key: 'category', title: 'الفئة', render: v => v || '—' },
            { key: 'extraSkus', title: 'SKUs أمازون', render: v => v?.length ? <span dir="ltr" style={{ fontSize: 11 }}>{v.join(', ')}</span> : '—' },
          ]} data={pv.items.slice(0, 200).map(i => ({ ...i, _id: i.row }))} />
          {pv.items.length > 200 && <div style={{ padding: 10, fontSize: 12, color: C.muted, textAlign: 'center' }}>يُعرض أول 200 صنف فقط، وسيُستورد الملف بالكامل</div>}
        </Card>
      )}

      {progress && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>جارٍ الاستيراد: {progress.done} من {progress.total} — يُرجى عدم إغلاق الصفحة</div>
          <div style={{ height: 10, background: C.bg, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(progress.done / progress.total * 100)}%`, height: '100%', background: `linear-gradient(90deg,${C.accent},${C.accent2})`, transition: 'width .3s' }} />
          </div>
        </Card>
      )}

      {result && (
        <Card style={{ marginBottom: 14, borderColor: result.errors.length ? '#f59e0b88' : '#10b98188' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{result.message}</div>
          {result.errors.map(e => <div key={e.row} style={{ fontSize: 12, color: '#f87171' }}>السطر {e.row} — {e.name}: {e.message}</div>)}
        </Card>
      )}

      {isSuper && <BackupCard />}
      {isSuper && <ResetCard key={result?.message || ''} />}
    </div>
  );
}

function ResetCard() {
  const [counts, setCounts] = useState(null);
  const [pick, setPick] = useState({ products: false, movements: false, shipments: false, amazon: false, sales: false, purchases: false, expenses: false });
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/admin/counts').then(r => setCounts(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const go = async () => {
    setBusy(true);
    try { const { data } = await api.post('/admin/reset', { scopes: Object.keys(pick).filter(k => pick[k]), confirm: word }); toast.success(data.message); setWord(''); load(); }
    catch (e) { toast.error(err(e)); }
    setBusy(false);
  };
  return (
    <Card style={{ borderColor: '#ef444466' }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: '#f87171', marginBottom: 6 }}>حذف البيانات</div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>الحذف نهائي ولا يمكن التراجع عنه. حدّد البيانات المطلوب حذفها فقط. لا يشمل الحذف المستخدمين أو الموظفين أو الإعدادات.</div>
      {counts && Object.entries(counts).map(([k, c]) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!pick[k]} onChange={e => setPick({ ...pick, [k]: e.target.checked })} />
          <span>{c.label}</span><Badge color="#64748b">{c.count}</Badge>
        </label>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <input value={word} onChange={e => setWord(e.target.value)} placeholder="اكتب: حذف" style={{ background: 'var(--bg)', border: '1px solid #ef444466', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 14, outline: 'none', width: 160 }} />
        <Btn variant="danger" onClick={go} disabled={busy || word !== 'حذف' || !Object.values(pick).some(Boolean)}>{busy ? 'جارٍ الحذف...' : 'حذف البيانات المحددة'}</Btn>
      </div>
    </Card>
  );
}

// ═══ المساعد الذكي: مفتاح API والموديل والاستهلاك ════════════════
function AssistantTab() {
  const [cfg, setCfg] = useState(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.get('/assistant/config').then(r => { setCfg(r.data); setModel(r.data.model); }).catch(e => toast.error(err(e)));
  useEffect(() => { load(); }, []);
  const save = async (body) => {
    setBusy(true);
    try { const { data } = await api.put('/assistant/config', body); toast.success(data.message); setKey(''); await load(); setTimeout(() => window.location.reload(), 600); }
    catch (e) { toast.error(err(e)); }
    setBusy(false);
  };
  if (!cfg) return <div style={{ padding: 30, color: C.muted }}>⏳</div>;
  const u = cfg.usage;
  return (
    <div style={{ maxWidth: 720 }}>
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        المساعد الذكي يعمل من زر <b>✨</b> أسفل الشاشة في كل الصفحات: تكتب أو تتحدث بأمر مثل «اشتريت 20 كنكة بسعر 150» فيجهّز العملية ويعرضها عليك، ولا يُنفّذ أي تعديل إلا بعد ضغط «تأكيد».
        يلتزم بصلاحيات كل مستخدم. يعمل عبر Claude من Anthropic ويحتاج مفتاح API من <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: C.accentLight }}>console.anthropic.com</a> برصيد مشحون.
      </Card>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b>الحالة</b>
          <Badge color={cfg.hasKey ? '#10b981' : '#64748b'}>{cfg.hasKey ? 'مفعّل' : 'غير مفعّل'}</Badge>
        </div>
        {cfg.hasKey && <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>المفتاح الحالي: <span dir="ltr" style={{ fontFamily: 'monospace' }}>{cfg.keyHint}</span>{cfg.fromEnv && ' (من متغيرات Render)'}</div>}
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{cfg.hasKey ? 'استبدال المفتاح' : 'مفتاح API'}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-..." dir="ltr" type="password"
            style={{ flex: 1, minWidth: 220, background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: 'monospace' }} />
          <Btn onClick={() => save({ apiKey: key, model })} disabled={busy || !key.trim()}>{busy ? 'جارٍ التحقق...' : 'حفظ وتفعيل'}</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>الموديل</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(cfg.models).map(([k, l]) => (
            <button key={k} onClick={() => { setModel(k); if (cfg.hasKey) save({ model: k }); }} style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: model === k ? '#6366f133' : 'transparent', border: `1px solid ${model === k ? '#6366f1' : C.border}`, color: model === k ? '#a5b4fc' : C.sub }}>{l}</button>
          ))}
        </div>
        {cfg.hasKey && !cfg.fromEnv && <div style={{ marginTop: 16 }}><Btn variant="ghost" size="sm" onClick={() => confirm('إيقاف المساعد وحذف المفتاح؟') && save({ apiKey: '' })}>إيقاف المساعد</Btn></div>}
      </Card>
      {u && (
        <Card>
          <b>استهلاك هذا الشهر ({u.month})</b>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 8, lineHeight: 1.9 }}>
            عدد الطلبات: {u.requests.toLocaleString('en')} — رموز الإدخال: {u.input.toLocaleString('en')} — رموز الإخراج: {u.output.toLocaleString('en')}
            <div style={{ fontSize: 12, color: C.muted }}>التكلفة الفعلية وحد الصرف الشهري يُتابعان من حسابك على console.anthropic.com.</div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══ النسخ الاحتياطي والاسترجاع ═════════════════════════════════
function BackupCard() {
  const [info, setInfo] = useState(null);
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState('');
  const [file, setFile] = useState(null);       // { name, text, meta }
  const [word, setWord] = useState('');
  const [withUsers, setWithUsers] = useState(false);
  const load = () => api.get('/admin/backup/info').then(r => setInfo(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const download = async () => {
    setBusy('backup');
    try {
      const r = await api.get('/admin/backup', { params: { photos: photos ? 1 : 0 }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = `smart-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success('تم تنزيل النسخة الاحتياطية — احفظها في مكان آمن'); load();
    } catch (e) { toast.error('تعذّر إنشاء النسخة'); }
    setBusy('');
  };

  const pick = async (f) => {
    if (!f) return;
    const text = await f.text();
    try {
      const j = JSON.parse(text);
      if (j.app !== 'smart-for-trading') throw new Error();
      const counts = Object.fromEntries(Object.entries(j.collections).map(([k, v]) => [k, v.length]));
      setFile({ name: f.name, text, meta: { createdAt: j.createdAt?.$date || j.createdAt, by: j.createdBy, withPhotos: j.withPhotos, counts } });
      setWord('');
    } catch { toast.error('الملف ليس نسخة احتياطية من هذا النظام'); }
  };

  const restore = async () => {
    setBusy('restore');
    try {
      const { data } = await api.post('/admin/restore', { file: file.text, confirm: word, includeUsers: withUsers });
      toast.success(data.message, { duration: 6000 }); setFile(null); load();
    } catch (e) { toast.error(err(e)); }
    setBusy('');
  };

  const last = info?.last;
  const age = last ? Math.floor((Date.now() - new Date(last.at)) / 864e5) : null;
  const total = info ? Object.entries(info.counts).filter(([k]) => photos || k !== 'damagedphotos').reduce((t, [, n]) => t + n, 0) : 0;
  const LABELS = { products: 'الأصناف', stockmovements: 'حركات المخزون', shipments: 'الشحنات', amazonorders: 'طلبات أمازون', amazontransactions: 'معاملات أمازون', sales: 'فواتير البيع', purchases: 'فواتير الشراء', expenses: 'المصروفات', customers: 'العملاء', suppliers: 'الموردون', users: 'المستخدمون', damageds: 'التوالف', damagedphotos: 'صور التوالف', categories: 'الفئات', employees: 'الموظفون', amazonskumaps: 'ربط SKU', settings: 'الإعدادات', assistantactions: 'سجل المساعد' };

  return (
    <Card style={{ marginTop: 16, borderColor: '#10b98155' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>💾 النسخ الاحتياطي</div>
      <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.9, marginBottom: 12 }}>
        ينزّل ملفاً واحداً فيه كل بيانات النظام (الأصناف، الشحنات، الفواتير، الحركات، العملاء، الإعدادات...). يُنصح بتنزيل نسخة أسبوعياً وحفظها على جهازك أو Google Drive.
        <div style={{ marginTop: 6 }}>
          آخر نسخة: {last ? <b style={{ color: age > 7 ? '#f59e0b' : '#10b981' }}>{new Date(last.at).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })} ({age === 0 ? 'اليوم' : `منذ ${age} يوم`}) — {last.by}</b> : <b style={{ color: '#f59e0b' }}>لم تُنزَّل أي نسخة بعد</b>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn variant="success" onClick={download} disabled={!!busy}>{busy === 'backup' ? 'جارٍ التجهيز...' : `تنزيل نسخة احتياطية (${total.toLocaleString('en')} سجل)`}</Btn>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.sub, cursor: 'pointer' }}>
          <input type="checkbox" checked={photos} onChange={e => setPhotos(e.target.checked)} /> تضمين صور التوالف {info?.counts?.damagedphotos ? `(${info.counts.damagedphotos} صورة — حجم أكبر)` : ''}
        </label>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14 }}>استرجاع من نسخة</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>يستبدل البيانات الحالية بالكامل ببيانات الملف. يُستخدم عند فقدان البيانات أو للنقل إلى قاعدة بيانات جديدة.</div>
        {!file ? (
          <label style={{ display: 'inline-block', border: `1px dashed ${C.border}`, borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13, color: C.sub }}>
            اختيار ملف النسخة (.json)
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { pick(e.target.files[0]); e.target.value = ''; }} />
          </label>
        ) : (
          <div style={{ background: '#ef444411', border: '1px solid #ef444455', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <b>{file.name}</b> — نسخة {file.meta.createdAt ? new Date(file.meta.createdAt).toLocaleString('ar-EG') : ''}{file.meta.by ? ` بواسطة ${file.meta.by}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {Object.entries(file.meta.counts).filter(([, n]) => n).map(([k, n]) => <Badge key={k} color="#64748b">{LABELS[k] || k}: {n}</Badge>)}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.sub, marginBottom: 10 }}>
              <input type="checkbox" checked={withUsers} onChange={e => setWithUsers(e.target.checked)} /> استرجاع المستخدمين وكلمات المرور أيضاً (يُترك غير محدد عادةً)
            </label>
            <div style={{ fontSize: 13, color: '#f87171', marginBottom: 8, fontWeight: 700 }}>تحذير: ستُحذف البيانات الحالية وتُستبدل ببيانات الملف. اكتب «استرجاع» للتأكيد:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={word} onChange={e => setWord(e.target.value)} placeholder="استرجاع" style={{ background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, outline: 'none', width: 140 }} />
              <Btn variant="danger" onClick={restore} disabled={word !== 'استرجاع' || !!busy}>{busy === 'restore' ? 'جارٍ الاسترجاع...' : 'استرجاع البيانات'}</Btn>
              <Btn variant="ghost" onClick={() => setFile(null)}>إلغاء</Btn>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
