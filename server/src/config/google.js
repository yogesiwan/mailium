const { google } = require('googleapis');
const Settings = require('../models/Settings');

/**
 * Creates and returns an authenticated OAuth2 client.
 * If credentials exist in DB, they are used. Otherwise, it falls back to ENV vars.
 */
const getOAuth2Client = async () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.TRACKING_BASE_URL + '/api/settings/oauth/callback' // Redirect URI
  );

  try {
    // Try to get tokens from DB first
    const settings = await Settings.findOne();
    if (settings && settings.google && settings.google.refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: settings.google.refreshToken,
        access_token: settings.google.accessToken,
        expiry_date: settings.google.tokenExpiry ? new Date(settings.google.tokenExpiry).getTime() : null,
      });
    } else {
      // Fallback to ENV vars
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });
    }

    // Add an event listener to update the DB when the access token is refreshed
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token || tokens.access_token) {
        const updateData = {};
        if (tokens.refresh_token) updateData['google.refreshToken'] = tokens.refresh_token;
        if (tokens.access_token) updateData['google.accessToken'] = tokens.access_token;
        if (tokens.expiry_date) updateData['google.tokenExpiry'] = new Date(tokens.expiry_date);
        
        await Settings.findOneAndUpdate({}, { $set: updateData }, { upsert: true });
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
