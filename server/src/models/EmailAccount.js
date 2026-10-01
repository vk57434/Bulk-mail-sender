const mongoose = require('mongoose');
const EmailAccountSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, provider: { type: String, enum: ['gmail', 'smtp'], required: true }, email: { type: String, required: true, lowercase: true, trim: true }, displayName: { type: String, default: '' }, encryptedCredentials: { type: String, required: true, select: false }, isDefault: { type: Boolean, default: false } }, { timestamps: true });
EmailAccountSchema.index({ userId: 1, email: 1 }, { unique: true });
module.exports = mongoose.model('EmailAccount', EmailAccountSchema);
