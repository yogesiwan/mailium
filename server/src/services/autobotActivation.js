const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const AutoBotDraftSync = require('../models/AutoBotDraftSync');
const {
  acquireLock,
  releaseLock,
  isReplicaSet,
  standaloneMaterialization,
  lockedError
} = require('./autobotDraftSync');

const createError = (statusCode, code, message, details = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  Object.assign(error, details);
  return error;
};

const validateSchedule = ({ sendAt, timezone, delayMinutes }) => {
  const when = new Date(sendAt);
  if (typeof sendAt !== 'string' || !Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
    throw createError(400, 'INVALID_SCHEDULE', 'A future sendAt timestamp is required');
  }
  if (typeof timezone !== 'string' || !timezone.trim()) {
    throw createError(400, 'INVALID_SCHEDULE', 'A valid IANA timezone is required');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(when);
  } catch {
    throw createError(400, 'INVALID_SCHEDULE', 'A valid IANA timezone is required');
  }
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 1440) {
    throw createError(400, 'INVALID_SCHEDULE', 'delayMinutes must be an integer from 0 to 1440');
  }
  return { sendAt: when, timezone: timezone.trim(), delayMinutes };
};

const applyActivation = async ({ campaign, syncRecord, schedule, expectedRevision, session }) => {
  if (!campaign || campaign.autobot?.provider !== 'autobot'
    || campaign.autobot.syncRecordId?.toString() !== syncRecord._id.toString()) {
    throw createError(404, 'CAMPAIGN_NOT_FOUND', 'AutoBot draft not found');
  }
  if (syncRecord.activatedAt || campaign.autobot.activatedAt) lockedError(campaign._id);
  if (syncRecord.state !== 'ready' || campaign.autobot.syncStatus !== 'ready') {
    throw createError(409, 'DRAFT_SYNC_IN_PROGRESS', 'Wait for the latest AutoBot recipient sync to finish');
  }
  if (campaign.status !== 'draft') lockedError(campaign._id);

  const currentRevision = campaign.autobot.revision || 0;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== currentRevision) {
    throw createError(409, 'STALE_REVIEW', 'The draft changed after it was reviewed; refresh and review it again', {
      currentRevision
    });
  }
  if ((campaign.followUps || []).length > 0) {
    throw createError(400, 'FOLLOWUPS_UNSUPPORTED', 'AutoBot drafts cannot have follow-ups');
  }

  const recipientCountQuery = Recipient.countDocuments({
    campaignId: campaign._id,
    user: campaign.user,
    status: 'pending'
  });
  if (session) recipientCountQuery.session(session);
  const recipientCount = await recipientCountQuery;
  if (recipientCount === 0) {
    throw createError(400, 'NO_ELIGIBLE_RECIPIENTS', 'At least one pending recipient is required to schedule this campaign');
  }

  const activatedAt = new Date();
  const activationRevision = currentRevision;
  syncRecord.activatedAt = activatedAt;
  syncRecord.activationRevision = activationRevision;
  syncRecord.revision = currentRevision;
  syncRecord.activationSchedule = schedule;
  syncRecord.enqueueGeneration = (syncRecord.enqueueGeneration || 0) + 1;
  syncRecord.enqueueStatus = 'pending';
  await syncRecord.save(session ? { session } : undefined);

  campaign.status = 'scheduled';
  campaign.schedule = {
    ...(campaign.schedule?.toObject?.() || campaign.schedule || {}),
    sendAt: schedule.sendAt,
    timezone: schedule.timezone,
    delayMinutes: schedule.delayMinutes,
    autopilot: { ...(campaign.schedule?.autopilot?.toObject?.() || campaign.schedule?.autopilot || {}), enabled: false }
  };
  campaign.autobot.activatedAt = activatedAt;
  campaign.autobot.activationRevision = activationRevision;
  campaign.autobot.enqueueGeneration = syncRecord.enqueueGeneration;
  campaign.autobot.enqueueStatus = 'pending';
  campaign.startedAt = undefined;
  await campaign.save(session ? { session } : undefined);
  return { campaign, syncRecord, recipientCount };
};

const scheduleUniqueActivation = async (campaignId, activationRevision, enqueueGeneration, sendAt) => {
  const agenda = require('../config/agenda');
  const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
  const job = agenda.create('send-campaign-emails', {
    campaignId: campaignObjectId,
    autobotActivationRevision: activationRevision,
    autobotEnqueueGeneration: enqueueGeneration
  });
  job.unique({
    name: 'send-campaign-emails',
    'data.campaignId': campaignObjectId,
    'data.autobotActivationRevision': activationRevision,
    'data.autobotEnqueueGeneration': enqueueGeneration
  }, { insertOnly: true });
  job.schedule(sendAt);
  await job.save();
};

const markEnqueued = async (syncRecord, campaign) => {
  await Campaign.updateOne(
    {
      _id: campaign._id,
      'autobot.activationRevision': syncRecord.activationRevision,
      'autobot.enqueueGeneration': syncRecord.enqueueGeneration
    },
    { $set: { 'autobot.enqueueStatus': 'enqueued' } }
  );
  await AutoBotDraftSync.updateOne(
    {
      _id: syncRecord._id,
      activationRevision: syncRecord.activationRevision,
      enqueueGeneration: syncRecord.enqueueGeneration
    },
    { $set: { enqueueStatus: 'enqueued' } }
  );
};

