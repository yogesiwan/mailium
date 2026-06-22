const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');

async function check() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const c = await Campaign.findOne({ name: /Testing/i }).sort({ createdAt: -1 });
  console.log('Campaign:', c.name);
  console.log('Excluded:', c.excludedRecipients);
  process.exit(0);
}
check();
