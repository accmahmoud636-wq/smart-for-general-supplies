require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());

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
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log('🚀 Server on port ' + PORT));
  })
  .catch(err => console.error('❌ DB:', err));
