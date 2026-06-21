const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const { sendEmail } = require('../services/emailService');
const { replacePlaceholders } = require('../services/templateEngine');
const { generateTrackingId } = require('../services/trackingService');

module.exports = function(agenda) {
  agenda.define('send-follow-ups', async (job, done) => {
    try {
      // Find campaigns that are completed or sending and have pending follow-ups
      const campaigns = await Campaign.find({
        status: { $in: ['sending', 'completed'] },
        'followUps.status': { $in: ['pending', 'sending'] }
      });

      for (const campaign of campaigns) {
        for (let i = 0; i < campaign.followUps.length; i++) {
          const followUp = campaign.followUps[i];
          
          if (followUp.status === 'completed') continue;
          
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

          if (followUp.onlyIfNoReply) {
            query['mainEmail.replied'] = false;
            // Also ensure no replies on previous follow-ups
            query['followUps.replied'] = { $ne: true };
          }

          if (followUp.order === 1) {
            query['mainEmail.status'] = 'sent';
            query['mainEmail.sentAt'] = { $lte: cutoffDate };
            // Ensure this follow-up hasn't been sent yet
            query['followUps'] = { $not: { $elemMatch: { order: 1 } } };
          } else {
            // Needs more complex querying in real scenario for order > 1
            // For simplicity, checking if previous follow up was sent before cutoff
            query['followUps'] = {
              $elemMatch: {
                order: followUp.order - 1,
                sentAt: { $lte: cutoffDate }
              }
            };
          }

          const recipients = await Recipient.find(query).limit(50); // Batch of 50
          
          if (recipients.length === 0) {
            // Might be completed for this order
            // We should check if ALL eligible recipients have received it
            // For now, let's keep it simple.
            continue;
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
              });

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
              console.error(`Failed to send follow up to ${recipient.email}:`, err);
            }
          }
        }
      }

      // Schedule next check
      job.schedule('in 1 hour');
      await job.save();
      done();
    } catch (err) {
      console.error('Job send-follow-ups failed:', err);
      done(err);
    }
  });
};
