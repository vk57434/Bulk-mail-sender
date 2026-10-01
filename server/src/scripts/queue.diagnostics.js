const emailQueue = require('../queues/email.queue');
const redisConnection = require('../config/redis');

async function reportQueueState() {
  const jobId = process.argv[2];
  const counts = await emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
  const report = {
    queue: emailQueue.name,
    prefix: emailQueue.opts.prefix || 'bull',
    paused: await emailQueue.isPaused(),
    counts,
  };

  if (jobId) {
    const job = await emailQueue.getJob(jobId);
    report.job = job
      ? {
        id: job.id,
        name: job.name,
        data: job.data,
        state: await job.getState(),
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
      }
      : null;
  }

  console.log(JSON.stringify(report, null, 2));
}

reportQueueState()
  .catch((error) => {
    console.error('Queue diagnostics failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await emailQueue.close();
    await redisConnection.quit();
  });
