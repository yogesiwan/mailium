const { protect } = require("../middleware/auth");
const express = require('express');
const router = express.Router();
router.use(protect);
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const Settings = require('../models/Settings');
const AutoBotDraftSync = require('../models/AutoBotDraftSync');
const agenda = require('../config/agenda');
const { sendTestEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');
const { syncReplies } = require('../services/replySyncService');
const { resolveTimezone, getAutopilotWindowState, getZonedDayBounds } = require('../utils/timezone');
const { renderAutoBotMessage } = require('../services/autobotRendering');
const { activateAutoBotCampaign, queueActivation } = require('../services/autobotActivation');

const autoBotErrorResponse = (res, error) => res.status(error.statusCode || 409).json({
  success: false,
  code: error.code || 'AUTOBOT_ERROR',
  error: error.message,
  ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}),
  ...(error.draftPath ? { draftPath: error.draftPath } : {})
});

const ACTIVE_FOLLOW_UP_STATUSES = ['pending', 'scheduled', 'sending'];

const normalizeCampaignPayload = async (payload = {}, userId) => {
  const settings = await Settings.findOne({ user: userId });
  const defaultTimezone = resolveTimezone(settings?.defaults?.timezone || payload.schedule?.autopilot?.timezone);
  const schedule = payload.schedule || {};
  const autopilot = schedule.autopilot || {};

  return {
    ...payload,
    name: payload.name?.trim() || 'New Campaign',
    companyName: payload.companyName?.trim() || '',
    roleName: payload.roleName?.trim() || '',
    from: {
      name: payload.from?.name || settings?.defaults?.fromName || settings?.google?.userName || '',
      email: payload.from?.email || settings?.defaults?.fromEmail || settings?.google?.userEmail || ''
    },
    schedule: {
      ...schedule,
      timezone: resolveTimezone(schedule.timezone || autopilot.timezone || defaultTimezone),
      autopilot: {
        ...autopilot,
        timezone: resolveTimezone(autopilot.timezone || schedule.timezone || defaultTimezone)
      }
    },
    followUps: (payload.followUps || []).map((followUp, index) => ({
      ...followUp,
      order: followUp.order || index + 1,
      schedule: followUp.schedule
        ? {
            ...followUp.schedule,
            timezone: resolveTimezone(followUp.schedule.timezone || followUp.schedule.autopilot?.timezone || defaultTimezone),
            autopilot: {
              ...(followUp.schedule.autopilot || {}),
              timezone: resolveTimezone(followUp.schedule.autopilot?.timezone || followUp.schedule.timezone || defaultTimezone)
            }
          }
        : followUp.schedule
    }))
  };
};

const isBlankHtml = (value = '') => {
  const text = String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
};

const hasActiveFollowUps = (campaign) => (
  (campaign.followUps || []).some(followUp => ACTIVE_FOLLOW_UP_STATUSES.includes(followUp.status))
);

const updateCampaignStatusAfterFollowUpChange = async (campaign) => {
  if (hasActiveFollowUps(campaign)) {
    campaign.status = 'scheduled';
    campaign.completedAt = undefined;
    return;
  }

  if (campaign.status === 'scheduled') {
    const pendingRecipients = await Recipient.countDocuments({
      campaignId: campaign._id,
      status: { $in: ['pending', 'queued'] }
    });

    if (pendingRecipients === 0) {
      campaign.status = 'completed';
      if (!campaign.completedAt) campaign.completedAt = new Date();
    }
  }
};

const getFollowUpWakeTime = (followUps = []) => {
  const now = new Date();
  const futureSendAts = followUps
    .filter(followUp => ACTIVE_FOLLOW_UP_STATUSES.includes(followUp.status))
    .map(followUp => followUp.schedule?.sendAt ? new Date(followUp.schedule.sendAt) : null)
    .filter(date => date && Number.isFinite(date.getTime()) && date > now);

  if (futureSendAts.length === 0) return now;
  return new Date(Math.min(...futureSendAts.map(date => date.getTime())));
};

