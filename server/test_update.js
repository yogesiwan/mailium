const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');
const Recipient = require('./src/models/Recipient');

async function test() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const c = await Campaign.findOne({ name: /Testing/i }).sort({ createdAt: -1 });
  console.log('Campaign excluded:', c.excludedRecipients);
  
  const res = await Recipient.updateMany(
    { campaignId: c._id, email: { $in: c.excludedRecipients }, status: { $in: ['pending', 'queued'] } },
    { $set: { status: 'excluded' } }
  );
  console.log('Update res:', res);
  process.exit(0);
}
test();
