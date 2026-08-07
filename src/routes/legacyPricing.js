const express = require('express');
const router = express.Router();
const { tinhGia, loaiGiay } = require('../legacyPricing');

// sheets được inject từ server.js sau khi loadPricingData() xong (load 1 lần lúc khởi động)
let sheetsCache = null;
function setSheets(sheets) { sheetsCache = sheets; }

router.get('/legacy/loai-giay', (req, res) => {
  res.json(Object.keys(loaiGiay));
});

router.post('/legacy/tinh-gia', (req, res) => {
  if (!sheetsCache) return res.status(503).json({ error: 'Dữ liệu giá (bangtinh.xlsx) chưa tải xong, thử lại sau vài giây.' });
  try {
    const result = tinhGia(sheetsCache, req.body || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = { router, setSheets };
