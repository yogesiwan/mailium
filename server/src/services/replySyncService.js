const { google } = require('googleapis');
const { getOAuth2Client } = require('../config/google');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');
const TrackingEvent = require('../models/TrackingEvent');

const REPLY_SYNC_CAMPAIGN_STATUSES = ['sending', 'paused', 'completed'];
const REPLY_SYNC_RECIPIENT_STATUSES = ['sent', 'opened', 'clicked'];

const findGmailThreadId = async (gmail, messageId) => {
  if (!messageId) return null;

  const normalizedMessageId = String(messageId).trim();
  const queries = [
    `rfc822msgid:${normalizedMessageId}`,
    `rfc822msgid:${normalizedMessageId.replace(/[<>]/g, '')}`
  ];

  for (const query of queries) {
    const searchRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 5
    });

    if (searchRes.data.messages && searchRes.data.messages.length > 0) {
      return searchRes.data.messages[0].threadId;
    }
  }

  return null;
};

const getHeader = (message, headerName) => {
  const headers = message.payload?.headers || [];
  return headers.find(header => header.name.toLowerCase() === headerName.toLowerCase())?.value || '';
};

const normalizeEmail = (value = '') => {
  const angleMatch = value.match(/<([^>]+)>/);
  return (angleMatch ? angleMatch[1] : value).trim().toLowerCase();
};

const messageDate = (message) => {
  if (message.internalDate) return new Date(Number(message.internalDate));
  const dateHeader = getHeader(message, 'Date');
  return dateHeader ? new Date(dateHeader) : null;
};

const hasRecipientReply = (messages = [], sentAt) => {
  const sentTime = sentAt ? new Date(sentAt).getTime() : 0;

  return messages.some((message) => {
    // If it's sent by us or is a draft, it's not a reply
    const isSentByMe = message.labelIds?.includes('SENT');
    const isDraft = message.labelIds?.includes('DRAFT');
    if (isSentByMe || isDraft) return false;

    // It's an incoming message on the thread, check the date
    const replyDate = messageDate(message);
    if (!replyDate || Number.isNaN(replyDate.getTime())) return true;

    return replyDate.getTime() >= sentTime - 60 * 1000;
  });
};

const markRecipientReplied = async ({ recipient, emailCheck, repliedAt }) => {
  if (emailCheck.type === 'main') {
    recipient.mainEmail.replied = true;
    recipient.mainEmail.repliedAt = repliedAt;
  } else {
    recipient.followUps[emailCheck.index].replied = true;
    recipient.followUps[emailCheck.index].repliedAt = repliedAt;
    recipient.markModified('followUps');
  }

  recipient.status = 'replied';
  await recipient.save();

  await Campaign.findByIdAndUpdate(recipient.campaignId, { $inc: { 'stats.replied': 1 } });

  await TrackingEvent.create({
    campaignId: recipient.campaignId,
    recipientId: recipient._id,
    trackingId: emailCheck.trackingId || 'manual_sync',
    type: 'reply'
  });
};

const syncReplies = async ({ campaignId, limit = 100 } = {}) => {
  const campaignQuery = campaignId
    ? { _id: campaignId, status: { $in: REPLY_SYNC_CAMPAIGN_STATUSES } }
    : { status: { $in: REPLY_SYNC_CAMPAIGN_STATUSES } };

  const activeCampaigns = await Campaign.find(campaignQuery).select('_id').lean();
  const campaignIds = activeCampaigns.map(campaign => campaign._id);

  if (campaignIds.length === 0) {
    return { checked: 0, updated: 0, skipped: 0 };
  }

  const recipients = await Recipient.find({
    campaignId: { $in: campaignIds },
    status: { $in: REPLY_SYNC_RECIPIENT_STATUSES },
    'mainEmail.messageId': { $exists: true, $ne: null }
  }).populate('campaignId', 'user').limit(limit);

  if (recipients.length === 0) {
    return { checked: 0, updated: 0, skipped: 0 };
  }

  const recipientsByUser = {};
  for (const recipient of recipients) {
    if (!recipient.campaignId || !recipient.campaignId.user) continue;
    const userId = recipient.campaignId.user.toString();
    if (!recipientsByUser[userId]) recipientsByUser[userId] = [];
    recipientsByUser[userId].push(recipient);
  }

  let updated = 0;
  let skipped = 0;

  for (const userId of Object.keys(recipientsByUser)) {
    try {
      const auth = await getOAuth2Client(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      for (const recipient of recipientsByUser[userId]) {
        try {
          const emailChecks = [];

          if (recipient.mainEmail?.messageId && !recipient.mainEmail.replied) {
            emailChecks.push({
              type: 'main',
              messageId: recipient.mainEmail.messageId,
              sentAt: recipient.mainEmail.sentAt,
              gmailThreadId: recipient.mainEmail.gmailThreadId,
              trackingId: recipient.mainEmail.trackingId
            });
          }

          recipient.followUps.forEach((followUp, index) => {
            if (followUp.messageId && !followUp.replied) {
              emailChecks.push({
                type: 'followUp',
                index,
                order: followUp.order,
                messageId: followUp.messageId,
                sentAt: followUp.sentAt,
                gmailThreadId: followUp.gmailThreadId,
                trackingId: followUp.trackingId
              });
            }
          });

          for (const emailCheck of emailChecks) {
            let trueThreadId = emailCheck.gmailThreadId;

            if (!trueThreadId) {
              trueThreadId = await findGmailThreadId(gmail, emailCheck.messageId);
              if (!trueThreadId) {
                skipped += 1;
                continue;
              }

              if (emailCheck.type === 'main') {
                recipient.mainEmail.gmailThreadId = trueThreadId;
              } else {
                recipient.followUps[emailCheck.index].gmailThreadId = trueThreadId;
                recipient.markModified('followUps');
              }
              await recipient.save();
            }

            const response = await gmail.users.threads.get({
              userId: 'me',
              id: trueThreadId,
              format: 'metadata',
              metadataHeaders: ['From', 'Date']
            });

            if (hasRecipientReply(response.data.messages, emailCheck.sentAt)) {
              await markRecipientReplied({ recipient, emailCheck, repliedAt: new Date() });
              updated += 1;
              break; // Stop checking further follow-ups if already replied
            }
          }
        } catch (err) {
          skipped += 1;
          if (err.code !== 404) {
            console.error(`Gmail API error for recipient ${recipient.email}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to get OAuth client for user ${userId}:`, err.message);
      skipped += recipientsByUser[userId].length;
    }
  }

  return { checked: recipients.length, updated, skipped };
};

module.exports = {
  syncReplies,
  findGmailThreadId,
  hasRecipientReply
};
