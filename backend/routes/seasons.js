// ═══════════════════════════════════════════════════════════════
// المواسم — تذكير قبل كل موسم بعدّ تنازلي + أفكار المنتجات
// التواريخ الهجرية محسوبة بتقويم أم القرى (ممكن تفرق يوم عن الرؤية في مصر — تقدر تعدّلها)
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const Setting = require('../models/Setting');
const { auth, permit } = require('../middleware/auth');

const DAY = 864e5;
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const iso = (d) => d.toISOString().slice(0, 10);

// ─── حساب التواريخ ─────────────────────────────────────────────
const hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
const hijriParts = (d) => Object.fromEntries(hijriFmt.formatToParts(d).map(p => [p.type, p.value]));
// كل مرات وقوع يوم هجري معيّن (شهر/يوم) داخل سنة ميلادية
function hijriInYear(year, hm, hd) {
  const out = [];
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += DAY) {
    const p = hijriParts(new Date(t));
    if (+p.month === hm && +p.day === hd) out.push(new Date(t));
  }
  return out;
}
// عيد القيامة الأرثوذكسي (شم النسيم = تاني يوم)
function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day) + 13 * DAY);  // جولياني ← ميلادي
}
const lastWeekday = (y, m, wd) => { const d = utc(y, m + 1, 0); while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() - 1); return d; };
const firstWeekdayFrom = (y, m, day, wd) => { const d = utc(y, m, day); while (d.getUTCDay() !== wd) d.setUTCDate(d.getUTCDate() + 1); return d; };

