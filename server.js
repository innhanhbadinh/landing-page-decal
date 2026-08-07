require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const seedIfEmpty = require('./src/seed');
const pricingRoutes = require('./src/routes/pricing');
const legacyPricing = require('./src/routes/legacyPricing');
const { loadPricingData } = require('./src/legacyPricing');

const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());

async function main() {
  // 1) Công thức đơn giản (landing page khách hàng) — dữ liệu trong SQLite
  seedIfEmpty();

  // 2) Công thức chi tiết (nội bộ) — đọc trực tiếp bangtinh.xlsx, load 1 lần
  const legacySheets = await loadPricingData(path.join(__dirname, 'data', 'bangtinh.xlsx'));
  legacyPricing.setSheets(legacySheets);

  const app = express();

  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS: ' + origin));
    }
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.use('/api', pricingRoutes);       // /api/pricing, /api/pricing/estimate
  app.use('/api', legacyPricing.router); // /api/legacy/loai-giay, /api/legacy/tinh-gia

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });

  app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log(` - Landing page:        http://localhost:${PORT}/`);
    console.log(` - Admin:               http://localhost:${PORT}/admin.html`);
    console.log(` - Tính giá nội bộ:     http://localhost:${PORT}/tinh-gia-noi-bo.html`);
  });
}

main();
