import { useState, useRef, useEffect } from 'react';
import api from '../utils/api';
import { Card, Btn, Badge, PageHeader, C_THEME as C } from '../components/UI';
import { beep } from '../utils/barcode';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const REASONS = ['بيع مباشر', 'تالف', 'عينة / هدية', 'تحويل لمخزن تاني', 'أخرى'];

const bigInput = (color) => ({
  width: '100%', background: '#0f172a', border: `2px solid ${color}`, borderRadius: 10, padding: '14px 16px',
  color: '#fff', fontSize: 20, outline: 'none', fontFamily: 'monospace', direction: 'ltr', textAlign: 'center'
});

export default function ScanOut() {
  const { can } = useAuth();
  const canAmazon = can('amazon'), canManual = can('stock');
  const [mode, setMode] = useState(canAmazon ? 'amazon' : 'manual');
  const [flash, setFlash] = useState(null); // { ok, text }

  const say = (ok, text) => { beep(ok); setFlash({ ok, text }); if (!ok) toast.error(text); };

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="خروج بضاعة بالاسكانر" icon="📤" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {canAmazon && <ModeBtn on={mode === 'amazon'} onClick={() => { setMode('amazon'); setFlash(null); }}>🛒 طلب أمازون</ModeBtn>}
        {canManual && <ModeBtn on={mode === 'manual'} onClick={() => { setMode('manual'); setFlash(null); }}>📦 صرف يدوي</ModeBtn>}
      </div>
      {flash && (
        <div style={{ padding: '12px 16px', borderRadius: 10, marginBottom: 14, fontWeight: 700, fontSize: 15, background: flash.ok ? '#10b98122' : '#ef444422', border: `1px solid ${flash.ok ? '#10b981' : '#ef4444'}`, color: flash.ok ? '#34d399' : '#f87171' }}>
          {flash.text}
        </div>
      )}
      {mode === 'amazon' ? <AmazonMode say={say} /> : <ManualMode say={say} />}
    </div>
  );
}

const ModeBtn = ({ on, onClick, children }) => (
  <button onClick={onClick} style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700, background: on ? '#6366f122' : 'transparent', border: `2px solid ${on ? '#6366f1' : C.border}`, color: on ? '#a5b4fc' : C.sub }}>{children}</button>
);

// يرجع المنتج من الباركود
async function lookup(code) {
  const r = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
  return r.data;
}

// ═══ طلب أمازون: امسح رقم الطلب ← امسح الأصناف ← تأكيد ═════════
function AmazonMode({ say }) {
  const [order, setOrder] = useState(null);
  const [scanned, setScannedState] = useState({}); // productId → qty
  const scannedRef = useRef({});   // نسخة فورية عشان المسح السريع ورا بعض
  const setScanned = (v) => { scannedRef.current = v; setScannedState(v); };
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, [order]);

  // المطلوب لكل منتج
  const need = {};
  const names = {};
  (order?.lines || []).filter(l => l.stage !== 'cancelled').forEach(l => {
    if (l.product) { need[l.product._id] = (need[l.product._id] || 0) + l.qty; names[l.product._id] = l.product.name; }
  });
  const unmapped = (order?.lines || []).filter(l => !l.product && l.stage !== 'cancelled');
  const complete = order && !unmapped.length && Object.keys(need).length > 0 &&
    Object.keys({ ...need, ...scanned }).every(id => (need[id] || 0) === (scanned[id] || 0));

  const onEnter = async () => {
    const v = code.trim(); setCode('');
    if (!v) { if (complete) confirmOut(); return; }      // Enter على فاضي = تأكيد لو مكتمل
    if (!order) {
      try {
        const r = await api.get(`/scan/order/${encodeURIComponent(v)}`);
        if (r.data.posted) { say(false, '⚠️ الطلب ده خرج قبل كده'); return; }
        setOrder(r.data); setScanned({});
        say(true, `طلب ${v} — امسح الأصناف`);
      } catch (e) { say(false, e.response?.data?.message || 'خطأ'); }
      return;
    }
    try {
      const p = await lookup(v);
      const id = p._id;
      if (!need[id]) { say(false, `❌ ${p.name} مش في الطلب ده`); return; }
      const cur = scannedRef.current;
      if ((cur[id] || 0) >= need[id]) { say(false, `❌ ${p.name} — مسحت الكمية كاملة (${need[id]}) خلاص`); return; }
      const n = { ...cur, [id]: (cur[id] || 0) + 1 };
      setScanned(n);
      say(true, `✓ ${p.name} (${n[id]}/${need[id]})`);
    } catch (e) { say(false, e.response?.data?.message || 'باركود غير معروف'); }
  };

  const confirmOut = async () => {
    setBusy(true);
    try {
      const r = await api.post('/scan/issue/amazon', { orderId: order.orderId, scanned });
      say(true, r.data.message);
      setOrder(null); setScanned({});
    } catch (e) { say(false, e.response?.data?.message || 'خطأ'); }
    setBusy(false);
  };

  return (
    <Card>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
        {!order ? '1️⃣ امسح أو اكتب رقم طلب أمازون (من الـ Packing Slip) واضغط Enter' : '2️⃣ امسح باركود كل قطعة — لما يكتمل اضغط Enter أو زرار التأكيد'}
      </div>
      <input ref={ref} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && onEnter()}
        placeholder={order ? 'امسح باركود المنتج' : '402-1234567-1234567'} style={bigInput(order ? '#6366f1' : '#f59e0b')} autoFocus />

      {order && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 10px' }}>
          <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>{order.orderId}</span>
          <Btn size="sm" variant="ghost" onClick={() => { setOrder(null); setScanned({}); }}>✖ طلب تاني</Btn>
        </div>
        {unmapped.length > 0 && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 10 }}>⚠️ SKU غير مربوط بمنتج: {unmapped.map(u => u.sku).join('، ')} — اربطه من مركز أمازون ← ربط SKU</div>}
        {Object.entries(need).map(([id, q]) => {
          const s = scanned[id] || 0;
          const done = s === q;
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, marginBottom: 6, background: done ? '#10b98118' : '#0f172a', border: `1px solid ${done ? '#10b98155' : C.border}` }}>
              <span style={{ fontSize: 20 }}>{done ? '✅' : '⬜'}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{names[id]}</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: done ? '#34d399' : '#fbbf24' }}>{s} / {q}</span>
              {s > 0 && <Btn size="sm" variant="ghost" onClick={() => setScanned({ ...scanned, [id]: s - 1 })}>−1</Btn>}
            </div>
          );
        })}
        <Btn size="lg" variant="success" style={{ width: '100%', marginTop: 12 }} disabled={!complete || busy} onClick={confirmOut}>
          {busy ? '⏳...' : complete ? '📤 تأكيد خروج الطلب (فاتورة + خصم مخزون)' : 'لسه الأصناف مش مكتملة'}
        </Btn>
      </>}
    </Card>
  );
}

