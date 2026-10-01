const mongoose = require('mongoose');

const CampaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      default: null,
    },
    emailAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailAccount',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    html: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'failed'],
      default: 'draft',
    },
    totalRecipients: {
      type: Number,
      default: 0,
    },
    pendingCount: {
      type: Number,
      default: 0,
    },
    processingCount: {
      type: Number,
      default: 0,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    cancelledCount: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Campaign', CampaignSchema);
