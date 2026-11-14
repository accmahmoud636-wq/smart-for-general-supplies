import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { C_THEME as C } from './UI';

// ═══ المساعد الذكي — زرار عائم + نافذة شات في كل الصفحات ═══════════
const KEY = 'erp_assistant_chat';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } };
const err = (e) => e.response?.data?.message || e.message || 'خطأ';
const EXAMPLES = ['اشتريت 20 كنكة موكا بسعر 150 من المورد أحمد', 'ما الرصيد المتبقي من مخدة الظهر؟', 'ما الأصناف التي أوشكت على النفاد؟', 'غيّر سعر بيع لمبة الأظافر لـ 165', 'سجّل مصروف 200 جنيه شنط تغليف'];

export default function Assistant() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const saved = load();
  const [msgs, setMsgs] = useState(saved?.msgs || []);         // ما يظهر: { role, text, actions? }
  const [history, setHistory] = useState(saved?.history || []); // صيغة الـ API
  const [notes, setNotes] = useState(saved?.notes || []);       // نتائج التأكيد تتبعت مع الرسالة الجاية
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(null);
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  const end = useRef();
  const input = useRef();

  useEffect(() => { api.get('/assistant/status').then(r => setEnabled(r.data.enabled)).catch(() => {}); }, []);
  useEffect(() => { const f = () => setMobile(window.innerWidth < 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ msgs: msgs.slice(-60), history, notes })); } catch { /* */ } }, [msgs, history, notes]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy, open]);
  useEffect(() => { if (open && !mobile) input.current?.focus(); }, [open]);

  if (!enabled) return null;

  const send = async (t = text) => {
    const m = t.trim();
    if (!m || busy) return;
    setText(''); setBusy(true);
    setMsgs(x => [...x, { role: 'user', text: m }]);
    try {
      const message = notes.length ? `[تحديث: ${notes.join(' | ')}]\n${m}` : m;
      const { data } = await api.post('/assistant/chat', { message, history });
      setNotes([]);
      setHistory(data.history);
      setMsgs(x => [...x, { role: 'assistant', text: data.reply, actions: data.actions }]);
    } catch (e) { setMsgs(x => [...x, { role: 'error', text: err(e) }]); }
    setBusy(false);
  };

  const decide = async (mi, ai, op) => {
    const a = msgs[mi].actions[ai];
    const setA = (patch) => setMsgs(x => x.map((m, i) => i !== mi ? m : { ...m, actions: m.actions.map((y, j) => j !== ai ? y : { ...y, ...patch }) }));
    setA({ busy: true });
    try {
      const { data } = await api.post(`/assistant/actions/${a._id}/${op}`);
      setA({ busy: false, status: data.status, result: data.message });
      setNotes(n => [...n, `${a.title}: ${op === 'confirm' ? 'نُفّذت — ' + data.message : 'ألغاها المستخدم'}`]);
      if (op === 'confirm') toast.success(data.message);
    } catch (e) {
      setA({ busy: false, status: e.response?.data?.status || a.status, result: err(e) });
      toast.error(err(e));
    }
  };

  const mic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('المتصفح لا يدعم الإدخال الصوتي — استخدم Chrome'); return; }
    if (rec) { rec.stop(); return; }
    const r = new SR();
    r.lang = 'ar-EG'; r.interimResults = true; r.continuous = false;
    const base = text ? text + ' ' : '';
    r.onresult = (e) => setText(base + [...e.results].map(x => x[0].transcript).join(''));
    r.onend = () => setRec(null);
    r.onerror = () => setRec(null);
    r.start(); setRec(r);
  };

  const clear = () => { setMsgs([]); setHistory([]); setNotes([]); };

  const panel = mobile
    ? { position: 'fixed', inset: 0, zIndex: 1500 }
    : { position: 'fixed', bottom: 88, left: 20, width: 400, height: 'min(620px, calc(100vh - 120px))', zIndex: 1500, borderRadius: 16, boxShadow: '0 20px 60px #0008' };

  return (
    <>
      {!(open && mobile) && (
        <button onClick={() => setOpen(o => !o)} title="المساعد الذكي"
          style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 1501, width: 56, height: 56, borderRadius: 28, border: 'none', cursor: 'pointer', fontSize: 24, color: '#fff', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 24px #6366f166' }}>
          {open ? '✕' : '✨'}
        </button>
      )}
      {open && (
        <div style={{ ...panel, background: C.card, border: mobile ? 'none' : `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>المساعد الذكي</div>
              <div style={{ fontSize: 11, color: C.muted }}>اكتب أو تحدّث — لا يُنفَّذ أي تعديل إلا بعد التأكيد</div>
            </div>
            {msgs.length > 0 && <button onClick={clear} title="محادثة جديدة" style={iconBtn}>🗑️</button>}
            <button onClick={() => setOpen(false)} title="إغلاق" style={iconBtn}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!msgs.length && (
              <div style={{ color: C.sub, fontSize: 13 }}>
                <div style={{ marginBottom: 10 }}>أمثلة لما يمكنني تنفيذه:</div>
                {EXAMPLES.map(e => (
                  <button key={e} onClick={() => send(e)} style={{ display: 'block', width: '100%', textAlign: 'right', background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 12px', color: C.text, fontSize: 13, marginBottom: 6, cursor: 'pointer' }}>{e}</button>
                ))}
              </div>
            )}
            {msgs.map((m, mi) => (
              <div key={mi} style={{ alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '88%' }}>
                {m.text && (
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14, padding: '9px 13px', borderRadius: 14,
                    background: m.role === 'user' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : m.role === 'error' ? '#ef444422' : 'var(--bg)',
                    color: m.role === 'user' ? '#fff' : m.role === 'error' ? '#f87171' : C.text, border: m.role === 'user' ? 'none' : `1px solid ${C.border}` }}>{m.text}</div>
                )}
                {(m.actions || []).map((a, ai) => <ActionCard key={a._id} a={a} onConfirm={() => decide(mi, ai, 'confirm')} onCancel={() => decide(mi, ai, 'cancel')} />)}
              </div>
            ))}
            {busy && <div style={{ alignSelf: 'flex-end', color: C.muted, fontSize: 13 }}>⏳ جارٍ التنفيذ...</div>}
            <div ref={end} />
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: `1px solid ${C.border}` }}>
            <button onClick={mic} title="إدخال صوتي" style={{ ...iconBtn, width: 44, height: 44, fontSize: 18, background: rec ? '#ef444433' : 'transparent', borderColor: rec ? '#ef4444' : C.border }}>{rec ? '⏺' : '🎤'}</button>
            <textarea ref={input} value={text} onChange={e => setText(e.target.value)} rows={1} placeholder={rec ? 'جارٍ الاستماع...' : 'اكتب الأمر...'}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              style={{ flex: 1, resize: 'none', background: 'var(--bg)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', maxHeight: 120 }} />
            <button onClick={() => send()} disabled={busy || !text.trim()} title="إرسال"
              style={{ width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 18, color: '#fff', background: busy || !text.trim() ? C.border : 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}

const iconBtn = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.sub, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

function ActionCard({ a, onConfirm, onCancel }) {
  const st = { pending: ['#f59e0b', 'بانتظار التأكيد'], done: ['#10b981', 'تم التنفيذ'], cancelled: ['#64748b', 'أُلغيت'], failed: ['#ef4444', 'تعذّر التنفيذ'] }[a.status] || ['#f59e0b', ''];
  return (
    <div style={{ marginTop: 8, border: `1px solid ${st[0]}88`, borderRight: `4px solid ${st[0]}`, borderRadius: 12, padding: 12, background: st[0] + '12' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>{a.title}</b>
        <span style={{ fontSize: 11, color: st[0], fontWeight: 700, whiteSpace: 'nowrap' }}>{st[1]}</span>
      </div>
      {a.lines.map((l, i) => <div key={i} style={{ fontSize: 13, color: C.sub, lineHeight: 1.8 }}>• {l}</div>)}
      {a.result && a.status !== 'pending' && <div style={{ fontSize: 12, marginTop: 6, color: st[0] }}>{a.result}</div>}
      {a.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={onConfirm} disabled={a.busy} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>{a.busy ? '⏳' : 'تأكيد'}</button>
          <button onClick={onCancel} disabled={a.busy} style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.sub, cursor: 'pointer', fontSize: 14 }}>إلغاء</button>
        </div>
      )}
    </div>
  );
}
