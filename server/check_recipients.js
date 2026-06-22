const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');
const Recipient = require('./src/models/Recipient');

async function check() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const c = await Campaign.findOne({ name: /Testing/i }).sort({ createdAt: -1 });
  const rs = await Recipient.find({ campaignId: c._id });
  console.log(rs.map(r => ({ email: r.email, status: r.status })));
  process.exit(0);
}
check();
