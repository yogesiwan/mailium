const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const Settings = require('../models/Settings');
const { resolveTimezone } = require('../utils/timezone');

const getServerTimezone = () => resolveTimezone(process.env.TZ);
const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');
const getTrackingBaseUrl = () => trimTrailingSlash(process.env.TRACKING_BASE_URL || 'http://localhost:5001');
const getFrontendUrl = () => trimTrailingSlash(process.env.FRONTEND_URL || process.env.TRACKING_BASE_URL || 'http://localhost:5173');
const getOAuthCallbackUrl = () => `${getTrackingBaseUrl()}/api/settings/oauth/callback`;

const toPublicSettings = (settings) => {
  const publicSettings = settings.toObject();
  if (publicSettings.google) {
    publicSettings.google.isConfigured = !!publicSettings.google.refreshToken;
    publicSettings.google.connectedAt = publicSettings.google.tokenExpiry || null;
    delete publicSettings.google.refreshToken;
    delete publicSettings.google.accessToken;
    delete publicSettings.google.clientSecret;
  }

  publicSettings.server = {
    now: new Date().toISOString(),
    timezone: getServerTimezone()
  };

  publicSettings.defaults = {
    ...publicSettings.defaults,
    timezone: resolveTimezone(publicSettings.defaults?.timezone)
  };

  return publicSettings;
};

// @route   GET /api/settings
// @desc    Get current settings
router.get('/', async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }

    res.json({ success: true, settings: toPublicSettings(settings) });
  } catch (err) {
    next(err);
  }
});

// @route   PUT /api/settings
// @desc    Update settings
router.put('/', async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    // Only allow updating specific fields
    if (req.body.defaults) {
      const existingDefaults = settings.defaults?.toObject ? settings.defaults.toObject() : (settings.defaults || {});
      settings.defaults = {
        ...existingDefaults,
        ...req.body.defaults,
        timezone: resolveTimezone(req.body.defaults.timezone || settings.defaults?.timezone)
      };
    }

    await settings.save();

    res.json({ success: true, settings: toPublicSettings(settings) });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/settings/oauth/url
// @desc    Get Google OAuth consent URL
router.get('/oauth/url', async (req, res, next) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getOAuthCallbackUrl()
    );

    const scopes = [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force to get refresh token
      scope: scopes
    });

    res.json({ success: true, url });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/settings/oauth/callback
// @desc    OAuth callback to store tokens
router.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Authentication code is missing');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getOAuthCallbackUrl()
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Store in DB
    const updateData = {
      'google.refreshToken': tokens.refresh_token,
      'google.accessToken': tokens.access_token,
      'google.tokenExpiry': tokens.expiry_date,
      'google.userEmail': userInfo.data.email,
      'google.userName': userInfo.data.name,
      'google.scopes': tokens.scope.split(' ')
    };

    // Note: if refresh_token is missing, we shouldn't overwrite an existing one with null.
    if (!tokens.refresh_token) {
      delete updateData['google.refreshToken'];
    }

    await Settings.findOneAndUpdate({}, { $set: updateData }, { upsert: true });

    // Redirect back to frontend
    res.redirect(`${getFrontendUrl()}/settings?oauth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${getFrontendUrl()}/settings?oauth=error`);
  }
});

module.exports = router;
