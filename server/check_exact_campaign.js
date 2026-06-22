const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');
const Recipient = require('./src/models/Recipient');

async function test() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const c = await Campaign.findOne({ excludedRecipients: { $in: ['noreply.calendar.app@gmail.com'] } });
  if (c) {
    console.log('Campaign:', c.name, 'Status:', c.status);
    const rs = await Recipient.find({ campaignId: c._id });
    console.log('Recipients:', rs.map(r => ({ email: r.email, status: r.status })));
  } else {
    console.log('Not found');
  }
  process.exit(0);
}
test();
