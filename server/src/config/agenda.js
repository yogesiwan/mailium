const Agenda = require('agenda');

const agenda = new Agenda({
  db: {
    address: process.env.MONGODB_URI,
    collection: 'agendaJobs',
    options: {}
  },
  processEvery: '1 minute'
});



agenda.on('error', (err) => {
  console.error('Agenda.js connection error:', err);
});

// Require jobs
require('../jobs/sendEmails')(agenda);
require('../jobs/sendFollowUps')(agenda);
require('../jobs/checkReplies')(agenda);

// Start repeating jobs when ready
agenda.on('ready', async () => {
  console.log('Agenda.js is ready and connected to MongoDB');
  await agenda.every('5 minutes', 'check-replies');
});

module.exports = agenda;
