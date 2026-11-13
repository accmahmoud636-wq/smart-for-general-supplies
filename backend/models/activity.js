const mongoose = require('mongoose');
// سجل نشاط المستخدمين: كل عملية تعديل ناجحة + الدخول والخروج
const activitySchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name:   String,
  action: String,        // وصف عربي: «ترحيل شحنة»، «حذف فاتورة بيع» ...
  ref:    String,        // رقم الفاتورة / الشحنة / اسم الصنف
  method: String,
  path:   String,
  ip:     String,
  at:     { type: Date, default: Date.now, index: true },
});
module.exports = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
