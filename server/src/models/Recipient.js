const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true, required: true },
  email: { type: String, required: true },
  data: mongoose.Schema.Types.Mixed,

  status: {
    type: String,
    enum: ["pending", "queued", "sent", "opened", "clicked", "replied", "bounced", "failed"],
    default: "pending"
  },

  mainEmail: {
    messageId: String,
    threadId: String,
    sentAt: Date,
    trackingId: { type: String, index: true },
    opened: { type: Boolean, default: false },
    openedAt: Date,
    openCount: { type: Number, default: 0 },
    clicked: { type: Boolean, default: false },
    clickedAt: Date,
    clickCount: { type: Number, default: 0 },
    replied: { type: Boolean, default: false },
    repliedAt: Date,
    bounced: { type: Boolean, default: false },
    bouncedAt: Date,
    error: String
  },

  followUps: [{
    order: Number,
    messageId: String,
    threadId: String,
    sentAt: Date,
    trackingId: String,
    opened: { type: Boolean, default: false },
    openedAt: Date,
    clicked: { type: Boolean, default: false },
    clickedAt: Date,
    replied: { type: Boolean, default: false },
    repliedAt: Date
  }]
}, { timestamps: true });

recipientSchema.index({ campaignId: 1, email: 1 }, { unique: true });
recipientSchema.index({ status: 1 });
recipientSchema.index({ "mainEmail.threadId": 1 });

module.exports = mongoose.model('Recipient', recipientSchema);
