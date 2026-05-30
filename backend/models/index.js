const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── CATEGORY ────────────────────────────────────────────────
const categorySchema = new Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  color:       { type: String, default: '#6366f1' }
}, { timestamps: true });
const Category = mongoose.model('Category', categorySchema);

// ─── SUPPLIER ─────────────────────────────────────────────────
const supplierSchema = new Schema({
  name:    { type: String, required: true, trim: true },
  country: { type: String, default: '' },
  contact: { type: String, default: '' },
  phone:   { type: String, default: '' },
  email:   { type: String, default: '' },
  balance: { type: Number, default: 0 }, // positive = we owe them
  notes:   { type: String, default: '' }
}, { timestamps: true });
const Supplier = mongoose.model('Supplier', supplierSchema);

// ─── CUSTOMER ─────────────────────────────────────────────────
const customerSchema = new Schema({
  name:          { type: String, required: true, trim: true },
  amazonId:      { type: String, default: '' },
  email:         { type: String, default: '' },
  phone:         { type: String, default: '' },
  country:       { type: String, default: '' },
  balance:       { type: Number, default: 0 }, // positive = they owe us
  notes:         { type: String, default: '' }
}, { timestamps: true });
const Customer = mongoose.model('Customer', customerSchema);

// ─── PRODUCT ──────────────────────────────────────────────────
const productSchema = new Schema({
  name:       { type: String, required: true, trim: true },
  sku:        { type: String, unique: true, sparse: true },
  asin:       { type: String, default: '' }, // Amazon ASIN
  category:   { type: Schema.Types.ObjectId, ref: 'Category' },
  supplier:   { type: Schema.Types.ObjectId, ref: 'Supplier' },
  buyPrice:   { type: Number, required: true, default: 0 },
  sellPrice:  { type: Number, required: true, default: 0 },
  stock:      { type: Number, default: 0 },
  minStock:   { type: Number, default: 5 },  // low stock alert
  unit:       { type: String, default: 'قطعة' },
  barcode:    { type: String, default: '' },
  description:{ type: String, default: '' },
  active:     { type: Boolean, default: true }
}, { timestamps: true });
productSchema.virtual('stockValue').get(function() {
  return this.stock * this.buyPrice;
});
productSchema.virtual('profitMargin').get(function() {
  if (!this.sellPrice) return 0;
  return ((this.sellPrice - this.buyPrice) / this.sellPrice * 100).toFixed(1);
});
const Product = mongoose.model('Product', productSchema);

// ─── PURCHASE INVOICE ─────────────────────────────────────────
const purchaseItemSchema = new Schema({
  product:  { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  qty:      { type: Number, required: true },
  price:    { type: Number, required: true },
  total:    { type: Number, required: true }
}, { _id: false });

const purchaseSchema = new Schema({
  invoiceNo: { type: String, unique: true },
  supplier:  { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  items:     [purchaseItemSchema],
  subtotal:  { type: Number, required: true },
  discount:  { type: Number, default: 0 },
  shipping:  { type: Number, default: 0 },
  total:     { type: Number, required: true },
  paid:      { type: Number, default: 0 },
  status:    { type: String, enum: ['draft','pending','received','partial','paid'], default: 'pending' },
  date:      { type: Date, default: Date.now },
  notes:     { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
purchaseSchema.virtual('remaining').get(function() { return this.total - this.paid; });
const Purchase = mongoose.model('Purchase', purchaseSchema);

// ─── SALES INVOICE ────────────────────────────────────────────
const saleItemSchema = new Schema({
  product:  { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  qty:      { type: Number, required: true },
  price:    { type: Number, required: true },
  cost:     { type: Number, default: 0 }, // buy price snapshot
  total:    { type: Number, required: true }
}, { _id: false });

const saleSchema = new Schema({
  invoiceNo:      { type: String, unique: true },
  customer:       { type: Schema.Types.ObjectId, ref: 'Customer' },
  platform:       { type: String, enum: ['amazon','website','manual','other'], default: 'amazon' },
  amazonOrderId:  { type: String, default: '' },
  items:          [saleItemSchema],
  subtotal:       { type: Number, required: true },
  discount:       { type: Number, default: 0 },
  shipping:       { type: Number, default: 0 },
  amazonFees:     { type: Number, default: 0 },
  total:          { type: Number, required: true },
  paid:           { type: Number, default: 0 },
  status:         { type: String, enum: ['draft','pending','shipped','delivered','returned','cancelled'], default: 'pending' },
  date:           { type: Date, default: Date.now },
  notes:          { type: String, default: '' },
  createdBy:      { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Sale = mongoose.model('Sale', saleSchema);

// ─── EXPENSE ──────────────────────────────────────────────────
const expenseSchema = new Schema({
  category:    { type: String, required: true },
  amount:      { type: Number, required: true },
  description: { type: String, default: '' },
  date:        { type: Date, default: Date.now },
  paymentMethod: { type: String, enum: ['cash','bank','card','other'], default: 'cash' },
  reference:   { type: String, default: '' },
  createdBy:   { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Expense = mongoose.model('Expense', expenseSchema);

// ─── STOCK MOVEMENT ───────────────────────────────────────────
const stockSchema = new Schema({
  product:   { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  type:      { type: String, enum: ['in','out','adjust','return'], required: true },
  qty:       { type: Number, required: true },
  before:    { type: Number, required: true },
  after:     { type: Number, required: true },
  reason:    { type: String, default: '' },
  reference: { type: String, default: '' }, // invoice ID
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const StockMovement = mongoose.model('StockMovement', stockSchema);

module.exports = { Category, Supplier, Customer, Product, Purchase, Sale, Expense, StockMovement };
