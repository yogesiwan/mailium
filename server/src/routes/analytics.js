const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const TrackingEvent = require('../models/TrackingEvent');

const getLatestDate = (dates) => {
  const validDates = dates.filter(Boolean).map(date => new Date(date).getTime()).filter(Number.isFinite);
  if (validDates.length === 0) return null;
  return new Date(Math.max(...validDates));
};

const buildRecipientTrackingSummary = (recipient) => {
  const followUps = recipient.followUps || [];
  const followUpOpenCount = followUps.reduce((sum, followUp) => sum + (followUp.openCount || 0), 0);
  const followUpClickCount = followUps.reduce((sum, followUp) => sum + (followUp.clickCount || 0), 0);
  const lastFollowUpOpen = getLatestDate(followUps.map(followUp => followUp.openedAt));
  const lastFollowUpClick = getLatestDate(followUps.map(followUp => followUp.clickedAt));
  const lastFollowUpReply = getLatestDate(followUps.map(followUp => followUp.repliedAt));

  return {
    _id: recipient._id,
    email: recipient.email,
    name: recipient.data?.name || recipient.data?.Name || recipient.data?.fullName || recipient.data?.FullName || '',
    role: recipient.data?.role || recipient.data?.Role || recipient.data?.title || recipient.data?.Title || '',
    company: recipient.data?.company || recipient.data?.Company || '',
    status: recipient.status,
    sentAt: recipient.mainEmail?.sentAt,
    openCount: (recipient.mainEmail?.openCount || 0) + followUpOpenCount,
    clickCount: (recipient.mainEmail?.clickCount || 0) + followUpClickCount,
    opened: Boolean(recipient.mainEmail?.opened || followUps.some(followUp => followUp.opened)),
    clicked: Boolean(recipient.mainEmail?.clicked || followUps.some(followUp => followUp.clicked)),
    replied: Boolean(recipient.mainEmail?.replied || followUps.some(followUp => followUp.replied)),
    lastOpenedAt: getLatestDate([recipient.mainEmail?.openedAt, lastFollowUpOpen]),
    lastClickedAt: getLatestDate([recipient.mainEmail?.clickedAt, lastFollowUpClick]),
    repliedAt: getLatestDate([recipient.mainEmail?.repliedAt, lastFollowUpReply]),
    followUpCount: followUps.length
  };
};

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

// @route   GET /api/analytics/campaigns/:id/tracking
// @desc    Paginated tracking events for a campaign
router.get('/campaigns/:id/tracking', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const type = req.query.type;
    const query = { campaignId };
    if (type && type !== 'All') query.type = type;

    const [events, total] = await Promise.all([
      TrackingEvent.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('recipientId', 'email data')
        .lean(),
      TrackingEvent.countDocuments(query)
    ]);

    res.json({
      success: true,
      events,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/analytics/campaigns/:id
// @desc    Per-campaign detailed analytics
router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const campaign = await Campaign.findById(campaignId).lean();
    
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
      .populate('recipientId', 'email data')
      .lean();

    const eventTotals = await TrackingEvent.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const recipients = await Recipient.find({ campaignId: campaign._id })
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    const trackingDetails = recipients.map(buildRecipientTrackingSummary);

    const sent = campaign.stats?.sent || 0;
    const rates = {
      openRate: sent > 0 ? ((campaign.stats?.opened || 0) / sent * 100).toFixed(1) : '0.0',
      clickRate: sent > 0 ? ((campaign.stats?.clicked || 0) / sent * 100).toFixed(1) : '0.0',
      replyRate: sent > 0 ? ((campaign.stats?.replied || 0) / sent * 100).toFixed(1) : '0.0'
    };

    res.json({
      success: true,
      campaign,
      rates,
      recipientBreakdown,
      eventTotals,
      timeline,
      trackingDetails
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
