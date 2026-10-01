const IORedis = require('ioredis');
const config = require('./env');

const redisOptions = { maxRetriesPerRequest: null };
const redisConnection = config.redisUrl
  ? new IORedis(config.redisUrl, redisOptions)
  : new IORedis({
      host: config.redisHost,
      port: config.redisPort,
      password: config.redisPassword || undefined,
      ...redisOptions,
    });

console.info(config.redisUrl ? '[Redis] Using REDIS_URL' : '[Redis] Using REDIS_HOST/REDIS_PORT configuration');

redisConnection.on("connect", () => {
  console.log('[Redis] Connected');
});

redisConnection.on("ready", () => {
  console.log('[Redis] Ready');
});

redisConnection.on("error", (error) => {
  console.error('[Redis] Connection error:', error.message);
});

redisConnection.on("close", () => {
  console.log('[Redis] Connection closed');
});

module.exports = redisConnection;