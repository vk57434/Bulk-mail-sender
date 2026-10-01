const mongoose = require('mongoose');
const TemplateSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, name: { type: String, required: true, trim: true }, subject: { type: String, required: true }, html: { type: String, required: true } }, { timestamps: true });
module.exports = mongoose.model('Template', TemplateSchema);
