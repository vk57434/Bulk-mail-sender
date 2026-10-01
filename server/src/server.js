const bcrypt = require('bcrypt');
const app = require('./app');
const config = require('./config/env');
const { connectMongo, disconnectMongo } = require('./config/db');
const redisConnection = require('./config/redis');
const Admin = require('./models/Admin');
const logger = require('./utils/logger');
const { startCampaignQueueEvents, stopCampaignQueueEvents } = require('./services/campaign-queue-events');

let server;

async function ensureDefaultAdmin() {
  const adminEmail = String(config.adminEmail || '').trim().toLowerCase();
  const adminPassword = String(config.adminPassword || '').trim();

  if (!adminEmail || !adminPassword) {
    return;
  }

  const existingAdmin = await Admin.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await Admin.create({ email: adminEmail, passwordHash });
    logger.info({ email: adminEmail }, 'Default admin account initialized');
  }
}

async function startServer() {
  try {
    await connectMongo();
    await redisConnection.ping();
    await ensureDefaultAdmin();

    try {
      startCampaignQueueEvents();
      logger.info('Campaign QueueEvents listener started in server process');
    } catch (qeError) {
      logger.warn({ err: qeError }, 'Could not start QueueEvents in server process; SSE fallback to worker events');
    }

    server = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'server started');
    });

    const shutdown = async () => {
      logger.info('Graceful shutdown initiated');

      await stopCampaignQueueEvents().catch(() => null);

      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }

      await redisConnection.quit().catch(() => null);
      await disconnectMongo().catch(() => null);
      logger.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
module.exports = { app, startServer };
