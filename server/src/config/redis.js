const IORedis = require("ioredis");

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,

  // Required/recommended for BullMQ
  maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => {
  console.log("Redis connected");
});

redisConnection.on("ready", () => {
  console.log("Redis ready");
});

redisConnection.on("error", (error) => {
  console.error("Redis error:", error.message);
});

redisConnection.on("close", () => {
  console.log("Redis connection closed");
});

module.exports = redisConnection;