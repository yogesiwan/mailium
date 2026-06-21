require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Campaign = require('./src/models/Campaign');
const Recipient = require('./src/models/Recipient');
const Settings = require('./src/models/Settings');
const Template = require('./src/models/Template');

const connectDB = require('./src/config/db');

const seed = async () => {
  await connectDB();

  console.log('Finding or creating seed user...');
  let user = await User.findOne({ email: 'yogesiwan@gmail.com' });
  if (!user) {
    user = await User.create({
      name: 'Yogesh Siwan',
      email: 'yogesiwan@gmail.com',
      password: 'Siwan00@'
    });
    console.log('Created new user:', user._id);
  } else {
    console.log('User already exists:', user._id);
  }

  console.log('Updating Campaigns...');
  await Campaign.updateMany({ user: { $exists: false } }, { $set: { user: user._id } });
  
  console.log('Updating Recipients...');
  await Recipient.updateMany({ user: { $exists: false } }, { $set: { user: user._id } });

  console.log('Updating Settings...');
  await Settings.updateMany({ user: { $exists: false } }, { $set: { user: user._id } });

  console.log('Updating Templates...');
  await Template.updateMany({ user: { $exists: false } }, { $set: { user: user._id } });

  console.log('Seed completed successfully!');
  process.exit(0);
};

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
