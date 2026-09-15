const mongoose = require('mongoose');

const ignoredIPSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true
  },
  label: {
    type: String,
    default: 'Whitelisted Device'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Automatically delete after 24 hours (86400 seconds)
  }
});

module.exports = mongoose.model('IgnoredIP', ignoredIPSchema);