// ─── المواسم المصرية ────────────────────────────────────────────
// lead: يبدأ التذكير قبلها بكام يوم — duration: مدة الموسم — prep: قبلها بكام يوم تطلب البضاعة
const SEASONS = [
  { key: 'ramadan', name: 'رمضان', icon: '🌙', color: '#8b5cf6', duration: 30, prep: 45, hijri: true,
    dates: (y) => hijriInYear(y, 9, 1),
    tip: 'الطلب بيبدأ قبل رمضان بـ 3–4 أسابيع. جهّز المخزون من بدري لأن الموردين بيزحموا.',
    ideas: ['أطقم تقديم وصواني وأطباق سحور', 'برطمانات وعلب تخزين ياميش وتوابل', 'فوانيس وزينة رمضان وإضاءة LED', 'مفارش سفرة وأطقم شاي وقهوة', 'أدوات مطبخ: مقالي، قوالب كنافة وقطايف، خلاطات', 'ترامس ودوارق عصير وكاسات', 'سجاجيد صلاة ومصاحف وسبح (هدايا)'] },
  { key: 'eid_fitr', name: 'عيد الفطر', icon: '🎉', color: '#10b981', duration: 3, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 10, 1),
    tip: 'آخر 10 أيام في رمضان هي ذروة طلبات العيد — خلّي المخزون جاهز قبلها.',
    ideas: ['قوالب ومستلزمات الكحك والبسكويت', 'علب وأكياس هدايا وعيدية', 'ألعاب أطفال وإكسسوارات', 'أطقم ضيافة وأطباق حلويات', 'منظّمات وأدوات تنظيف البيت قبل العيد', 'عطور ومستلزمات عناية شخصية'] },
  { key: 'eid_adha', name: 'عيد الأضحى', icon: '🐑', color: '#f59e0b', duration: 4, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 12, 10),
    tip: 'الطلب على أدوات الشوي واللحوم والتخزين بيبدأ قبل العيد بأسبوعين، وبيوصل للذروة آخر 5 أيام. اعمل باندلز للشوي (شواية + أسياخ + ماشة).',
    ideas: ['شوايات فحم ومحمولة للرحلات والبلكونة', 'جريل وشوايات كهربا', 'أسياخ شيش وكفتة وشبك شوي', 'ماشات وفرش وقفازات شوي', 'مراوح شواية يدوي وكهربا وولاعات فحم', 'صواني ألومنيوم وورق قصدير', 'سكاكين وأطقم سكاكين وسنّانات وسواطير', 'ألواح تقطيع ومفارم لحمة يدوي وكهربا', 'علب وأكياس تخزين وتفريز', 'أواني طبخ كبيرة وحلل فتة', 'أطقم تقديم وصواني كبيرة'] },
  { key: 'mawlid', name: 'المولد النبوي', icon: '🍬', color: '#ec4899', duration: 7, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 3, 12),
    tip: 'موسم قصير لكن طلبه عالي على العلب والهدايا.',
    ideas: ['علب حلاوة المولد وعلب هدايا', 'عرائس وأحصنة المولد (ديكور)', 'صواني وأطباق تقديم', 'أكياس وتغليف هدايا'] },
  { key: 'school_1', name: 'بداية الدراسة (الترم الأول)', icon: '🎒', color: '#3b82f6', duration: 21, prep: 45,
    dates: (y) => [firstWeekdayFrom(y, 9, 19, 6)],  // تقريباً تالت سبت في سبتمبر
    tip: 'المدارس الدولية بتبدأ بدري (أوائل سبتمبر) — ابدأ العرض من منتصف أغسطس.',
    ideas: ['شنط مدرسة ولانش بوكس وزمزميات', 'أدوات مكتبية: أقلام، كشاكيل، ألوان، مقالم', 'منظّمات مكتب وأرفف كتب', 'ألعاب تعليمية ومونتيسوري', 'ساعات أطفال وإكسسوارات', 'أكياس تجليد ولاصق أسماء'] },
  { key: 'school_2', name: 'الترم الثاني', icon: '📚', color: '#0ea5e9', duration: 14, prep: 30,
    dates: (y) => [firstWeekdayFrom(y, 2, 7, 6)],  // تقريباً أول سبت بعد 7 فبراير
    tip: 'موسم أصغر من الترم الأول — ركّز على الأدوات اللي بتخلص.',
    ideas: ['أدوات مكتبية وكشاكيل وأقلام', 'لانش بوكس وزمزميات', 'منظّمات مكتب ومذاكرة', 'إضاءة مكتب LED'] },
  { key: 'mothers_day', name: 'عيد الأم', icon: '💐', color: '#f43f5e', duration: 1, prep: 30,
    dates: (y) => [utc(y, 3, 21)],
    tip: 'من أقوى مواسم الهدايا في مصر — الطلبات بتتركز في آخر أسبوعين.',
    ideas: ['أجهزة مطبخ صغيرة كهدايا', 'أطقم تقديم وفناجين وأكواب', 'أجهزة عناية شخصية وتجميل', 'مفارش ومنظّمات منزل', 'علب هدايا وتغليف'] },
  { key: 'sham_nessim', name: 'شم النسيم', icon: '🌸', color: '#84cc16', duration: 1, prep: 21,
    dates: (y) => [new Date(orthodoxEaster(y).getTime() + DAY)],
    tip: 'خروجات ورحلات — منتجات خفيفة وسريعة الدوران.',
    ideas: ['شنط رحلات وتبريد وكولمان', 'ترامس وزمزميات', 'أدوات تلوين بيض للأطفال', 'حصير وكراسي رحلات'] },
  { key: 'summer', name: 'إجازة الصيف والمصايف', icon: '🏖️', color: '#06b6d4', duration: 75, prep: 45,
    dates: (y) => [utc(y, 6, 15)],
    tip: 'الإجازة بتبدأ بعد الامتحانات، والذروة يوليو وأغسطس. منتجات البحر والعوامات بتخلص بسرعة، فاطلبها بكميات من مايو.',
    ideas: ['عوامات وأطواق وبراشوتات سباحة للأطفال والكبار', 'منافيخ عوامات (يدوي وكهربا)', 'نظارات وأطقم غطس وزعانف', 'ألعاب رمل وجرادل ومسدسات مية', 'شماسي وكراسي ومفارش بحر', 'شنط بحر وفوط مايكروفايبر', 'كولمان وشنط تبريد وزمزميات', 'مراوح محمولة ورشاشات مية', 'منظّمات شنط سفر وأكياس مقاومة للمية للموبايل', 'برانيط ونظارات شمس', 'أدوات عصائر وماكينات ثلج'] },
  { key: 'winter', name: 'موسم الشتاء', icon: '🧣', color: '#38bdf8', duration: 90, prep: 30,
    dates: (y) => [utc(y, 11, 15)],
    tip: 'الطلب بيقفز مع أول موجة برد ويفضل لآخر فبراير. الدفايات والمراتب الكهربا بتخلص بسرعة في يناير، فاطلبها بكميات من أول نوفمبر. اكتب في الإعلان القدرة بالوات ووسائل الأمان (فصل تلقائي عند الوقوع والسخونة الزيادة)، لأنها أكتر حاجة بيسأل عنها العميل.',
    ideas: [
      'دفايات كهربا: هالوجين، زيت (رادياتير)، سيراميك، ومراوح تدفئة',
      'مراتب وبطاطين كهربا',
      'قِرَب مية سخنة (كاوتش وكهربا) وأغطية قطيفة ليها',
      'بطاطين وكوفرتات صغيرة (سنجل وأطفال) وشالات تلفزيون بأكمام',
      'شرابات وشباشب شتوي وجوانتيات وكوفيات وطواقي',
      'ترامس وأكواب وماجات حافظة للحرارة',
      'غلايات كهربا وأجهزة قهوة ونسكافيه وصانعات شوكولاتة سخنة',
      'أواني الشوربة: حلل ضغط، خلاطات يد، أطباق وزبادي شوربة',
      'مُرطّبات جو وأجهزة بخار للمناخير',
      'كريمات ومرطّبات وزبدة كاكاو للشفايف والإيد',
      'شماعات ومجففات غسيل داخلية (الغسيل بيتأخر ينشف في الشتا)',
      'أكياس تفريغ ومنظّمات لتخزين الملابس الشتوي والصيفي',
      'شرائط عزل للأبواب والشبابيك وسدادات هوا تحت الباب',
      'مظلات (شماسي) مطر وجزم وأغطية شوز ضد المية',
      'أغطية مقاعد عربيات فرو ومساحات زجاج وبخاخ مانع الشبورة',
    ] },
  { key: 'white_friday', name: 'عروض الجمعة البيضاء', icon: '🛍️', color: '#eab308', duration: 10, prep: 30,
    dates: (y) => [lastWeekday(y, 11, 5)],
    tip: 'أكبر موسم عروض في السنة على أمازون ونون — راجع أسعارك وكوبوناتك قبلها بأسبوعين.',
    ideas: ['الأصناف الأكثر مبيعاً عندك بعرض واضح', 'باندلز (صنفين مع بعض بسعر أقل)', 'أجهزة المطبخ الصغيرة', 'تصفية المخزون الراكد بخصم'] },
  { key: 'new_year', name: 'رأس السنة والكريسماس وعيد الميلاد المجيد', icon: '🎄', color: '#dc2626', duration: 14, prep: 30,
    dates: (y) => [utc(y, 12, 25)],
    tip: 'هدايا وديكور — الطلب بيبدأ من أوائل ديسمبر ويمتد لعيد الميلاد المجيد (7 يناير).',
    ideas: ['زينة وإضاءة LED وشجر', 'علب هدايا وتغليف', 'أطقم أكواب وفناجين هدايا', 'ألعاب أطفال'] },
  // ─── مواسم طلب إضافية طول السنة ───
  { key: 'exams_mid', name: 'امتحانات نص السنة', icon: '📝', color: '#6366f1', duration: 21, prep: 21,
    dates: (y) => [utc(y, 1, 3)],
    tip: 'البيت كله بيتقفل على المذاكرة — منتجات التركيز والسهر والتنظيم.',
    ideas: ['إضاءة مكتب LED ولمبات قراءة', 'مكاتب وترابيزات مذاكرة قابلة للطي', 'منظّمات مكتب وحوامل كتب', 'ترامس وماجات قهوة', 'منبّهات وساعات حائط', 'أدوات مكتبية: هايلايتر، Sticky notes، أقلام', 'وسائد ظهر وكراسي مريحة'] },
  { key: 'midyear_break', name: 'إجازة نص السنة', icon: '🧸', color: '#f97316', duration: 14, prep: 21,
    dates: (y) => [utc(y, 1, 24)],
    tip: 'الأطفال في البيت أسبوعين — الألعاب والأنشطة والخروجات.',
    ideas: ['ألعاب تعليمية وبازل ومكعبات', 'أطقم رسم وتلوين وصلصال', 'ألعاب جماعية (أونو، كوتشينة، شطرنج)', 'أطقم خرز وأشغال يدوية', 'شنط ومستلزمات خروجات'] },
  { key: 'valentine', name: 'عيد الحب', icon: '❤️', color: '#e11d48', duration: 1, prep: 21,
    dates: (y) => [utc(y, 2, 14)],
    tip: 'هدايا بأسعار متوسطة — التغليف الشيك بيفرق في البيع.',
    ideas: ['علب وأكياس هدايا وتغليف', 'ماجات وأكواب مطبوعة وأطقم فناجين', 'إضاءة ديكور LED وشموع', 'إكسسوارات ومنظّمات مجوهرات', 'أجهزة عناية شخصية صغيرة'] },
  { key: 'spring', name: 'الربيع والزراعة المنزلية', icon: '🌱', color: '#22c55e', duration: 60, prep: 30,
    dates: (y) => [utc(y, 3, 1)],
    tip: 'أحسن وقت للزراعة في البلكونات والجناين، ومعاه تنظيف البيت الكبير.',
    ideas: ['أصص وزراعات وحوامل نباتات', 'أدوات زراعة صغيرة ومرشّات مية', 'خراطيم ورشاشات جنينة', 'أدوات تنظيف شامل: مماسح، فرش، منظّفات زجاج', 'منظّمات ودواليب تخزين'] },
  { key: 'mosquito', name: 'موسم الناموس والحشرات', icon: '🦟', color: '#65a30d', duration: 150, prep: 30,
    dates: (y) => [utc(y, 4, 15)],
    tip: 'الطلب بيبدأ مع الحر وبيستمر لحد أكتوبر — منتج سريع الدوران.',
    ideas: ['صواعق ناموس كهربا ومضارب', 'ناموسيات سراير وأطفال', 'سلك شبابيك ولاصق ناموسية', 'أجهزة طاردة للحشرات (أقراص وسائل)', 'مصائد حشرات وفيران'] },
  { key: 'exams_final', name: 'امتحانات آخر السنة والثانوية العامة', icon: '🎓', color: '#4f46e5', duration: 45, prep: 21,
    dates: (y) => [utc(y, 5, 15)],
    tip: 'أطول موسم مذاكرة في السنة — ومعاه بداية الحر.',
    ideas: ['إضاءة مكتب ولمبات قراءة', 'مراوح مكتب صغيرة', 'ترامس وماجات وزمزميات', 'منظّمات مكتب ومذاكرة', 'أدوات مكتبية', 'هدايا نجاح'] },
  { key: 'hajj', name: 'موسم الحج', icon: '🕋', color: '#0d9488', duration: 25, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 11, 15),
    tip: 'الحجاج بيسافروا قبل العيد بـ 3–4 أسابيع — والطلب على الهدايا بعد رجوعهم.',
    ideas: ['شنط سفر ومنظّمات شنط', 'أحزمة وشنط وسط للفلوس والباسبور', 'شباشب طبية وصنادل مريحة', 'مظلات شمس ومراوح يد ورشاشات مية', 'زمزميات وترامس', 'سجاجيد صلاة وسبح ومصاحف جيب (هدايا)'] },
  { key: 'prime_day', name: 'برايم داي أمازون', icon: '📦', color: '#0ea5e9', duration: 3, prep: 30,
    dates: (y) => [utc(y, 7, 8)],
    tip: 'التاريخ بيتعلن من أمازون كل سنة (غالباً يوليو) — عدّله أول ما يتعلن، وقدّم عروضك من Seller Central قبلها.',
    ideas: ['الأصناف الأكثر مبيعاً عندك بخصم', 'باندلز بسعر مميز', 'تصفية المخزون الراكد', 'أجهزة المطبخ الصغيرة'] },
  { key: 'weddings', name: 'موسم الأفراح وجهاز العرايس', icon: '💍', color: '#db2777', duration: 90, prep: 45,
    dates: (y) => [utc(y, 7, 1)],
    tip: 'أكبر موسم للمطبخ والبيت في مصر — بيبدأ بعد عيد الفطر وبيوصل للذروة في الصيف. الأطقم الكاملة بتتباع أحسن من القطع الفردية.',
    ideas: ['أطقم حلل وأواني طبخ كاملة', 'أطقم سكاكين وأدوات مطبخ', 'أجهزة مطبخ صغيرة: خلاط، كبة، محضّر طعام، قلاية هوائية', 'أطقم تقديم وصواني وأطباق', 'علب وبرطمانات تخزين وتوابل', 'منظّمات مطبخ وأدراج ودواليب', 'مفارش سفرة وفوط مطبخ', 'أطقم فناجين وكاسات'] },
  { key: 'mango_mouna', name: 'موسم المانجا والمونة', icon: '🥭', color: '#fb923c', duration: 60, prep: 30,
    dates: (y) => [utc(y, 7, 15)],
    tip: 'وقت العصائر وتخزين المونة (صلصة، مخلل، مربى) قبل ما المواسم تخلص.',
    ideas: ['عصّارات وخلاطات', 'برطمانات زجاج بأحجام مختلفة', 'أكياس وعلب تفريز', 'أدوات تقطيع وتقشير', 'قمع ومصافي وأدوات تعبئة', 'دوارق وكاسات عصير'] },
  { key: 'sales_1111', name: 'عروض 11.11', icon: '🏷️', color: '#a855f7', duration: 3, prep: 21,
    dates: (y) => [utc(y, 11, 11)],
    tip: 'بداية موسم العروض في آخر السنة على نون وأمازون — وبعدها الجمعة البيضاء.',
    ideas: ['عروض على الأكثر مبيعاً', 'باندلز', 'تصفية المخزون الراكد قبل الشتا'] },
];

