const mongoose = require('mongoose');
const { Schema } = mongoose;
// جرد المخزون: مسودة ← ترحيل (التسويات بتتعمل عند الترحيل)
const lineSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name:    String,
  barcode: String,
  system:  { type: Number, default: 0 },   // رصيد النظام وقت إضافة الصنف للجرد
  counted: { type: Number, default: 0 },   // الكمية الفعلية
  cost:    { type: Number, default: 0 },
}, { _id: false });
const countSchema = new Schema({
  no:        { type: String, unique: true },
  title:     { type: String, default: '' },
  status:    { type: String, enum: ['draft', 'posted'], default: 'draft' },
  lines:     [lineSchema],
  notes:     { type: String, default: '' },
  result:    { type: Schema.Types.Mixed },  // ملخص بعد الترحيل
  postedAt:  Date,
  postedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
module.exports = { InventoryCount: mongoose.models.InventoryCount || mongoose.model('InventoryCount', countSchema) };
