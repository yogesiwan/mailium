const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { protect } = require('../middleware/auth');

router.use(protect);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

router.post('/', upload.array('files'), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const attachments = req.files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size
    }));

    res.status(201).json({ success: true, files: attachments });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
