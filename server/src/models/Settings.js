const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  google: {
    clientId: String,
    clientSecret: String,
    refreshToken: String,
    accessToken: String,
    tokenExpiry: Date,
    userEmail: { type: String, default: "" },
    userName: { type: String, default: "" },
    scopes: [String]
  },
  defaults: {
    fromName: { type: String, default: "" },
    fromEmail: { type: String, default: "" },
    timezone: { type: String, default: "Asia/Kolkata" },
    maxEmailsPerDay: { type: Number, default: 300 },
    delayBetweenEmails: { type: Number, default: 3 }
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
