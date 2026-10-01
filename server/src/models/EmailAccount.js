const mongoose = require('mongoose');
const EmailAccountSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
	provider: { type: String, enum: ['gmail', 'smtp'], required: true },
	email: { type: String, required: true, lowercase: true, trim: true },
	displayName: { type: String, default: '' },
	encryptedCredentials: { type: String, required: true, select: false },
	isDefault: { type: Boolean, default: false },
	connectionStatus: { type: String, enum: ['active', 'reconnect_required'], default: 'active' },
	verificationStatus: { type: String, enum: ['pending', 'verified', 'expired'], default: 'pending' },
	verifiedAt: { type: Date, default: null },
	otpExpiresAt: { type: Date, default: null },
	otpHash: { type: String, default: null, select: false },
	otpSalt: { type: String, default: null, select: false },
	otpAttempts: { type: Number, default: 0 },
	otpResendCount: { type: Number, default: 0 },
	otpResendWindowStartedAt: { type: Date, default: null },
	otpLastSentAt: { type: Date, default: null },
}, { timestamps: true });
EmailAccountSchema.index({ userId: 1, email: 1 }, { unique: true });
module.exports = mongoose.model('EmailAccount', EmailAccountSchema);
