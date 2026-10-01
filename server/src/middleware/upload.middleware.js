const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: (config.maxCsvSizeMb || 10) * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file || !file.originalname) return cb(new Error('Invalid file'));
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      return cb(new Error('Only CSV files are allowed'));
    }
    return cb(null, true);
  },
});

module.exports = { upload };
