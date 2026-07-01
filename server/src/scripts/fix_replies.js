require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Recipient = require('../models/Recipient');
const Campaign = require('../models/Campaign');
const TrackingEvent = require('../models/TrackingEvent');

async function fixReplies() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    // Look for Shantanu and Carol
    const recipients = await Recipient.find({
      $or: [
        { name: /Shantanu/i },
        { email: /shantanu/i },
        { name: /Carol/i },
        { email: /carol/i }
      ],
      status: { $ne: 'replied' }
    });

    console.log(`Found ${recipients.length} recipients to update.`);

    for (const recipient of recipients) {
      console.log(`Updating recipient: ${recipient.email}`);

      // We'll mark the mainEmail as replied for simplicity (or whatever was last sent)
      if (recipient.mainEmail && !recipient.mainEmail.replied) {
        recipient.mainEmail.replied = true;
        recipient.mainEmail.repliedAt = new Date();
      }

      recipient.status = 'replied';
      await recipient.save();

      await Campaign.findByIdAndUpdate(recipient.campaignId, { $inc: { 'stats.replied': 1 } });

      await TrackingEvent.create({
        campaignId: recipient.campaignId,
        recipientId: recipient._id,
        trackingId: recipient.mainEmail?.trackingId || 'manual_sync_fix',
        type: 'reply',
        createdAt: new Date()
      });

      console.log(`Successfully marked ${recipient.email} as replied.`);
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error fixing replies:', err);
    process.exit(1);
  }
}

fixReplies();
