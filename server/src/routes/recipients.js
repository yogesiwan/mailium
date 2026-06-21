const express = require('express');
const router = express.Router({ mergeParams: true }); // Merge params to get campaignId
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

    let query = { campaignId };
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.email = { $regex: search, $options: 'i' };
    }

    const recipients = await Recipient.find(query)
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

    // Format for bulk insert
    const formattedRecipients = recipientsData.map(r => ({
      campaignId,
      email: r.email,
      data: r.data || {},
      status: 'pending'
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
    const totalRecipients = await Recipient.countDocuments({ campaignId });
    await Campaign.findByIdAndUpdate(campaignId, { 'stats.totalRecipients': totalRecipients });

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
    
    const result = await Recipient.deleteMany({ campaignId });
    await Campaign.findByIdAndUpdate(campaignId, { 'stats.totalRecipients': 0 });
    
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
