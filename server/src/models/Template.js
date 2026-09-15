const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: String,
  subject: { type: String, required: true },
  body: { type: String, required: true },
  followUps: [{
    order: Number,
    subject: String,
    body: String,
    delayDays: Number
  }],
  settings: {
    trackEmails: { type: Boolean, default: true }
  },
  tags: [String]
}, { timestamps: true });

templateSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model('Template', templateSchema);
