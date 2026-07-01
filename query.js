require('dotenv').config({ path: 'server/.env' });
const mongoose = require('mongoose');
const Recipient = require('./server/src/models/Recipient');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const recipients = await Recipient.find({
    $or: [{ name: /Shantanu/i }, { email: /shantanu/i }, { name: /Carol/i }, { email: /carol/i }]
  }).lean();
  console.log(JSON.stringify(recipients, null, 2));
  process.exit(0);
});
