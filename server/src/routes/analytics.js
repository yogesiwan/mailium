const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const TrackingEvent = require('../models/TrackingEvent');

// @route   GET /api/analytics/overview
// @desc    Global analytics across all campaigns
router.get('/overview', async (req, res, next) => {
  try {
    // Aggregate global stats from campaigns
    const stats = await Campaign.aggregate([
      {
        $group: {
          _id: null,
          totalSent: { $sum: "$stats.sent" },
          totalOpened: { $sum: "$stats.opened" },
          totalClicked: { $sum: "$stats.clicked" },
          totalReplied: { $sum: "$stats.replied" },
          totalBounced: { $sum: "$stats.bounced" },
          totalFailed: { $sum: "$stats.failed" }
        }
      }
    ]);

    const globalStats = stats[0] || {
      totalSent: 0, totalOpened: 0, totalClicked: 0, 
      totalReplied: 0, totalBounced: 0, totalFailed: 0
    };

    // Calculate rates
    const openRate = globalStats.totalSent > 0 ? (globalStats.totalOpened / globalStats.totalSent) * 100 : 0;
    const clickRate = globalStats.totalSent > 0 ? (globalStats.totalClicked / globalStats.totalSent) * 100 : 0;
    const replyRate = globalStats.totalSent > 0 ? (globalStats.totalReplied / globalStats.totalSent) * 100 : 0;

    const campaignCount = await Campaign.countDocuments();
    const recentCampaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name companyName roleName status stats createdAt startedAt completedAt');

    // Group by company
    const byCompany = await Campaign.aggregate([
      { $match: { companyName: { $exists: true, $ne: "" } } },
      {
        $group: {
          _id: "$companyName",
          sent: { $sum: "$stats.sent" },
          opened: { $sum: "$stats.opened" },
          replied: { $sum: "$stats.replied" }
        }
      },
      { $sort: { sent: -1 } },
      { $limit: 10 }
    ]);

    // Group by role
    const byRole = await Campaign.aggregate([
      { $match: { roleName: { $exists: true, $ne: "" } } },
      {
        $group: {
          _id: "$roleName",
          sent: { $sum: "$stats.sent" },
          opened: { $sum: "$stats.opened" },
          replied: { $sum: "$stats.replied" }
        }
      },
      { $sort: { sent: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      stats: globalStats,
      rates: {
        openRate: openRate.toFixed(1),
        clickRate: clickRate.toFixed(1),
        replyRate: replyRate.toFixed(1)
      },
      campaignCount,
      recentCampaigns,
      byCompany,
      byRole
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/campaigns/:id/analytics
// @desc    Per-campaign detailed analytics
router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const campaign = await Campaign.findById(campaignId);
    
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    // Status breakdown
    const recipientBreakdown = await Recipient.aggregate([
      { $match: { campaignId: campaign._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent events timeline
    const timeline = await TrackingEvent.find({ campaignId: campaign._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('recipientId', 'email');

    res.json({
      success: true,
      campaign: {
        name: campaign.name,
        status: campaign.status,
        stats: campaign.stats,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt
      },
      recipientBreakdown,
      timeline
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