// @route   GET /api/campaigns
// @desc    Get all campaigns
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const search = req.query.search;
    const companyName = req.query.companyName;
    const roleName = req.query.roleName;

    const archived = req.query.archived;
    let query = { user: req.user._id };

    // Default to excluding archived campaigns, unless explicitly requested
    if (archived === 'true') {
      query.isArchived = true;
    } else {
      query.isArchived = { $ne: true };
    }

    // Default to excluding single type campaigns, as they shouldn't clutter the main list
    query.type = { $ne: 'single' };

    if (status && status !== 'All') query.status = status;
    if (companyName && companyName !== 'All') query.companyName = companyName;
    if (roleName && roleName !== 'All') query.roleName = roleName;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { roleName: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    const rawCampaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const now = new Date();
    const campaigns = await Promise.all(rawCampaigns.map(async (camp) => {
      let autopilotState = 'active';
      let autopilotNextRun = null;
      if (camp.status === 'sending' && camp.schedule?.autopilot?.enabled) {
        const auto = camp.schedule.autopilot;
        const windowState = getAutopilotWindowState(auto, now);
        
        if (!windowState.allowed) {
          autopilotState = 'sleeping_window';
          autopilotNextRun = windowState.nextRun;
        } else if (auto.maxPerDay > 0) {
          const { start, end } = getZonedDayBounds(now, windowState.timezone);
          const sentToday = await Recipient.countDocuments({
            campaignId: camp._id,
            'mainEmail.sentAt': { $gte: start, $lt: end }
          });
          if (sentToday >= auto.maxPerDay) {
            autopilotState = 'sleeping_limit';
            // It will resume at the start of the next day in the autopilot timezone
            const { getZonedDayBounds: nextDayBounds } = require('../utils/timezone');
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const { start: tomorrowStart } = nextDayBounds(tomorrow, windowState.timezone);
            // Then check the window state at tomorrowStart
            const tomorrowWindowState = getAutopilotWindowState(auto, tomorrowStart);
            autopilotNextRun = tomorrowWindowState.allowed ? tomorrowStart : tomorrowWindowState.nextRun;
          }
        }
      }
      return { ...camp.toObject(), autopilotState, autopilotNextRun };
    }));

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      campaigns,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/campaigns/filters
// @desc    Get available company and targeted-role filters
router.get('/filters', async (req, res, next) => {
  try {
    const [companies, roles, roleGroups] = await Promise.all([
      Campaign.distinct('companyName', { user: req.user._id, companyName: { $exists: true, $ne: '' } }),
      Campaign.distinct('roleName', { user: req.user._id, roleName: { $exists: true, $ne: '' } }),
      Campaign.aggregate([
        { $match: { user: req.user._id, companyName: { $exists: true, $ne: '' } } },
        {
          $group: {
            _id: { companyName: '$companyName', roleName: '$roleName' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.companyName': 1, '_id.roleName': 1 } }
      ])
    ]);

    res.json({
      success: true,
      companies: companies.sort((a, b) => a.localeCompare(b)),
      roles: roles.sort((a, b) => a.localeCompare(b)),
      roleGroups
    });
  } catch (err) {
    next(err);
  }
});
// @route   GET /api/campaigns/metadata/options
// @desc    Get unique company and role names for combobox
router.get('/metadata/options', async (req, res, next) => {
  try {
    const companies = await Campaign.distinct('companyName', { user: req.user._id, companyName: { $nin: [null, ''] } });
    const roles = await Campaign.distinct('roleName', { user: req.user._id, roleName: { $nin: [null, ''] } });
    res.json({
      success: true,
      companies: companies.sort(),
      roles: roles.sort()
    });
  } catch (err) {
    next(err);
  }
});


// @route   PATCH /api/campaigns/:id/schedule
// @desc    Update campaign schedule and metadata
router.patch('/:id/schedule', async (req, res, next) => {
  try {
    const { schedule, companyName, roleName } = req.body;
    const existing = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (existing?.autobot?.provider === 'autobot') {
      return res.status(409).json({ success: false, code: 'USE_ACTIVATION_FORM', error: 'Save the send time and delay in the AutoBot review form when scheduling' });
    }
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { schedule, companyName, roleName } },
      { new: true, runValidators: true }
    );
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    if (campaign.status === 'sending' || campaign.status === 'scheduled') {
      const jobs = await agenda.jobs({ name: 'send-campaign-emails', 'data.campaignId': campaign._id });
      
      let nextRun = new Date();
      if (campaign.status === 'scheduled' && campaign.schedule?.sendAt) {
        nextRun = new Date(campaign.schedule.sendAt);
        if (nextRun < new Date()) {
          nextRun = new Date();
        }
      }

      if (jobs.length > 0) {
        const job = jobs[0];
        job.schedule(nextRun);
        await job.save();
      } else {
        await agenda.schedule(nextRun, 'send-campaign-emails', { campaignId: campaign._id });
      }
    }

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/campaigns/:id
// @desc    Get single campaign
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    let autopilotState = 'active';
    const now = new Date();
    if (campaign.status === 'sending' && campaign.schedule?.autopilot?.enabled) {
      const auto = campaign.schedule.autopilot;
      const windowState = getAutopilotWindowState(auto, now);
      if (!windowState.allowed) {
        autopilotState = 'paused_window';
      } else if (auto.maxPerDay > 0) {
        const { start, end } = getZonedDayBounds(now, windowState.timezone);
        const sentToday = await Recipient.countDocuments({
          campaignId: campaign._id,
          'mainEmail.sentAt': { $gte: start, $lt: end }
        });
        if (sentToday >= auto.maxPerDay) {
          autopilotState = 'paused_limit';
        }
      }
    }

    res.json({ 
      success: true, 
      campaign: { ...campaign.toObject(), autopilotState }
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/campaigns/:id/recipients
// @desc    Get recipients for a campaign with pagination
router.get('/:id/recipients', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const search = req.query.search;

    const query = { campaignId: req.params.id, user: req.user._id };
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'data.name': { $regex: search, $options: 'i' } },
        { 'data.Name': { $regex: search, $options: 'i' } }
      ];
    }

    const recipients = await Recipient.find(query)
      .sort({ sortOrder: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Recipient.countDocuments(query);

    res.json({
      success: true,
      recipients,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/campaigns/:id/autobot-review
// @desc    Return the complete AutoBot draft recipient set and rendered preview
router.get('/:id/autobot-review', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign || campaign.autobot?.provider !== 'autobot') {
      return res.status(404).json({ success: false, error: 'AutoBot draft not found' });
    }
    const syncRecord = await AutoBotDraftSync.findById(campaign.autobot.syncRecordId).select('state');
    if (campaign.autobot.syncStatus !== 'ready' || syncRecord?.state !== 'ready') {
      return res.status(409).json({ success: false, code: 'DRAFT_SYNC_IN_PROGRESS', error: 'Wait for recipient sync to finish' });
    }

    const recipients = await Recipient.find({ campaignId: campaign._id, user: req.user._id })
      .sort({ sortOrder: 1, _id: 1 })
      .select('_id email data status sortOrder')
      .lean();
    const previewRecipient = recipients.find((recipient) => recipient.status === 'pending') || recipients[0] || null;
    const preview = previewRecipient ? renderAutoBotMessage(campaign, previewRecipient.data) : null;
    res.json({
      success: true,
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        status: campaign.status,
        subject: campaign.subject,
        body: campaign.body,
        schedule: campaign.schedule,
        from: campaign.from,
        autobot: campaign.autobot
      },
      revision: campaign.autobot.revision || 0,
      totalRecipients: recipients.length,
      recipients,
      previewRecipientId: previewRecipient?._id || null,
      preview
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/autobot-preview/:recipientId', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign || campaign.autobot?.provider !== 'autobot') {
      return res.status(404).json({ success: false, error: 'AutoBot draft not found' });
    }
    const syncRecord = await AutoBotDraftSync.findById(campaign.autobot.syncRecordId).select('state');
    if (campaign.autobot.syncStatus !== 'ready' || syncRecord?.state !== 'ready') {
      return res.status(409).json({ success: false, code: 'DRAFT_SYNC_IN_PROGRESS', error: 'Wait for recipient sync to finish' });
    }
    const recipient = await Recipient.findOne({
      _id: req.params.recipientId,
      campaignId: campaign._id,
      user: req.user._id
    }).select('_id email data status').lean();
    if (!recipient) return res.status(404).json({ success: false, error: 'Recipient not found' });
    res.json({
      success: true,
      revision: campaign.autobot.revision || 0,
      recipient,
      preview: renderAutoBotMessage(campaign, recipient.data)
    });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns
// @desc    Create new campaign
router.post('/', async (req, res, next) => {
  try {
    const campaignPayload = await normalizeCampaignPayload(req.body, req.user._id);
    delete campaignPayload.autobot;
    campaignPayload.user = req.user._id;
    const campaign = await Campaign.create(campaignPayload);
    res.status(201).json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   PUT /api/campaigns/:id
// @desc    Update campaign
router.put('/:id', async (req, res, next) => {
  try {
    const existingCampaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingCampaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    if (existingCampaign.autobot?.provider === 'autobot') {
      if (existingCampaign.autobot.activatedAt || existingCampaign.status !== 'draft') {
        return autoBotErrorResponse(res, Object.assign(new Error('Activated AutoBot campaigns are locked'), {
          statusCode: 409, code: 'DRAFT_LOCKED', draftPath: `/campaigns/${existingCampaign._id}`
        }));
      }
      if (req.body.expectedRevision !== existingCampaign.autobot.revision) {
        return autoBotErrorResponse(res, Object.assign(new Error('The draft changed; refresh and review it again'), {
          statusCode: 409, code: 'STALE_REVIEW', currentRevision: existingCampaign.autobot.revision
        }));
      }
      if (Array.isArray(req.body.followUps) && req.body.followUps.length > 0) {
        return res.status(400).json({ success: false, code: 'FOLLOWUPS_UNSUPPORTED', error: 'AutoBot drafts cannot have follow-ups' });
      }
      const allowed = ['name', 'subject', 'body', 'attachments'];
      const updates = {};
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key];
      }
      if (typeof updates.subject !== 'undefined' && (typeof updates.subject !== 'string' || !updates.subject.trim())) {
        return res.status(400).json({ success: false, error: 'Subject is required' });
      }
      if (typeof updates.body !== 'undefined' && (typeof updates.body !== 'string' || !updates.body.trim())) {
        return res.status(400).json({ success: false, error: 'Message body is required' });
      }
      const campaign = await Campaign.findOneAndUpdate(
        {
          _id: existingCampaign._id,
          user: req.user._id,
          status: 'draft',
          'autobot.revision': req.body.expectedRevision,
          'autobot.activatedAt': { $exists: false }
        },
        { $set: updates, $inc: { 'autobot.revision': 1 } },
        { new: true, runValidators: true }
      );
      if (!campaign) {
        return autoBotErrorResponse(res, Object.assign(new Error('The draft changed; refresh and review it again'), {
          statusCode: 409, code: 'STALE_REVIEW'
        }));
      }
      await AutoBotDraftSync.updateOne(
        { _id: campaign.autobot.syncRecordId, owner: req.user._id },
        { $set: { revision: campaign.autobot.revision } }
      );
      return res.json({ success: true, campaign });
    }

    const campaignPayload = await normalizeCampaignPayload({
      ...existingCampaign.toObject(),
      ...req.body
    }, req.user._id);
    delete campaignPayload._id;
    delete campaignPayload.createdAt;
    delete campaignPayload.updatedAt;
    delete campaignPayload.__v;
    delete campaignPayload.autobot;

    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id }, 
      campaignPayload, 
      {
        new: true,
        runValidators: true
      }
    );

    // Handle excluded recipients:
    // 1. Mark newly excluded recipients as 'excluded'
    if (campaign.excludedRecipients && campaign.excludedRecipients.length > 0) {
      await Recipient.updateMany(
        { campaignId: campaign._id, email: { $in: campaign.excludedRecipients }, status: { $in: ['pending', 'queued'] } },
        { $set: { status: 'excluded' } }
      );
    }
    // 2. Mark previously excluded recipients that are no longer in the list back to 'pending'
    await Recipient.updateMany(
      { 
        campaignId: campaign._id, 
        status: 'excluded', 
        email: { $nin: campaign.excludedRecipients || [] } 
      },
      { $set: { status: 'pending' } }
    );

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/follow-ups/schedule
// @desc    Confirm and schedule draft/edited follow-ups for an existing campaign
router.post('/:id/follow-ups/schedule', async (req, res, next) => {
  try {
    const existingCampaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingCampaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    if (existingCampaign.autobot?.provider === 'autobot') {
      return res.status(400).json({ success: false, code: 'FOLLOWUPS_UNSUPPORTED', error: 'AutoBot drafts cannot have follow-ups' });
    }

    const campaignPayload = await normalizeCampaignPayload({
      ...existingCampaign.toObject(),
      followUps: req.body.followUps || existingCampaign.followUps || []
    }, req.user._id);

    const now = new Date();
    let scheduledCount = 0;

    campaignPayload.followUps = (campaignPayload.followUps || []).map((followUp, index) => {
      const status = followUp.status || 'draft';
      const shouldSchedule = ['draft', 'pending', 'scheduled'].includes(status);

      if (!shouldSchedule) {
        return { ...followUp, order: index + 1 };
      }

      if (isBlankHtml(followUp.body)) {
        const error = new Error(`Follow-up ${index + 1} body is required before scheduling`);
        error.statusCode = 400;
        throw error;
      }

      if (followUp.inSameThread === false && !followUp.subject?.trim()) {
        const error = new Error(`Follow-up ${index + 1} subject is required when it is not in the same thread`);
        error.statusCode = 400;
        throw error;
      }

      scheduledCount += 1;

      return {
        ...followUp,
        order: index + 1,
        subject: followUp.inSameThread !== false ? existingCampaign.subject : followUp.subject,
        status: 'scheduled',
        scheduledAt: followUp.scheduledAt || now,
        cancelledAt: undefined,
        completedAt: undefined
      };
    });

    if (scheduledCount === 0) {
      return res.status(400).json({ success: false, error: 'No draft or scheduled follow-ups to schedule' });
    }

    delete campaignPayload._id;
    delete campaignPayload.createdAt;
    delete campaignPayload.updatedAt;
    delete campaignPayload.__v;

    existingCampaign.set(campaignPayload);
    existingCampaign.status = 'scheduled';
    existingCampaign.completedAt = undefined;
    await existingCampaign.save();

    await agenda.schedule(getFollowUpWakeTime(existingCampaign.followUps), 'send-follow-ups', { campaignId: existingCampaign._id });

    res.json({ success: true, campaign: existingCampaign, scheduledCount });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/follow-ups/:order/cancel
// @desc    Cancel a scheduled follow-up without deleting it from the timeline
router.post('/:id/follow-ups/:order/cancel', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    if (campaign.autobot?.provider === 'autobot') {
      return res.status(400).json({ success: false, code: 'FOLLOWUPS_UNSUPPORTED', error: 'AutoBot drafts cannot have follow-ups' });
    }

    const order = parseInt(req.params.order, 10);
    const followUp = campaign.followUps.find(item => item.order === order);
    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!['draft', 'pending', 'scheduled'].includes(followUp.status || 'draft')) {
      return res.status(400).json({ success: false, error: 'Only draft or scheduled follow-ups can be cancelled' });
    }

    followUp.status = 'cancelled';
    followUp.cancelledAt = new Date();
    followUp.completedAt = undefined;
    await updateCampaignStatusAfterFollowUpChange(campaign);
    await campaign.save();

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   DELETE /api/campaigns/:id
// @desc    Delete campaign and its recipients
router.delete('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    // Delete associated recipients and tracking events (could be done via mongoose middleware too)
    await Recipient.deleteMany({ campaignId: req.params.id, user: req.user._id });
    const TrackingEvent = require('../models/TrackingEvent');
    await TrackingEvent.deleteMany({ campaignId: req.params.id });
    
    await campaign.deleteOne();
    
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/retarget
// @desc    Branch a campaign by retargeting specific recipients
router.post('/:id/retarget', async (req, res, next) => {
  try {
    const { recipientIds } = req.body;
    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ success: false, error: 'recipientIds array is required' });
    }

    const parentCampaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!parentCampaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    // Create the branched campaign
    const branchedCampaign = new Campaign({
      user: req.user._id,
      parentCampaignId: parentCampaign._id,
      name: `${parentCampaign.name} (Retargeted)`,
      companyName: parentCampaign.companyName,
      roleName: parentCampaign.roleName,
      status: 'draft',
      from: parentCampaign.from,
      subject: parentCampaign.subject,
      body: parentCampaign.body,
      inSameThread: true, // Default to true as per user request for quick retargeting
      attachments: parentCampaign.attachments,
      settings: parentCampaign.settings,
      recipientSource: parentCampaign.recipientSource
      // Intentionally omitting followUps and schedules to start fresh
    });

    await branchedCampaign.save();

    // Fetch the specific recipients to copy
    const oldRecipients = await Recipient.find({
      _id: { $in: recipientIds },
      campaignId: parentCampaign._id,
      user: req.user._id
    });

    // Create new recipients for the branched campaign
    const newRecipients = oldRecipients.map(oldR => {
      // Find the last message sent to thread replies correctly
      let lastMessageId = oldR.mainEmail?.messageId;
      let lastThreadId = oldR.mainEmail?.threadId;
      let lastGmailThreadId = oldR.mainEmail?.gmailThreadId;

      if (oldR.followUps && oldR.followUps.length > 0) {
        // Iterate backwards to find the last sent followUp with a messageId
        for (let i = oldR.followUps.length - 1; i >= 0; i--) {
          if (oldR.followUps[i].messageId) {
            lastMessageId = oldR.followUps[i].messageId;
            lastThreadId = oldR.followUps[i].threadId;
            lastGmailThreadId = oldR.followUps[i].gmailThreadId;
            break;
          }
        }
      }

      return {
        user: req.user._id,
        campaignId: branchedCampaign._id,
        email: oldR.email,
        data: oldR.data,
        status: 'pending',
        retargetedFrom: {
          campaignId: parentCampaign._id,
          messageId: lastMessageId,
          threadId: lastThreadId,
          gmailThreadId: lastGmailThreadId
        }
      };
    });

    if (newRecipients.length > 0) {
      await Recipient.insertMany(newRecipients);
      branchedCampaign.stats.totalRecipients = newRecipients.length;
      await branchedCampaign.save();
    }

    res.json({ success: true, campaign: branchedCampaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/send
// @desc    Start sending campaign
router.post('/:id/send', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    if (campaign.autobot?.provider === 'autobot') {
      try {
        const result = await activateAutoBotCampaign({
          campaignId: campaign._id,
          ownerId: req.user._id,
          expectedRevision: req.body.expectedRevision,
          schedule: req.body.schedule
        });
        const response = {
          success: true,
          campaign: result.campaign,
          enqueueStatus: result.enqueueStatus
        };
        return res.status(result.enqueueStatus === 'pending' ? 202 : 200).json(response);
      } catch (error) {
        if (error.code) return autoBotErrorResponse(res, error);
        throw error;
      }
    }

    if (['scheduled', 'sending', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ success: false, error: 'Campaign is already scheduled, sending, or completed' });
    }

    // Schedule Agenda job
    // If schedule.sendAt is in the future, schedule it then, otherwise now
    const now = new Date();
    const sendAt = campaign.schedule?.sendAt ? new Date(campaign.schedule.sendAt) : now;
    const isFutureSchedule = Number.isFinite(sendAt.getTime()) && sendAt.getTime() > now.getTime() + 1000;
    const isAutopilotEnabled = campaign.schedule?.autopilot?.enabled;

    campaign.status = (isFutureSchedule || isAutopilotEnabled) ? 'scheduled' : 'sending';
    if (campaign.status === 'sending' && !campaign.startedAt) campaign.startedAt = now;
    await campaign.save();
    
    await agenda.schedule(sendAt, 'send-campaign-emails', { campaignId: campaign._id });

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/sync-replies
// @desc    Manually sync Gmail replies for a campaign
router.post('/:id/sync-replies', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const result = await syncReplies({ campaignId: campaign._id, limit: 250 });
    const updatedCampaign = await Campaign.findById(campaign._id);
    res.json({ success: true, result, campaign: updatedCampaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/pause
// @desc    Pause campaign
router.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign || !['scheduled', 'sending'].includes(campaign.status)) {
      return res.status(400).json({ success: false, error: 'Campaign is not currently scheduled or sending' });
    }

    campaign.status = 'paused';
    await campaign.save();
    
    // Cancel any pending jobs for this campaign
    await agenda.cancel({ name: 'send-campaign-emails', 'data.campaignId': campaign._id });

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/resume
// @desc    Resume campaign
router.post('/:id/resume', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!campaign || campaign.status !== 'paused') {
      return res.status(400).json({ success: false, error: 'Campaign is not paused' });
    }

    if (campaign.autobot?.provider === 'autobot') {
      const syncRecord = await AutoBotDraftSync.findOne({
        _id: campaign.autobot.syncRecordId,
        campaignId: campaign._id,
        owner: req.user._id
      });
      if (!syncRecord?.activatedAt) {
        return res.status(409).json({ success: false, code: 'DRAFT_LOCKED', error: 'AutoBot activation record is unavailable' });
      }
      const now = new Date();
      const sendAt = campaign.schedule?.sendAt ? new Date(campaign.schedule.sendAt) : now;
      const isFutureSchedule = Number.isFinite(sendAt.getTime()) && sendAt.getTime() > now.getTime() + 1000;
      campaign.status = isFutureSchedule ? 'scheduled' : 'sending';
      campaign.autobot.enqueueGeneration = (campaign.autobot.enqueueGeneration || 0) + 1;
      campaign.autobot.enqueueStatus = 'pending';
      syncRecord.enqueueGeneration = campaign.autobot.enqueueGeneration;
      syncRecord.enqueueStatus = 'pending';
      await syncRecord.save();
      await campaign.save();
      try {
        await queueActivation(syncRecord, campaign);
        campaign.autobot.enqueueStatus = 'enqueued';
        return res.json({ success: true, campaign, enqueueStatus: 'enqueued' });
      } catch {
        return res.status(202).json({ success: true, campaign, enqueueStatus: 'pending' });
      }
    }

    const now = new Date();
    const sendAt = campaign.schedule?.sendAt ? new Date(campaign.schedule.sendAt) : now;
    const isFutureSchedule = Number.isFinite(sendAt.getTime()) && sendAt.getTime() > now.getTime() + 1000;

    campaign.status = isFutureSchedule ? 'scheduled' : 'sending';
    if (campaign.status === 'sending' && !campaign.startedAt) campaign.startedAt = now;
    await campaign.save();
    
    await agenda.schedule(sendAt, 'send-campaign-emails', { campaignId: campaign._id });

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/test
// @desc    Send a test email to self
router.post('/:id/test', async (req, res, next) => {
  try {
    const { testEmail } = req.body; // If provided, else use sender email
    const campaign = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    // Try to find one recipient to use their data for placeholders
    const recipient = await Recipient.findOne({ campaignId: campaign._id });
    const data = recipient ? recipient.data : {};

    const rendered = campaign.autobot?.provider === 'autobot'
      ? renderAutoBotMessage(campaign, data)
      : {
          subject: replacePlaceholders(campaign.subject, data),
          body: replacePlaceholders(campaign.body, data)
        };
    const { subject, body } = rendered;
    const to = testEmail || campaign.from.email;

    await sendTestEmail(to, subject, body, campaign.from.name, campaign.from.email, req.user._id, campaign.attachments);

    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/test-draft
// @desc    Send a test email for an unsaved draft campaign
router.post('/test-draft', async (req, res, next) => {
  try {
    const { subject, body, testEmail, recipientData, fromName, fromEmail, attachments } = req.body;
    
    if (!subject || !body || !testEmail) {
      return res.status(400).json({ success: false, error: 'Subject, body, and test email are required' });
    }

    const data = recipientData || {};
    const parsedSubject = replacePlaceholders(subject, data);
    const parsedBody = replacePlaceholders(body, data);

    await sendTestEmail(testEmail, parsedSubject, parsedBody, fromName || 'Mailium User', fromEmail || process.env.GOOGLE_USER_EMAIL, req.user._id, attachments);

    res.json({ success: true, message: 'Test draft email sent successfully' });
  } catch (err) {
    next(err);
  }
});

// @route   PATCH /api/campaigns/:id/name
// @desc    Rename a campaign
router.patch('/:id/name', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    
    const existing = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!existing) return res.status(404).json({ success: false, error: 'Campaign not found' });
    if (existing.autobot?.provider === 'autobot') {
      if (existing.autobot.activatedAt || existing.status !== 'draft') {
        return autoBotErrorResponse(res, Object.assign(new Error('Activated AutoBot campaigns are locked'), {
          statusCode: 409, code: 'DRAFT_LOCKED', draftPath: `/campaigns/${existing._id}`
        }));
      }
      const campaign = await Campaign.findOneAndUpdate(
        { _id: existing._id, user: req.user._id, status: 'draft', 'autobot.revision': existing.autobot.revision },
        { $set: { name }, $inc: { 'autobot.revision': 1 } },
        { new: true, runValidators: true }
      );
      if (!campaign) return autoBotErrorResponse(res, Object.assign(new Error('The draft changed; refresh and review it again'), {
        statusCode: 409, code: 'STALE_REVIEW'
      }));
      await AutoBotDraftSync.updateOne(
        { _id: campaign.autobot.syncRecordId, owner: req.user._id },
        { $set: { revision: campaign.autobot.revision } }
      );
      return res.json({ success: true, campaign });
    }

    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { name },
      { new: true, runValidators: true }
    );
    
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/duplicate
// @desc    Duplicate a campaign
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const original = await Campaign.findOne({ _id: req.params.id, user: req.user._id });
    if (!original) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const newCampaignData = original.toObject();
    delete newCampaignData._id;
    delete newCampaignData.createdAt;
    delete newCampaignData.updatedAt;
    delete newCampaignData.autobot;
    
    newCampaignData.name = `Copy of ${newCampaignData.name}`;
    newCampaignData.status = 'draft';
    newCampaignData.stats = { totalRecipients: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
    newCampaignData.startedAt = undefined;
    newCampaignData.completedAt = undefined;
    newCampaignData.followUps = (newCampaignData.followUps || []).map((followUp, index) => ({
      ...followUp,
      order: index + 1,
      status: 'draft',
      scheduledAt: undefined,
      cancelledAt: undefined,
      completedAt: undefined
    }));

    const newCampaign = await Campaign.create(newCampaignData);

    // Fetch existing recipients
    const originalRecipients = await Recipient.find({ campaignId: original._id });
    if (originalRecipients && originalRecipients.length > 0) {
      const newRecipients = originalRecipients.map(r => {
        const rObj = r.toObject();
        delete rObj._id;
        delete rObj.createdAt;
        delete rObj.updatedAt;
        delete rObj.__v;
        delete rObj.origin;
        
        rObj.campaignId = newCampaign._id;
        rObj.status = 'pending';
        rObj.mainEmail = undefined;
        rObj.followUps = undefined;
        return rObj;
      });
      
      await Recipient.insertMany(newRecipients);
      newCampaign.stats.totalRecipients = newRecipients.length;
      await newCampaign.save();
    }

    res.json({ success: true, campaign: newCampaign });
  } catch (err) {
    next(err);
  }
});



// @route   PATCH /api/campaigns/:id/archive
// @desc    Archive a campaign
router.patch('/:id/archive', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: true },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   PATCH /api/campaigns/:id/unarchive
// @desc    Unarchive a campaign
router.patch('/:id/unarchive', async (req, res, next) => {
  try {
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isArchived: false },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/bulk-archive
// @desc    Bulk archive campaigns
router.post('/bulk-archive', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No campaign IDs provided' });
    }
    const result = await Campaign.updateMany(
      { _id: { $in: ids }, user: req.user._id },
      { $set: { isArchived: true } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/bulk-unarchive
// @desc    Bulk unarchive campaigns
router.post('/bulk-unarchive', async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No campaign IDs provided' });
    }
    const result = await Campaign.updateMany(
      { _id: { $in: ids }, user: req.user._id },
      { $set: { isArchived: false } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/single-email
// @desc    Create a single-email campaign and send immediately
router.post('/single-email', async (req, res, next) => {
  try {
    const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    if (!to || !subject || !body.trim()) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ success: false, error: 'A valid recipient email is required' });
    }

    const settings = await Settings.findOne({ user: req.user._id });

    // Create the "single" type campaign
    const campaign = new Campaign({
      user: req.user._id,
      name: `Single Mail: ${subject.substring(0, 30)}`,
      subject,
      body,
      type: 'single',
      status: 'sending',
      from: {
        name: settings?.defaults?.fromName || settings?.google?.userName || req.user.name || '',
        email: settings?.defaults?.fromEmail || settings?.google?.userEmail || req.user.email || ''
      },
      settings: {
        trackEmails: true
      },
      stats: { totalRecipients: 1 }
    });
    await campaign.save();

    try {
      const recipient = new Recipient({
        campaignId: campaign._id,
        user: req.user._id,
        email: to,
        status: 'pending',
        data: { email: to }
      });
      await recipient.save();

      // Trigger agenda worker to process this immediately
      await agenda.now('send-campaign-emails', { campaignId: campaign._id.toString() });
    } catch (err) {
      await Recipient.deleteMany({ campaignId: campaign._id, user: req.user._id });
      await Campaign.deleteOne({ _id: campaign._id, user: req.user._id });
      throw err;
    }

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
