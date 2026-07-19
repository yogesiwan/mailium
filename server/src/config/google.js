const { google } = require('googleapis');
const Settings = require('../models/Settings');

const getOAuthCallbackUrl = () => {
  const baseUrl = (process.env.TRACKING_BASE_URL || 'http://localhost:5001').replace(/\/+$/, '');
  return `${baseUrl}/api/settings/oauth/callback`;
};

/**
 * Creates and returns an authenticated OAuth2 client.
 * If credentials exist in DB, they are used. Otherwise, it falls back to ENV vars.
 */
const getOAuth2Client = async (userId) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getOAuthCallbackUrl()
  );

  try {
    // Try to get tokens from DB first
    const settings = await Settings.findOne({ user: userId });
    if (settings && settings.google && settings.google.refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: settings.google.refreshToken,
        access_token: settings.google.accessToken,
        expiry_date: settings.google.tokenExpiry ? new Date(settings.google.tokenExpiry).getTime() : null,
      });
    } else {
      throw new Error('User has not connected their Google account.');
    }

    // Add an event listener to update the DB when the access token is refreshed
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token || tokens.access_token) {
        const updateData = {};
        if (tokens.refresh_token) updateData['google.refreshToken'] = tokens.refresh_token;
        if (tokens.access_token) updateData['google.accessToken'] = tokens.access_token;
        if (tokens.expiry_date) updateData['google.tokenExpiry'] = new Date(tokens.expiry_date);
        
        await Settings.findOneAndUpdate({ user: userId }, { $set: updateData }, { upsert: true });
        console.log('Google OAuth tokens updated in database');
      }
    });

    return oauth2Client;
  } catch (error) {
    console.error('Error setting up OAuth2 client:', error);
    throw error;
  }
};

module.exports = {
  getOAuth2Client,
};
