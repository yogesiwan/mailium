const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const Settings = require('../models/Settings');
const agenda = require('../config/agenda');
const { sendTestEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');
const { syncReplies } = require('../services/replySyncService');
const { resolveTimezone } = require('../utils/timezone');

const ACTIVE_FOLLOW_UP_STATUSES = ['pending', 'scheduled', 'sending'];

const normalizeCampaignPayload = async (payload = {}) => {
  const settings = await Settings.findOne();
  const defaultTimezone = resolveTimezone(settings?.defaults?.timezone || payload.schedule?.autopilot?.timezone);
  const schedule = payload.schedule || {};
  const autopilot = schedule.autopilot || {};

  return {
    ...payload,
    name: payload.name?.trim() || 'New Campaign',
    companyName: payload.companyName?.trim() || '',
    roleName: payload.roleName?.trim() || '',
    from: {
      name: payload.from?.name || settings?.defaults?.fromName || 'Yogesh Siwan',
      email: payload.from?.email || settings?.defaults?.fromEmail || process.env.GOOGLE_USER_EMAIL
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

    let query = {};
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

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

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
      Campaign.distinct('companyName', { companyName: { $exists: true, $ne: '' } }),
      Campaign.distinct('roleName', { roleName: { $exists: true, $ne: '' } }),
      Campaign.aggregate([
        { $match: { companyName: { $exists: true, $ne: '' } } },
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

// @route   GET /api/campaigns/:id
// @desc    Get single campaign
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, campaign });
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

    const query = { campaignId: req.params.id };
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { 'data.name': { $regex: search, $options: 'i' } },
        { 'data.Name': { $regex: search, $options: 'i' } }
      ];
    }

    const recipients = await Recipient.find(query)
      .sort({ _id: 1 })
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

// @route   POST /api/campaigns
// @desc    Create new campaign
router.post('/', async (req, res, next) => {
  try {
    const campaignPayload = await normalizeCampaignPayload(req.body);
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
    const existingCampaign = await Campaign.findById(req.params.id);
    if (!existingCampaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const campaignPayload = await normalizeCampaignPayload({
      ...existingCampaign.toObject(),
      ...req.body
    });
    delete campaignPayload._id;
    delete campaignPayload.createdAt;
    delete campaignPayload.updatedAt;
    delete campaignPayload.__v;

    const campaign = await Campaign.findByIdAndUpdate(req.params.id, campaignPayload, {
      new: true,
      runValidators: true
    });

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/follow-ups/schedule
// @desc    Confirm and schedule draft/edited follow-ups for an existing campaign
router.post('/:id/follow-ups/schedule', async (req, res, next) => {
  try {
    const existingCampaign = await Campaign.findById(req.params.id);
    if (!existingCampaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const campaignPayload = await normalizeCampaignPayload({
      ...existingCampaign.toObject(),
      followUps: req.body.followUps || existingCampaign.followUps || []
    });

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
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
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
    await Recipient.deleteMany({ campaignId: req.params.id });
    const TrackingEvent = require('../models/TrackingEvent');
    await TrackingEvent.deleteMany({ campaignId: req.params.id });
    
    await campaign.deleteOne();
    
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/send
// @desc    Start sending campaign
router.post('/:id/send', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
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
    const campaign = await Campaign.findById(req.params.id);
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
    const campaign = await Campaign.findById(req.params.id);
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
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign || campaign.status !== 'paused') {
      return res.status(400).json({ success: false, error: 'Campaign is not paused' });
    }

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

// @route   POST /api/campaigns/:id/test
// @desc    Send a test email to self
router.post('/:id/test', async (req, res, next) => {
  try {
    const { testEmail } = req.body; // If provided, else use sender email
    const campaign = await Campaign.findById(req.params.id);
    
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    // Try to find one recipient to use their data for placeholders
    const recipient = await Recipient.findOne({ campaignId: campaign._id });
    const data = recipient ? recipient.data : {};

    const subject = replacePlaceholders(campaign.subject, data);
    const body = replacePlaceholders(campaign.body, data);
    const to = testEmail || campaign.from.email;

    await sendTestEmail(to, subject, body, campaign.from.name, campaign.from.email);

    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/test-draft
// @desc    Send a test email for an unsaved draft campaign
router.post('/test-draft', async (req, res, next) => {
  try {
    const { subject, body, testEmail, recipientData, fromName, fromEmail } = req.body;
    
    if (!subject || !body || !testEmail) {
      return res.status(400).json({ success: false, error: 'Subject, body, and test email are required' });
    }

    const data = recipientData || {};
    const parsedSubject = replacePlaceholders(subject, data);
    const parsedBody = replacePlaceholders(body, data);

    await sendTestEmail(testEmail, parsedSubject, parsedBody, fromName || 'Mailium User', fromEmail || process.env.GOOGLE_USER_EMAIL);

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
    
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id, 
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
    const original = await Campaign.findById(req.params.id);
    if (!original) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const newCampaignData = original.toObject();
    delete newCampaignData._id;
    delete newCampaignData.createdAt;
    delete newCampaignData.updatedAt;
    
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
    res.json({ success: true, campaign: newCampaign });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
