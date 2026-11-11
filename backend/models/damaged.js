const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── صور المرتجعات التالفة ─────────────────────────────────────
// الصورة بتتضغط في المتصفح (حوالي 100–200KB) وتتحفظ كـ data URL
const photoSchema = new Schema({
  data:      { type: String, required: true },
  size:      { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const DamagedPhoto = mongoose.model('DamagedPhoto', photoSchema);

// ─── مخزن التوالف ──────────────────────────────────────────────
// كل مرتجع تالف بيتسجل هنا وقت ترحيل الشحنة (ما بيدخلش المخزون الرئيسي)
// قيد المراجعة ← (مطالبة أمازون ← تم التعويض) | إعدام | إرجاع للمخزون الرئيسي
const STATUSES = {
  pending:     'قيد المراجعة',
  claimed:     'تمت المطالبة من أمازون',
  reimbursed:  'تم التعويض',
  written_off: 'إعدام',
  restored:    'أُعيد للمخزون الرئيسي',
};
const damagedSchema = new Schema({
  product:    { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name:       { type: String, default: '' },
  barcode:    { type: String, default: '' },
  qty:        { type: Number, required: true, min: 1 },
  unitCost:   { type: Number, default: 0 },          // سعر الشراء وقت الترحيل
  shipment:   { type: Schema.Types.ObjectId, ref: 'Shipment' },
  shipmentNo: { type: String, default: '' },
  employee:   { type: Schema.Types.ObjectId, ref: 'Employee' },
  note:       { type: String, default: '' },
  photos:     [{ type: Schema.Types.ObjectId, ref: 'DamagedPhoto' }],
  status:     { type: String, enum: Object.keys(STATUSES), default: 'pending' },
  claimNo:    { type: String, default: '' },          // رقم مطالبة SAFE-T
  reimbursed: { type: Number, default: 0 },           // مبلغ التعويض
  history:    [{ _id: false, status: String, note: String, at: { type: Date, default: Date.now }, by: { type: Schema.Types.ObjectId, ref: 'User' } }],
  createdBy:  { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Damaged = mongoose.model('Damaged', damagedSchema);

module.exports = { Damaged, DamagedPhoto, DAMAGED_STATUSES: STATUSES };
