const mongoose = require('mongoose');

// إعدادات عامة للنظام (المظهر، اسم الشركة ...) — key/value
const settingSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
