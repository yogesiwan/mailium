const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');

async function check() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const c = await Campaign.find({ excludedRecipients: { $exists: true, $not: {$size: 0} } });
  console.log('Campaigns with excluded:', c.map(x => x.name + ': ' + x.excludedRecipients));
  process.exit(0);
}
check();
