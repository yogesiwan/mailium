const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const agenda = require('../config/agenda');
const { sendTestEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');

// @route   GET /api/campaigns
// @desc    Get all campaigns
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const search = req.query.search;

    let query = {};
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
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

    const recipients = await Recipient.find({ campaignId: req.params.id })
      .sort({ _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Recipient.countDocuments({ campaignId: req.params.id });

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
    const campaign = await Campaign.create(req.body);
    res.status(201).json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   PUT /api/campaigns/:id
// @desc    Update campaign
router.put('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
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

    if (campaign.status === 'sending' || campaign.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Campaign is already sending or completed' });
    }

    campaign.status = 'sending';
    if (!campaign.startedAt) campaign.startedAt = new Date();
    await campaign.save();

    // Schedule Agenda job
    // If schedule.sendAt is in the future, schedule it then, otherwise now
    const sendAt = campaign.schedule?.sendAt ? new Date(campaign.schedule.sendAt) : new Date();
    
    await agenda.schedule(sendAt, 'send-campaign-emails', { campaignId: campaign._id });

    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:id/pause
// @desc    Pause campaign
router.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign || campaign.status !== 'sending') {
      return res.status(400).json({ success: false, error: 'Campaign is not currently sending' });
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

    campaign.status = 'sending';
    await campaign.save();
    
    await agenda.now('send-campaign-emails', { campaignId: campaign._id });

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

    const newCampaign = await Campaign.create(newCampaignData);
    res.json({ success: true, campaign: newCampaign });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
