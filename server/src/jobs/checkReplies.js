const { google } = require('googleapis');
const { getOAuth2Client } = require('../config/google');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const TrackingEvent = require('../models/TrackingEvent');

module.exports = function(agenda) {
  agenda.define('check-replies', async (job, done) => {
    try {
      // Find recipients who have been sent an email but haven't replied
      // We only check active or recently completed campaigns to save API calls
      const activeCampaigns = await Campaign.find({
        status: { $in: ['sending', 'completed'] }
      }).select('_id');
      
      const campaignIds = activeCampaigns.map(c => c._id);

      const recipients = await Recipient.find({
        campaignId: { $in: campaignIds },
        status: { $in: ['sent', 'opened', 'clicked'] }, // Not replied, bounced, failed
        'mainEmail.threadId': { $exists: true }
      }).limit(100); // Batch limit

      if (recipients.length === 0) {
        return done();
      }

      const auth = await getOAuth2Client();
      const gmail = google.gmail({ version: 'v1', auth });

      for (const recipient of recipients) {
        try {
          let trueThreadId = recipient.mainEmail.gmailThreadId;
          
          if (!trueThreadId) {
            // Find the true thread ID using the RFC 2822 Message-ID
            // emailService.js returns messageId with angle brackets, e.g., <abc@gmail.com>
            const messageId = recipient.mainEmail.messageId;
            const searchRes = await gmail.users.messages.list({
              userId: 'me',
              q: `rfc822msgid:${messageId}`
            });
            
            if (searchRes.data.messages && searchRes.data.messages.length > 0) {
              trueThreadId = searchRes.data.messages[0].threadId;
              // Cache it
              recipient.mainEmail.gmailThreadId = trueThreadId;
              // We don't await save here to keep the loop fast, it will be saved if there's a reply
              // or we can just save it.
              await recipient.save();
            } else {
              // Message not found in Gmail
              continue;
            }
          }

          const response = await gmail.users.threads.get({
            userId: 'me',
            id: trueThreadId,
            format: 'metadata',
            metadataHeaders: ['From']
          });

          const messages = response.data.messages;
          
          if (messages && messages.length > 1) {
            // There's more than one message in the thread.
            // Check if any message is from someone else (the recipient)
            let hasReply = false;

            // Skip the first message (which is our outbound email)
            for (let i = 1; i < messages.length; i++) {
              const msg = messages[i];
              const fromHeader = msg.payload.headers.find(h => h.name.toLowerCase() === 'from');
              
              if (fromHeader) {
                // If the 'From' address contains the recipient's email, it's a reply
                if (fromHeader.value.toLowerCase().includes(recipient.email.toLowerCase())) {
                  hasReply = true;
                  break;
                }
              }
            }

            if (hasReply) {
              // Update recipient
              recipient.mainEmail.replied = true;
              recipient.mainEmail.repliedAt = new Date();
              recipient.status = 'replied';
              await recipient.save();

              // Update campaign stats
              await Campaign.findByIdAndUpdate(recipient.campaignId, { $inc: { 'stats.replied': 1 } });

              // Log event
              await TrackingEvent.create({
                campaignId: recipient.campaignId,
                recipientId: recipient._id,
                trackingId: recipient.mainEmail.trackingId || 'manual_sync',
                type: 'reply'
              });
            }
          }
        } catch (err) {
          // If thread is not found or other API error, just continue
          if (err.code !== 404) {
            console.error(`Gmail API error for recipient ${recipient.email}:`, err.message);
          }
        }
      }

      done();
    } catch (err) {
      console.error('Job check-replies failed:', err);
      done(err);
    }
  });
};
