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
  if (/\.xlsx?$/i.test(file.name)) throw new Error('احفظ التقرير CSV أو TXT من Seller Central (ملفات Excel غير مدعومة حالياً)');
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1256').decode(buf); // ملفات عربية قديمة
  return parseDelimited(text);
}