async function getConfig() {
  const s = await Setting.findOne({ key: 'seasons' }).lean();
  return { disabled: [], overrides: {}, custom: [], ...(s?.value || {}) };
}

// كل مواسم السنة دي والسنة الجاية — مع التعديلات والمواسم المضافة
async function buildSeasons() {
  const cfg = await getConfig();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const year = today.getUTCFullYear();
  const out = [];
  const add = (s, date, extra = {}) => {
    const end = new Date(date.getTime() + Math.max(1, s.duration || 1) * DAY);
    if (end <= today) return;
    const daysLeft = Math.round((date - today) / DAY);
    const lead = s.lead ?? cfg.lead ?? 30;
    out.push({
      key: s.key, id: `${s.key}_${date.getUTCFullYear()}`, name: s.name, icon: s.icon || '📅', color: s.color || '#6366f1',
      date: iso(date), daysLeft, lead, active: daysLeft <= 0, soon: daysLeft > 0 && daysLeft <= lead,
      prepBy: s.prep ? iso(new Date(date.getTime() - s.prep * DAY)) : null, prep: s.prep || null,
      duration: s.duration || 1, tip: s.tip || '', ideas: s.ideas || [], hijri: !!s.hijri,
      enabled: !cfg.disabled.includes(s.key), ...extra,
    });
  };
  for (const s of SEASONS) {
    for (const y of [year, year + 1]) {
      for (const d of s.dates(y)) {
        const ov = cfg.overrides[`${s.key}_${d.getUTCFullYear()}`];
        add(s, ov ? new Date(ov + 'T00:00:00Z') : d, { overridden: !!ov, original: iso(d) });
      }
    }
  }
  for (const c of cfg.custom) {
    const [, m, d] = c.date.split('-').map(Number);
    const dates = c.yearly ? [utc(year, m, d), utc(year + 1, m, d)] : [new Date(c.date + 'T00:00:00Z')];
    for (const dt of dates) add({ ...c, key: c.id, prep: c.prep || null }, dt, { custom: true, yearly: !!c.yearly });
  }
  // أقرب ظهور لكل موسم بس
  const seen = new Set();
  return out.sort((a, b) => a.date.localeCompare(b.date)).filter(s => !seen.has(s.key) && seen.add(s.key));
}

