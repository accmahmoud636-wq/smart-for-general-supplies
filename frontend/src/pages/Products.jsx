import { useState, useEffect } from 'react';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Select, Modal, Table, PageHeader, fmt, C_THEME as C } from '../components/UI';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Products() {
  const { can } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name:'', sku:'', asin:'', category:'', supplier:'', buyPrice:'', sellPrice:'', stock:'', minStock:'5', unit:'قطعة', description:'' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/products'), api.get('/categories'), api.get('/suppliers')])
      .then(([p, c, s]) => { setProducts(p.data); setCategories(c.data); setSuppliers(s.data); })
      .catch(() => toast.error('خطأ في التحميل'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.asin?.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditing(null); setForm({ name:'', sku:'', asin:'', category:'', supplier:'', buyPrice:'', sellPrice:'', stock:'0', minStock:'5', unit:'قطعة', description:'' }); setModal(true); };
  const openEdit = (p) => { setEditing(p._id); setForm({ name:p.name, sku:p.sku||'', asin:p.asin||'', category:p.category?._id||'', supplier:p.supplier?._id||'', buyPrice:p.buyPrice, sellPrice:p.sellPrice, stock:p.stock, minStock:p.minStock, unit:p.unit, description:p.description||'' }); setModal(true); };

  const save = async () => {
    try {
      if (editing) await api.put(`/products/${editing}`, form);
      else await api.post('/products', form);
      toast.success(editing ? 'تم التحديث' : 'تم الإضافة');
      setModal(false); load();
    } catch(e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };

  const adjust = async () => {
    try {
      await api.post(`/products/${adjustModal._id}/adjust`, { qty: Number(adjustQty), reason: adjustReason });
      toast.success('تم التسوية');
      setAdjustModal(null); setAdjustQty(''); setAdjustReason(''); load();
    } catch(e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };

  const columns = [
    { key: 'name', title: 'المنتج', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: '#64748b' }}>{r.sku} · {r.asin}</div></div> },
    { key: 'category', title: 'الفئة', render: (v) => v ? <Badge color={v.color || '#6366f1'}>{v.name}</Badge> : '—' },
    { key: 'buyPrice', title: 'سعر الشراء', render: v => `${fmt(v)} ر.س` },
    { key: 'sellPrice', title: 'سعر البيع', render: v => `${fmt(v)} ر.س` },
    { key: 'stock', title: 'المخزون', render: (v, r) => <span style={{ color: v <= r.minStock ? '#ef4444' : '#10b981', fontWeight: 700 }}>{v} {r.unit}{v <= r.minStock ? ' ⚠️' : ''}</span> },
    { key: 'buyPrice', title: 'قيمة المخزون', render: (v, r) => `${fmt(v * r.stock)} ر.س` },
    { key: '_id', title: 'إجراءات', render: (_, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        {can('products') && <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>✏️</Btn>}
        {can('stock') && <Btn size="sm" variant="warning" onClick={() => { setAdjustModal(r); setAdjustQty(''); setAdjustReason(''); }}>📦</Btn>}
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader title="المنتجات" icon="📦" actions={can('products') && [<Btn key="add" onClick={openNew}>+ إضافة منتج</Btn>]} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 بحث بالاسم، SKU، ASIN..."
            style={{ flex: 1, minWidth: 200, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 14, outline: 'none' }} />
          <div style={{ fontSize: 13, color: '#64748b' }}>{filtered.length} منتج</div>
          <div style={{ fontSize: 13, color: '#ef4444' }}>{filtered.filter(p => p.stock <= p.minStock).length} منخفض المخزون</div>
        </div>
      </Card>

      <Card>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>تحميل...</div> : <Table columns={columns} data={filtered} />}
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل منتج' : 'إضافة منتج جديد'} width={600}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={{ gridColumn: '1/-1' }}><Input label="اسم المنتج" value={form.name} onChange={v => setForm({...form,name:v})} required /></div>
          <Input label="SKU" value={form.sku} onChange={v => setForm({...form,sku:v})} placeholder="EL-001" />
          <Input label="Amazon ASIN" value={form.asin} onChange={v => setForm({...form,asin:v})} placeholder="B08XXXXX" />
          <Select label="الفئة" value={form.category} onChange={v => setForm({...form,category:v})} options={categories.map(c => ({ value: c._id, label: c.name }))} />
          <Select label="المورد" value={form.supplier} onChange={v => setForm({...form,supplier:v})} options={suppliers.map(s => ({ value: s._id, label: s.name }))} />
          <Input label="سعر الشراء (ر.س)" type="number" value={form.buyPrice} onChange={v => setForm({...form,buyPrice:v})} required />
          <Input label="سعر البيع (ر.س)" type="number" value={form.sellPrice} onChange={v => setForm({...form,sellPrice:v})} required />
          {!editing && <Input label="الكمية الابتدائية" type="number" value={form.stock} onChange={v => setForm({...form,stock:v})} />}
          <Input label="حد التنبيه (مخزون منخفض)" type="number" value={form.minStock} onChange={v => setForm({...form,minStock:v})} />
          <Input label="الوحدة" value={form.unit} onChange={v => setForm({...form,unit:v})} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>إلغاء</Btn>
          <Btn onClick={save}>💾 حفظ</Btn>
        </div>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={`تسوية مخزون: ${adjustModal?.name}`} width={400}>
        <div style={{ marginBottom: 12, padding: 12, background: '#0f172a', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: '#64748b' }}>المخزون الحالي: </span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>{adjustModal?.stock} {adjustModal?.unit}</span>
        </div>
        <Input label="الكمية (موجبة للإضافة، سالبة للخصم)" type="number" value={adjustQty} onChange={setAdjustQty} placeholder="مثال: +10 أو -5" />
        <Input label="السبب" value={adjustReason} onChange={setAdjustReason} placeholder="جرد، تلف، هدية..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setAdjustModal(null)}>إلغاء</Btn>
          <Btn variant="warning" onClick={adjust}>📦 تطبيق التسوية</Btn>
        </div>
      </Modal>
    </div>
  );
}
