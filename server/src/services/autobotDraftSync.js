const crypto = require('crypto');
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const Template = require('../models/Template');
const Settings = require('../models/Settings');
const AutoBotDraftSync = require('../models/AutoBotDraftSync');

const LOCK_TTL_MS = 5 * 60 * 1000;
let indexesReady;

const makeDigest = (recipients) => crypto
  .createHash('sha256')
  .update(JSON.stringify(recipients))
  .digest('hex');

const isReplicaSet = () => {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  return topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
};

const acquireLock = async ({ owner, integrationId, scanDate }) => {
  const lockToken = crypto.randomUUID();
  const now = new Date();
  try {
    const syncRecord = await AutoBotDraftSync.findOneAndUpdate(
      {
        owner,
        integrationId,
        scanDate,
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: { lockToken, lockExpiresAt: new Date(now.getTime() + LOCK_TTL_MS) },
        $setOnInsert: { owner, integrationId, scanDate }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { syncRecord, lockToken };
  } catch (error) {
    if (error.code === 11000) {
      const busy = new Error('A draft update is already in progress for this scan date');
      busy.statusCode = 409;
      busy.code = 'SYNC_BUSY';
      throw busy;
    }
    throw error;
  }
};

const releaseLock = async (syncRecordId, lockToken) => {
  await AutoBotDraftSync.updateOne(
    { _id: syncRecordId, lockToken },
    { $unset: { lockToken: 1, lockExpiresAt: 1 } }
  );
};

const syncResponse = async (syncRecord, { added = 0, removed = 0 } = {}, session) => {
  let revision = syncRecord.revision || 0;
  if (syncRecord.campaignId) {
    const campaignQuery = Campaign.findOne({ _id: syncRecord.campaignId, user: syncRecord.owner }).select('autobot.revision');
    if (session) campaignQuery.session(session);
    const campaign = await campaignQuery;
    revision = campaign?.autobot?.revision ?? revision;
  }
  const base = {
    selectionVersion: syncRecord.highestSelectionVersion,
    revision,
    added,
    removed,
    totalRecipients: 0
  };
  if (!syncRecord.campaignId) {
    return {
      status: 'noop',
      campaignId: null,
      draftPath: null,
      ...base,
      totalRecipients: 0
    };
  }
  const query = Recipient.countDocuments({ campaignId: syncRecord.campaignId, user: syncRecord.owner });
  if (session) query.session(session);
  const totalRecipients = await query;
  return {
    status: 'draft',
    campaignId: syncRecord.campaignId.toString(),
    draftPath: `/campaigns/${syncRecord.campaignId}`,
    ...base,
    totalRecipients
  };
};

const conflictError = (message = 'A recipient conflicts with a manual or nonpending campaign recipient') => {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = 'RECIPIENT_CONFLICT';
  throw error;
};

const lockedError = (campaignId) => {
  const error = new Error('This AutoBot draft has already been activated and cannot be changed');
  error.statusCode = 409;
  error.code = 'DRAFT_LOCKED';
  error.draftPath = campaignId ? `/campaigns/${campaignId}` : null;
  throw error;
};

const staleError = (lastSelectionVersion) => {
  const error = new Error('The selection version is stale or was reused with different content');
  error.statusCode = 409;
  error.code = 'STALE_SELECTION';
  error.lastSelectionVersion = lastSelectionVersion;
  throw error;
};

const createCampaignForDraft = async ({ syncRecord, config, session, campaignId, revision, reconciling }) => {
  const templateQuery = Template.findOne({ _id: config.templateId, user: config.ownerId });
  const settingsQuery = Settings.findOne({ user: config.ownerId });
  if (session) {
    templateQuery.session(session);
    settingsQuery.session(session);
  }
  const [template, settings] = await Promise.all([templateQuery, settingsQuery]);
  if (!template) {
    const error = new Error('The configured AutoBot template was not found for the integration owner');
    error.statusCode = 503;
    error.code = 'INTEGRATION_UNAVAILABLE';
    throw error;
  }

  if (!settings?.google?.refreshToken || !settings?.google?.userEmail
    || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    const error = new Error('The integration owner must have a connected Gmail sender in Mailium');
    error.statusCode = 503;
    error.code = 'INTEGRATION_UNAVAILABLE';
    throw error;
  }

  const defaultEmail = settings?.defaults?.fromEmail || settings?.google?.userEmail || '';
  const defaultName = settings?.defaults?.fromName || settings?.google?.userName || '';
  if (!defaultEmail) {
    const error = new Error('The integration owner has no configured Mailium sender identity');
    error.statusCode = 503;
    error.code = 'INTEGRATION_UNAVAILABLE';
    throw error;
  }
  if (config.senderEmail && config.senderEmail.toLowerCase() !== defaultEmail.toLowerCase()) {
    const error = new Error('AUTOBOT_SENDER_EMAIL must match a sender identity configured for the owner');
    error.statusCode = 503;
    error.code = 'INTEGRATION_UNAVAILABLE';
    throw error;
  }

  let timezone = settings?.defaults?.timezone || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    timezone = 'Asia/Kolkata';
  }
  const savedDelay = settings?.defaults?.delayBetweenEmails;
  const delayMinutes = Number.isInteger(savedDelay) && savedDelay >= 0 && savedDelay <= 1440 ? savedDelay : 0;

  const campaign = new Campaign({
    _id: campaignId,
    user: config.ownerId,
    name: `AutoBot Jobs — ${syncRecord.scanDate}`,
    subject: template.subject,
    body: template.body,
    status: 'draft',
    from: { name: defaultName, email: config.senderEmail || defaultEmail },
    settings: { trackEmails: template.settings?.trackEmails !== false },
    schedule: {
      timezone,
      delayMinutes,
      autopilot: { enabled: false }
    },
    followUps: [],
    stats: { totalRecipients: 0 },
    autobot: {
      provider: 'autobot',
      integrationId: syncRecord.integrationId,
      scanDate: syncRecord.scanDate,
      syncRecordId: syncRecord._id,
      revision,
      syncStatus: reconciling ? 'reconciling' : 'ready'
    }
  });
  await campaign.save(session ? { session } : undefined);
  return campaign;
};

const preflightRecipients = async ({ campaign, syncRecord, recipients, session }) => {
  if (!campaign) return [];
  if (campaign.autobot?.activatedAt || campaign.status !== 'draft') {
    lockedError(campaign._id);
  }

  const query = Recipient.find({ campaignId: campaign._id, user: syncRecord.owner });
  if (session) query.session(session);
  const existing = await query;
  const managed = existing.filter((recipient) => (
    recipient.origin?.provider === 'autobot'
    && recipient.origin?.integrationId === syncRecord.integrationId
    && recipient.origin?.scanDate === syncRecord.scanDate
  ));
  const managedIds = new Set(managed.map((recipient) => recipient._id.toString()));
  const existingByEmail = new Map();
  for (const recipient of existing) {
    const normalizedEmail = recipient.email.trim().toLowerCase();
    if (!existingByEmail.has(normalizedEmail)) existingByEmail.set(normalizedEmail, []);
    existingByEmail.get(normalizedEmail).push(recipient);
  }

  for (const incoming of recipients) {
    const matches = existingByEmail.get(incoming.email) || [];
    for (const match of matches) {
      if (!managedIds.has(match._id.toString()) || match.status !== 'pending') {
        conflictError();
      }
    }
  }
  if (managed.some((recipient) => recipient.status !== 'pending')) conflictError();
  return managed;
};

const recipientDataFor = (recipient) => ({
  greeting: recipient.contactName ? `Hi ${recipient.contactName},` : 'Hi Sir/Ma’am,',
  contactName: recipient.contactName,
  company: recipient.company,
  role: recipient.role,
  location: recipient.location,
  jobUrl: recipient.jobUrl
});

const materializeDraft = async ({ syncRecord, config, session, revision, reconciling = false }) => {
  if (!syncRecord.campaignId && syncRecord.selection.length === 0) return { added: 0, removed: 0, totalRecipients: 0 };

  let campaign = syncRecord.campaignId
    ? await Campaign.findOne({ _id: syncRecord.campaignId, user: syncRecord.owner }).session(session || null)
    : null;
  if (!campaign && syncRecord.selection.length > 0) {
    campaign = await createCampaignForDraft({
      syncRecord,
      config,
      session,
      campaignId: syncRecord.campaignId || new mongoose.Types.ObjectId(),
      revision,
      reconciling
    });
  }
  if (!campaign) return { added: 0, removed: 0, totalRecipients: 0 };

  if (campaign.autobot?.provider !== 'autobot'
    || campaign.autobot.integrationId !== syncRecord.integrationId
    || campaign.autobot.scanDate !== syncRecord.scanDate) {
    const error = new Error('The stored AutoBot draft no longer matches its sync record');
    error.statusCode = 409;
    error.code = 'DRAFT_LOCKED';
    error.draftPath = `/campaigns/${campaign._id}`;
    throw error;
  }
  if (campaign.autobot.activatedAt || campaign.status !== 'draft') lockedError(campaign._id);

  const existingManaged = await preflightRecipients({ campaign, syncRecord, recipients: syncRecord.selection, session });

  if (reconciling && campaign.autobot.syncStatus !== 'reconciling') {
    campaign.autobot.syncStatus = 'reconciling';
    await campaign.save(session ? { session } : undefined);
  }

  const oldByEmail = new Map(existingManaged.map((recipient) => [recipient.email.trim().toLowerCase(), recipient]));
  const desiredByEmail = new Map(syncRecord.selection.map((recipient) => [recipient.email, recipient]));
  const manualRecipients = await Recipient.find({
    campaignId: campaign._id,
    user: syncRecord.owner,
    'origin.provider': { $ne: 'autobot' }
  }).select('sortOrder').session(session || null);
  const startOrder = manualRecipients.reduce((max, recipient) => Math.max(max, recipient.sortOrder ?? -1), -1) + 1;

  const removedDocs = existingManaged.filter((recipient) => !desiredByEmail.has(recipient.email.trim().toLowerCase()));
  if (removedDocs.length > 0) {
    await Recipient.deleteMany({ _id: { $in: removedDocs.map((recipient) => recipient._id) } }).session(session || null);
  }

  let added = 0;
  let removed = removedDocs.length;
  const bulkOps = [];
  const insertDocs = [];
  syncRecord.selection.forEach((selected, index) => {
    const existing = oldByEmail.get(selected.email);
    const update = {
      email: selected.email,
      data: recipientDataFor(selected),
      sortOrder: startOrder + index,
      origin: {
        provider: 'autobot',
        integrationId: syncRecord.integrationId,
        scanDate: syncRecord.scanDate,
        jobId: selected.jobId
      }
    };
    if (existing) {
      bulkOps.push({
        updateOne: {
          filter: { _id: existing._id, campaignId: campaign._id, user: syncRecord.owner, status: 'pending' },
          update: { $set: update }
        }
      });
    } else {
      added += 1;
      insertDocs.push({
        user: syncRecord.owner,
        campaignId: campaign._id,
        status: 'pending',
        ...update
      });
    }
  });
  if (bulkOps.length > 0) await Recipient.bulkWrite(bulkOps, { session });
  if (insertDocs.length > 0) await Recipient.insertMany(insertDocs, { session, ordered: true });

  const countQuery = Recipient.countDocuments({ campaignId: campaign._id, user: syncRecord.owner });
  if (session) countQuery.session(session);
  const totalRecipients = await countQuery;

  campaign.stats.totalRecipients = totalRecipients;
  campaign.autobot.revision = revision;
  campaign.autobot.syncStatus = reconciling ? 'reconciling' : 'ready';
  await campaign.save(session ? { session } : undefined);

  return { added, removed, totalRecipients };
};

const standaloneMaterialization = async ({ syncRecord, config, lockToken }) => {
  if (syncRecord.state !== 'reconciling') return { added: 0, removed: 0 };
  const result = await materializeDraft({
    syncRecord,
    config,
    revision: syncRecord.revision,
    reconciling: true
  });
  if (syncRecord.campaignId) {
    await Campaign.updateOne(
      { _id: syncRecord.campaignId, user: syncRecord.owner, 'autobot.syncRecordId': syncRecord._id },
      { $set: { 'autobot.syncStatus': 'ready' } }
    );
  }
  syncRecord.state = 'ready';
  await syncRecord.save();
  return { added: result.added, removed: result.removed };
};

const buildNextRevision = (syncRecord, digest, campaign, recipientCount) => {
  const campaignRevision = campaign?.autobot?.revision || 0;
  if (!syncRecord.campaignId) return recipientCount > 0 ? 1 : 0;
  if (digest === syncRecord.payloadDigest) return campaignRevision || syncRecord.revision;
  return Math.max(campaignRevision, syncRecord.revision || 0) + 1;
};

const processSelection = async ({ syncRecord, recipients, selectionVersion, digest, config, session, lockToken }) => {
  if (syncRecord.activatedAt) lockedError(syncRecord.campaignId);

  const priorVersion = syncRecord.highestSelectionVersion || 0;
  if (selectionVersion < priorVersion) staleError(priorVersion);
  if (selectionVersion === priorVersion && digest !== syncRecord.payloadDigest) staleError(priorVersion);

  if (syncRecord.state === 'reconciling' && !session) {
    await standaloneMaterialization({ syncRecord, config, lockToken });
    syncRecord = await AutoBotDraftSync.findById(syncRecord._id);
  }

  if (selectionVersion === priorVersion) {
    return syncResponse(syncRecord, { added: 0, removed: 0 }, session);
  }

  if (digest === syncRecord.payloadDigest) {
    syncRecord.highestSelectionVersion = selectionVersion;
    const currentCampaign = syncRecord.campaignId
      ? await Campaign.findOne({ _id: syncRecord.campaignId, user: syncRecord.owner }).select('autobot.revision').session(session || null)
      : null;
    if (currentCampaign?.autobot?.revision) syncRecord.revision = currentCampaign.autobot.revision;
    if (session) await syncRecord.save({ session });
    else await AutoBotDraftSync.updateOne(
      { _id: syncRecord._id, lockToken },
      { $set: { highestSelectionVersion: selectionVersion, revision: syncRecord.revision } }
    );
    if (!session) syncRecord.highestSelectionVersion = selectionVersion;
    return syncResponse(syncRecord, { added: 0, removed: 0 }, session);
  }

  const campaign = syncRecord.campaignId
    ? await Campaign.findOne({ _id: syncRecord.campaignId, user: syncRecord.owner }).session(session || null)
    : null;
  if (campaign?.autobot?.activatedAt || (campaign && campaign.status !== 'draft')) lockedError(campaign._id);
  await preflightRecipients({ campaign, syncRecord, recipients, session });

  const revision = buildNextRevision(syncRecord, digest, campaign, recipients.length);
  const campaignId = syncRecord.campaignId || (recipients.length > 0 ? new mongoose.Types.ObjectId() : null);
  if (!session) {
    syncRecord.highestSelectionVersion = selectionVersion;
    syncRecord.payloadDigest = digest;
    syncRecord.selection = recipients;
    syncRecord.campaignId = campaignId;
    syncRecord.revision = revision;
    syncRecord.state = campaignId ? 'reconciling' : 'ready';
    await syncRecord.save();
    const materialized = await standaloneMaterialization({ syncRecord, config, lockToken });
    syncRecord = await AutoBotDraftSync.findById(syncRecord._id);
    return syncResponse(syncRecord, materialized);
  }

  syncRecord.highestSelectionVersion = selectionVersion;
  syncRecord.payloadDigest = digest;
  syncRecord.selection = recipients;
  syncRecord.campaignId = campaignId;
  syncRecord.revision = revision;
  syncRecord.state = campaignId ? 'reconciling' : 'ready';
  const changes = await materializeDraft({ syncRecord, config, session, revision, reconciling: false });
  syncRecord.state = 'ready';
  await syncRecord.save({ session });
  return syncResponse(syncRecord, changes, session);
};

const syncAutoBotDraft = async ({ ownerId, integrationId, scanDate, selectionVersion, recipients, templateId, senderEmail }) => {
  indexesReady ||= AutoBotDraftSync.init();
  await indexesReady;
  const digest = makeDigest(recipients);
  const { syncRecord: lockedRecord, lockToken } = await acquireLock({
    owner: ownerId,
    integrationId,
    scanDate
  });
  const config = { ownerId, templateId, senderEmail };

  try {
    if (!isReplicaSet()) {
      return await processSelection({
        syncRecord: lockedRecord,
        recipients,
        selectionVersion,
        digest,
        config,
        lockToken
      });
    }

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const syncRecord = await AutoBotDraftSync.findById(lockedRecord._id).session(session);
        result = await processSelection({
          syncRecord,
          recipients,
          selectionVersion,
          digest,
          config,
          session,
          lockToken
        });
      });
    } finally {
      await session.endSession();
    }
    return result;
  } finally {
    await releaseLock(lockedRecord._id, lockToken);
  }
};

module.exports = {
  syncAutoBotDraft,
  standaloneMaterialization,
  acquireLock,
  releaseLock,
  isReplicaSet,
  makeDigest,
  lockedError,
  staleError
};
