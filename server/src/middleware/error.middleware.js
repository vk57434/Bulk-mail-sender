const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
}

function errorHandler(err, req, res, next) {
  logger.error({ err, req: { method: req.method, url: req.originalUrl } }, 'Unhandled API error');

  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    message: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  };

  if (process.env.NODE_ENV === 'development') {
    response.details = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
