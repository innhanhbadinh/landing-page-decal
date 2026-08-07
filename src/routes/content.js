const express = require('express');
const router = express.Router();
const db = require('../db');
const { getFullConfig } = require('../pricing');

const CONTENT_KEY = 'site_content_json';

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'Server chưa cấu hình ADMIN_TOKEN' });
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Sai hoặc thiếu x-admin-token' });
  next();
}

// GET /api/content — công khai, trả về TOÀN BỘ nội dung (thương hiệu, hero, quy trình, lý do
// chọn, ảnh mẫu, CTA cuối...) gộp chung với chất liệu + công thức giá đang có trong DB —
// để admin.html mở lên là thấy đúng bản đã lưu gần nhất, không phải gõ lại từ đầu.
router.get('/content', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(CONTENT_KEY);
  let siteContent = {};
  if (row && row.value) {
    try { siteContent = JSON.parse(row.value); } catch (e) { siteContent = {}; }
  }

  const pricingCfg = getFullConfig();
  const merged = Object.assign({}, siteContent);
  merged.materials = pricingCfg.materials;
  merged.pricing = {
    floor: pricingCfg.floor,
    shapes: pricingCfg.shapes,
    sides: pricingCfg.sides,
    laminate: pricingCfg.laminate,
    rush: pricingCfg.rush,
    promoTiers: pricingCfg.promoTiers,
    promoCode: pricingCfg.promoCode
  };

  res.json(merged);
});

// PUT /api/content — chỉ lưu phần KHÔNG PHẢI giá (materials/pricing đã có endpoint riêng
// /api/pricing từ trước, giữ nguyên không đụng vào để không phá luồng đang chạy tốt).
router.put('/content', requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const toStore = Object.assign({}, body);
    delete toStore.materials;
    delete toStore.pricing;
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(CONTENT_KEY, JSON.stringify(toStore));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Không lưu được: ' + e.message });
  }
});

module.exports = router;
