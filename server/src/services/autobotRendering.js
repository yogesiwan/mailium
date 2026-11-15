const { replacePlaceholders } = require('./templateEngine');

const renderAutoBotMessage = (campaign, recipientData = {}) => ({
  subject: replacePlaceholders(campaign.subject, recipientData, { singleLine: true }),
  body: replacePlaceholders(campaign.body, recipientData, { escapeHtml: true })
});

module.exports = { renderAutoBotMessage };
