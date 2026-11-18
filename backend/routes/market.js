// ═══════════════════════════════════════════════════════════════
// رصد السوق والترند — قائمة متابعة للمنتجات الرائجة
// ═══════════════════════════════════════════════════════════════
const router = require('express').Router();
const { MarketItem } = require('../models/market');
const { auth, permit } = require('../middleware/auth');
const Setting = require('../models/Setting');

const BS = 'https://www.amazon.eg/gp/bestsellers';
// القائمة المبدئية: من صفحات «الأكثر مبيعاً» على أمازون مصر (نوفمبر 2026) — بتتسجل مرة واحدة
const SEED = [
  ['ميزان مطبخ ديجيتال 10 كجم (Portal)', 'أدوات المطبخ', 120, 3.7, 4089, '#1 أدوات المطبخ', `${BS}/home/21863850031`],
  ['مقشرة خضار ستانلس شكل Y', 'أدوات المطبخ', 57, 4.2, 742, '#7 أدوات المطبخ', `${BS}/home/21863850031`],
  ['قالب كفتة وكباب 3 فتحات', 'أدوات المطبخ', 83.6, 0, 0, '#1 أطقم أدوات المطبخ', `${BS}/home/21864043031`],
  ['جهاز سلق البيض 7 بيضات (Lingrui)', 'أجهزة المطبخ', 198, 3.9, 487, '#1 أجهزة سلق البيض', `${BS}/home/21864387031`],
  ['طاسة جرانيت 24 سم (Top Chef)', 'الأواني', 653, 4.5, 401, '#1 أواني الطهي', `${BS}/home/21863844031`],
  ['طاسة تيفال 18 سم (Trueval)', 'الأواني', 175, 4.2, 151, '#2 أواني الطهي', `${BS}/home/21863844031`],
  ['طقم طاسات تيفال قطعتين 16-22 (Trueval)', 'الأواني', 409, 4.1, 539, '#6 أواني الطهي', `${BS}/home/21863844031`],
  ['طقم حلل 6 قطع (Zinox Express)', 'الأواني', 1285, 3.8, 234, '#1 أطقم الحلل', `${BS}/home/21864428031`],
  ['منظم مطبخ وحمام 3 أرفف أبيض', 'التنظيم والتخزين', 205, 3.9, 386, '#1 تنظيم المطبخ', `${BS}/home/21864034031`],
  ['رف ركنة بامبو 3 أدوار', 'التنظيم والتخزين', 115, 3.3, 112, '#3 تنظيم المطبخ', `${BS}/home/21864034031`],
  ['فوط ميكروفايبر للتنظيف — 20 قطعة', 'التنظيف', 0, 0, 0, '#2 المنزل والمطبخ', `${BS}/home`],
  ['أغطية مطاطة لحفظ الأكل — 100 غطاء', 'التنظيم والتخزين', 19, 3.5, 711, '#3 المنزل والمطبخ', `${BS}/home`],
  ['طقم فوط مطبخ قطن 5 قطع', 'مفارش المطبخ', 45, 3.6, 1395, '#3 مفارش المطبخ', `${BS}/home/21863845031`],
  ['مريلة طبخ ضد المياه', 'مفارش المطبخ', 61.65, 3.8, 834, '#12 مفارش المطبخ', `${BS}/home/21863845031`],
  ['معطر سيارة معلّق (Godrej aer O)', 'مستلزمات السيارات', 93.58, 3.8, 10523, '#1 إكسسوارات السيارات', `${BS}/automotive/21805227031`],
  ['قواعد أكواب للسيارة 4 قطع (Singaro)', 'مستلزمات السيارات', 149, 4.4, 29849, '#15 السيارات', `${BS}/automotive`],
  ['منظم فراغ كرسي السيارة — قطعتين', 'مستلزمات السيارات', 333, 4.0, 205, '#1 منظمات السيارة', `${BS}/automotive/85437953031`],
  ['منفاخ كاوتش ديجيتال (Michelin)', 'مستلزمات السيارات', 2300, 4.5, 2131, '#3 الإطارات والجنوط', `${BS}/automotive/21805090031`],
  ['منفاخ رجل بعداد (Mercury)', 'مستلزمات السيارات', 199.06, 3.3, 467, '#2 الإطارات والجنوط', `${BS}/automotive/21805090031`],
  ['كفر الكنبة الخلفية ضد المياه', 'مستلزمات السيارات', 495, 4.3, 112, '#1 كفرات الكراسي', `${BS}/automotive/85437480031`],
  ['مصد باب السيارة 25 سم', 'مستلزمات السيارات', 119.4, 3.6, 37, '#1 مصدات الأبواب', `${BS}/automotive/21806539031`],
];
async function seedOnce(userId) {
  if (await Setting.findOne({ key: 'market_seeded' }).lean()) return;
  if (!(await MarketItem.countDocuments())) {
    await MarketItem.insertMany(SEED.map(([name, category, price, rating, reviews, rank, url]) => ({ name, category, price, rating, reviews, rank, url, source: 'أمازون مصر', note: 'من قائمة الأكثر مبيعاً — نوفمبر 2026', createdBy: userId })));
  }
  await Setting.create({ key: 'market_seeded', value: { at: new Date() } });
}

const clean = (b) => ({
  name: String(b.name || '').trim().slice(0, 200), category: String(b.category || '').slice(0, 80),
  price: Math.max(0, +b.price || 0), rating: Math.min(5, Math.max(0, +b.rating || 0)), reviews: Math.max(0, Math.round(+b.reviews || 0)),
  rank: String(b.rank || '').slice(0, 80), source: String(b.source || 'أمازون مصر').slice(0, 60),
  url: /^https?:\/\//i.test(b.url || '') ? String(b.url).slice(0, 500) : '', note: String(b.note || '').slice(0, 500),
  ...(['idea', 'sample', 'added', 'rejected'].includes(b.status) ? { status: b.status } : {}),
});

router.get('/', auth, permit('amazon:read'), async (req, res) => {
  try { await seedOnce(req.user._id); res.json(await MarketItem.find().sort('-createdAt').lean()); }
  catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/', auth, permit('amazon'), async (req, res) => {
  const d = clean(req.body);
  if (!d.name) return res.status(400).json({ message: 'اسم المنتج مطلوب' });
  res.status(201).json(await MarketItem.create({ ...d, createdBy: req.user._id }));
});
router.put('/:id', auth, permit('amazon'), async (req, res) => {
  const d = clean({ ...req.body });
  if (req.body.name !== undefined && !d.name) return res.status(400).json({ message: 'اسم المنتج مطلوب' });
  const doc = await MarketItem.findByIdAndUpdate(req.params.id, Object.fromEntries(Object.entries(d).filter(([k]) => req.body[k] !== undefined)), { new: true });
  if (!doc) return res.status(404).json({ message: 'غير موجود' });
  res.json(doc);
});
router.delete('/:id', auth, permit('amazon'), async (req, res) => {
  await MarketItem.findByIdAndDelete(req.params.id);
  res.json({ message: 'تم الحذف' });
});

module.exports = router;
