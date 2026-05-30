require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const { Category, Supplier, Customer, Product } = require('./models/index');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected...');

  // Create superadmin
  const existing = await User.findOne({ email: 'admin@erp.com' });
  if (!existing) {
    await User.create({ name: 'مدير النظام', email: 'admin@erp.com', password: 'admin123', role: 'superadmin' });
    console.log('✅ Superadmin created: admin@erp.com / admin123');
  }

  // Sample categories
  const cats = ['إلكترونيات', 'ملابس', 'منزل ومطبخ', 'رياضة', 'كتب'];
  const colors = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6'];
  const catDocs = [];
  for (let i = 0; i < cats.length; i++) {
    let c = await Category.findOne({ name: cats[i] });
    if (!c) c = await Category.create({ name: cats[i], color: colors[i] });
    catDocs.push(c);
  }
  console.log('✅ Categories seeded');

  // Sample suppliers
  const sup1 = await Supplier.findOne({ name: 'Alibaba Supplier' }) ||
    await Supplier.create({ name: 'Alibaba Supplier', country: 'الصين', email: 'supplier@alibaba.com', phone: '+86-123-456' });
  const sup2 = await Supplier.findOne({ name: 'AE Direct' }) ||
    await Supplier.create({ name: 'AE Direct', country: 'الإمارات', email: 'ae@direct.com' });

  // Sample products
  const products = [
    { name: 'سماعة لاسلكية Bluetooth', sku: 'EL-001', asin: 'B08XXXXX01', category: catDocs[0]._id, supplier: sup1._id, buyPrice: 50, sellPrice: 120, stock: 45, minStock: 10 },
    { name: 'شاحن سريع USB-C', sku: 'EL-002', asin: 'B08XXXXX02', category: catDocs[0]._id, supplier: sup1._id, buyPrice: 15, sellPrice: 45, stock: 3, minStock: 10 },
    { name: 'حقيبة رياضية', sku: 'SP-001', asin: 'B08XXXXX03', category: catDocs[3]._id, supplier: sup2._id, buyPrice: 80, sellPrice: 199, stock: 20, minStock: 5 },
  ];
  for (const p of products) {
    if (!await Product.findOne({ sku: p.sku })) await Product.create(p);
  }
  console.log('✅ Products seeded');

  // Sample customer
  if (!await Customer.findOne({ name: 'Amazon Customer' }))
    await Customer.create({ name: 'Amazon Customer', amazonId: 'AMZ-DEFAULT', country: 'السعودية' });

  console.log('\n🎉 Seed complete!');
  console.log('Login: admin@erp.com | Password: admin123');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
