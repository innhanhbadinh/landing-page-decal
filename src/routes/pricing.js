const express = require('express');
const router = express.Router();
const { getFullConfig, replaceFullConfig, estimate } = require('../pricing');

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Server chưa cấu hình ADMIN_TOKEN' });
  }
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Sai hoặc thiếu x-admin-token' });
  }
  next();
}

// GET /api/pricing — public, trang landing page gọi để lấy chất liệu/kiểu bế/hệ số...
router.get('/pricing', (req, res) => {
  res.json(getFullConfig());
});

// PUT /api/pricing — admin only, ghi đè toàn bộ cấu hình giá (từ admin.html)
router.put('/pricing', requireAdmin, (req, res) => {
  try {
    replaceFullConfig(req.body);
    res.json({ ok: true, config: getFullConfig() });
  } catch (e) {
    res.status(400).json({ error: 'Payload không hợp lệ', detail: e.message });
  }
});

// POST /api/pricing/estimate — public, tính giá theo lựa chọn của khách
router.post('/pricing/estimate', (req, res) => {
  try {
    const result = estimate(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'Không tính được giá', detail: e.message });
  }
});

module.exports = router;
