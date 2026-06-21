const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  name: { type: String, required: true },
  companyName: String,
  roleName: String,
  status: {
    type: String,
    enum: ["draft", "scheduled", "sending", "paused", "completed", "failed"],
    default: "draft"
  },
  from: {
    name: { type: String, default: "Yogesh Siwan" },
    email: { type: String, default: "yogesiwan@gmail.com" }
  },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  inSameThread: { type: Boolean, default: false },
  excludedRecipients: [{ type: String }],
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    mimetype: String,
    size: Number
  }],

  recipientSource: {
    type: { type: String, enum: ["google_sheets", "csv", "copy_paste"] },
    spreadsheetUrl: String,
    sheetName: String,
    filterColumn: String,
    filterValues: [String],
    emailColumn: String
  },

  schedule: {
    sendAt: Date,
    timezone: { type: String, default: "Asia/Kolkata" },
    delayMinutes: { type: Number, default: 0 },
    autopilot: {
      enabled: { type: Boolean, default: false },
      days: {
        monday: { type: Boolean, default: true },
        tuesday: { type: Boolean, default: true },
        wednesday: { type: Boolean, default: true },
        thursday: { type: Boolean, default: true },
        friday: { type: Boolean, default: true },
        saturday: { type: Boolean, default: false },
        sunday: { type: Boolean, default: false }
      },
      startTime: { type: String, default: "09:00" },
      endTime: { type: String, default: "17:00" },
      maxPerDay: { type: Number, default: 300 },
      delayMinutes: { type: Number, default: 3 },
      timezone: { type: String, default: "Asia/Kolkata" }
    }
  },

  settings: {
    trackEmails: { type: Boolean, default: true }
  },

  followUps: [{
    order: Number,
    subject: String,
    body: String,
    attachments: [{ filename: String, originalName: String, path: String, mimetype: String, size: Number }],
    delayDays: { type: Number, default: 3 },
    onlyIfNoReply: { type: Boolean, default: true },
    inSameThread: { type: Boolean, default: true },
    schedule: {
      sendAt: Date,
      timezone: { type: String, default: "Asia/Kolkata" },
      autopilot: {
        enabled: { type: Boolean, default: false },
        days: {
          monday: { type: Boolean, default: true },
          tuesday: { type: Boolean, default: true },
          wednesday: { type: Boolean, default: true },
          thursday: { type: Boolean, default: true },
          friday: { type: Boolean, default: true },
          saturday: { type: Boolean, default: false },
          sunday: { type: Boolean, default: false }
        },
        startTime: { type: String, default: "09:00" },
        endTime: { type: String, default: "17:00" },
        timezone: { type: String, default: "Asia/Kolkata" }
      }
    },
    status: { type: String, enum: ["draft", "pending", "scheduled", "sending", "completed", "cancelled"], default: "draft" },
    scheduledAt: Date,
    cancelledAt: Date,
    completedAt: Date,
    excludedRecipients: [{ type: String }] // Store emails of excluded recipients
  }],

  stats: {
    totalRecipients: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },

  startedAt: Date,
  completedAt: Date
}, { timestamps: true });

campaignSchema.index({ status: 1 });
campaignSchema.index({ createdAt: -1 });
campaignSchema.index({ companyName: 1 });
campaignSchema.index({ roleName: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
