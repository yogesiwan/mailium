const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');
async function test() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const c = await Campaign.findOne({ name: 'V2 Testing (Retargeted)' });
  console.log('Created:', c.createdAt, 'Completed:', c.completedAt);
  process.exit(0);
}
test();
