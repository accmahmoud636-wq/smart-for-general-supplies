require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
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
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
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
