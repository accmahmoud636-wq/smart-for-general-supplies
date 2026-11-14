// ═══════════════════════════════════════════════════════════════
// المواسم — تذكير قبل كل موسم بعدّ تنازلي + أفكار المنتجات
// التواريخ الهجرية محسوبة بتقويم أم القرى (ممكن تفرق يوم عن الرؤية في مصر — تقدر تعدّلها)
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const Setting = require('../models/Setting');
const { auth, permit } = require('../middleware/auth');
const { Product } = require('../models/index');

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
    tip: 'يبدأ الطلب قبل رمضان بـ 3–4 أسابيع. يُنصح بتجهيز المخزون مبكراً نظراً لازدحام الموردين.',
    ideas: ['أطقم تقديم وصواني وأطباق سحور', 'برطمانات وعلب تخزين ياميش وتوابل', 'فوانيس وزينة رمضان وإضاءة LED', 'مفارش سفرة وأطقم شاي وقهوة', 'أدوات مطبخ: مقالي، قوالب كنافة وقطايف، خلاطات', 'ترامس ودوارق عصير وكاسات', 'سجاجيد صلاة ومصاحف وسبح (هدايا)'] },
  { key: 'eid_fitr', name: 'عيد الفطر', icon: '🎉', color: '#10b981', duration: 3, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 10, 1),
    tip: 'تمثّل الأيام العشرة الأخيرة من رمضان ذروة طلبات العيد — يُنصح بتجهيز المخزون قبلها.',
    ideas: ['قوالب ومستلزمات الكحك والبسكويت', 'علب وأكياس هدايا وعيدية', 'ألعاب أطفال وإكسسوارات', 'أطقم ضيافة وأطباق حلويات', 'منظّمات وأدوات تنظيف البيت قبل العيد', 'عطور ومستلزمات عناية شخصية'] },
  { key: 'eid_adha', name: 'عيد الأضحى', icon: '🐑', color: '#f59e0b', duration: 4, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 12, 10),
    tip: 'يبدأ الطلب على أدوات الشواء واللحوم والتخزين قبل العيد بأسبوعين، ويبلغ ذروته في الأيام الخمسة الأخيرة. يُنصح بإعداد حزم للشواء (شواية + أسياخ + ماشة).',
    ideas: ['شوايات فحم ومحمولة للرحلات والبلكونة', 'جريل وشوايات كهربائية', 'أسياخ شيش وكفتة وشبك شوي', 'ماشات وفرش وقفازات شوي', 'مراوح شواية يدوية وكهربائية وولاعات فحم', 'صواني ألومنيوم وورق قصدير', 'سكاكين وأطقم سكاكين وسنّانات وسواطير', 'ألواح تقطيع ومفارم لحوم يدوية وكهربائية', 'علب وأكياس تخزين وتفريز', 'أواني طبخ كبيرة وحلل فتة', 'أطقم تقديم وصواني كبيرة'] },
  { key: 'mawlid', name: 'المولد النبوي', icon: '🍬', color: '#ec4899', duration: 7, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 3, 12),
    tip: 'موسم قصير لكنه يشهد طلباً مرتفعاً على العلب والهدايا.',
    ideas: ['علب حلاوة المولد وعلب هدايا', 'عرائس وأحصنة المولد (ديكور)', 'صواني وأطباق تقديم', 'أكياس وتغليف هدايا'] },
  { key: 'school_1', name: 'بداية الدراسة (الترم الأول)', icon: '🎒', color: '#3b82f6', duration: 21, prep: 45,
    dates: (y) => [firstWeekdayFrom(y, 9, 19, 6)],  // تقريباً تالت سبت في سبتمبر
    tip: 'تبدأ المدارس الدولية مبكراً (أوائل سبتمبر) — يُنصح ببدء العروض من منتصف أغسطس.',
    ideas: ['شنط مدرسة ولانش بوكس وزمزميات', 'أدوات مكتبية: أقلام، كشاكيل، ألوان، مقالم', 'منظّمات مكتب وأرفف كتب', 'ألعاب تعليمية ومونتيسوري', 'ساعات أطفال وإكسسوارات', 'أكياس تجليد ولاصق أسماء'] },
  { key: 'school_2', name: 'الترم الثاني', icon: '📚', color: '#0ea5e9', duration: 14, prep: 30,
    dates: (y) => [firstWeekdayFrom(y, 2, 7, 6)],  // تقريباً أول سبت بعد 7 فبراير
    tip: 'موسم أصغر من الفصل الدراسي الأول — يُنصح بالتركيز على الأدوات سريعة النفاد.',
    ideas: ['أدوات مكتبية وكشاكيل وأقلام', 'لانش بوكس وزمزميات', 'منظّمات مكتب ومذاكرة', 'إضاءة مكتب LED'] },
  { key: 'mothers_day', name: 'عيد الأم', icon: '💐', color: '#f43f5e', duration: 1, prep: 30,
    dates: (y) => [utc(y, 3, 21)],
    tip: 'من أقوى مواسم الهدايا في مصر — تتركز الطلبات في الأسبوعين الأخيرين.',
    ideas: ['أجهزة مطبخ صغيرة كهدايا', 'أطقم تقديم وفناجين وأكواب', 'أجهزة عناية شخصية وتجميل', 'مفارش ومنظّمات منزل', 'علب هدايا وتغليف'] },
  { key: 'sham_nessim', name: 'شم النسيم', icon: '🌸', color: '#84cc16', duration: 1, prep: 21,
    dates: (y) => [new Date(orthodoxEaster(y).getTime() + DAY)],
    tip: 'موسم الرحلات والنزهات — منتجات خفيفة وسريعة الدوران.',
    ideas: ['شنط رحلات وتبريد وكولمان', 'ترامس وزمزميات', 'أدوات تلوين بيض للأطفال', 'حصير وكراسي رحلات'] },
  { key: 'summer', name: 'إجازة الصيف والمصايف', icon: '🏖️', color: '#06b6d4', duration: 75, prep: 45,
    dates: (y) => [utc(y, 6, 15)],
    tip: 'تبدأ الإجازة بعد الامتحانات، وتبلغ الذروة في يوليو وأغسطس. تنفد منتجات الشاطئ والعوامات سريعاً، لذا يُنصح بطلبها بكميات كافية من مايو.',
    ideas: ['عوامات وأطواق وبراشوتات سباحة للأطفال والكبار', 'منافيخ عوامات (يدوية وكهربائية)', 'نظارات وأطقم غطس وزعانف', 'ألعاب رمل وجرادل ومسدسات مياه', 'شماسي وكراسي ومفارش بحر', 'شنط بحر وفوط مايكروفايبر', 'كولمان وشنط تبريد وزمزميات', 'مراوح محمولة ورشاشات مياه', 'منظّمات شنط سفر وأكياس مقاومة للمياه للموبايل', 'برانيط ونظارات شمس', 'أدوات عصائر وماكينات ثلج'] },
  { key: 'winter', name: 'موسم الشتاء', icon: '🧣', color: '#38bdf8', duration: 90, prep: 30,
    dates: (y) => [utc(y, 11, 15)],
    tip: 'يرتفع الطلب مع أول موجة برد ويستمر حتى نهاية فبراير. تنفد الدفايات والمراتب الكهربائية سريعاً في يناير، لذا يُنصح بطلبها بكميات كافية من أول نوفمبر. يُفضّل ذكر القدرة بالوات ووسائل الأمان (الفصل التلقائي عند السقوط والسخونة الزائدة) في الإعلان، لأنها أكثر ما يسأل عنه العملاء.',
    ideas: [
      'دفايات كهربائية: هالوجين، زيت (رادياتير)، سيراميك، ومراوح تدفئة',
      'مراتب وبطاطين كهربائية',
      'قِرَب مياه ساخنة (مطاط وكهربائية) وأغطية قطيفة لها',
      'بطاطين وكوفرتات صغيرة (سنجل وأطفال) وشالات تلفزيون بأكمام',
      'جوارب وشباشب شتوية وجوانتيات وكوفيات وطواقي',
      'ترامس وأكواب وماجات حافظة للحرارة',
      'غلايات كهربائية وأجهزة قهوة ونسكافيه وصانعات شوكولاتة سخنة',
      'أواني الشوربة: حلل ضغط، خلاطات يد، أطباق وزبادي شوربة',
      'مُرطّبات جو وأجهزة بخار للأنف',
      'كريمات ومرطّبات وزبدة كاكاو للشفايف واليدين',
      'شماعات ومجففات غسيل داخلية (لبطء جفاف الملابس في الشتاء)',
      'أكياس تفريغ ومنظّمات لتخزين الملابس الشتوية والصيفية',
      'شرائط عزل للأبواب والشبابيك وسدادات هواء تحت الباب',
      'مظلات (شماسي) مطر وأحذية وأغطية أحذية مقاومة للمياه',
      'أغطية مقاعد سيارات فرو ومساحات زجاج وبخاخ مانع الشبورة',
    ] },
  { key: 'white_friday', name: 'عروض الجمعة البيضاء', icon: '🛍️', color: '#eab308', duration: 10, prep: 30,
    dates: (y) => [lastWeekday(y, 11, 5)],
    tip: 'أكبر موسم عروض في العام على أمازون ونون — يُنصح بمراجعة الأسعار والقسائم قبله بأسبوعين.',
    ideas: ['الأصناف الأكثر مبيعاً لديك بعرض واضح', 'باندلز (صنفين معاً بسعر أقل)', 'أجهزة المطبخ الصغيرة', 'تصفية المخزون الراكد بخصم'] },
  { key: 'new_year', name: 'رأس السنة والكريسماس وعيد الميلاد المجيد', icon: '🎄', color: '#dc2626', duration: 14, prep: 30,
    dates: (y) => [utc(y, 12, 25)],
    tip: 'هدايا وديكور — يبدأ الطلب من أوائل ديسمبر ويمتد حتى عيد الميلاد المجيد (7 يناير).',
    ideas: ['زينة وإضاءة LED وشجر', 'علب هدايا وتغليف', 'أطقم أكواب وفناجين هدايا', 'ألعاب أطفال'] },
  // ─── مواسم طلب إضافية طول السنة ───
  { key: 'exams_mid', name: 'امتحانات نص السنة', icon: '📝', color: '#6366f1', duration: 21, prep: 21,
    dates: (y) => [utc(y, 1, 3)],
    tip: 'تتفرغ الأسرة للمذاكرة — منتجات التركيز والسهر والتنظيم.',
    ideas: ['إضاءة مكتب LED ولمبات قراءة', 'مكاتب وترابيزات مذاكرة قابلة للطي', 'منظّمات مكتب وحوامل كتب', 'ترامس وماجات قهوة', 'منبّهات وساعات حائط', 'أدوات مكتبية: هايلايتر، Sticky notes، أقلام', 'وسائد ظهر وكراسي مريحة'] },
  { key: 'midyear_break', name: 'إجازة نص السنة', icon: '🧸', color: '#f97316', duration: 14, prep: 21,
    dates: (y) => [utc(y, 1, 24)],
    tip: 'يقضي الأطفال أسبوعين في المنزل — الألعاب والأنشطة والنزهات.',
    ideas: ['ألعاب تعليمية وبازل ومكعبات', 'أطقم رسم وتلوين وصلصال', 'ألعاب جماعية (أونو، كوتشينة، شطرنج)', 'أطقم خرز وأشغال يدوية', 'شنط ومستلزمات خروجات'] },
  { key: 'valentine', name: 'عيد الحب', icon: '❤️', color: '#e11d48', duration: 1, prep: 21,
    dates: (y) => [utc(y, 2, 14)],
    tip: 'هدايا بأسعار متوسطة — التغليف الأنيق يُحدث فرقاً في المبيعات.',
    ideas: ['علب وأكياس هدايا وتغليف', 'ماجات وأكواب مطبوعة وأطقم فناجين', 'إضاءة ديكور LED وشموع', 'إكسسوارات ومنظّمات مجوهرات', 'أجهزة عناية شخصية صغيرة'] },
  { key: 'spring', name: 'الربيع والزراعة المنزلية', icon: '🌱', color: '#22c55e', duration: 60, prep: 30,
    dates: (y) => [utc(y, 3, 1)],
    tip: 'أفضل وقت للزراعة في الشرفات والحدائق، ويتزامن مع التنظيف الشامل للمنزل.',
    ideas: ['أصص وزراعات وحوامل نباتات', 'أدوات زراعة صغيرة ومرشّات مياه', 'خراطيم ورشاشات حدائق', 'أدوات تنظيف شامل: مماسح، فرش، منظّفات زجاج', 'منظّمات ودواليب تخزين'] },
  { key: 'mosquito', name: 'موسم الناموس والحشرات', icon: '🦟', color: '#65a30d', duration: 150, prep: 30,
    dates: (y) => [utc(y, 4, 15)],
    tip: 'يبدأ الطلب مع ارتفاع الحرارة ويستمر حتى أكتوبر — منتج سريع الدوران.',
    ideas: ['صواعق ناموس كهربائية ومضارب', 'ناموسيات أسرّة وأطفال', 'سلك شبابيك ولاصق ناموسية', 'أجهزة طاردة للحشرات (أقراص وسائل)', 'مصائد حشرات وفئران'] },
  { key: 'exams_final', name: 'امتحانات آخر السنة والثانوية العامة', icon: '🎓', color: '#4f46e5', duration: 45, prep: 21,
    dates: (y) => [utc(y, 5, 15)],
    tip: 'أطول موسم مذاكرة في العام — ويتزامن مع بداية الصيف.',
    ideas: ['إضاءة مكتب ولمبات قراءة', 'مراوح مكتب صغيرة', 'ترامس وماجات وزمزميات', 'منظّمات مكتب ومذاكرة', 'أدوات مكتبية', 'هدايا نجاح'] },
  { key: 'hajj', name: 'موسم الحج', icon: '🕋', color: '#0d9488', duration: 25, prep: 30, hijri: true,
    dates: (y) => hijriInYear(y, 11, 15),
    tip: 'يسافر الحجاج قبل العيد بـ 3–4 أسابيع — ويرتفع الطلب على الهدايا بعد عودتهم.',
    ideas: ['شنط سفر ومنظّمات شنط', 'أحزمة وشنط وسط للفلوس والباسبور', 'شباشب طبية وصنادل مريحة', 'مظلات شمس ومراوح يد ورشاشات مياه', 'زمزميات وترامس', 'سجاجيد صلاة وسبح ومصاحف جيب (هدايا)'] },
  { key: 'prime_day', name: 'برايم داي أمازون', icon: '📦', color: '#0ea5e9', duration: 3, prep: 30,
    dates: (y) => [utc(y, 7, 8)],
    tip: 'تُعلن أمازون الموعد سنوياً (غالباً في يوليو) — يُرجى تعديله فور الإعلان وتقديم العروض من Seller Central مسبقاً.',
    ideas: ['الأصناف الأكثر مبيعاً لديك بخصم', 'باندلز بسعر مميز', 'تصفية المخزون الراكد', 'أجهزة المطبخ الصغيرة'] },
  { key: 'weddings', name: 'موسم الأفراح وجهاز العرايس', icon: '💍', color: '#db2777', duration: 90, prep: 45,
    dates: (y) => [utc(y, 7, 1)],
    tip: 'أكبر موسم للمطبخ والمنزل في مصر — يبدأ بعد عيد الفطر ويبلغ ذروته في الصيف. تُباع الأطقم الكاملة أفضل من القطع الفردية.',
    ideas: ['أطقم حلل وأواني طبخ كاملة', 'أطقم سكاكين وأدوات مطبخ', 'أجهزة مطبخ صغيرة: خلاط، كبة، محضّر طعام، قلاية هوائية', 'أطقم تقديم وصواني وأطباق', 'علب وبرطمانات تخزين وتوابل', 'منظّمات مطبخ وأدراج ودواليب', 'مفارش سفرة وفوط مطبخ', 'أطقم فناجين وكاسات'] },
  { key: 'mango_mouna', name: 'موسم المانجا والمونة', icon: '🥭', color: '#fb923c', duration: 60, prep: 30,
    dates: (y) => [utc(y, 7, 15)],
    tip: 'موسم العصائر وتخزين المؤونة (صلصة، مخللات، مربى) قبل انتهاء المواسم.',
    ideas: ['عصّارات وخلاطات', 'برطمانات زجاج بأحجام مختلفة', 'أكياس وعلب تفريز', 'أدوات تقطيع وتقشير', 'قمع ومصافي وأدوات تعبئة', 'دوارق وكاسات عصير'] },
  { key: 'sales_1111', name: 'عروض 11.11', icon: '🏷️', color: '#a855f7', duration: 3, prep: 21,
    dates: (y) => [utc(y, 11, 11)],
    tip: 'بداية موسم العروض في نهاية العام على نون وأمازون — تليه الجمعة البيضاء.',
    ideas: ['عروض على الأكثر مبيعاً', 'باندلز', 'تصفية المخزون الراكد قبل الشتاء'] },
];

