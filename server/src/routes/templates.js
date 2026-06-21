const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const Campaign = require('../models/Campaign');

// @route   GET /api/templates
// @desc    Get all templates
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;

    let query = {};
    if (search) {
      query.$text = { $search: search };
    }

    const templates = await Template.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Template.countDocuments(query);

    res.json({
      success: true,
      templates,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/templates/:id
// @desc    Get single template
router.get('/:id', async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/templates
// @desc    Create template
router.post('/', async (req, res, next) => {
  try {
    const template = await Template.create(req.body);
    res.status(201).json({ success: true, template });
  } catch (err) {
    next(err);
  }
});

// @route   PUT /api/templates/:id
// @desc    Update template
router.put('/:id', async (req, res, next) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (err) {
    next(err);
  }
});

// @route   DELETE /api/templates/:id
// @desc    Delete template
router.delete('/:id', async (req, res, next) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    await template.deleteOne();
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/templates/from-campaign/:campaignId
// @desc    Save campaign as template
router.post('/from-campaign/:campaignId', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Template name is required' });
    }

    const templateData = {
      name,
      description,
      subject: campaign.subject,
      body: campaign.body,
      followUps: campaign.followUps.map(f => ({
        order: f.order,
        subject: f.subject,
        body: f.body,
        delayDays: f.delayDays
      })),
      settings: campaign.settings
    };

    const template = await Template.create(templateData);
    res.status(201).json({ success: true, template });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
