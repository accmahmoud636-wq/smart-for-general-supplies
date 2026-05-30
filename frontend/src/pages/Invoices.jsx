import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Select, Modal, Table, PageHeader, StatCard, fmt, fmtDate, C_THEME as C } from '../components/UI';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = { pending:'#f59e0b', received:'#10b981', draft:'#64748b', partial:'#3b82f6', paid:'#10b981', shipped:'#6366f1', delivered:'#10b981', returned:'#ef4444', cancelled:'#ef4444' };
const STATUS_LABELS = { pending:'معلق', received:'مستلم', draft:'مسودة', partial:'جزئي', paid:'مدفوع', shipped:'مشحون', delivered:'تم التسليم', returned:'مرتجع', cancelled:'ملغي' };

// ═══════════════════════════════════════════════════════════
// PURCHASE INVOICES
// ═══════════════════════════════════════════════════════════
export function Purchases() {
  const { can } = useAuth();
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [suppliers, setSuppliers] = useState([]); const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ supplier:'', items:[], discount:0, shipping:0, paid:0, status:'pending', date:new Date().toISOString().slice(0,10), notes:'' });
  const [lines, setLines] = useState([{ product:'', qty:1, price:0 }]);

  const load = () => {
    api.get('/purchases').then(r=>setItems(r.data)).catch(()=>toast.error('خطأ'));
    api.get('/suppliers').then(r=>setSuppliers(r.data));
    api.get('/products').then(r=>setProducts(r.data));
  };
  useEffect(()=>{ load(); },[]);

  const addLine = () => setLines([...lines, { product:'', qty:1, price:0 }]);
  const updateLine = (i, key, val) => { const l=[...lines]; l[i]={...l[i],[key]:val}; if(key==='product'){ const p=products.find(x=>x._id===val); if(p) l[i].price=p.buyPrice; } setLines(l); };
  const removeLine = (i) => setLines(lines.filter((_,j)=>j!==i));

  const subtotal = lines.reduce((s,l)=>s+(l.qty*(l.price||0)),0);
  const total = subtotal - (Number(form.discount)||0) + (Number(form.shipping)||0);

  const save = async () => {
    if (!form.supplier) return toast.error('اختر المورد');
    if (lines.some(l=>!l.product)) return toast.error('اختر المنتج لكل سطر');
    try {
      const payload = { ...form, items: lines.map(l=>({ product:l.product, qty:Number(l.qty), price:Number(l.price), total:Number(l.qty)*Number(l.price) })), subtotal, total };
      await api.post('/purchases', payload);
      toast.success('تم إنشاء فاتورة الشراء وتحديث المخزون ✅');
      setModal(false); load();
    } catch(e){ toast.error(e.response?.data?.message||'خطأ'); }
  };

  const cols = [
    { key:'invoiceNo', title:'رقم الفاتورة', render:v=><span style={{fontFamily:'monospace',color:'#818cf8',fontWeight:700}}>{v}</span> },
    { key:'date', title:'التاريخ', render:v=>fmtDate(v) },
    { key:'supplier', title:'المورد', render:v=><span style={{fontWeight:600}}>{v?.name}</span> },
    { key:'items', title:'المنتجات', render:v=>`${v?.length} منتج` },
    { key:'total', title:'الإجمالي', render:v=><span style={{fontWeight:700}}>{fmt(v)} ر.س</span> },
    { key:'paid', title:'المدفوع', render:(v,r)=><span style={{color:v>=r.total?'#10b981':'#f59e0b',fontWeight:700}}>{fmt(v)} ر.س</span> },
    { key:'status', title:'الحالة', render:v=><Badge color={STATUS_COLORS[v]||'#64748b'}>{STATUS_LABELS[v]||v}</Badge> },
  ];

  const totalAmount = items.reduce((s,i)=>s+i.total,0);
  const totalPaid = items.reduce((s,i)=>s+i.paid,0);

  return (
    <div>
      <PageHeader title="فواتير الشراء" icon="🛒" actions={can('purchases') && [<Btn key="a" onClick={()=>{setLines([{product:'',qty:1,price:0}]);setForm({supplier:'',discount:0,shipping:0,paid:0,status:'pending',date:new Date().toISOString().slice(0,10),notes:''});setModal(true);}}>+ فاتورة شراء</Btn>]} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:16}}>
        <StatCard label="إجمالي المشتريات" value={`${fmt(totalAmount)} ر.س`} icon="🛒" color="#3b82f6" />
        <StatCard label="إجمالي المدفوع" value={`${fmt(totalPaid)} ر.س`} icon="✅" color="#10b981" />
        <StatCard label="المستحق للموردين" value={`${fmt(totalAmount-totalPaid)} ر.س`} icon="⏳" color="#f59e0b" />
      </div>
      <Card><Table columns={cols} data={items} /></Card>

      <Modal open={modal} onClose={()=>setModal(false)} title="فاتورة شراء جديدة" width={700}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
          <Select label="المورد" value={form.supplier} onChange={v=>setForm({...form,supplier:v})} required options={suppliers.map(s=>({value:s._id,label:s.name}))} />
          <Input label="التاريخ" type="date" value={form.date} onChange={v=>setForm({...form,date:v})} />
        </div>
        {/* Items */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,color:'#94a3b8',marginBottom:8,fontWeight:600}}>المنتجات</div>
          {lines.map((line,i)=>(
            <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
              <select value={line.product} onChange={e=>updateLine(i,'product',e.target.value)}
                style={{flex:2,background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 10px',color:'#e2e8f0',fontSize:13,outline:'none'}}>
                <option value="">-- المنتج --</option>
                {products.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
              <input type="number" value={line.qty} onChange={e=>updateLine(i,'qty',e.target.value)} placeholder="الكمية" min="1"
                style={{width:70,background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 10px',color:'#e2e8f0',fontSize:13,outline:'none'}} />
              <input type="number" value={line.price} onChange={e=>updateLine(i,'price',e.target.value)} placeholder="السعر"
                style={{width:90,background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 10px',color:'#e2e8f0',fontSize:13,outline:'none'}} />
              <span style={{minWidth:70,color:'#10b981',fontSize:12,fontWeight:700}}>{fmt(line.qty*line.price)} ر.س</span>
              {lines.length>1 && <button onClick={()=>removeLine(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:16}}>×</button>}
            </div>
          ))}
          <Btn size="sm" variant="ghost" onClick={addLine}>+ سطر</Btn>
        </div>
        {/* Totals */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 16px'}}>
          <Input label="خصم (ر.س)" type="number" value={form.discount} onChange={v=>setForm({...form,discount:v})} />
          <Input label="شحن (ر.س)" type="number" value={form.shipping} onChange={v=>setForm({...form,shipping:v})} />
          <Input label="المدفوع (ر.س)" type="number" value={form.paid} onChange={v=>setForm({...form,paid:v})} />
        </div>
        <div style={{background:'#0f172a',borderRadius:8,padding:12,marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:'#94a3b8',fontSize:13}}>الإجمالي النهائي</span>
          <span style={{color:'#10b981',fontWeight:800,fontSize:18}}>{fmt(total)} ر.س</span>
        </div>
        <Select label="الحالة" value={form.status} onChange={v=>setForm({...form,status:v})} options={[{value:'pending',label:'معلق'},{value:'received',label:'مستلم'},{value:'partial',label:'جزئي الدفع'},{value:'paid',label:'مدفوع'}]} />
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn variant="success" onClick={save}>💾 حفظ وتحديث المخزون</Btn></div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SALES INVOICES
// ═══════════════════════════════════════════════════════════
export function Sales() {
  const { can } = useAuth();
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [customers, setCustomers] = useState([]); const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ customer:'', platform:'amazon', amazonOrderId:'', discount:0, shipping:0, amazonFees:0, paid:0, status:'pending', date:new Date().toISOString().slice(0,10), notes:'' });
  const [lines, setLines] = useState([{ product:'', qty:1, price:0 }]);

  const load = () => {
    api.get('/sales').then(r=>setItems(r.data)).catch(()=>toast.error('خطأ'));
    api.get('/customers').then(r=>setCustomers(r.data));
    api.get('/products').then(r=>setProducts(r.data));
  };
  useEffect(()=>{ load(); },[]);

  const addLine = () => setLines([...lines, { product:'', qty:1, price:0 }]);
  const updateLine = (i, key, val) => { const l=[...lines]; l[i]={...l[i],[key]:val}; if(key==='product'){ const p=products.find(x=>x._id===val); if(p) l[i].price=p.sellPrice; } setLines(l); };
  const removeLine = (i) => setLines(lines.filter((_,j)=>j!==i));
  const subtotal = lines.reduce((s,l)=>s+(l.qty*(l.price||0)),0);
  const total = subtotal - (Number(form.discount)||0) + (Number(form.shipping)||0) - (Number(form.amazonFees)||0);

  const save = async () => {
    if (lines.some(l=>!l.product)) return toast.error('اختر المنتج لكل سطر');
    try {
      const payload = { ...form, items: lines.map(l=>({ product:l.product, qty:Number(l.qty), price:Number(l.price), total:Number(l.qty)*Number(l.price) })), subtotal, total };
      await api.post('/sales', payload);
      toast.success('تم إنشاء فاتورة المبيعات وخصم المخزون ✅');
      setModal(false); load();
    } catch(e){ toast.error(e.response?.data?.message||'خطأ'); }
  };

  const totalRevenue = items.reduce((s,i)=>s+i.total,0);
  const cols = [
    { key:'invoiceNo', title:'رقم الفاتورة', render:v=><span style={{fontFamily:'monospace',color:'#10b981',fontWeight:700}}>{v}</span> },
    { key:'date', title:'التاريخ', render:v=>fmtDate(v) },
    { key:'platform', title:'المنصة', render:v=><Badge color={v==='amazon'?'#f59e0b':'#6366f1'}>{v}</Badge> },
    { key:'amazonOrderId', title:'رقم Amazon' },
    { key:'total', title:'الإجمالي', render:v=><span style={{fontWeight:700,color:'#10b981'}}>{fmt(v)} ر.س</span> },
    { key:'status', title:'الحالة', render:v=><Badge color={STATUS_COLORS[v]||'#64748b'}>{STATUS_LABELS[v]||v}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="فواتير المبيعات" icon="💳" actions={can('sales') && [<Btn key="a" onClick={()=>{setLines([{product:'',qty:1,price:0}]);setForm({customer:'',platform:'amazon',amazonOrderId:'',discount:0,shipping:0,amazonFees:0,paid:0,status:'pending',date:new Date().toISOString().slice(0,10),notes:''});setModal(true);}}>+ فاتورة بيع</Btn>]} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:16}}>
        <StatCard label="إجمالي المبيعات" value={`${fmt(totalRevenue)} ر.س`} icon="💰" color="#10b981" />
        <StatCard label="عدد الفواتير" value={items.length} icon="📄" color="#6366f1" />
        <StatCard label="متوسط قيمة الطلب" value={`${fmt(items.length?totalRevenue/items.length:0)} ر.س`} icon="📊" color="#3b82f6" />
      </div>
      <Card><Table columns={cols} data={items} /></Card>

      <Modal open={modal} onClose={()=>setModal(false)} title="فاتورة مبيعات جديدة" width={700}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0 16px'}}>
          <Select label="العميل" value={form.customer} onChange={v=>setForm({...form,customer:v})} options={customers.map(c=>({value:c._id,label:c.name}))} />
          <Select label="المنصة" value={form.platform} onChange={v=>setForm({...form,platform:v})} options={[{value:'amazon',label:'Amazon'},{value:'website',label:'موقعنا'},{value:'manual',label:'يدوي'},{value:'other',label:'أخرى'}]} />
          <Input label="رقم الطلب Amazon" value={form.amazonOrderId} onChange={v=>setForm({...form,amazonOrderId:v})} />
        </div>
        {/* Items */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:12,color:'#94a3b8',marginBottom:8,fontWeight:600}}>المنتجات</div>
          {lines.map((line,i)=>(
            <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
              <select value={line.product} onChange={e=>updateLine(i,'product',e.target.value)}
                style={{flex:2,background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 10px',color:'#e2e8f0',fontSize:13,outline:'none'}}>
                <option value="">-- المنتج --</option>
                {products.map(p=><option key={p._id} value={p._id}>{p.name} (مخزون: {p.stock})</option>)}
              </select>
              <input type="number" value={line.qty} onChange={e=>updateLine(i,'qty',e.target.value)} placeholder="الكمية" min="1"
                style={{width:70,background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 10px',color:'#e2e8f0',fontSize:13,outline:'none'}} />
              <input type="number" value={line.price} onChange={e=>updateLine(i,'price',e.target.value)} placeholder="السعر"
                style={{width:90,background:'#0f172a',border:'1px solid #334155',borderRadius:8,padding:'8px 10px',color:'#e2e8f0',fontSize:13,outline:'none'}} />
              <span style={{minWidth:70,color:'#10b981',fontSize:12,fontWeight:700}}>{fmt(line.qty*line.price)} ر.س</span>
              {lines.length>1 && <button onClick={()=>removeLine(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:16}}>×</button>}
            </div>
          ))}
          <Btn size="sm" variant="ghost" onClick={addLine}>+ سطر</Btn>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'0 12px'}}>
          <Input label="خصم" type="number" value={form.discount} onChange={v=>setForm({...form,discount:v})} />
          <Input label="شحن" type="number" value={form.shipping} onChange={v=>setForm({...form,shipping:v})} />
          <Input label="رسوم Amazon" type="number" value={form.amazonFees} onChange={v=>setForm({...form,amazonFees:v})} />
          <Input label="المدفوع" type="number" value={form.paid} onChange={v=>setForm({...form,paid:v})} />
        </div>
        <div style={{background:'#0f172a',borderRadius:8,padding:12,marginBottom:14,display:'flex',justifyContent:'space-between'}}>
          <span style={{color:'#94a3b8',fontSize:13}}>الإجمالي النهائي</span>
          <span style={{color:'#10b981',fontWeight:800,fontSize:18}}>{fmt(total)} ر.س</span>
        </div>
        <Select label="الحالة" value={form.status} onChange={v=>setForm({...form,status:v})} options={[{value:'pending',label:'معلق'},{value:'shipped',label:'مشحون'},{value:'delivered',label:'تم التسليم'},{value:'cancelled',label:'ملغي'}]} />
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><Btn variant="ghost" onClick={()=>setModal(false)}>إلغاء</Btn><Btn variant="success" onClick={save}>💾 حفظ وخصم المخزون</Btn></div>
      </Modal>
    </div>
  );
}
