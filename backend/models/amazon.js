const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── AMAZON ORDER LINE (من تقرير الطلبات) ─────────────────────
// سطر لكل (رقم طلب + SKU)
const amazonOrderSchema = new Schema({
  orderId:      { type: String, required: true, index: true },
  sku:          { type: String, required: true },
  asin:         { type: String, default: '' },
  productName:  { type: String, default: '' },
  qty:          { type: Number, default: 1 },
  itemPrice:    { type: Number, default: 0 },   // إجمالي سعر السطر (الكمية × السعر)
  shippingPrice:{ type: Number, default: 0 },
  purchaseDate: { type: Date },
  amazonStatus: { type: String, default: '' },  // الحالة كما في تقرير أمازون
  // مرحلة التجهيز الداخلية (Seller Flex)
  stage:        { type: String, enum: ['new','packed','shipped','delivered','returned','cancelled'], default: 'new' },
  city:         { type: String, default: '' },
  product:      { type: Schema.Types.ObjectId, ref: 'Product' },
  sale:         { type: Schema.Types.ObjectId, ref: 'Sale' }, // فاتورة البيع بعد الترحيل
  notes:        { type: String, default: '' },
  manual:       { type: Boolean, default: false } // اتسجل من شاشة الاسكانر قبل رفع التقرير
}, { timestamps: true });
amazonOrderSchema.index({ orderId: 1, sku: 1 }, { unique: true });
const AmazonOrder = mongoose.model('AmazonOrder', amazonOrderSchema);

// ─── AMAZON TRANSACTION (من تقرير المعاملات / التسوية) ──────────
const amazonTxSchema = new Schema({
  hash:          { type: String, required: true, unique: true }, // لمنع التكرار عند إعادة الرفع
  date:          { type: Date },
  settlementId:  { type: String, default: '' },
  type:          { type: String, default: '' },  // كما في التقرير
  kind:          { type: String, enum: ['order','refund','fee','transfer','other'], default: 'other' },
  orderId:       { type: String, default: '', index: true },
  sku:           { type: String, default: '', index: true },
  description:   { type: String, default: '' },
  qty:           { type: Number, default: 0 },
  productSales:  { type: Number, default: 0 },
  shippingCredits:{ type: Number, default: 0 },
  promoRebates:  { type: Number, default: 0 },
  sellingFees:   { type: Number, default: 0 },
  fulfillmentFees:{ type: Number, default: 0 },
  otherFees:     { type: Number, default: 0 },
  other:         { type: Number, default: 0 },
  total:         { type: Number, default: 0 }
}, { timestamps: true });
const AmazonTransaction = mongoose.model('AmazonTransaction', amazonTxSchema);

// ─── ربط SKU أمازون بمنتج في النظام ───────────────────────────
const skuMapSchema = new Schema({
  sku:     { type: String, required: true, unique: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }
}, { timestamps: true });
const AmazonSkuMap = mongoose.model('AmazonSkuMap', skuMapSchema);

module.exports = { AmazonOrder, AmazonTransaction, AmazonSkuMap };
