require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOneAndUpdate(
    { email: 'yogeshsiwan.dev@gmail.com' },
    { $set: { status: 'active' } },
    { returnDocument: 'after' }
  );
  console.log('User activated:', user?.email, user?.status);
  process.exit(0);
}

run();
