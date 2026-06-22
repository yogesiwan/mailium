const mongoose = require('mongoose');
const IgnoredIP = require('./src/models/IgnoredIP');

async function check() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const ips = await IgnoredIP.find();
  console.log('Ignored IPs:', ips);
  process.exit(0);
}
check();
