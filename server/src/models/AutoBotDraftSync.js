const mongoose = require('mongoose');

const selectionRecipientSchema = new mongoose.Schema({
  jobId: { type: String, required: true },
  email: { type: String, required: true },
  contactName: { type: String, default: null },
  company: { type: String, default: null },
  role: { type: String, default: null },
  location: { type: String, default: null },
  jobUrl: { type: String, required: true }
}, { _id: false });

const autoBotDraftSyncSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  integrationId: { type: String, required: true },
  scanDate: { type: String, required: true },
  highestSelectionVersion: { type: Number, default: 0, required: true },
  payloadDigest: { type: String, default: '' },
  selection: { type: [selectionRecipientSchema], default: [] },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
  revision: { type: Number, default: 0 },
  state: { type: String, enum: ['ready', 'reconciling'], default: 'ready' },
  activatedAt: Date,
  activationRevision: Number,
  activationSchedule: {
    sendAt: Date,
    timezone: String,
    delayMinutes: Number
  },
  enqueueStatus: { type: String, enum: ['pending', 'enqueued'] },
  enqueueGeneration: { type: Number, default: 0 },
  lockToken: String,
  lockExpiresAt: Date
}, { timestamps: true });

autoBotDraftSyncSchema.index(
  { owner: 1, integrationId: 1, scanDate: 1 },
  { unique: true, name: 'autobot_owner_integration_date_unique' }
);
autoBotDraftSyncSchema.index({ campaignId: 1 }, { sparse: true });
autoBotDraftSyncSchema.index({ enqueueStatus: 1, activatedAt: 1 });

module.exports = mongoose.model('AutoBotDraftSync', autoBotDraftSyncSchema);
