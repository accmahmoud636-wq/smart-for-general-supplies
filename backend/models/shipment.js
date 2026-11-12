const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── الموظف (ليه كارت باركود بيمسحه في أول الشحنة) ─────────────
const employeeSchema = new Schema({
  name:   { type: String, required: true, trim: true },
  code:   { type: String, required: true, unique: true, uppercase: true, trim: true }, // EMP0001
  active: { type: Boolean, default: true },
  user:   { type: Schema.Types.ObjectId, ref: 'User' }   // حساب الدخول المربوط بالكارت
}, { timestamps: true });
const Employee = mongoose.model('Employee', employeeSchema);

// ─── الشحنة / البضاعة المسلّمة ────────────────────────────────
// مسودة ← (ترحيل: يخصم المبيعات ويرجّع المرتجع للمخزون) ← مطابقة مع ملف أمازون
const shipmentItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name:    { type: String, default: '' },
  barcode: { type: String, default: '' },
  qty:     { type: Number, required: true, min: 1 },
  type:    { type: String, enum: ['sale', 'return'], default: 'sale' },
  // للمرتجع بس: يرجع المخزن الرئيسي (افتراضي) ولا مخزن التوالف
  dest:    { type: String, enum: ['main', 'damaged'], default: 'main' },
  note:    { type: String, default: '' },
  photos:  [{ type: Schema.Types.ObjectId, ref: 'DamagedPhoto' }]
}, { _id: false });

const shipmentSchema = new Schema({
  no:        { type: String, required: true, unique: true },     // SH-00001
  date:      { type: Date, default: Date.now },
  employee:  { type: Schema.Types.ObjectId, ref: 'Employee' },
  customer:  { type: Schema.Types.ObjectId, ref: 'Customer' },   // أمازون / نون / جوميا ...
  items:     [shipmentItemSchema],
  notes:     { type: String, default: '' },
  status:    { type: String, enum: ['draft', 'posted'], default: 'draft' },
  postedAt:  { type: Date },
  postedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  // ملف أمازون اللي اتطابق عليه — بنحفظ المجاميع لكل SKU عشان المطابقة تتعاد لو ربطت SKU جديد
  match: {
    fileName:   String,
    fileType:   String,               // transactions | orders
    uploadedAt: Date,
    from:       Date,
    to:         Date,
    amazon:     [{ _id: false, sku: String, name: String, sale: Number, ret: Number, orders: Number }],
    result:     { type: String, enum: ['matched', 'diff', null], default: null }
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Shipment = mongoose.model('Shipment', shipmentSchema);

module.exports = { Employee, Shipment };
