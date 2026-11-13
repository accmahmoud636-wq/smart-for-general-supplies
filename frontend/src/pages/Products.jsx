import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import KitModal from '../components/KitModal';
import ProductPicker from '../components/ProductPicker';
import api from '../utils/api';
import { Card, Btn, Badge, Input, Select, Modal, Table, PageHeader, fmt, C_THEME as C, THEME } from '../components/UI';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import LabelModal from '../components/LabelModal';
import CameraScanner from '../components/CameraScanner';

const CUR = THEME.currency || 'ج.م';

export default function Products() {
  const { can } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(null);
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const catFilter = params.get('category') || '';
  const setCat = (v) => { const p = new URLSearchParams(params); if (v) p.set('category', v); else p.delete('category'); setParams(p, { replace: true }); };
  const [form, setForm] = useState({ name:'', sku:'', asin:'', category:'', supplier:'', buyPrice:'', sellPrice:'', stock:'', minStock:'5', unit:'قطعة', description:'' });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [labels, setLabels] = useState(null); // { productId: copies }
  const [cam, setCam] = useState('');
  const [maps, setMaps] = useState([]);          // كل ربط SKU أمازون ← صنف
  const [skus, setSkus] = useState([]);          // SKUs الصنف المفتوح في الكارت
  const [skuInput, setSkuInput] = useState('');
  const [kitSku, setKitSku] = useState(null);
  const reloadMaps = () => api.get('/amazon/skus/maps').then(r => setMaps(r.data)).catch(() => {});
  const kitLabel = (sku) => { const m = maps.find(x => x.sku === sku); if (!m) return ''; const n = 1 + (m.components || []).length; return n > 1 ? ` · طقم ${n} أصناف` : m.qty > 1 ? ` · ×${m.qty}` : ''; };
  const [moveSkus, setMoveSkus] = useState([]);  // SKUs هتتنقل من صنف تاني // 'form' = يملى خانة الباركود، 'search' = يبحث

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/products'), api.get('/categories'), api.get('/suppliers'), api.get('/amazon/skus/maps').catch(() => ({ data: [] }))])
      .then(([p, c, s, m]) => { setProducts(p.data); setCategories(c.data); setSuppliers(s.data); setMaps(m.data); })
      .catch(() => toast.error('خطأ في التحميل'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter(p => !catFilter || (catFilter === 'none' ? !p.category : (p.category?._id || p.category) === catFilter)).filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.asin?.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || maps.some(m => m.product === p._id && m.sku.toLowerCase().includes(search.toLowerCase())));

  const skusOf = (id) => maps.filter(m => m.product === id).map(m => m.sku);
  const nameOf = (id) => products.find(p => p._id === id)?.name || 'صنف آخر';

  const addSku = () => {
    const v = skuInput.trim();
    if (!v) return;
    if (skus.some(x => x.toLowerCase() === v.toLowerCase())) { toast.error('موجود بالفعل'); return; }
    const other = maps.find(m => m.sku.toLowerCase() === v.toLowerCase() && m.product !== editing);
    if (other && !confirm(`رمز SKU «${v}» مرتبط بالصنف «${nameOf(other.product)}». هل تريد نقله إلى هذا الصنف؟`)) return;
    if (other) setMoveSkus(x => [...x, v]);
    setSkus(x => [...x, v]); setSkuInput('');
  };

  // يطبّق الفرق بين SKUs الكارت والمحفوظ
  const syncSkus = async (productId) => {
    const before = skusOf(productId);
    const added = skus.filter(x => !before.includes(x));
    const removed = before.filter(x => !skus.includes(x));
    for (const sku of added) await api.post('/amazon/skus/map', { sku, product: productId, force: moveSkus.includes(sku) });
    for (const sku of removed) await api.delete(`/amazon/skus/map/${encodeURIComponent(sku)}`);
  };

  const openNew = () => { setSkus([]); setSkuInput(''); setMoveSkus([]); setEditing(null); setForm({ name:'', sku:'', asin:'', barcode:'', category:'', supplier:'', buyPrice:'', sellPrice:'', stock:'0', minStock:'5', unit:'قطعة', description:'', isKit:false, components:[] }); setModal(true); };
  const openEdit = (p) => { setSkus(skusOf(p._id)); setSkuInput(''); setMoveSkus([]); setEditing(p._id); setForm({ name:p.name, sku:p.sku||'', asin:p.asin||'', barcode:p.barcode||'', category:p.category?._id||'', supplier:p.supplier?._id||'', buyPrice:p.buyPrice, sellPrice:p.sellPrice, stock:p.stock, minStock:p.minStock, unit:p.unit, description:p.description||'', isKit:!!p.isKit, components:(p.components||[]).map(c => ({ product: String(c.product?._id || c.product), qty: c.qty || 1 })) }); setModal(true); };

  const save = async () => {
    try {
      let id = editing;
      if (editing) await api.put(`/products/${editing}`, form);
      else id = (await api.post('/products', form)).data._id;
      await syncSkus(id);
      toast.success(editing ? 'تم التحديث' : 'تمت الإضافة');
      setModal(false); load();
    } catch(e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };

  const newBarcode = async () => {
    try { const r = await api.get('/products/barcodes/new'); setForm(f => ({ ...f, barcode: r.data.barcode })); }
    catch { toast.error('خطأ'); }
  };

  const generateAll = async () => {
    if (!confirm('توليد باركود لجميع الأصناف التي لا تملك باركود؟')) return;
    try { const r = await api.post('/products/barcodes/generate'); toast.success(r.data.message); load(); }
    catch(e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };

  const adjust = async () => {
    try {
      await api.post(`/products/${adjustModal._id}/adjust`, { qty: Number(adjustQty), reason: adjustReason });
      toast.success('تمت التسوية');
      setAdjustModal(null); setAdjustQty(''); setAdjustReason(''); load();
    } catch(e) { toast.error(e.response?.data?.message || 'خطأ'); }
  };

  const columns = [
    { key: 'name', title: 'المنتج', render: (v, r) => <div><div style={{ fontWeight: 600 }}>{r.isKit && <span title={(r.components || []).map(c => `${c.qty} × ${c.name}`).join('\n')} style={{ fontSize: 11, color: '#a78bfa', border: '1px solid #8b5cf666', borderRadius: 10, padding: '1px 7px', marginLeft: 6 }}>📦 مركب من {(r.components || []).length}</span>}{v}</div><div style={{ fontSize: 11, color: 'var(--muted)', direction: 'ltr', textAlign: 'right' }}>{[r.sku, r.asin].filter(Boolean).join(' · ')}</div>{r.barcode && <div style={{ fontSize: 11, color: '#818cf8', fontFamily: 'monospace' }}>▮▯▮ {r.barcode}</div>}{skusOf(r._id).length > 0 && <div title={skusOf(r._id).join('\n')} style={{ fontSize: 11, color: '#f59e0b' }}>🔗 {skusOf(r._id).length} إعلان أمازون</div>}</div> },
    { key: 'category', title: 'الفئة', render: (v) => v ? <Badge color={v.color || '#6366f1'}>{v.name}</Badge> : '—' },
    { key: 'buyPrice', title: 'سعر الشراء', render: v => `${fmt(v)} ${CUR}` },
    { key: 'sellPrice', title: 'سعر البيع', render: v => `${fmt(v)} ${CUR}` },
    { key: 'stock', title: 'المخزون', render: (v, r) => <span style={{ color: v <= r.minStock ? '#ef4444' : '#10b981', fontWeight: 700 }}>{v} {r.unit}{v <= r.minStock ? ' ⚠️' : ''}</span> },
    { key: 'buyPrice', title: 'قيمة المخزون', render: (v, r) => `${fmt(v * r.stock)} ${CUR}` },
    { key: '_id', title: 'إجراءات', render: (_, r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        {can('products') && <Btn size="sm" variant="ghost" onClick={() => openEdit(r)}>✏️</Btn>}
        <Btn size="sm" variant="ghost" onClick={() => setLabels({ [r._id]: 1 })}>🏷️</Btn>
        {can('stock') && !r.isKit && <Btn size="sm" variant="warning" onClick={() => { setAdjustModal(r); setAdjustQty(''); setAdjustReason(''); }}>📦</Btn>}
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader title="المنتجات" icon="📦" actions={[
        can('products') && <Btn key="imp" variant="ghost" onClick={() => window.location.assign('/settings?tab=data')}>استيراد من Excel</Btn>,
        <Btn key="lbl" variant="ghost" onClick={() => setLabels({})}>طباعة الباركود</Btn>,
        can('products') && <Btn key="gen" variant="ghost" onClick={generateAll}>توليد الباركود</Btn>,
        can('products') && <Btn key="add" onClick={openNew}>+ إضافة منتج</Btn>
      ]} />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو SKU أو ASIN أو الباركود"
            style={{ flex: 1, minWidth: 200, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
          <Btn variant="ghost" onClick={() => setCam('search')}>📷</Btn>
          <select value={catFilter} onChange={e => setCat(e.target.value)} style={{ background: 'var(--bg)', border: `1px solid ${catFilter ? '#6366f1' : 'var(--border)'}`, borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
            <option value="">كل الفئات</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
            <option value="none">بدون فئة</option>
          </select>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{filtered.length} منتج</div>
          <div style={{ fontSize: 13, color: '#ef4444' }}>{filtered.filter(p => p.stock <= p.minStock).length} تحت حد الطلب</div>
        </div>
      </Card>

      <Card>
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>جارٍ التحميل...</div> : <Table columns={columns} data={filtered} />}
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'تعديل منتج' : 'إضافة منتج جديد'} width={600}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={{ gridColumn: '1/-1' }}><Input label="اسم المنتج" value={form.name} onChange={v => setForm({...form,name:v})} required /></div>
          <Input label="SKU" value={form.sku} onChange={v => setForm({...form,sku:v})} placeholder="EL-001" />
          <Input label="Amazon ASIN" value={form.asin} onChange={v => setForm({...form,asin:v})} placeholder="B08XXXXX" />
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><Input label="الباركود (يُولَّد تلقائياً عند تركه فارغاً، أو امسح باركود المصنّع)" value={form.barcode} onChange={v => setForm({...form,barcode:v})} placeholder="200000000001X" /></div>
            <div style={{ marginBottom: 14, display: 'flex', gap: 6 }}><Btn variant="ghost" onClick={() => setCam('form')}>📷</Btn><Btn variant="ghost" onClick={newBarcode}>توليد</Btn></div>
          </div>
          <div style={{ gridColumn: '1/-1', marginBottom: 14, padding: 12, border: '1px dashed var(--border)', borderRadius: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginBottom: 6, fontWeight: 600 }}>رموز SKU لإعلانات أمازون الخاصة بهذا الصنف</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {form.sku && <Badge color="#64748b">{form.sku} (الرمز الأساسي)</Badge>}
              {skus.map(x => (
                <span key={x} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f59e0b22', color: '#fbbf24', border: '1px solid #f59e0b44', borderRadius: 20, padding: '3px 6px 3px 10px', fontSize: 12, fontFamily: 'monospace' }}>
                  {x}{moveSkus.includes(x) && ' ↩'}<span style={{ color: '#a78bfa', fontFamily: 'inherit' }}>{kitLabel(x)}</span>
                  {maps.some(m => m.sku === x && m.product === editing) && <button onClick={() => setKitSku(x)} title="محتوى الإعلان (كام قطعة / أصناف تانية معاه)" style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>⚙</button>}
                  <button onClick={() => setSkus(skus.filter(y => y !== x))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {!skus.length && !form.sku && <span style={{ fontSize: 12, color: 'var(--muted)' }}>لا توجد رموز مضافة</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={skuInput} onChange={e => setSkuInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSku(); } }} placeholder="أدخل رمز SKU ثم اضغط Enter"
                style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', direction: 'ltr' }} />
              <Btn variant="ghost" onClick={addSku}>+ إضافة</Btn>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><Select label="الفئة" value={form.category} onChange={v => setForm({...form,category:v})} options={categories.map(c => ({ value: c._id, label: c.name }))} /></div>
            {can('categories') && <div style={{ marginBottom: 14 }}><Btn variant="ghost" onClick={async () => {
              const name = prompt('اسم الفئة الجديدة:');
              if (!name?.trim()) return;
              try { const { data } = await api.post('/categories', { name: name.trim() }); setCategories(c => [...c, data]); setForm(f => ({ ...f, category: data._id })); toast.success('تمت إضافة الفئة'); }
              catch (e) { toast.error(e.response?.data?.message || 'خطأ'); }
            }}>+ فئة</Btn></div>}
          </div>
          <Select label="المورد" value={form.supplier} onChange={v => setForm({...form,supplier:v})} options={suppliers.map(s => ({ value: s._id, label: s.name }))} />
          <Input label={`سعر الشراء (${CUR})`} type="number" value={form.buyPrice} onChange={v => setForm({...form,buyPrice:v})} required />
          <Input label={`سعر البيع (${CUR})`} type="number" value={form.sellPrice} onChange={v => setForm({...form,sellPrice:v})} required />
          {!editing && !form.isKit && <Input label="الكمية الابتدائية" type="number" value={form.stock} onChange={v => setForm({...form,stock:v})} />}
          <Input label="حد التنبيه (مخزون منخفض)" type="number" value={form.minStock} onChange={v => setForm({...form,minStock:v})} />
          <Input label="الوحدة" value={form.unit} onChange={v => setForm({...form,unit:v})} />
        </div>

        {/* صنف مركب: لما يخرج بتخرج مكوناته */}
        <div style={{ border: `1px dashed ${form.isKit ? '#8b5cf6' : 'var(--border)'}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
            <input type="checkbox" checked={!!form.isKit} onChange={e => setForm({ ...form, isKit: e.target.checked, components: e.target.checked && !form.components?.length ? [{ product: '', qty: 1 }] : form.components })} />
            صنف مركب (طقم من أكتر من صنف)
          </label>
          {form.isKit && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 8 }}>لما الصنف ده يخرج في شحنة، بتخرج القطع دي من المخزون. رصيده بيتحسب من رصيد مكوناته.</div>
              {form.components.map((c, i) => {
                const cp = products.find(p => p._id === c.product);
                const setC = (patch) => setForm(f => ({ ...f, components: f.components.map((x, k) => k === i ? { ...x, ...patch } : x) }));
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ width: 70, fontSize: 12, color: 'var(--sub)', fontWeight: 700 }}>القطعة {i + 1}</span>
                    {cp
                      ? <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid #8b5cf666', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
                          <span style={{ flex: 1 }}>{cp.name} <span style={{ fontSize: 11, color: 'var(--muted)' }}>· الرصيد {cp.stock}</span></span>
                          <button type="button" onClick={() => setC({ product: '' })} title="تغيير" style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: 12 }}>تغيير</button>
                        </div>
                      : <div style={{ flex: 1, minWidth: 200 }}><ProductPicker products={products.filter(p => !p.isKit && p._id !== editing && !form.components.some(x => x.product === p._id))} onSelect={(id) => setC({ product: id })} width="100%" placeholder="ابحث عن الصنف..." /></div>}
                    <span style={{ fontSize: 12, color: 'var(--sub)' }}>الكمية</span>
                    <input type="number" min="1" value={c.qty} onChange={e => setC({ qty: Math.max(1, Math.round(+e.target.value || 1)) })} style={{ width: 56, textAlign: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px', color: 'var(--text)', fontWeight: 700 }} />
                    <button type="button" onClick={() => setForm(f => ({ ...f, components: f.components.filter((_, k) => k !== i) }))} title="حذف القطعة" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 15 }}>✕</button>
                  </div>
                );
              })}
              {form.components.length < 6 && <Btn size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, components: [...f.components, { product: '', qty: 1 }] }))}>+ إضافة قطعة ({form.components.length}/6)</Btn>}
              {(() => {
                const ok = form.components.filter(c => c.product).map(c => ({ ...c, p: products.find(p => p._id === c.product) })).filter(c => c.p);
                if (!ok.length) return null;
                const cost = ok.reduce((t, c) => t + (c.p.buyPrice || 0) * c.qty, 0);
                const avail = Math.min(...ok.map(c => Math.floor(c.p.stock / c.qty)));
                return <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sub)', background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                  تكلفة الطقم: <b>{fmt(cost)} {CUR}</b> · المتاح منه حالياً: <b style={{ color: avail > 0 ? '#10b981' : '#f87171' }}>{Math.max(0, avail)}</b>
                  {Number(form.buyPrice) !== Math.round(cost * 100) / 100 && <button type="button" onClick={() => setForm(f => ({ ...f, buyPrice: Math.round(cost * 100) / 100 }))} style={{ marginRight: 8, background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>استخدمها كسعر شراء</button>}
                </div>;
              })()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>إلغاء</Btn>
          <Btn onClick={save}>حفظ</Btn>
        </div>
      </Modal>

      <CameraScanner open={!!cam} onClose={() => setCam('')} title={cam === 'form' ? 'مسح باركود المصنّع' : 'البحث بالباركود'}
        onScan={code => { if (cam === 'form') setForm(f => ({ ...f, barcode: code })); else setSearch(code); }} />
      <KitModal open={!!kitSku} onClose={() => setKitSku(null)} sku={kitSku} products={products} onSaved={reloadMaps}
        map={kitSku && (maps.find(m => m.sku === kitSku) || { product: editing, qty: 1, components: [] })} />
      <LabelModal open={!!labels} onClose={() => setLabels(null)} products={products} maps={maps} initial={labels || {}} />

      {/* Adjust Stock Modal */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={`تسوية مخزون: ${adjustModal?.name}`} width={400}>
        <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--muted)' }}>المخزون الحالي: </span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>{adjustModal?.stock} {adjustModal?.unit}</span>
        </div>
        <Input label="الكمية (موجبة للإضافة، سالبة للخصم)" type="number" value={adjustQty} onChange={setAdjustQty} placeholder="مثال: +10 أو -5" />
        <Input label="السبب" value={adjustReason} onChange={setAdjustReason} placeholder="جرد، تلف، هدية..." />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setAdjustModal(null)}>إلغاء</Btn>
          <Btn variant="warning" onClick={adjust}>تطبيق التسوية</Btn>
        </div>
      </Modal>
    </div>
  );
}
