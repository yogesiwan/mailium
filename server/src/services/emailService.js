const nodemailer = require('nodemailer');
const { getOAuth2Client } = require('../config/google');
const { injectTrackingPixel, rewriteLinks } = require('./trackingService');
const Settings = require('../models/Settings');

/**
 * Creates and returns a configured Nodemailer transporter using Gmail OAuth2
 */
const createTransporter = async () => {
  try {
    const oauth2Client = await getOAuth2Client();
    
    // The access token must be refreshed if expired, getAccessToken handles this
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse.token;
    
    if (!accessToken) {
      throw new Error('Failed to retrieve access token. Check Google OAuth credentials.');
    }

    const settings = await Settings.findOne();
    const user = settings?.google?.userEmail || process.env.GOOGLE_USER_EMAIL;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = settings?.google?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: user,
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken,
        accessToken: accessToken
      }
    });

    return transporter;
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
};

/**
 * Sends an email
 * @param {Object} options 
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML body
 * @param {string} options.fromName - Sender name
 * @param {string} options.fromEmail - Sender email
 * @param {Array} options.attachments - Array of attachment objects
 * @param {string} options.trackingId - Optional tracking ID for opens/clicks
 * @param {boolean} options.trackEmails - Whether to inject tracking
 * @param {string} options.replyToMessageId - Optional Message-ID to reply to
 * @param {string} options.threadId - Optional Gmail Thread ID
 * @returns {Object} { messageId, threadId }
 */
const sendEmail = async (options) => {
  const { 
    to, subject, html, fromName, fromEmail, attachments, 
    trackingId, trackEmails, replyToMessageId, threadId 
  } = options;

  try {
    const transporter = await createTransporter();
    
    // Process HTML for tracking if enabled and trackingId is provided
    let processedHtml = html.replace(/<p><\/p>/g, '<p><br></p>');
    let finalHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          /* Basic email client resets */
          body { font-family: sans-serif; line-height: 1.4; }
          p { margin-bottom: 1em; }
        </style>
      </head>
      <body>
        ${processedHtml}
      </body>
      </html>
    `;
    const baseUrl = process.env.TRACKING_BASE_URL || 'http://localhost:5000';
    
    if (trackEmails && trackingId) {
      finalHtml = injectTrackingPixel(finalHtml, trackingId, baseUrl);
      finalHtml = rewriteLinks(finalHtml, trackingId, baseUrl);
    }
    
    // Format the From string: "Name <email>"
    const fromString = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    // Build mail options
    const mailOptions = {
      from: fromString,
      to,
      subject,
      html: finalHtml,
    };
    
    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => ({
        filename: att.originalName || att.filename,
        path: att.path,
        contentType: att.mimetype
      }));
    }
    
    // Handle Replies
    if (replyToMessageId) {
      mailOptions.inReplyTo = replyToMessageId;
      mailOptions.references = replyToMessageId; // Better client compatibility
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    // Parse response for Message ID
    // Nodemailer returns messageId surrounded by <>, we might want to keep it or strip it depending on preference.
    const messageId = info.messageId;
    
    // Return relevant info
    return {
      messageId,
      // If we provided a threadId, return it, otherwise return messageId (which acts as thread starter)
      threadId: threadId || messageId.replace(/[<>]/g, ''), 
      response: info.response
    };
    
  } catch (error) {
    console.error(`Error sending email to ${options.to}:`, error);
    throw error;
  }
};

/**
 * Sends a test email without tracking
 */
const sendTestEmail = async (to, subject, html, fromName, fromEmail) => {
  return sendEmail({
    to,
    subject: `[TEST] ${subject}`,
    html,
    fromName,
    fromEmail,
    trackEmails: false
  });
};

module.exports = {
  createTransporter,
  sendEmail,
  sendTestEmail
};
