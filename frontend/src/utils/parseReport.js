// يقرأ تقارير أمازون (CSV أو TXT مفصول بـ Tab) ويرجع مصفوفة صفوف
export function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  const d = tabs >= commas && tabs >= semis ? '\t' : (semis > commas ? ';' : ',');

  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

export async function readReportFile(file) {
  const buf = await file.arrayBuffer();
  if (/\.xls[xm]?$/i.test(file.name)) return parseExcel(buf);
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1256').decode(buf); // ملفات عربية قديمة
  return parseDelimited(text);
}

// ملف Excel: أول شيت ← صفوف نصوص (التواريخ بتتحول ISO عشان تتقري صح)
async function parseExcel(buf) {
  const XLSX = await import('xlsx');      // بيتحمّل بس لما ترفع Excel
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const pad = (n) => String(n).padStart(2, '0');
  return rows
    .map(r => r.map(v => v instanceof Date
      ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}T${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`
      : String(v ?? '')))
    .filter(r => r.some(v => v.trim() !== ''));
}