// ─── الواجهات ──────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try { res.json({ seasons: await buildSeasons() }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

// للشريط العلوي: المواسم اللي جاية خلال فترة التذكير أو شغالة دلوقتي
router.get('/upcoming', auth, async (req, res) => {
  try { res.json((await buildSeasons()).filter(s => s.enabled && (s.soon || s.active))); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

const save = (value) => Setting.findOneAndUpdate({ key: 'seasons' }, { key: 'seasons', value }, { upsert: true });

// تفعيل/إيقاف موسم، أو تعديل تاريخه (مثلاً بعد إعلان الرؤية أو مواعيد المدارس الرسمية)
router.put('/:key', auth, permit('settings'), async (req, res) => {
  const cfg = await getConfig();
  const { key } = req.params;
  if (req.body.enabled !== undefined) {
    cfg.disabled = cfg.disabled.filter(k => k !== key);
    if (!req.body.enabled) cfg.disabled.push(key);
  }
  if (req.body.id && req.body.date !== undefined) {
    if (req.body.date && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.date)) return res.status(400).json({ message: 'تاريخ غير صحيح' });
    if (req.body.date) cfg.overrides[req.body.id] = req.body.date; else delete cfg.overrides[req.body.id];
  }
  await save(cfg);
  res.json({ message: 'تم الحفظ' });
});

// موسم خاص (عروض متجر، يوم وطني، ...)
router.post('/custom', auth, permit('settings'), async (req, res) => {
  const { name, date, lead, ideas, icon, yearly, tip } = req.body;
  if (!String(name || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ message: 'الاسم والتاريخ مطلوبان' });
  const cfg = await getConfig();
  cfg.custom.push({
    id: 'c' + Date.now().toString(36), name: String(name).trim().slice(0, 60), date, yearly: !!yearly, icon: icon || '📅', color: '#6366f1',
    lead: Math.min(120, Math.max(1, +lead || 30)), duration: 1, tip: String(tip || '').slice(0, 300),
    ideas: (Array.isArray(ideas) ? ideas : String(ideas || '').split(/\n|،|,/)).map(s => String(s).trim()).filter(Boolean).slice(0, 20),
  });
  await save(cfg);
  res.status(201).json({ message: 'تمت إضافة الموسم' });
});

router.delete('/custom/:id', auth, permit('settings'), async (req, res) => {
  const cfg = await getConfig();
  cfg.custom = cfg.custom.filter(c => c.id !== req.params.id);
  await save(cfg);
  res.json({ message: 'تم الحذف' });
});

module.exports = router;
module.exports._test = { buildSeasons, orthodoxEaster, SEASONS };
