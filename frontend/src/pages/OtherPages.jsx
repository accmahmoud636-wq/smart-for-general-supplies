import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Select, Modal, Table, PageHeader, StatCard, fmt, fmtDate, C_THEME as C } from '../components/UI';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// ═══════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════
export function Categories() {
  const { can } = useAuth();
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name:'', description:'', color:'#6366f1' }); const [editing, setEditing] = useState(null);
  const load = () => api.get('/categories').then(r => setItems(r.data)).catch(() => toast.error('خطأ'));
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing(null); setForm({ name:'', description:'', color:'#6366f1' }); setModal(true); };
  const openEdit = (item) => { setEditing(item._id); setForm({ name:item.name, description:item.description||'', color:item.color||'#6366f1' }); setModal(true); };
  const save = async () => { try { if (editing) await api.put(`/categories/${editing}`, form); else await api.post('/categories', form); toast.success('تم'); setModal(false); load(); } catch(e){ toast.error(e.response?.data?.message||'خطأ'); } };
  const del = async (id) => { if (!confirm('حذف؟')) return; await api.delete(`/categories/${id}`); toast.success('تم الحذف'); load(); };
  const cols = [
    { key:'name', title:'الاسم', render:(v,r) => <Badge color={r.color}>{v}</Badge> },
    { key:'description', title:'الوصف' },
    { key:'_id', title:'إجراءات', render:(_,r) => can('categories') && <div style={{display:'flex',gap:6}}><Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>✏️</Btn><Btn size="sm" variant="danger" onClick={() => del(r._id)}>🗑️</Btn></div> }
  ];
  return (
    <div>
      <PageHeader title="الفئات" icon="🏷️" actions={can('categories') && [<Btn key="a" onClick={openNew}>+ إضافة</Btn>]} />
      <Card><Table columns={cols} data={items} /></Card>
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل' : 'إضافة فئة'} width={400}>
        <Input label="الاسم" value={form.name} onChange={v => setForm({...form,name:v})} required />
        <Input label="الوصف" value={form.description} onChange={v => setForm({...form,description:v})} />
        <div style={{marginBottom:14}}><label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:6,fontWeight:600}}>اللون</label><input type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} style={{width:60,height:36,borderRadius:8,border:'none',cursor:'pointer',background:'none'}} /></div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn onClick={save}>💾 حفظ</Btn></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════
