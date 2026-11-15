const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const Template = require('../models/Template');
const { syncAutoBotDraft } = require('../services/autobotDraftSync');

const router = express.Router();

const jsonError = (res, status, code, error, details = {}) => (
  res.status(status).json({ code, error, ...details })
);

const isPrivateProxyAddress = (address = '') => {
  const ip = address.replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  const match = ip.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
};

const getIntegrationConfig = (req, res, next) => {
  const integrationId = process.env.AUTOBOT_INTEGRATION_ID?.trim();
  const ownerId = process.env.AUTOBOT_OWNER_USER_ID?.trim();
  const templateId = process.env.AUTOBOT_DEFAULT_TEMPLATE_ID?.trim();
  const tokenHash = process.env.AUTOBOT_SYNC_TOKEN_SHA256?.trim().toLowerCase();
  const senderEmail = process.env.AUTOBOT_SENDER_EMAIL?.trim() || '';

  if (!integrationId || !mongoose.isValidObjectId(ownerId) || !mongoose.isValidObjectId(templateId)
    || !/^[a-f0-9]{64}$/.test(tokenHash || '')) {
    return jsonError(res, 503, 'INTEGRATION_UNAVAILABLE', 'AutoBot integration is not configured');
  }

  const forwardedHttps = req.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() === 'https';
  const httpsViaTrustedProxy = forwardedHttps && isPrivateProxyAddress(req.socket.remoteAddress);
  if (!req.socket.encrypted && !httpsViaTrustedProxy) {
    return jsonError(res, 400, 'HTTPS_REQUIRED', 'AutoBot draft sync requires HTTPS');
  }

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return jsonError(res, 401, 'UNAUTHORIZED', 'Invalid integration credentials');

  const suppliedHash = crypto.createHash('sha256').update(match[1], 'utf8').digest();
  const expectedHash = Buffer.from(tokenHash, 'hex');
  if (suppliedHash.length !== expectedHash.length || !crypto.timingSafeEqual(suppliedHash, expectedHash)) {
    return jsonError(res, 401, 'UNAUTHORIZED', 'Invalid integration credentials');
  }

  req.autoBotConfig = {
    integrationId,
    ownerId: new mongoose.Types.ObjectId(ownerId),
    templateId: new mongoose.Types.ObjectId(templateId),
    senderEmail
  };
  next();
};

const validateScanDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const validateRecipient = (value, index) => {
  const fail = (message) => ({ error: `recipients[${index}] ${message}` });
  const allowedKeys = ['jobId', 'email', 'contactName', 'company', 'role', 'location', 'jobUrl'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('must be an object');
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return fail('contains unsupported fields');
  if (!allowedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) return fail('is missing required fields');

  if (typeof value.jobId !== 'string' || !value.jobId.trim() || value.jobId.trim().length > 256) {
    return fail('jobId must be a non-empty string of at most 256 characters');
  }
  if (typeof value.email !== 'string' || value.email.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
    return fail('email must be a valid address of at most 254 characters');
  }
  for (const field of ['contactName', 'company', 'role', 'location']) {
    if (value[field] !== null && (typeof value[field] !== 'string' || value[field].length > 200)) {
      return fail(`${field} must be null or a string of at most 200 characters`);
    }
  }
  if (typeof value.jobUrl !== 'string' || value.jobUrl.length > 2048) {
    return fail('jobUrl must be an absolute HTTP or HTTPS URL of at most 2048 characters');
  }
  try {
    const url = new URL(value.jobUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return fail('jobUrl must be an absolute HTTP or HTTPS URL without embedded credentials');
    }
  } catch {
    return fail('jobUrl must be an absolute HTTP or HTTPS URL');
  }

  return {
    recipient: {
      jobId: value.jobId.trim(),
      email: value.email.trim().toLowerCase(),
      contactName: value.contactName === null ? null : value.contactName.trim(),
      company: value.company === null ? null : value.company.trim(),
      role: value.role === null ? null : value.role.trim(),
      location: value.location === null ? null : value.location.trim(),
      jobUrl: value.jobUrl
    }
  };
};

const validateRequest = (body, maxRecipients) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be a JSON object' };
  if (Object.keys(body).some((key) => !['selectionVersion', 'recipients'].includes(key))) {
    return { error: 'Request body contains unsupported fields' };
  }
  if (!Number.isSafeInteger(body.selectionVersion) || body.selectionVersion <= 0) {
    return { error: 'selectionVersion must be a positive safe integer' };
  }
  if (!Array.isArray(body.recipients) || body.recipients.length > maxRecipients) {
    return { error: `recipients must be an array containing no more than ${maxRecipients} entries` };
  }

  const recipients = [];
  const jobIds = new Set();
  const emails = new Set();
  for (let index = 0; index < body.recipients.length; index += 1) {
    const validated = validateRecipient(body.recipients[index], index);
    if (validated.error) return validated;
    if (jobIds.has(validated.recipient.jobId)) return { error: `jobId must be unique (duplicate at recipients[${index}])` };
    if (emails.has(validated.recipient.email)) return { error: `email must be unique after case normalization (duplicate at recipients[${index}])` };
    jobIds.add(validated.recipient.jobId);
    emails.add(validated.recipient.email);
    recipients.push(validated.recipient);
  }
  return { selectionVersion: body.selectionVersion, recipients };
};

