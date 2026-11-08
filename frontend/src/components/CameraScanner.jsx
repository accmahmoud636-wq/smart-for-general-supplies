import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';

const FORMATS = [F.EAN_13, F.EAN_8, F.CODE_128, F.CODE_39, F.UPC_A, F.UPC_E, F.ITF, F.QR_CODE];

// يفتح كاميرا الموبايل الخلفية ويقرأ الباركود
// continuous = يفضل مفتوح لمسح قطع ورا بعض (مع تجاهل نفس الكود لمدة 1.5 ثانية)
export default function CameraScanner({ open, onClose, onScan, continuous = false, title = 'امسح الباركود', message = null }) {
  const boxId = useRef('cam-' + Math.random().toString(36).slice(2));
  const scanner = useRef(null);
  const last = useRef({ code: '', t: 0 });
  const cb = useRef(onScan);
  cb.current = onScan;
  const [err, setErr] = useState('');
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr('');
    const s = new Html5Qrcode(boxId.current, { formatsToSupport: FORMATS, verbose: false, useBarCodeDetectorIfSupported: true });
    scanner.current = s;
    s.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h, w) * 0.45) }), aspectRatio: 1.333 },
      (text) => {
        const now = Date.now();
        if (text === last.current.code && now - last.current.t < 1500) return;
        last.current = { code: text, t: now };
        cb.current(text.trim());
        if (!continuous) close();
      },
      () => {}
    ).catch(e => {
      const m = String(e?.message || e);
      setErr(/Permission|NotAllowed/i.test(m) ? 'اسمح للمتصفح باستخدام الكاميرا (من إعدادات الموقع) وجرّب تاني'
        : /secure|https/i.test(m) ? 'الكاميرا بتشتغل على رابط https بس'
        : 'مش قادر يفتح الكاميرا: ' + m);
    });
    return () => { stop(); };
  }, [open]);

  const stop = async () => {
    const s = scanner.current;
    scanner.current = null;
    setTorch(false);
    try { if (s?.isScanning) await s.stop(); s?.clear(); } catch { /* */ }
  };
  const close = async () => { await stop(); onClose(); };

  const toggleTorch = async () => {
    try { await scanner.current?.applyVideoConstraints({ advanced: [{ torch: !torch }] }); setTorch(!torch); }
    catch { setErr('الفلاش مش مدعوم على الجهاز ده'); }
  };

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', color: '#fff' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>📷 {title}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleTorch} style={btn(torch ? '#f59e0b' : '#334155')}>🔦</button>
          <button onClick={close} style={btn('#ef4444')}>✕ قفل</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div id={boxId.current} style={{ width: '100%', maxWidth: 520 }} />
      </div>
      {message && !err && (
        <div style={{ margin: '0 16px', padding: '12px 14px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 16, background: message.ok ? '#10b98133' : '#ef444433', color: message.ok ? '#34d399' : '#f87171' }}>{message.text}</div>
      )}
      <div style={{ padding: 16, textAlign: 'center', color: err ? '#f87171' : '#94a3b8', fontSize: 14 }}>
        {err || (continuous ? 'وجّه الكاميرا على الباركود — تقدر تمسح قطع ورا بعض' : 'وجّه الكاميرا على الباركود')}
      </div>
    </div>
  );
}

const btn = (bg) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' });
