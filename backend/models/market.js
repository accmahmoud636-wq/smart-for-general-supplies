const mongoose = require('mongoose');
// رصد السوق: منتجات ترند بنتابعها (من أمازون/نون/فيسبوك...) قبل ما نقرر نضيفها
const marketSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  category: { type: String, default: '' },
  price:    { type: Number, default: 0 },
  rating:   { type: Number, default: 0 },
  reviews:  { type: Number, default: 0 },
  rank:     { type: String, default: '' },        // مثال: «#1 أدوات المطبخ»
  source:   { type: String, default: 'أمازون مصر' },
  url:      { type: String, default: '' },
  note:     { type: String, default: '' },
  status:   { type: String, enum: ['idea', 'sample', 'added', 'rejected'], default: 'idea' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
module.exports = { MarketItem: mongoose.models.MarketItem || mongoose.model('MarketItem', marketSchema) };
