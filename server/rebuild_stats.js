const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');
const Recipient = require('./src/models/Recipient');
const TrackingEvent = require('./src/models/TrackingEvent');

async function run() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  
  const events = await TrackingEvent.find({ type: 'open' });
  let updatedRecipients = 0;
  
  for (const ev of events) {
    const recipient = await Recipient.findById(ev.recipientId);
    if (!recipient) continue;
    
    let isMain = recipient.mainEmail.trackingId === ev.trackingId;
    let targetPrefix = isMain ? 'mainEmail.' : 'followUps.$.';
    
    let updateData = {};
    if (isMain && !recipient.mainEmail.opened) {
      updateData[`mainEmail.opened`] = true;
      updateData[`mainEmail.openCount`] = 1;
      updateData.status = 'opened';
      await Recipient.findByIdAndUpdate(recipient._id, { $set: updateData });
      await Campaign.findByIdAndUpdate(recipient.campaignId, { $inc: { 'stats.opened': 1 } });
      updatedRecipients++;
    }
  }
  
  console.log(`Updated ${updatedRecipients} recipients with missed opens.`);
  process.exit(0);
}
run();
