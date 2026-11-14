require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
// ضغط الردود (البيانات وملفات البرنامج بتنزل أصغر ٤-٦ مرات)
try { app.use(require('compression')({ threshold: 1024 })); } catch { console.warn('compression غير مثبت'); }
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
// تقارير أمازون ممكن تكون كبيرة — وملف الاسترجاع أكبر
const jsonSmall = express.json({ limit: '25mb' }), jsonBig = express.json({ limit: '150mb' });
app.use((req, res, next) => (req.path === '/api/admin/restore' ? jsonBig : jsonSmall)(req, res, next));

app.use(require('./utils/activity').activityLogger);   // سجل النشاط
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/users',      require('./routes/users'));

const { prodRouter, catRouter, supRouter, custRouter } = require('./routes/products');
app.use('/api/products',   prodRouter);
app.use('/api/categories', catRouter);
app.use('/api/suppliers',  supRouter);
app.use('/api/customers',  custRouter);

app.use('/api/purchases',  require('./routes/purchases'));
app.use('/api/sales',      require('./routes/sales'));

const { expRouter, stockRouter, reportsRouter } = require('./routes/reports');
app.use('/api/expenses',   expRouter);
app.use('/api/stock',      stockRouter);
app.use('/api/reports',    reportsRouter);

app.use('/api/amazon',     require('./routes/amazon'));
app.use('/api/shipments',  require('./routes/shipments'));
app.use('/api/damaged',    require('./routes/damaged'));
app.use('/api/assistant',  require('./routes/assistant'));
app.use('/api/seasons',    require('./routes/seasons'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/home',       require('./routes/home'));
app.use('/api/admin',      require('./routes/admin'));

if (process.env.NODE_ENV === 'production') {
  // ملفات البرنامج أسماؤها بتتغير مع كل تحديث → المتصفح يحتفظ بيها؛ index.html دايماً جديد
  app.use(express.static(path.join(__dirname, '../frontend/dist'), {
    setHeaders: (res, file) => res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache'),
  }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api'))
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

async function autoSeed() {
  try {
    const User = require('./models/User');
    const count = await User.countDocuments();
    if (count === 0) {
      await User.create({
        name: 'مدير النظام',
        email: 'admin@erp.com',
        password: 'admin123',
        role: 'superadmin'
      });
      console.log('✅ Admin created: admin@erp.com / admin123');
    }
  } catch(e) {
    console.log('Seed error:', e.message);
  }
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    await autoSeed();
    // مرة واحدة: اللي كان معاه صلاحية الشحنات (مخصصة) ياخد صلاحية الترحيل عشان شغله مايقفش
    try {
      const Setting = require('./models/Setting');
      if (!(await Setting.findOne({ key: 'perm_migr_post' }).lean())) {
        const User = require('./models/User');
        await User.updateMany({ useCustom: true, customPermissions: 'shipments' }, { $addToSet: { customPermissions: 'shipments_post' } });
        await Setting.create({ key: 'perm_migr_post', value: true });
      }
    } catch (e) { console.error('perm migration:', e.message); }
    // تصحيح مرة واحدة: روابط SKU غلط من الاستيراد (أكواد FNSKU X00...، ورموز آخرها X رقم اتقرت باكدج)
    try {
      const Setting = require('./models/Setting');
      if (!(await Setting.findOne({ key: 'fix_sku_maps_2' }).lean())) {
        const { AmazonSkuMap, AmazonOrder, AmazonTransaction } = require('./models/amazon');
        const seen = async (sku) => !!(await AmazonOrder.exists({ sku }) || await AmazonTransaction.exists({ sku }));
        const fn = await AmazonSkuMap.deleteMany({ sku: /^X00[0-9A-Z]{7}$/ });
        let fixed = 0;
        // رموز أمازون التلقائية شكلها 2-4-4 (زي 68-J4CS-4TX4 أو L4-XQ15-SX03): لو اتقصّت عند X نرجّعها
        for (const m of await AmazonSkuMap.find({ qty: { $gt: 1 }, sku: /^[A-Z0-9]{2}-[A-Z0-9]{4}-[A-Z0-9]{0,2}$/ }).lean()) {
          const left = 3 - m.sku.split('-')[2].length;     // عدد الأرقام اللي كانت بعد X
          if (String(m.qty).length > left || await seen(m.sku)) continue;   // رمز حقيقي موجود في أمازون: نسيبه
          const real = `${m.sku}X${String(m.qty).padStart(left, '0')}`;
          if (await AmazonSkuMap.exists({ sku: real })) await AmazonSkuMap.deleteOne({ _id: m._id });
          else await AmazonSkuMap.updateOne({ _id: m._id }, { $set: { sku: real, qty: 1 } });
          fixed++;
        }
        // نفس المشكلة بس آخرها X1 أو X0 (اتسجلت كمية 1): مش معروف الأصلي — ندوّر عليه في طلبات/معاملات أمازون، وإلا الرابط يتمسح (إعادة الاستيراد بترجّعه صح)
        for (const m of await AmazonSkuMap.find({ qty: { $lte: 1 }, sku: /^[A-Z0-9]{2}-[A-Z0-9]{4}-[A-Z0-9]{0,2}$/ }).lean()) {
          const left = 3 - m.sku.split('-')[2].length;
          if (await seen(m.sku)) continue;
          const cands = ['0', '1'].map(d => `${m.sku}X${d.padStart(left, '0')}`);
          let real = null;
          for (const c of cands) if (await seen(c)) { real = c; break; }
          if (real && !(await AmazonSkuMap.exists({ sku: real }))) await AmazonSkuMap.updateOne({ _id: m._id }, { $set: { sku: real, qty: 1 } });
          else await AmazonSkuMap.deleteOne({ _id: m._id });
          fixed++;
        }
        await Setting.create({ key: 'fix_sku_maps_2', value: { fnsku: fn.deletedCount, fixed, at: new Date() } });
        if (fn.deletedCount || fixed) console.log(`🔧 SKU maps: حذف ${fn.deletedCount} FNSKU، تصحيح ${fixed}`);
      }
    } catch (e) { console.error('sku map fix:', e.message); }
    // روابط SKU لأصناف محذوفة (مؤرشفة) → تتمسح، عشان الرمز يبان «غير مربوط» ويتربط عادي
    try {
      const { AmazonSkuMap } = require('./models/amazon');
      const { Product } = require('./models/index');
      const live = new Set((await Product.find({ active: { $ne: false } }).select('_id').lean()).map(p => String(p._id)));
      const dead = (await AmazonSkuMap.find().select('product').lean()).filter(m => !live.has(String(m.product))).map(m => m._id);
      if (dead.length) { await AmazonSkuMap.deleteMany({ _id: { $in: dead } }); console.log(`🔧 فك ربط ${dead.length} رمز SKU كانوا على أصناف محذوفة`); }
    } catch (e) { console.error('dead maps:', e.message); }
    // تصحيح: أي رصيد اتسجل على صنف مركب (من فواتير قبل التحديث) يتنقل لمكوناته، والطقم يرجع صفر
    try {
      const { Product } = require('./models/index');
      const { moveStock } = require('./utils/stock');
      for (const k of await Product.find({ isKit: true, stock: { $ne: 0 } })) {
        const d = k.stock;
        k.stock = 0; await k.save();
        for (const c of k.components || [])
          await moveStock(c.product, d * (c.qty || 1), { type: d < 0 ? 'out' : 'in', reason: `تصحيح حركة سابقة على الطقم: ${k.name}`, reference: 'KIT-FIX' });
        console.log(`kit fix: ${k.name} (${d})`);
      }
    } catch (e) { console.error('kit fix:', e.message); }
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log('🚀 Server on port ' + PORT));
  })
  .catch(err => console.error('❌ DB:', err));
