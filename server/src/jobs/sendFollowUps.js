const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const { sendEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');
const { generateTrackingId } = require('../services/trackingService');
const { getAutopilotWindowState } = require('../utils/timezone');

const ACTIVE_FOLLOW_UP_STATUSES = ['pending', 'scheduled', 'sending'];

const hasActiveFollowUps = (campaign) => (
  (campaign.followUps || []).some(followUp => ACTIVE_FOLLOW_UP_STATUSES.includes(followUp.status))
);

const completeCampaignIfFollowUpsDone = async (campaign) => {
  if (campaign.status !== 'scheduled' || hasActiveFollowUps(campaign)) return;

  const pendingRecipients = await Recipient.countDocuments({
    campaignId: campaign._id,
    status: { $in: ['pending', 'queued'] }
  });

  if (pendingRecipients === 0) {
    campaign.status = 'completed';
    campaign.completedAt = new Date();
  }
};

module.exports = function(agenda) {
  agenda.define('send-follow-ups', async (job, done) => {
    try {
      const now = new Date();
      let nextCheckAt = new Date(now.getTime() + 60 * 60 * 1000);

      const { campaignId } = job.attrs.data || {};
      const campaignQuery = {
        status: { $in: ['scheduled', 'sending', 'completed'] },
        'followUps.status': { $in: ACTIVE_FOLLOW_UP_STATUSES }
      };
      if (campaignId) campaignQuery._id = campaignId;

      const campaigns = await Campaign.find(campaignQuery);

      for (const campaign of campaigns) {
        for (let i = 0; i < campaign.followUps.length; i++) {
          const followUp = campaign.followUps[i];
          
          if (!ACTIVE_FOLLOW_UP_STATUSES.includes(followUp.status)) continue;

          if (followUp.schedule?.sendAt) {
            const sendAt = new Date(followUp.schedule.sendAt);
            if (sendAt > now) {
              if (sendAt < nextCheckAt) nextCheckAt = sendAt;
              continue;
            }
          }

          if (followUp.schedule?.autopilot?.enabled) {
            const windowState = getAutopilotWindowState(followUp.schedule.autopilot, now);
            if (!windowState.allowed) {
              if (windowState.nextRun && windowState.nextRun < nextCheckAt) nextCheckAt = windowState.nextRun;
              continue;
            }
          }
          
          // Determine if we should process this follow-up order
          // Only process order X if order X-1 is completed, or if it's order 1
          if (i > 0 && campaign.followUps[i-1].status !== 'completed') {
            continue;
          }

          // Calculate cutoff date (emails sent before this date should get follow-up)
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - followUp.delayDays);

          // Find recipients who received the PREVIOUS email before the cutoff date
          // and haven't replied (if onlyIfNoReply is true)
          // For order 1, previous is mainEmail. For order > 1, previous is followUps[order-1]
          
          let query = {
            campaignId: campaign._id,
            status: { $nin: ['bounced', 'failed'] } // Don't follow up on failures
          };
          const andConditions = [];

          if (followUp.onlyIfNoReply) {
            query['mainEmail.replied'] = false;
            // Also ensure no replies on previous follow-ups
            query['followUps.replied'] = { $ne: true };
          }
          
          if (followUp.excludedRecipients && followUp.excludedRecipients.length > 0) {
            query['email'] = { $nin: followUp.excludedRecipients };
          }

          if (followUp.order === 1) {
            query['mainEmail.sentAt'] = { $exists: true, $lte: cutoffDate };
            // Ensure this follow-up hasn't been sent yet
            andConditions.push({ followUps: { $not: { $elemMatch: { order: 1 } } } });
          } else {
            andConditions.push({
              followUps: {
                $elemMatch: {
                  order: followUp.order - 1,
                  sentAt: { $lte: cutoffDate }
                }
              }
            });
            andConditions.push({ followUps: { $not: { $elemMatch: { order: followUp.order } } } });
          }

          if (andConditions.length > 0) query.$and = andConditions;

          const recipients = await Recipient.find(query).limit(50); // Batch of 50
          
          if (recipients.length === 0) {
            if (followUp.order === 1) {
              const earliestMainEmail = await Recipient.findOne({
                campaignId: campaign._id,
                'mainEmail.sentAt': { $exists: true }
              }).sort({ 'mainEmail.sentAt': 1 }).select('mainEmail.sentAt').lean();

              if (earliestMainEmail?.mainEmail?.sentAt) {
                const dueAt = new Date(earliestMainEmail.mainEmail.sentAt);
                dueAt.setDate(dueAt.getDate() + followUp.delayDays);
                if (dueAt > now) {
                  if (dueAt < nextCheckAt) nextCheckAt = dueAt;
                  continue;
                }
              }
            }

            followUp.status = 'completed';
            followUp.completedAt = new Date();
            await completeCampaignIfFollowUpsDone(campaign);
            await campaign.save();
            continue;
          }

          if (followUp.status !== 'sending') {
            followUp.status = 'sending';
            await campaign.save();
          }

          for (const recipient of recipients) {
            try {
              const subject = replacePlaceholders(followUp.subject, recipient.data);
              const body = replacePlaceholders(followUp.body, recipient.data);
              
              const trackingId = campaign.settings.trackEmails ? generateTrackingId() : null;

              // Get thread ID from previous email
              let threadId = recipient.mainEmail.threadId;
              let replyToMessageId = recipient.mainEmail.messageId;

              if (followUp.order > 1) {
                const prev = recipient.followUps.find(f => f.order === followUp.order - 1);
                if (prev) {
                  threadId = prev.threadId;
                  replyToMessageId = prev.messageId;
                }
              }

              if (followUp.inSameThread === false) {
                threadId = undefined;
                replyToMessageId = undefined;
              }

              const emailResult = await sendEmail({
                to: recipient.email,
                subject,
                html: body,
                fromName: campaign.from.name,
                fromEmail: campaign.from.email,
                attachments: followUp.attachments,
                trackingId,
                trackEmails: campaign.settings.trackEmails,
                replyToMessageId,
                threadId
              }, campaign.user);

              // Add to recipient followUps array
              recipient.followUps.push({
                order: followUp.order,
                messageId: emailResult.messageId,
                threadId: emailResult.threadId,
                sentAt: new Date(),
                trackingId
              });
              
              await recipient.save();
              await Campaign.findByIdAndUpdate(campaign._id, { $inc: { 'stats.sent': 1 } });

            } catch (err) {
              const isAuthError = err.message === 'invalid_grant' || (err.response && err.response.data && err.response.data.error === 'invalid_grant') || (err.message && err.message.includes('invalid_grant'));
              
              if (isAuthError) {
                console.error(`Google Auth revoked/expired for campaign ${campaign._id}. Pausing campaign.`);
                await Campaign.findByIdAndUpdate(campaign._id, { status: 'paused' });
                return done(new Error(`Campaign paused due to invalid Google Auth token (invalid_grant).`));
              }

              console.error(`Failed to send follow up to ${recipient.email}:`, err);
            }
          }

          if (recipients.length < 50) {
            followUp.status = 'completed';
            followUp.completedAt = new Date();
            await completeCampaignIfFollowUpsDone(campaign);
            await campaign.save();
          }
        }
      }

      // Schedule next check
      job.schedule(nextCheckAt);
      await job.save();
      done();
    } catch (err) {
      console.error('Job send-follow-ups failed:', err);
      done(err);
    }
  });
};
