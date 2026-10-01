const mongoose = require('mongoose');

const RecipientSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      default: null,
    },
    sequence: {
      type: Number,
      default: null,
    },
    emailAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailAccount',
      default: null,
    },
    senderEmail: {
      type: String,
      default: '',
    },
    department: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'cancelled'],
      default: 'pending',
    },
    error: {
      type: String,
      default: '',
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    queuedAt: {
      type: Date,
      default: null,
    },
    processingAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

RecipientSchema.index({ campaignId: 1, email: 1 }, { unique: true });
RecipientSchema.index({ campaignId: 1, sequence: 1 });

module.exports = mongoose.model('Recipient', RecipientSchema);
