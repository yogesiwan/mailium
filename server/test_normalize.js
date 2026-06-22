const { resolveTimezone } = require('./src/utils/timezone');
const normalizeCampaignPayload = async (payload = {}) => {
  return {
    ...payload,
    name: payload.name?.trim() || 'New Campaign'
  };
};

async function test() {
  const res = await normalizeCampaignPayload({ excludedRecipients: ['test@test.com'], name: 'Test' });
  console.log(res);
  process.exit(0);
}
test();
