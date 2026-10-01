const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./env');

let isConnected = false;

async function connectMongo() {
  try {
    if (isConnected) return;

    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });

    isConnected = true;
    logger.info('MongoDB connected');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    throw error;
  }
}

async function disconnectMongo() {
  if (!isConnected) return;

  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected');
}

module.exports = {
  connectMongo,
  disconnectMongo,
  isMongoConnected: () => isConnected,
};
