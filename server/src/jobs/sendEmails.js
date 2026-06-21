const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const { sendEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');
const { generateTrackingId } = require('../services/trackingService');

module.exports = function(agenda) {
  agenda.define('send-campaign-emails', async (job, done) => {
    try {
      const { campaignId } = job.attrs.data;
      const campaign = await Campaign.findById(campaignId);

      if (!campaign || campaign.status !== 'sending') {
        return done(); // Job shouldn't run
      }

      // Find pending recipients
      const recipients = await Recipient.find({
        campaignId,
        status: { $in: ['pending', 'queued'] }
      });

      if (recipients.length === 0) {
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();
        
        // Schedule follow-ups if any exist
        if (campaign.followUps && campaign.followUps.length > 0) {
          // Trigger first follow-up check tomorrow
          await agenda.schedule('in 1 day', 'send-follow-ups');
        }
        return done();
      }

      // Autopilot check logic
      if (campaign.schedule && campaign.schedule.autopilot && campaign.schedule.autopilot.enabled) {
        const auto = campaign.schedule.autopilot;
        const now = new Date();
        
        // Very basic day check based on server time (can be improved with timezone logic)
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = dayNames[now.getDay()];
        
        if (!auto.days[currentDay]) {
          // Not an allowed day, reschedule for tomorrow
          job.schedule('tomorrow at ' + auto.startTime);
          await job.save();
          return done();
        }

        // Check time window (simplified parsing)
        const [startHr, startMin] = auto.startTime.split(':').map(Number);
        const [endHr, endMin] = auto.endTime.split(':').map(Number);
        const currentHr = now.getHours();
        const currentMin = now.getMinutes();
        
        const currentTimeInMins = currentHr * 60 + currentMin;
        const startTimeInMins = startHr * 60 + startMin;
        const endTimeInMins = endHr * 60 + endMin;

        if (currentTimeInMins < startTimeInMins) {
          // Too early, reschedule for start time
          const nextRun = new Date(now);
          nextRun.setHours(startHr, startMin, 0, 0);
          job.schedule(nextRun);
          await job.save();
          return done();
        }

        if (currentTimeInMins > endTimeInMins) {
          // Too late, reschedule for tomorrow start time
          const nextRun = new Date(now);
          nextRun.setDate(nextRun.getDate() + 1);
          nextRun.setHours(startHr, startMin, 0, 0);
          job.schedule(nextRun);
          await job.save();
          return done();
        }
      }

      // Send ONE email per job run, then reschedule itself based on delay
      // This is safer for rate limits and agenda concurrency
      const recipient = recipients[0];
      recipient.status = 'queued'; // Mark as working
      await recipient.save();

      try {
        const subject = replacePlaceholders(campaign.subject, recipient.data);
        const body = replacePlaceholders(campaign.body, recipient.data);
        
        const trackingId = campaign.settings.trackEmails ? generateTrackingId() : null;

        const emailResult = await sendEmail({
          to: recipient.email,
          subject,
          html: body,
          fromName: campaign.from.name,
          fromEmail: campaign.from.email,
          attachments: campaign.attachments,
          trackingId,
          trackEmails: campaign.settings.trackEmails
        });

        recipient.status = 'sent';
        recipient.mainEmail = {
          ...recipient.mainEmail,
          messageId: emailResult.messageId,
          threadId: emailResult.threadId,
          sentAt: new Date(),
          trackingId
        };
        await recipient.save();

        await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.sent': 1 } });

      } catch (err) {
        recipient.status = 'failed';
        recipient.mainEmail = {
          ...recipient.mainEmail,
          error: err.message
        };
        await recipient.save();
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.failed': 1 } });
      }

      // If there are more recipients, schedule the next run based on delay
      if (recipients.length > 1) {
        let delayMinutes = 0;
        if (campaign.schedule && campaign.schedule.autopilot && campaign.schedule.autopilot.enabled) {
          delayMinutes = campaign.schedule.autopilot.delayMinutes || 3;
        }
        
        if (delayMinutes > 0) {
          job.schedule(`in ${delayMinutes} minutes`);
          await job.save();
        } else {
          // Even without autopilot delay, add a tiny delay to not hammer the API
          job.schedule('in 5 seconds');
          await job.save();
        }
      } else {
        // Last one
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        await campaign.save();
        
        if (campaign.followUps && campaign.followUps.length > 0) {
          await agenda.schedule('in 1 day', 'send-follow-ups');
        }
      }

      done();
    } catch (err) {
      console.error('Job send-campaign-emails failed:', err);
      done(err);
    }
  });
};