const queueActivation = async (syncRecord, campaign) => {
  if (!syncRecord?.activatedAt || !campaign) return false;
  if (syncRecord.enqueueStatus === 'enqueued') return true;
  if (campaign.status === 'paused') return false;

  const sendAt = campaign.schedule?.sendAt || syncRecord.activationSchedule?.sendAt;
  if (!sendAt) throw createError(500, 'ENQUEUE_PENDING', 'The activated draft has no stored send time');
  await scheduleUniqueActivation(campaign._id, syncRecord.activationRevision, syncRecord.enqueueGeneration || 1, sendAt);
  await markEnqueued(syncRecord, campaign);
  return true;
};

const activationConfig = () => ({
  ownerId: new mongoose.Types.ObjectId(process.env.AUTOBOT_OWNER_USER_ID),
  templateId: new mongoose.Types.ObjectId(process.env.AUTOBOT_DEFAULT_TEMPLATE_ID),
  senderEmail: process.env.AUTOBOT_SENDER_EMAIL?.trim() || ''
});

const activateAutoBotCampaign = async ({ campaignId, ownerId, expectedRevision, schedule: schedulePayload }) => {
  const schedule = validateSchedule(schedulePayload || {});
  const campaignBeforeLock = await Campaign.findOne({ _id: campaignId, user: ownerId });
  if (!campaignBeforeLock) throw createError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  if (campaignBeforeLock.autobot?.provider !== 'autobot') {
    throw createError(400, 'NOT_AUTOBOT_DRAFT', 'Campaign is not an AutoBot draft');
  }

  const syncBeforeLock = await AutoBotDraftSync.findOne({
    _id: campaignBeforeLock.autobot.syncRecordId,
    campaignId: campaignBeforeLock._id,
    owner: ownerId
  });
  if (!syncBeforeLock) throw createError(409, 'DRAFT_LOCKED', 'AutoBot sync record is unavailable');

  const { syncRecord: lockedRecord, lockToken } = await acquireLock({
    owner: syncBeforeLock.owner,
    integrationId: syncBeforeLock.integrationId,
    scanDate: syncBeforeLock.scanDate
  });
  try {
    if (!isReplicaSet() && lockedRecord.state === 'reconciling') {
      await standaloneMaterialization({ syncRecord: lockedRecord, config: activationConfig(), lockToken });
    }

    if (!isReplicaSet()) {
      const syncRecord = await AutoBotDraftSync.findById(lockedRecord._id);
      const campaign = await Campaign.findOne({ _id: campaignId, user: ownerId });
      const activated = await applyActivation({ campaign, syncRecord, schedule, expectedRevision });
      try {
        await queueActivation(activated.syncRecord, activated.campaign);
        return { campaign: activated.campaign, enqueueStatus: 'enqueued' };
      } catch {
        return { campaign: activated.campaign, enqueueStatus: 'pending' };
      }
    }

    const session = await mongoose.startSession();
    let activated;
    try {
      await session.withTransaction(async () => {
        const syncRecord = await AutoBotDraftSync.findById(lockedRecord._id).session(session);
        const campaign = await Campaign.findOne({ _id: campaignId, user: ownerId }).session(session);
        activated = await applyActivation({ campaign, syncRecord, schedule, expectedRevision, session });
      });
    } finally {
      await session.endSession();
    }

    try {
      await queueActivation(activated.syncRecord, activated.campaign);
      activated.campaign.autobot.enqueueStatus = 'enqueued';
      return { campaign: activated.campaign, enqueueStatus: 'enqueued' };
    } catch {
      return { campaign: activated.campaign, enqueueStatus: 'pending' };
    }
  } finally {
    await releaseLock(lockedRecord._id, lockToken);
  }
};

const recoverPendingAutoBotActivations = async () => {
  const pendingRecords = await AutoBotDraftSync.find({ activatedAt: { $exists: true }, enqueueStatus: 'pending' })
    .limit(100)
    .lean();
  for (const candidate of pendingRecords) {
    let lock;
    try {
      lock = await acquireLock({
        owner: candidate.owner,
        integrationId: candidate.integrationId,
        scanDate: candidate.scanDate
      });
      const syncRecord = await AutoBotDraftSync.findById(lock.syncRecord._id);
      if (!syncRecord?.activatedAt || syncRecord.enqueueStatus !== 'pending') continue;
      const campaign = await Campaign.findOne({ _id: syncRecord.campaignId, user: syncRecord.owner });
      if (!campaign) continue;

      if (campaign.status === 'draft') {
        const schedule = syncRecord.activationSchedule;
        if (!schedule?.sendAt) continue;
        campaign.schedule = {
          ...(campaign.schedule?.toObject?.() || campaign.schedule || {}),
          sendAt: schedule.sendAt,
          timezone: schedule.timezone,
          delayMinutes: schedule.delayMinutes,
          autopilot: { ...(campaign.schedule?.autopilot?.toObject?.() || campaign.schedule?.autopilot || {}), enabled: false }
        };
        campaign.status = 'scheduled';
        campaign.autobot.activatedAt = syncRecord.activatedAt;
        campaign.autobot.activationRevision = syncRecord.activationRevision;
        campaign.autobot.enqueueGeneration = syncRecord.enqueueGeneration || 1;
        campaign.autobot.enqueueStatus = 'pending';
        await campaign.save();
      }
      await queueActivation(syncRecord, campaign);
    } catch (error) {
      console.error(`AutoBot activation recovery failed for ${candidate._id}: ${error.message}`);
    } finally {
      if (lock) await releaseLock(lock.syncRecord._id, lock.lockToken).catch(() => {});
    }
  }
};

module.exports = {
  activateAutoBotCampaign,
  recoverPendingAutoBotActivations,
  queueActivation,
  scheduleUniqueActivation,
  validateSchedule
};
