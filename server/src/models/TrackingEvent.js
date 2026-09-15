const mongoose = require('mongoose');

const trackingEventSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true, required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient', required: true },
  trackingId: { type: String, index: true, required: true },
  type: { type: String, enum: ["open", "click", "reply", "bounce"], required: true },
  metadata: {
    url: String,
    userAgent: String,
    ip: String,
    isBot: Boolean,
    isIgnored: Boolean
  }
}, { timestamps: true });

trackingEventSchema.index({ type: 1 });

module.exports = mongoose.model('TrackingEvent', trackingEventSchema);
