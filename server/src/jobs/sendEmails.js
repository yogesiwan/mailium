const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const { sendEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');
const { generateTrackingId } = require('../services/trackingService');
const { getAutopilotWindowState, getZonedDayBounds } = require('../utils/timezone');

module.exports = function(agenda) {
  agenda.define('send-campaign-emails', async (job, done) => {
    try {
      const { campaignId } = job.attrs.data;
      const campaign = await Campaign.findById(campaignId);

      if (!campaign || !['scheduled', 'sending'].includes(campaign.status)) {
        return done(); // Job shouldn't run
      }

      // Defer status update to sending until after autopilot check if autopilot is enabled
      let isAutopilotEnabled = campaign.schedule && campaign.schedule.autopilot && campaign.schedule.autopilot.enabled;
      
      if (!isAutopilotEnabled && campaign.status === 'scheduled') {
        campaign.status = 'sending';
        if (!campaign.startedAt) campaign.startedAt = new Date();
        await campaign.save();
      }

      // Find pending recipients
      const query = {
        campaignId,
        status: { $in: ['pending', 'queued'] }
      };

      if (campaign.excludedRecipients && campaign.excludedRecipients.length > 0) {
        query.email = { $nin: campaign.excludedRecipients };
      }

      const recipients = await Recipient.find(query);

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

        const windowState = getAutopilotWindowState(auto, now);
        if (!windowState.allowed) {
          job.schedule(windowState.nextRun);
          await job.save();
          return done();
        }

        if (auto.maxPerDay > 0) {
          const { start, end } = getZonedDayBounds(now, windowState.timezone);
          const sentToday = await Recipient.countDocuments({
            campaignId,
            'mainEmail.sentAt': { $gte: start, $lt: end }
          });

          if (sentToday >= auto.maxPerDay) {
            const nextWindow = getAutopilotWindowState({
              ...auto,
              days: auto.days
            }, new Date(end.getTime() + 1000));
            job.schedule(nextWindow.nextRun || end);
            await job.save();
            return done();
          }
        }
      }

      // If we got here, autopilot allowed it (or not enabled)
      if (campaign.status === 'scheduled') {
        campaign.status = 'sending';
        if (!campaign.startedAt) campaign.startedAt = new Date();
        await campaign.save();
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

        const options = {
          to: recipient.email,
          subject,
          html: body,
          fromName: campaign.from.name,
          fromEmail: campaign.from.email,
          attachments: campaign.attachments,
          trackingId,
          trackEmails: campaign.settings.trackEmails
        };

        if (campaign.inSameThread && recipient.retargetedFrom && recipient.retargetedFrom.messageId) {
          options.replyToMessageId = recipient.retargetedFrom.messageId;
          options.threadId = recipient.retargetedFrom.threadId;
        }

        const emailResult = await sendEmail(options, campaign.user);

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
        } else if (campaign.schedule && campaign.schedule.delayMinutes > 0) {
          delayMinutes = campaign.schedule.delayMinutes;
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