async function getConfig() {
  const s = await Setting.findOne({ key: 'seasons' }).lean();
  return { disabled: [], overrides: {}, custom: [], products: {}, ideas: {}, ...(s?.value || {}) };
}

// كل مواسم السنة دي والسنة الجاية — مع التعديلات والمواسم المضافة
async function buildSeasons() {
  const cfg = await getConfig();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const year = today.getUTCFullYear();
  const out = [];
  // أصناف الموسم من المخزون — برصيدها الحالي
  const ids = [...new Set(Object.values(cfg.products).flat().map(String))];
  const prods = ids.length ? await Product.find({ _id: { $in: ids } }).select('name stock minStock sellPrice buyPrice barcode sku').lean() : [];
  const prodMap = new Map(prods.map(p => [String(p._id), { _id: p._id, name: p.name, stock: p.stock, minStock: p.minStock, sellPrice: p.sellPrice, barcode: p.barcode, sku: p.sku, low: p.stock <= (p.minStock || 0) }]));
  const add = (s, date, extra = {}) => {
    const end = new Date(date.getTime() + Math.max(1, s.duration || 1) * DAY);
    if (end <= today) return;
    const daysLeft = Math.round((date - today) / DAY);
    const lead = s.lead ?? cfg.lead ?? 30;
    out.push({
      key: s.key, id: `${s.key}_${date.getUTCFullYear()}`, name: s.name, icon: s.icon || '📅', color: s.color || '#6366f1',
      date: iso(date), daysLeft, lead, active: daysLeft <= 0, soon: daysLeft > 0 && daysLeft <= lead,
      prepBy: s.prep ? iso(new Date(date.getTime() - s.prep * DAY)) : null, prep: s.prep || null,
      duration: s.duration || 1, tip: s.tip || '', ideas: s.ideas || [], myIdeas: cfg.ideas[s.key] || [], hijri: !!s.hijri,
      products: (cfg.products[s.key] || []).map(id => prodMap.get(String(id))).filter(Boolean),
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
  return out.sort((a, b) => a.date.localeCompare(b.date)).filter(s => !seen.has(s.key) && seen.add(s.key))
    .map(s => ({ ...s, lowCount: s.products.filter(p => p.low).length }));
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

// ربط أصناف من المخزون بالموسم
router.post('/:key/products', auth, permit('settings', 'products'), async (req, res) => {
  const cfg = await getConfig();
  const { key } = req.params;
  const ids = (Array.isArray(req.body.products) ? req.body.products : [req.body.product]).filter(Boolean).map(String);
  if (!ids.length || !(await Product.countDocuments({ _id: { $in: ids } }))) return res.status(400).json({ message: 'الصنف غير موجود' });
  cfg.products[key] = [...new Set([...(cfg.products[key] || []).map(String), ...ids])];
  await save(cfg);
  res.json({ message: 'تمت الإضافة للموسم' });
});
router.delete('/:key/products/:pid', auth, permit('settings', 'products'), async (req, res) => {
  const cfg = await getConfig();
  cfg.products[req.params.key] = (cfg.products[req.params.key] || []).map(String).filter(id => id !== req.params.pid);
  await save(cfg);
  res.json({ message: 'تمت الإزالة' });
});
// أفكار خاصة بيك تتضاف لأفكار الموسم
router.post('/:key/ideas', auth, permit('settings', 'products'), async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 120);
  if (!text) return res.status(400).json({ message: 'اكتب الفكرة' });
  const cfg = await getConfig();
  cfg.ideas[req.params.key] = [...new Set([...(cfg.ideas[req.params.key] || []), text])];
  await save(cfg);
  res.json({ message: 'تمت الإضافة' });
});
router.delete('/:key/ideas', auth, permit('settings', 'products'), async (req, res) => {
  const cfg = await getConfig();
  cfg.ideas[req.params.key] = (cfg.ideas[req.params.key] || []).filter(t => t !== req.body.text);
  await save(cfg);
  res.json({ message: 'تم الحذف' });
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