// ═══ صرف يدوي: امسح الأصناف ← اختار السبب ← تأكيد ═══════════════
function ManualMode({ say }) {
  const [items, setItems] = useState([]); // { product, qty }
  const [code, setCode] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);

  const onEnter = async () => {
    const v = code.trim(); setCode('');
    if (!v) return;
    try {
      const p = await lookup(v);
      setItems(list => {
        const i = list.findIndex(x => x.product._id === p._id);
        if (i >= 0) { const n = [...list]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
        return [{ product: p, qty: 1 }, ...list];
      });
      say(true, `✓ ${p.name}`);
    } catch (e) { say(false, e.response?.data?.message || 'باركود غير معروف'); }
  };

  const setQty = (id, q) => setItems(list => list.map(x => x.product._id === id ? { ...x, qty: Math.max(0, q) } : x).filter(x => x.qty > 0));
  const total = items.reduce((s, x) => s + x.qty, 0);
  const over = items.filter(x => x.qty > x.product.stock);

  const confirmOut = async () => {
    if (!items.length) return;
    setBusy(true);
    try {
      const r = await api.post('/scan/issue/manual', { reason, items: items.map(x => ({ product: x.product._id, qty: x.qty })) });
      say(true, r.data.message);
      setItems([]);
      ref.current?.focus();
    } catch (e) { say(false, e.response?.data?.message || 'خطأ'); }
    setBusy(false);
  };

  return (
    <Card>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>امسح باركود القطع — كل مسحة = قطعة</div>
      <input ref={ref} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && onEnter()} placeholder="امسح باركود المنتج" style={bigInput('#6366f1')} />

      <div style={{ marginTop: 14 }}>
        {items.map(x => (
          <div key={x.product._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 6, background: '#0f172a', border: `1px solid ${x.qty > x.product.stock ? '#ef444466' : C.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{x.product.name}</div>
              <div style={{ fontSize: 11, color: x.qty > x.product.stock ? '#f87171' : C.muted }}>المتاح: {x.product.stock}</div>
            </div>
            <Btn size="sm" variant="ghost" onClick={() => setQty(x.product._id, x.qty - 1)}>−</Btn>
            <input type="number" value={x.qty} onChange={e => setQty(x.product._id, +e.target.value)} style={{ width: 70, textAlign: 'center', background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 6, padding: 6, color: '#fff', fontSize: 16, fontWeight: 700 }} />
            <Btn size="sm" variant="ghost" onClick={() => setQty(x.product._id, x.qty + 1)}>+</Btn>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ background: '#0f172a', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14 }}>
            {REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
          <Badge color="#6366f1">{items.length} صنف — {total} قطعة</Badge>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" onClick={() => setItems([])}>مسح القائمة</Btn>
          <Btn size="lg" variant="success" disabled={busy || over.length > 0} onClick={confirmOut}>{busy ? '⏳...' : over.length ? 'كمية أكبر من المخزون' : '📤 تأكيد الصرف'}</Btn>
        </div>
      )}
    </Card>
  );
}
