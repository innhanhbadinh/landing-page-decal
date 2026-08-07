const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    const ext = ALLOWED_TYPES[file.mimetype] || '.bin';
    const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
    cb(null, name);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    if (!ALLOWED_TYPES[file.mimetype]) return cb(new Error('Chỉ chấp nhận ảnh PNG, JPEG, WEBP hoặc GIF'));
    cb(null, true);
  }
});

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'Server chưa cấu hình ADMIN_TOKEN' });
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Sai hoặc thiếu x-admin-token' });
  next();
}

router.post('/upload', requireAdmin, function (req, res) {
  upload.single('image')(req, res, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Không nhận được file ảnh' });
    res.json({ url: '/uploads/' + req.file.filename });
  });
});

module.exports = router;
