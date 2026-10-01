const mongoose = require('mongoose');
const EmailSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  emailAccountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'EmailAccount' },
  from: String,
  to: [String],
  cc: [String],
  bcc: [String],
  subject: { type: String, required: true },
  html: { type: String, required: true },
  text: String,
  status: { type: String, enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED'], default: 'PENDING' },
  provider: { type: String, enum: ['gmail', 'smtp'], default: 'smtp' },
  providerMessageId: String,
  error: String,
  queuedAt: Date,
  processingAt: Date,
  sentAt: Date,
  failedAt: Date,
}, { timestamps: true });
EmailSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('Email', EmailSchema);