export function Suppliers() {
  const { can } = useAuth();
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name:'', country:'', contact:'', phone:'', email:'', notes:'' }); const [editing, setEditing] = useState(null);
  const load = () => api.get('/suppliers').then(r => setItems(r.data)).catch(() => toast.error('خطأ'));
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing(null); setForm({ name:'', country:'', contact:'', phone:'', email:'', notes:'' }); setModal(true); };
  const openEdit = (item) => { setEditing(item._id); setForm({...item}); setModal(true); };
  const save = async () => { try { if (editing) await api.put(`/suppliers/${editing}`, form); else await api.post('/suppliers', form); toast.success('تم'); setModal(false); load(); } catch(e){ toast.error(e.response?.data?.message||'خطأ'); } };
  const cols = [
    { key:'name', title:'اسم المورد', render:v=><span style={{fontWeight:600}}>{v}</span> },
    { key:'country', title:'الدولة' }, { key:'phone', title:'الهاتف' }, { key:'email', title:'البريد' },
    { key:'balance', title:'الرصيد', render:v=><span style={{color:v>0?'#ef4444':'#10b981',fontWeight:700}}>{fmt(v)} ر.س</span> },
    { key:'_id', title:'إجراءات', render:(_,r) => can('suppliers') && <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>✏️</Btn> }
  ];
  return (
    <div>
      <PageHeader title="الموردون" icon="🏭" actions={can('suppliers') && [<Btn key="a" onClick={openNew}>+ إضافة مورد</Btn>]} />
      <Card><Table columns={cols} data={items} /></Card>
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل مورد' : 'مورد جديد'} width={500}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <div style={{gridColumn:'1/-1'}}><Input label="الاسم" value={form.name} onChange={v=>setForm({...form,name:v})} required /></div>
          <Input label="الدولة" value={form.country||''} onChange={v=>setForm({...form,country:v})} />
          <Input label="جهة الاتصال" value={form.contact||''} onChange={v=>setForm({...form,contact:v})} />
          <Input label="الهاتف" value={form.phone||''} onChange={v=>setForm({...form,phone:v})} />
          <Input label="البريد الإلكتروني" type="email" value={form.email||''} onChange={v=>setForm({...form,email:v})} />
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn onClick={save}>💾 حفظ</Btn></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════
export function Customers() {
  const { can } = useAuth();
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name:'', amazonId:'', email:'', phone:'', country:'', notes:'' }); const [editing, setEditing] = useState(null);
  const load = () => api.get('/customers').then(r => setItems(r.data)).catch(() => toast.error('خطأ'));
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing(null); setForm({ name:'', amazonId:'', email:'', phone:'', country:'' }); setModal(true); };
  const openEdit = (item) => { setEditing(item._id); setForm({...item}); setModal(true); };
  const save = async () => { try { if (editing) await api.put(`/customers/${editing}`, form); else await api.post('/customers', form); toast.success('تم'); setModal(false); load(); } catch(e){ toast.error(e.response?.data?.message||'خطأ'); } };
  const cols = [
    { key:'name', title:'العميل', render:v=><span style={{fontWeight:600}}>{v}</span> },
    { key:'amazonId', title:'Amazon ID' }, { key:'country', title:'الدولة' }, { key:'phone', title:'الهاتف' },
    { key:'_id', title:'إجراءات', render:(_,r) => can('customers') && <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>✏️</Btn> }
  ];
  return (
    <div>
      <PageHeader title="العملاء" icon="👥" actions={can('customers') && [<Btn key="a" onClick={openNew}>+ إضافة عميل</Btn>]} />
      <Card><Table columns={cols} data={items} /></Card>
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل عميل' : 'عميل جديد'} width={500}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <div style={{gridColumn:'1/-1'}}><Input label="الاسم" value={form.name} onChange={v=>setForm({...form,name:v})} required /></div>
          <Input label="Amazon ID" value={form.amazonId||''} onChange={v=>setForm({...form,amazonId:v})} />
          <Input label="الدولة" value={form.country||''} onChange={v=>setForm({...form,country:v})} />
          <Input label="الهاتف" value={form.phone||''} onChange={v=>setForm({...form,phone:v})} />
          <Input label="البريد" type="email" value={form.email||''} onChange={v=>setForm({...form,email:v})} />
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn onClick={save}>💾 حفظ</Btn></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EXPENSES
// ═══════════════════════════════════════════════════════════
const EXP_CATS = ['شحن وتوصيل','رسوم Amazon','إعلانات','تخزين','موظفين','إيجار','أدوات وبرامج','ضرائب','مصروفات متنوعة'];
export function Expenses() {
  const { can } = useAuth();
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category:'', amount:'', description:'', date:new Date().toISOString().slice(0,10), paymentMethod:'cash' });
  const [editing, setEditing] = useState(null);
  const load = () => api.get('/expenses').then(r => setItems(r.data)).catch(() => toast.error('خطأ'));
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing(null); setForm({ category:'', amount:'', description:'', date:new Date().toISOString().slice(0,10), paymentMethod:'cash' }); setModal(true); };
  const save = async () => { try { if (editing) await api.put(`/expenses/${editing}`, form); else await api.post('/expenses', form); toast.success('تم'); setModal(false); load(); } catch(e){ toast.error(e.response?.data?.message||'خطأ'); } };
  const del = async (id) => { if (!confirm('حذف هذا المصروف؟')) return; await api.delete(`/expenses/${id}`); toast.success('تم الحذف'); load(); };
  const total = items.reduce((s, e) => s + e.amount, 0);
  const cols = [
    { key:'date', title:'التاريخ', render:v=>fmtDate(v) },
    { key:'category', title:'الفئة', render:v=><Badge color="#f59e0b">{v}</Badge> },
    { key:'description', title:'الوصف' },
    { key:'paymentMethod', title:'طريقة الدفع', render:v=>({cash:'نقداً',bank:'بنك',card:'بطاقة',other:'أخرى'}[v]||v) },
    { key:'amount', title:'المبلغ', render:v=><span style={{color:'#ef4444',fontWeight:700}}>{fmt(v)} ر.س</span> },
    { key:'_id', title:'إجراءات', render:(_,r) => can('expenses') && <Btn size="sm" variant="danger" onClick={() => del(r._id)}>🗑️</Btn> }
  ];
  return (
    <div>
      <PageHeader title="المصروفات" icon="💸" actions={can('expenses') && [<Btn key="a" onClick={openNew}>+ إضافة مصروف</Btn>]} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:16}}>
        <StatCard label="إجمالي المصروفات" value={`${fmt(total)} ر.س`} icon="💸" color="#ef4444" />
        <StatCard label="عدد العمليات" value={items.length} icon="📋" color="#f59e0b" />
        <StatCard label="متوسط المصروف" value={`${fmt(items.length?total/items.length:0)} ر.س`} icon="📊" color="#6366f1" />
      </div>
      <Card><Table columns={cols} data={items} /></Card>
      <Modal open={modal} onClose={() => setModal(false)} title="إضافة مصروف" width={460}>
        <Select label="الفئة" value={form.category} onChange={v=>setForm({...form,category:v})} required options={EXP_CATS.map(c=>({value:c,label:c}))} />
        <Input label="المبلغ (ر.س)" type="number" value={form.amount} onChange={v=>setForm({...form,amount:v})} required />
        <Input label="الوصف" value={form.description} onChange={v=>setForm({...form,description:v})} />
        <Input label="التاريخ" type="date" value={form.date} onChange={v=>setForm({...form,date:v})} />
        <Select label="طريقة الدفع" value={form.paymentMethod} onChange={v=>setForm({...form,paymentMethod:v})} options={[{value:'cash',label:'نقداً'},{value:'bank',label:'تحويل بنكي'},{value:'card',label:'بطاقة'},{value:'other',label:'أخرى'}]} />
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn onClick={save}>💾 حفظ</Btn></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STOCK MOVEMENTS
// ═══════════════════════════════════════════════════════════
export function StockPage() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get('/stock').then(r => setItems(r.data)).catch(() => toast.error('خطأ')); }, []);
  const TYPE_COLORS = { in: '#10b981', out: '#ef4444', adjust: '#f59e0b', return: '#3b82f6' };
  const TYPE_LABELS = { in: 'وارد ↑', out: 'صادر ↓', adjust: 'تسوية', return: 'مرتجع' };
  const cols = [
    { key:'createdAt', title:'التاريخ', render:v=>fmtDate(v) },
    { key:'product', title:'المنتج', render:v=><span style={{fontWeight:600}}>{v?.name}</span> },
    { key:'type', title:'النوع', render:v=><Badge color={TYPE_COLORS[v]}>{TYPE_LABELS[v]}</Badge> },
    { key:'qty', title:'الكمية', render:v=><span style={{fontWeight:700}}>{v}</span> },
    { key:'before', title:'قبل' }, { key:'after', title:'بعد', render:v=><span style={{color:'#10b981',fontWeight:600}}>{v}</span> },
    { key:'reason', title:'السبب' },
    { key:'reference', title:'المرجع' }
  ];
  return (
    <div>
      <PageHeader title="حركة المخزون" icon="📋" />
      <Card><Table columns={cols} data={items} /></Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════
const ROLE_COLORS2 = { superadmin:'#f59e0b', admin:'#6366f1', accountant:'#10b981', inventory:'#3b82f6', sales:'#ec4899', viewer:'#64748b' };
export function Users() {
  const { user: me, can } = useAuth();
  const [items, setItems] = useState([]); const [roles, setRoles] = useState([]);
  const [modal, setModal] = useState(false); const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'viewer', active:true });
  const load = () => { api.get('/users').then(r => setItems(r.data)).catch(()=>toast.error('غير مصرح')); api.get('/users/roles').then(r=>setRoles(r.data)); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditing(null); setForm({ name:'', email:'', password:'', role:'viewer', active:true }); setModal(true); };
  const openEdit = (u) => { setEditing(u._id); setForm({ name:u.name, email:u.email, password:'', role:u.role, active:u.active }); setModal(true); };
  const save = async () => { try { const d = {...form}; if(!d.password) delete d.password; if(editing) await api.put(`/users/${editing}`,d); else await api.post('/users',d); toast.success('تم'); setModal(false); load(); } catch(e){ toast.error(e.response?.data?.message||'خطأ'); } };
  const del = async (id) => { if(!confirm('حذف المستخدم؟')) return; try{ await api.delete(`/users/${id}`); toast.success('تم'); load(); }catch(e){ toast.error(e.response?.data?.message||'خطأ'); } };
  const cols = [
    { key:'name', title:'الاسم', render:(v,r)=><div><div style={{fontWeight:600}}>{v}{r._id===me?._id&&' (أنت)'}</div><div style={{fontSize:11,color:'#64748b'}}>{r.email}</div></div> },
    { key:'role', title:'الدور', render:(v,r)=><Badge color={ROLE_COLORS2[v]}>{r.roleLabel||v}</Badge> },
    { key:'active', title:'الحالة', render:v=><Badge color={v?'#10b981':'#ef4444'}>{v?'نشط':'معطل'}</Badge> },
    { key:'lastLogin', title:'آخر دخول', render:v=>fmtDate(v) },
    { key:'_id', title:'إجراءات', render:(_,r)=><div style={{display:'flex',gap:6}}>
      <Btn size="sm" variant="ghost" onClick={()=>openEdit(r)}>✏️</Btn>
      {me?.role==='superadmin' && r._id!==me._id && <Btn size="sm" variant="danger" onClick={()=>del(r._id)}>🗑️</Btn>}
    </div> }
  ];
  if (!can('all')) return <div style={{textAlign:'center',padding:80,color:'#64748b'}}>🔒 غير مصرح بالوصول</div>;
  return (
    <div>
      <PageHeader title="إدارة المستخدمين" icon="👤" actions={[<Btn key="a" onClick={openNew}>+ مستخدم جديد</Btn>]} />
      <Card><Table columns={cols} data={items} /></Card>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?'تعديل مستخدم':'مستخدم جديد'} width={460}>
        <Input label="الاسم الكامل" value={form.name} onChange={v=>setForm({...form,name:v})} required />
        <Input label="البريد الإلكتروني" type="email" value={form.email} onChange={v=>setForm({...form,email:v})} required />
        <Input label={editing?'كلمة المرور الجديدة (اتركها فارغة للإبقاء)':'كلمة المرور'} type="password" value={form.password} onChange={v=>setForm({...form,password:v})} required={!editing} />
        <Select label="الدور" value={form.role} onChange={v=>setForm({...form,role:v})} options={roles.map(r=>({value:r.key,label:r.label}))} />
        <Select label="الحالة" value={form.active?'true':'false'} onChange={v=>setForm({...form,active:v==='true'})} options={[{value:'true',label:'نشط'},{value:'false',label:'معطل'}]} />
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn onClick={save}>💾 حفظ</Btn></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════
export function Reports() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [pl, setPL] = useState(null); const [inv, setInv] = useState(null); const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if(from) params.append('from',from); if(to) params.append('to',to);
      const [r1, r2] = await Promise.all([api.get(`/reports/profit-loss?${params}`), api.get('/reports/inventory')]);
      setPL(r1.data); setInv(r2.data);
    } catch { toast.error('خطأ'); } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);
  return (
    <div>
      <PageHeader title="التقارير المالية" icon="📈" />
      <Card style={{marginBottom:16}}>
        <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div><label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:5,fontWeight:600}}>من تاريخ</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 12px',color:'#e2e8f0',fontSize:14,outline:'none'}} /></div>
          <div><label style={{fontSize:12,color:'#94a3b8',display:'block',marginBottom:5,fontWeight:600}}>إلى تاريخ</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 12px',color:'#e2e8f0',fontSize:14,outline:'none'}} /></div>
          <Btn onClick={load} disabled={loading}>🔍 عرض</Btn>
        </div>
      </Card>
      {pl && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          <Card>
            <div style={{fontWeight:700,marginBottom:16,fontSize:15}}>📊 قائمة الدخل (P&L)</div>
            {[
              {label:'الإيرادات الإجمالية',val:pl.revenue,color:'#10b981'},
              {label:'تكلفة البضاعة (COGS)',val:-pl.cogs,color:'#ef4444'},
              {label:'إجمالي الربح',val:pl.grossProfit,color:'#6366f1',bold:true},
              {label:'رسوم Amazon',val:-pl.amazonFees,color:'#f59e0b'},
              {label:'المصروفات التشغيلية',val:-pl.totalExpenses,color:'#ef4444'},
              {label:'صافي الربح',val:pl.netProfit,color:pl.netProfit>=0?'#10b981':'#ef4444',bold:true,border:true},
            ].map(r=>(
              <div key={r.label} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderTop:r.border?'2px solid #334155':'1px solid #334155',marginTop:r.border?6:0}}>
                <span style={{fontSize:13,color:'#94a3b8'}}>{r.label}</span>
                <span style={{fontSize:13,color:r.color,fontWeight:r.bold?800:600}}>{r.val>=0?'+':''}{fmt(r.val)} ر.س</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{fontWeight:700,marginBottom:16,fontSize:15}}>📦 ملخص المخزون</div>
            {inv && <>
              <StatCard label="قيمة المخزون الكلية" value={`${fmt(inv.totalValue)} ر.س`} icon="💰" color="#3b82f6" />
              <div style={{marginTop:12}}><StatCard label="منتجات منخفضة المخزون" value={inv.lowStockCount} icon="⚠️" color="#ef4444" /></div>
              <div style={{marginTop:12,maxHeight:200,overflowY:'auto'}}>
                {inv.products?.filter(p=>p.lowStock).map(p=>(
                  <div key={p._id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #334155',fontSize:12}}>
                    <span style={{color:'#e2e8f0'}}>{p.name}</span>
                    <span style={{color:'#ef4444',fontWeight:700}}>{p.stock} متبقي (حد: {p.minStock})</span>
                  </div>
                ))}
              </div>
            </>}
          </Card>
        </div>
      )}
    </div>
  );
}
