# Amazon ERP System 🛍️
نظام إدارة المخزون والحسابات لتجارة Amazon

## الميزات
- إدارة المنتجات والمخزون مع تنبيهات المخزون المنخفض
- فواتير الشراء (تحديث المخزون تلقائياً)
- فواتير المبيعات (خصم المخزون تلقائياً)
- إدارة الموردين والعملاء
- المصروفات ودفتر الحسابات
- تقارير P&L وإحصائيات المخزون
- إدارة المستخدمين بالصلاحيات (6 أدوار)

## الأدوار
- superadmin: كل الصلاحيات
- admin: إدارة كاملة بدون حذف مستخدمين
- accountant: فواتير + مصروفات + تقارير
- inventory: مخزون + مشتريات
- sales: مبيعات + عملاء
- viewer: عرض فقط

## الرفع على Render
1. ارفع المشروع على GitHub
2. New Web Service → اختر الـ repo
3. Build Command: `npm run build`
4. Start Command: `npm start`
5. أضف Environment Variables:
   - MONGO_URI = رابط MongoDB Atlas
   - JWT_SECRET = كلمة سر عشوائية
   - NODE_ENV = production

## بعد الرفع
شغّل أمر الـ seed لإنشاء الأدمن:
`npm run seed` في Render Shell

Login: admin@erp.com / admin123
