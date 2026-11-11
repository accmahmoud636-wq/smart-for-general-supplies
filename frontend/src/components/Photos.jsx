import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { C_THEME as C } from './UI';

// ضغط الصورة في المتصفح قبل الرفع (صورة الموبايل 4MB ← حوالي 150KB)
export function compressImage(file, max = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّرت قراءة الصورة')); };
    img.src = url;
  });
}

const cache = new Map();   // id → data URL
export async function uploadPhoto(file) {
  const data = await compressImage(file);
  const { data: r } = await api.post('/damaged/photos', { data });
  cache.set(r._id, data);
  return r._id;
}

function usePhoto(id) {
  const [src, setSrc] = useState(cache.get(id) || null);
  useEffect(() => {
    if (cache.has(id)) { setSrc(cache.get(id)); return; }
    let on = true;
    api.get(`/damaged/photos/${id}`).then(r => { cache.set(id, r.data.data); if (on) setSrc(r.data.data); }).catch(() => {});
    return () => { on = false; };
  }, [id]);
  return src;
}

function Thumb({ id, onOpen, onRemove, size }) {
  const src = usePhoto(id);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div onClick={() => src && onOpen(src)} style={{ width: '100%', height: '100%', borderRadius: 8, border: `1px solid ${C.border}`, background: src ? `center/cover url(${src})` : 'var(--bg)', cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: C.muted }}>{!src && '⏳'}</div>
      {onRemove && <button onClick={onRemove} title="حذف الصورة" style={{ position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: '20px', padding: 0 }}>✕</button>}
    </div>
  );
}

// صف الصور + زرار إضافة (بيفتح الكاميرا على الموبايل)
export function PhotoStrip({ ids = [], onChange, size = 56 }) {
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const add = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const out = [...ids];
      for (const f of files) out.push(await uploadPhoto(f));
      onChange(out);
    } catch (e) { toast.error(e.response?.data?.message || e.message); }
    setBusy(false);
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {ids.map((id, i) => <Thumb key={id} id={id} size={size} onOpen={setView} onRemove={onChange ? () => onChange(ids.filter((_, k) => k !== i)) : null} />)}
      {onChange && (
        <label style={{ width: size, height: size, borderRadius: 8, border: `2px dashed ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.sub, fontSize: 10, gap: 2 }}>
          <span style={{ fontSize: 18 }}>{busy ? '⏳' : '📷'}</span>{!busy && 'صورة'}
          <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} disabled={busy} onChange={e => { add([...e.target.files]); e.target.value = ''; }} />
        </label>
      )}
      {view && (
        <div onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, background: '#000d', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={view} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
