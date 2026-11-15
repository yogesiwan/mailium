const { recoverPendingAutoBotActivations } = require('../services/autobotActivation');

module.exports = function(agenda) {
  agenda.define('recover-autobot-activations', async (job, done) => {
    try {
      await recoverPendingAutoBotActivations();
      done();
    } catch (error) {
      console.error('AutoBot activation recovery failed:', error);
      done(error);
    }
  });
};
