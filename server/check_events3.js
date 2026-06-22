const mongoose = require('mongoose');
const TrackingEvent = require('./src/models/TrackingEvent');

async function check() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const events = await TrackingEvent.find({ type: 'open' }).sort({ createdAt: -1 }).limit(10);
  console.log(JSON.stringify(events.map(e => ({ meta: e.metadata, id: e._id, created: e.createdAt })), null, 2));
  process.exit(0);
}
check();
