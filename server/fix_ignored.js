const mongoose = require('mongoose');
const IgnoredIP = require('./src/models/IgnoredIP');
async function fix() {
  await mongoose.connect('mongodb+srv://yogesh:siwan@cluster0.hjme6.mongodb.net/mailium?retryWrites=true&w=majority&appName=Cluster0');
  const res = await IgnoredIP.deleteMany({ ip: { $regex: /^(172\.|127\.|192\.168\.|10\.)/ } });
  console.log('Deleted local IgnoredIPs:', res);
  process.exit(0);
}
fix();
