const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');
const Recipient = require('./src/models/Recipient');

async function test() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const camps = await Campaign.find().sort({ createdAt: -1 }).limit(5);
  for (let c of camps) {
    console.log('Campaign:', c.name, '| Status:', c.status, '| Excluded:', c.excludedRecipients);
    const rs = await Recipient.find({ campaignId: c._id });
    console.log('  Recipients:', rs.map(r => ({ email: r.email, status: r.status })).slice(0, 5));
  }
  process.exit(0);
}
test();
