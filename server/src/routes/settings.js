const { protect } = require("../middleware/auth");
const express = require('express');
const router = express.Router();
router.use((req, res, next) => {
  if (req.path === '/oauth/callback') return next();
  protect(req, res, next);
});
const { google } = require('googleapis');
const Settings = require('../models/Settings');
const IgnoredIP = require('../models/IgnoredIP');
const { resolveTimezone } = require('../utils/timezone');

const getServerTimezone = () => resolveTimezone(process.env.TZ);
const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');
const getTrackingBaseUrl = () => trimTrailingSlash(process.env.TRACKING_BASE_URL || 'http://localhost:5001');
const getFrontendUrl = () => trimTrailingSlash(process.env.FRONTEND_URL || process.env.TRACKING_BASE_URL || 'http://localhost:5173');
const getOAuthCallbackUrl = () => `${getTrackingBaseUrl()}/api/settings/oauth/callback`;
const hasEnvGoogleCredentials = () => Boolean(
  process.env.GOOGLE_CLIENT_ID
  && process.env.GOOGLE_CLIENT_SECRET
  && process.env.GOOGLE_REFRESH_TOKEN
);
const isSecureOAuthCallback = () => {
  const callbackUrl = getOAuthCallbackUrl();
  return callbackUrl.startsWith('https://')
    || callbackUrl.startsWith('http://localhost')
    || callbackUrl.startsWith('http://127.0.0.1');
};

const toPublicSettings = (settings) => {
  const publicSettings = settings.toObject();
  const googleSettings = publicSettings.google || {};
  const hasDbGoogleCredentials = Boolean(googleSettings.refreshToken);
  const hasEnvCredentials = hasEnvGoogleCredentials();

  publicSettings.google = {
    ...googleSettings,
    userEmail: googleSettings.userEmail || process.env.GOOGLE_USER_EMAIL || '',
    userName: googleSettings.userName || (hasEnvCredentials ? 'Google account from server env' : ''),
    scopes: googleSettings.scopes || [],
    isConfigured: hasDbGoogleCredentials || hasEnvCredentials,
    connectedAt: googleSettings.tokenExpiry || null,
    source: hasDbGoogleCredentials ? 'database' : hasEnvCredentials ? 'environment' : 'none',
    oauthAvailable: isSecureOAuthCallback()
  };
  delete publicSettings.google.refreshToken;
  delete publicSettings.google.accessToken;
  delete publicSettings.google.clientSecret;

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
    let settings = await Settings.findOne({ user: req.user._id });
    if (!settings) {
      settings = await Settings.create({ user: req.user._id });
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
    let settings = await Settings.findOne({ user: req.user._id });
    if (!settings) {
      settings = new Settings({ user: req.user._id });
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
    if (!isSecureOAuthCallback()) {
      return res.status(400).json({
        success: false,
        error: 'Google OAuth requires an HTTPS redirect URI in production. Configure TRACKING_BASE_URL with HTTPS or use GOOGLE_REFRESH_TOKEN in the server env.'
      });
    }

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
      scope: scopes,
      state: req.user._id.toString()
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
    const { code, state } = req.query;
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

    const userId = state; // We passed req.user._id in state

    await Settings.findOneAndUpdate({ user: userId }, { $set: updateData }, { upsert: true });

    // Redirect back to frontend
    res.redirect(`${getFrontendUrl()}/settings?oauth=success`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${getFrontendUrl()}/settings?oauth=error`);
  }
});

// @route   GET /api/settings/ignored-ips
// @desc    Get all ignored IPs
router.get('/ignored-ips', async (req, res, next) => {
  try {
    const ips = await IgnoredIP.find().sort('-createdAt');
    res.json({ success: true, ips });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/settings/ignored-ips
// @desc    Add current IP to ignored IPs
router.post('/ignored-ips', async (req, res, next) => {
  try {
    const { label } = req.body;
    // req.ip works correctly due to app.set('trust proxy', 1) in index.js
    let rawIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // Extract first IP if it's a comma-separated list
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp;
    
    if (!ip) {
       return res.status(400).json({ success: false, error: 'Could not determine IP address' });
    }

    let ignoredIp = await IgnoredIP.findOne({ ip });
    if (ignoredIp) {
      ignoredIp.label = label || ignoredIp.label;
      ignoredIp.createdAt = Date.now();
      await ignoredIp.save();
    } else {
      ignoredIp = await IgnoredIP.create({ ip, label: label || 'Whitelisted Device' });
    }
    
    res.json({ success: true, ip: ignoredIp });
  } catch (err) {
    next(err);
  }
});

// @route   DELETE /api/settings/ignored-ips/:id
// @desc    Remove an ignored IP
router.delete('/ignored-ips/:id', async (req, res, next) => {
  try {
    await IgnoredIP.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
