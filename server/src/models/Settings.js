const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  google: {
    clientId: String,
    clientSecret: String,
    refreshToken: String,
    accessToken: String,
    tokenExpiry: Date,
    userEmail: { type: String, default: "yogesiwan@gmail.com" },
    userName: { type: String, default: "Yogesh Siwan" },
    scopes: [String]
  },
  defaults: {
    fromName: { type: String, default: "Yogesh Siwan" },
    fromEmail: { type: String, default: "yogesiwan@gmail.com" },
    timezone: { type: String, default: "Asia/Kolkata" },
    maxEmailsPerDay: { type: Number, default: 300 },
    delayBetweenEmails: { type: Number, default: 3 }
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
