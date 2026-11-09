import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Modal, Table, PageHeader, fmtDate, C_THEME as C, ACCENTS, BASES, THEME, THEME_KEY, themeColors } from '../components/UI';
import { Employees } from './Shipments';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const TABS = [
  ['employees', '👤 الموظفين', 'settings:read'],
  ['users', '🔐 المستخدمين والصلاحيات', 'all'],
  ['theme', '🎨 المظهر والألوان', 'settings:read'],
];
const err = (e) => e.response?.data?.message || e.message || 'خطأ';

export default function Settings() {
  const { can, user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tabs = TABS.filter(([, , p]) => can(p) || user?.role === 'superadmin');
  const tab = tabs.some(t => t[0] === sp.get('tab')) ? sp.get('tab') : tabs[0]?.[0];
  if (!tab) return <div style={{ textAlign: 'center', padding: 80, color: C.muted }}>🔒 غير مصرح بالوصول</div>;

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
    </div>
  );
}

// ═══ المستخدمين والصلاحيات ════════════════════════════════════
const LEVELS = [['none', 'ممنوع', '#64748b'], ['read', 'عرض بس', '#3b82f6'], ['full', 'عرض وتعديل', '#10b981']];
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
      toast.success('اتحفظ'); setForm(null); load();
    } catch (e) { toast.error(err(e)); }
  };
  const del = async (u) => {
    if (!confirm(`تمسح المستخدم ${u.name}؟`)) return;
    try { await api.delete(`/users/${u._id}`); toast.success('اتمسح'); load(); } catch (e) { toast.error(err(e)); }
  };

  const groups = [...new Set(perms.map(p => p.group))];
  const superForm = form?.role === 'superadmin';

  return (
    <div>
      <Card style={{ marginBottom: 14, fontSize: 13, color: C.sub, lineHeight: 1.9 }}>
        المستخدم = حد بيدخل المنصة بإيميل وباسورد. كل مستخدم ليه <b>دور</b> بيحدد صلاحياته الافتراضية، وتقدر تخصص صلاحياته
        صفحة صفحة: <Badge color="#64748b">ممنوع</Badge> <Badge color="#3b82f6">عرض بس</Badge> <Badge color="#10b981">عرض وتعديل</Badge>.
        <br />الموظفين اللي بيمسحوا كارت الباركود في الشحنات مش لازم يبقوا مستخدمين — دول في تبويب «الموظفين».
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Btn onClick={openNew}>+ مستخدم جديد</Btn></div>
      <Card style={{ padding: 0 }}>
        <Table columns={[
          { key: 'name', title: 'الاسم', render: (v, r) => <div><div style={{ fontWeight: 700 }}>{v}{r._id === me?._id && ' (أنت)'}</div><div style={{ fontSize: 11, color: C.muted }}>{r.email}</div></div> },
          { key: 'role', title: 'الدور', render: (v, r) => <span><Badge color="#6366f1">{r.roleLabel || v}</Badge>{r.useCustom && <> <Badge color="#f59e0b">صلاحيات مخصصة</Badge></>}</span> },
          { key: 'active', title: 'الحالة', render: v => <Badge color={v ? '#10b981' : '#ef4444'}>{v ? 'نشط' : 'موقوف'}</Badge> },
          { key: 'lastLogin', title: 'آخر دخول', render: v => fmtDate(v) },
          { key: '_id', title: '', render: (_, r) => <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>✏️ تعديل وصلاحيات</Btn>
            {me?.role === 'superadmin' && r._id !== me._id && <Btn size="sm" variant="danger" onClick={() => del(r)}>🗑️</Btn>}
          </div> },
        ]} data={users} />
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? `تعديل ${form.name}` : 'مستخدم جديد'} width={720}>
        {form && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Input label="الاسم" value={form.name} onChange={v => setForm({ ...form, name: v })} required />
            <Input label="الإيميل" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} required />
            <Input label={form._id ? 'باسورد جديد (سيبه فاضي لو مش هتغيره)' : 'الباسورد'} type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} required={!form._id} />
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>الحالة</label>
              <select value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })} style={sel}>
                <option value="1">نشط</option><option value="0">موقوف (مش هيقدر يدخل)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600 }}>الدور (الصلاحيات الجاهزة)</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value, useCustom: false, customPermissions: [] })} style={{ ...sel, width: '100%' }}>
              {roles.filter(r => r.key !== 'superadmin' || me?.role === 'superadmin').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>

          {superForm
            ? <Card style={{ fontSize: 13, color: '#fbbf24' }}>👑 مدير النظام ليه كل الصلاحيات، ومش بتتخصص.</Card>
            : <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: C.bg }}>
                  <b style={{ fontSize: 13 }}>الصلاحيات بالتفصيل {form.useCustom ? <Badge color="#f59e0b">مخصصة</Badge> : <Badge color="#64748b">حسب الدور</Badge>}</b>
                  {form.useCustom && <Btn size="sm" variant="ghost" onClick={resetToRole}>↩️ ارجع لصلاحيات الدور</Btn>}
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
            <Btn onClick={save}>💾 حفظ</Btn>
          </div>
          {form._id === me?._id && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>تعديل صلاحياتك بيظهر بعد ما تعمل خروج ودخول.</div>}
        </>}
      </Modal>
    </div>
  );
}
const sel = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none', width: '100%' };

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
      toast.success('اتحفظ — الشاشة هتتحدث');
      setTimeout(() => window.location.reload(), 600);
    } catch (e) { toast.error(err(e)); setBusy(false); }
  };

  const Swatch = ({ on, onClick, children }) => (
    <button onClick={edit ? onClick : undefined} disabled={!edit} style={{ padding: 10, borderRadius: 10, cursor: edit ? 'pointer' : 'default', background: on ? '#ffffff10' : 'transparent', border: `2px solid ${on ? pv.accent : C.border}`, color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 96 }}>{children}</button>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>اسم المنصة</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <Input label="الاسم (فوق في الشريط الجانبي)" value={t.appName} onChange={v => edit && setT({ ...t, appName: v })} />
          <Input label="السطر الصغير تحته" value={t.appSub} onChange={v => edit && setT({ ...t, appSub: v })} />
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>اللون الأساسي (الأزرار والقائمة المختارة)</div>
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
              <span style={{ fontSize: 13 }}>كارت</span>
              <span style={{ marginRight: 'auto', background: `linear-gradient(135deg,${pv.accent},${pv.accent2})`, color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>زرار</span>
            </div>
          </div>
          <div style={{ width: 150, background: pv.sidebar, borderRight: `1px solid ${pv.border}`, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: pv.accentLight, marginBottom: 6 }}>{t.appName}</div>
            <div style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: pv.accent + '22', color: pv.accentLight, fontWeight: 700 }}>📦 الشحنات</div>
            <div style={{ fontSize: 12, padding: '6px 8px', color: C.sub }}>🏷️ المنتجات</div>
          </div>
        </div>
      </Card>

      {edit
        ? <Btn size="lg" onClick={save} disabled={busy}>💾 حفظ وتطبيق على كل المستخدمين</Btn>
        : <div style={{ color: C.muted, fontSize: 13 }}>🔒 عرض بس — مش عندك صلاحية تعديل المظهر</div>}
    </div>
  );
}
