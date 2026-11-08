import JsBarcode from 'jsbarcode';

// EAN-13 لو الرقم 13 خانة صحيحة، غير كده CODE128 (يقبل حروف وأرقام)
export function barcodeFormat(code) {
  if (!/^\d{13}$/.test(code)) return 'CODE128';
  const sum = code.slice(0, 12).split('').reduce((s, d, i) => s + (+d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === +code[12] ? 'EAN13' : 'CODE128';
}

export function barcodeSVG(code, opts = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, code, { format: barcodeFormat(code), width: 2, height: 50, fontSize: 14, margin: 0, displayValue: true, ...opts });
  return svg.outerHTML;
}

// مقاسات الاستيكر — الطابعات الحرارية بتطبع استيكر لكل صفحة
export const LABEL_SIZES = {
  '50x25': { label: 'استيكر 50×25 مم (حراري)', w: 50, h: 25 },
  '40x30': { label: 'استيكر 40×30 مم (حراري)', w: 40, h: 30 },
  '38x25': { label: 'استيكر 38×25 مم (حراري)', w: 38, h: 25 },
  '60x40': { label: 'استيكر 60×40 مم (حراري)', w: 60, h: 40 },
  'a4':    { label: 'ورقة A4 — 24 استيكر (3×8)', w: 70, h: 37, sheet: true },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// items: [{ name, barcode, price, copies }]
export function printLabels(items, sizeKey = '50x25', { showName = true, showPrice = false, currency = '' } = {}) {
  const sz = LABEL_SIZES[sizeKey];
  const labels = [];
  for (const it of items) {
    if (!it.barcode) continue;
    const svg = barcodeSVG(it.barcode, { height: sz.h >= 30 ? 50 : 40 });
    for (let i = 0; i < (it.copies || 1); i++) {
      labels.push(`<div class="lbl">
        ${showName ? `<div class="nm">${esc(it.name)}</div>` : ''}
        <div class="bc">${svg}</div>
        ${showPrice && it.price ? `<div class="pr">${esc(Number(it.price).toFixed(2))} ${esc(currency)}</div>` : ''}
      </div>`);
    }
  }
  if (!labels.length) return false;

  const page = sz.sheet
    ? `@page { size: A4; margin: 10mm 0 0 0; } body { display: grid; grid-template-columns: repeat(3, ${sz.w}mm); grid-auto-rows: ${sz.h}mm; }`
    : `@page { size: ${sz.w}mm ${sz.h}mm; margin: 0; } .lbl { page-break-after: always; break-after: page; }`;

  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>Barcode</title><style>
    ${page}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Tahoma, sans-serif; }
    .lbl { width: ${sz.w}mm; height: ${sz.h}mm; padding: 1.5mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
    .nm { font-size: ${sz.h >= 30 ? 10 : 8}pt; font-weight: bold; text-align: center; max-height: 2.4em; overflow: hidden; line-height: 1.2; width: 100%; }
    .bc { width: 100%; flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
    .bc svg { max-width: 100%; max-height: 100%; height: auto; }
    .pr { font-size: 9pt; font-weight: bold; }
  </style></head><body>${labels.join('')}
  <script>window.onload = () => { setTimeout(() => { window.print(); }, 300); };<\/script></body></html>`;

  const w = window.open('', '_blank', 'width=800,height=600');
  if (!w) { alert('المتصفح منع النافذة — اسمح بالـ Popups للموقع'); return false; }
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}

// ─── أصوات الاسكانر ────────────────────────────────────────────
// نجاح: "بيب" عالي قصير زي اسكانر السوبرماركت — خطأ: 3 "بززز" واطية واضحة
let ctx;
function audio() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// المتصفح (خصوصاً الآيفون) ما بيشغلش صوت غير بعد أول لمسة أو زرار — نفتح الصوت من أول تفاعل
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      const c = audio();
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch { /* */ }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(c, freq, start, dur, type, vol) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(c.destination);
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);       // من غير "طقّة" في الأول
  g.gain.setValueAtTime(vol, t + dur - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}

export function beep(ok = true) {
  try {
    const c = audio();
    if (ok) {
      tone(c, 1850, 0, 0.12, 'square', 0.25);              // بيب واحدة عالية
    } else {
      tone(c, 160, 0, 0.18, 'sawtooth', 0.45);             // بززز ×3
      tone(c, 160, 0.24, 0.18, 'sawtooth', 0.45);
      tone(c, 120, 0.48, 0.35, 'sawtooth', 0.45);
    }
  } catch { /* بدون صوت */ }
  try { navigator.vibrate?.(ok ? 60 : [200, 80, 200, 80, 300]); } catch { /* */ }
}
