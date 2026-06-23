const mongoose = require('mongoose');
const Campaign = require('./src/models/Campaign');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mailium')
  .then(async () => {
    const campaigns = await Campaign.find().sort({createdAt: -1}).limit(3).lean();
    console.log(JSON.stringify(campaigns, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
