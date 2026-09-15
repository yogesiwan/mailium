const AppConfig = require('../models/AppConfig');

const getConfig = async (key, defaultValue = null) => {
  try {
    let config = await AppConfig.findOne({ key });
    if (!config) {
      if (defaultValue !== null) {
        config = await AppConfig.create({ key, value: defaultValue });
        return config.value;
      }
      return null;
    }
    return config.value;
  } catch (error) {
    console.error(`Error fetching config for key ${key}:`, error);
    // If DB is unavailable or another error occurs, return the default value so the app doesn't crash
    return defaultValue;
  }
};

const setConfig = async (key, value) => {
  try {
    const config = await AppConfig.findOneAndUpdate(
      { key },
      { value },
      { new: true, upsert: true }
    );
    return config.value;
  } catch (error) {
    console.error(`Error setting config for key ${key}:`, error);
    throw error;
  }
};

module.exports = {
  getConfig,
  setConfig
};
