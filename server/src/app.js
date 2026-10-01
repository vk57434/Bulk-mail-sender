const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { isMongoConnected } = require('./config/db');
const redisConnection = require('./config/redis');
const authRoutes = require('./routes/auth.routes');
const campaignRoutes = require('./routes/campaign.routes');
const campaignEventRoutes = require('./routes/campaign-events.routes');
const recipientRoutes = require('./routes/recipient.routes');
const unsubscribeRoutes = require('./routes/unsubscribe.routes');
const emailAccountRoutes = require('./routes/email-account.routes');
const emailRoutes = require('./routes/email.routes');
const templateRoutes = require('./routes/template.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    server: 'ok',
    mongodb: isMongoConnected() ? 'connected' : 'disconnected',
    redis: redisConnection.status === 'ready' ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/email-accounts', emailAccountRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/campaigns', campaignEventRoutes);
app.use('/api/campaigns', recipientRoutes);
app.use('/api', unsubscribeRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
