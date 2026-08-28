const { protect } = require("../middleware/auth");
const express = require('express');
const router = express.Router({ mergeParams: true });
router.use(protect);
const Recipient = require('../models/Recipient');
const Campaign = require('../models/Campaign');

// @route   GET /api/campaigns/:campaignId/recipients
// @desc    Get all recipients for a campaign
router.get('/', async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    const search = req.query.search;

    let query = { campaignId, user: req.user._id };
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.email = { $regex: search, $options: 'i' };
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

// @route   POST /api/campaigns/:campaignId/recipients/import
// @desc    Import recipients directly
router.post('/import', async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const { recipients: recipientsData } = req.body; // Array of objects: { email, data: {} }

    if (!recipientsData || !Array.isArray(recipientsData)) {
      return res.status(400).json({ success: false, error: 'Please provide recipients array' });
    }

    // Get the current max sortOrder for this campaign
    const maxDoc = await Recipient.findOne({ campaignId, user: req.user._id })
      .sort({ sortOrder: -1 }).select('sortOrder').lean();
    const startOrder = (maxDoc?.sortOrder ?? -1) + 1;

    // Format for bulk insert with sortOrder
    const formattedRecipients = recipientsData.map((r, i) => ({
      user: req.user._id,
      campaignId,
      email: r.email,
      data: r.data || {},
      status: 'pending',
      sortOrder: startOrder + i
    }));

    // Insert ignoring duplicates
    let insertedCount = 0;
    let insertedDocs = [];
    try {
      const result = await Recipient.insertMany(formattedRecipients, { ordered: false });
      insertedCount = result.length;
      insertedDocs = result;
    } catch (error) {
      // If error is 11000 (duplicate key), insertMany throws, but we can get the inserted docs
      if (error.code === 11000 && error.insertedDocs) {
        insertedCount = error.insertedDocs.length;
        insertedDocs = error.insertedDocs;
      } else {
        throw error;
      }
    }

    // Update campaign recipient count
    const totalRecipients = await Recipient.countDocuments({ campaignId, user: req.user._id });
    await Campaign.findOneAndUpdate({ _id: campaignId, user: req.user._id }, { 'stats.totalRecipients': totalRecipients });

    res.json({
      success: true,
      insertedCount,
      duplicateCount: Math.max(recipientsData.length - insertedCount, 0),
      totalRecipients,
      sampleRecipients: insertedDocs.slice(0, 8).map(recipient => ({
        email: recipient.email,
        data: recipient.data,
        status: recipient.status
      }))
    });
  } catch (err) {
    next(err);
  }
});

// @route   DELETE /api/campaigns/:campaignId/recipients
// @desc    Clear all recipients
router.delete('/', async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    
    const result = await Recipient.deleteMany({ campaignId, user: req.user._id });
    await Campaign.findOneAndUpdate({ _id: campaignId, user: req.user._id }, { 'stats.totalRecipients': 0 });
    
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/campaigns/:campaignId/recipients/add
// @desc    Add a single recipient to an existing campaign
router.post('/add', async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const { email, data } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Verify campaign belongs to user
    const campaign = await Campaign.findOne({ _id: campaignId, user: req.user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    // Check for duplicate
    const existing = await Recipient.findOne({ campaignId, email, user: req.user._id });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Recipient with this email already exists in this campaign' });
    }

    // Get max sortOrder to append at end
    const maxDoc = await Recipient.findOne({ campaignId, user: req.user._id })
      .sort({ sortOrder: -1 }).select('sortOrder').lean();
    const sortOrder = (maxDoc?.sortOrder ?? -1) + 1;

    const recipient = await Recipient.create({
      user: req.user._id,
      campaignId,
      email,
      data: data || {},
      status: 'pending',
      sortOrder
    });

    // Update campaign recipient count
    const totalRecipients = await Recipient.countDocuments({ campaignId, user: req.user._id });
    await Campaign.findOneAndUpdate({ _id: campaignId, user: req.user._id }, { 'stats.totalRecipients': totalRecipients });

    res.json({ success: true, recipient });
  } catch (err) {
    next(err);
  }
});

// @route   PATCH /api/campaigns/:campaignId/recipients/reorder
// @desc    Reorder pending recipients by providing ordered array of IDs
router.patch('/reorder', async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const { orderedIds, startIndex = 0 } = req.body;

    if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'orderedIds array is required' });
    }

    // Verify campaign belongs to user
    const campaign = await Campaign.findOne({ _id: campaignId, user: req.user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    // Bulk update sortOrder based on array position
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, campaignId, user: req.user._id },
        update: { $set: { sortOrder: startIndex + index } }
      }
    }));

    await Recipient.bulkWrite(bulkOps);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
