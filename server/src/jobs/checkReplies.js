const { syncReplies } = require('../services/replySyncService');

module.exports = function(agenda) {
  agenda.define('check-replies', async (job, done) => {
    try {
      await syncReplies();
      done();
    } catch (err) {
      console.error('Job check-replies failed:', err);
      done(err);
    }
  });
};