router.put('/drafts/:scanDate/recipients', getIntegrationConfig, async (req, res, next) => {
  if (!validateScanDate(req.params.scanDate)) {
    return jsonError(res, 400, 'INVALID_REQUEST', 'scanDate must be a real calendar date in YYYY-MM-DD format');
  }

  const maxRecipients = Number.parseInt(process.env.AUTOBOT_MAX_RECIPIENTS || '500', 10);
  const limit = Number.isSafeInteger(maxRecipients) && maxRecipients > 0 ? Math.min(maxRecipients, 500) : 500;
  const validated = validateRequest(req.body, limit);
  if (validated.error) return jsonError(res, 400, 'INVALID_REQUEST', validated.error);

  try {
    const { ownerId, templateId, integrationId, senderEmail } = req.autoBotConfig;
    const [template, settings] = await Promise.all([
      Template.findOne({ _id: templateId, user: ownerId }).select('_id'),
      Settings.findOne({ user: ownerId })
    ]);
    if (!template) return jsonError(res, 503, 'INTEGRATION_UNAVAILABLE', 'Configured AutoBot template is unavailable');
    if (!settings?.google?.refreshToken || !settings?.google?.userEmail
      || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return jsonError(res, 503, 'INTEGRATION_UNAVAILABLE', 'The integration owner must have a connected Gmail sender in Mailium');
    }
    const defaultSender = settings?.defaults?.fromEmail || settings.google.userEmail;
    if (!defaultSender) {
      return jsonError(res, 503, 'INTEGRATION_UNAVAILABLE', 'The integration owner has no configured Mailium sender identity');
    }
    if (senderEmail) {
      if (senderEmail.toLowerCase() !== defaultSender.toLowerCase()) {
        return jsonError(res, 503, 'INTEGRATION_UNAVAILABLE', 'Configured AutoBot sender is not verified for the owner');
      }
    }

    const result = await syncAutoBotDraft({
      ownerId,
      integrationId,
      scanDate: req.params.scanDate,
      selectionVersion: validated.selectionVersion,
      recipients: validated.recipients,
      templateId,
      senderEmail
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'STALE_SELECTION' || error.code === 'DRAFT_LOCKED'
      || error.code === 'RECIPIENT_CONFLICT' || error.code === 'SYNC_BUSY') {
      return jsonError(res, error.statusCode || 409, error.code, error.message, {
        ...(error.lastSelectionVersion !== undefined ? { lastSelectionVersion: error.lastSelectionVersion } : {}),
        ...(error.draftPath ? { draftPath: error.draftPath } : {})
      });
    }
    return next(error);
  }
});

module.exports = router;
