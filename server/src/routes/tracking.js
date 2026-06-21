const express = require('express');
const router = express.Router();
const TrackingEvent = require('../models/TrackingEvent');
const Recipient = require('../models/Recipient');
const Campaign = require('../models/Campaign');
const { getPixelImage } = require('../utils/pixelImage');
const { isbot } = require('isbot');
const IgnoredIP = require('../models/IgnoredIP');

// Helper to log event and update stats
const handleTrackingEvent = async (trackingId, type, req, additionalData = {}) => {
  try {
    // Find recipient by trackingId
    const recipient = await Recipient.findOne({
      $or: [
        { 'mainEmail.trackingId': trackingId },
        { 'followUps.trackingId': trackingId }
      ]
    });

    if (!recipient) return null;

    // Check if it's main email or follow-up
    const isMain = recipient.mainEmail.trackingId === trackingId;
    const emailData = isMain ? recipient.mainEmail : recipient.followUps.find(f => f.trackingId === trackingId);

    let rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp;
    const userAgent = req.headers['user-agent'] || '';

    // Detect Bot or Ignored IP
    const botDetected = isbot(userAgent) || userAgent.includes('GoogleImageProxy');
    const ignoredIpDoc = await IgnoredIP.findOne({ ip });
    const isIgnored = !!ignoredIpDoc;

    // Create event
    await TrackingEvent.create({
      campaignId: recipient.campaignId,
      recipientId: recipient._id,
      trackingId,
      type,
      metadata: {
        ...additionalData,
        userAgent,
        ip,
        isBot: botDetected,
        isIgnored
      }
    });

    // If it's a machine open or ignored IP, we DO NOT update stats
    if (botDetected || isIgnored) {
      return recipient;
    }

    // Update recipient based on type
    const updateData = {};
    const campaignInc = {};

    if (type === 'open') {
      const targetPrefix = isMain ? 'mainEmail.' : `followUps.$.`;
      
      // Update specific email stats
      updateData[`${targetPrefix}openCount`] = emailData.openCount ? emailData.openCount + 1 : 1;
      updateData[`${targetPrefix}openedAt`] = new Date();
      
      if (!emailData.opened) {
        updateData[`${targetPrefix}opened`] = true;
        
        // If overall recipient status is sent, upgrade to opened
        if (recipient.status === 'sent') {
          updateData.status = 'opened';
        }
        
        // Update campaign stats
        campaignInc['stats.opened'] = 1;
      }
    } else if (type === 'click') {
      const targetPrefix = isMain ? 'mainEmail.' : `followUps.$.`;
      
      updateData[`${targetPrefix}clickCount`] = emailData.clickCount ? emailData.clickCount + 1 : 1;
      updateData[`${targetPrefix}clickedAt`] = new Date();
      
      if (!emailData.clicked) {
        updateData[`${targetPrefix}clicked`] = true;
        
        if (recipient.status === 'sent' || recipient.status === 'opened') {
          updateData.status = 'clicked';
        }
        
        campaignInc['stats.clicked'] = 1;
      }
    }

    // Apply updates
    if (Object.keys(updateData).length > 0) {
      if (isMain) {
        await Recipient.findByIdAndUpdate(recipient._id, { $set: updateData });
      } else {
        // More complex update for array element
        const matchQuery = { _id: recipient._id, 'followUps.trackingId': trackingId };
        await Recipient.findOneAndUpdate(matchQuery, { $set: updateData });
      }
    }

    if (Object.keys(campaignInc).length > 0) {
      await Campaign.findByIdAndUpdate(recipient.campaignId, { $inc: campaignInc });
    }

    return recipient;
  } catch (err) {
    console.error('Error handling tracking event:', err);
    return null;
  }
};

// @route   GET /t/:trackingId/pixel.png
// @desc    Tracking pixel for opens
router.get('/:trackingId/pixel.png', async (req, res) => {
  const { trackingId } = req.params;
  
  // Record open event before responding so the event is not dropped under process churn.
  await handleTrackingEvent(trackingId, 'open', req);

  // Send 1x1 transparent PNG
  const imgBuffer = getPixelImage();
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': imgBuffer.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(imgBuffer);
});

// @route   GET /t/:trackingId/click
// @desc    Tracking link for clicks
router.get('/:trackingId/click', async (req, res) => {
  const { trackingId } = req.params;
  const originalUrl = req.query.url;
  
  if (!originalUrl) {
    return res.status(400).send('Invalid URL');
  }

  await handleTrackingEvent(trackingId, 'click', req, { url: originalUrl });

  // Redirect to original URL
  res.redirect(302, originalUrl);
});

module.exports = router;
