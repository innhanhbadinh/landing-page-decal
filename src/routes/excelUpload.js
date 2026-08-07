const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const { loadPricingData } = require('../legacyPricing');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const EXCEL_PATH = path.join(DATA_DIR, 'bangtinh.xlsx');
fs.mkdirSync(DATA_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    const okExt = /\.xlsx$/i.test(file.originalname);
    if (!okExt) return cb(new Error('Chỉ chấp nhận file .xlsx'));
    cb(null, true);
  }
});

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'Server chưa cấu hình ADMIN_TOKEN' });
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Sai hoặc thiếu x-admin-token' });
  next();
}

// onReload: callback do server.js truyền vào, gọi lại các module dùng sheets để nạp dữ liệu mới
function buildRouter(onReload) {
  router.post('/legacy/upload-excel', requireAdmin, function (req, res) {
    upload.single('excel')(req, res, async function (err) {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Không nhận được file Excel' });
      try {
        fs.writeFileSync(EXCEL_PATH, req.file.buffer);
        const sheets = await loadPricingData(EXCEL_PATH);
        onReload(sheets);
        res.json({ ok: true, message: 'Đã cập nhật bảng giá Excel và nạp lại thành công.' });
      } catch (e) {
        res.status(500).json({ error: 'Lỗi khi nạp file Excel mới: ' + e.message });
      }
    });
  });

  return router;
}

module.exports = buildRouter;
