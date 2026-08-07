const db = require('./db');
const { vlookup } = require('./legacyPricing');

// Sheets Excel (BETHUONG/KETP/BEKHO...) được server.js nạp 1 lần lúc khởi động
// và inject vào đây qua setLegacySheets() — dùng chung với công thức tính giá chi tiết.
let legacySheets = null;
function setLegacySheets(sheets) { legacySheets = sheets; }

// Diện tích tờ giấy tham khảo (cm²) x hệ số hao hụt khi xếp hình lên tờ — dùng để
// quy đổi "giá theo tờ" (tiered theo số tờ trong Excel gốc) thành "phụ phí mỗi tem"
// cho công thức đơn giản, vốn không mô phỏng việc xếp tem lên tờ giấy thật.
const DIEN_TICH_TO_THAM_KHAO = 32 * 43 * 0.7;

// Quy tắc xác định nhóm sheet giá bế theo hình dạng + kích thước (đã xác nhận với người dùng):
// - Cạnh nhỏ nhất < 2cm -> luôn BEKHO (bất kể hình gì)
// - Còn lại thì theo nhóm đã gán sẵn cho từng hình (nhom_be trong bảng shapes)
function xacDinhNhomBe(shape, widthCm, heightCm) {
  const minDim = Math.min(widthCm, heightCm);
  if (minDim < 2) return 'BEKHO';
  return (shape && shape.nhomBe) || 'BETHUONG';
}

function tinhPhuPhiBeTuExcel(shape, widthCm, heightCm, qty) {
  if (!legacySheets) return 0; // chưa nạp xong dữ liệu Excel — không tính phụ phí, tránh lỗi
  const nhom = xacDinhNhomBe(shape, widthCm, heightCm);
  const giaTheoTo = vlookup(legacySheets[nhom], qty);
  const soTemUocLuong = Math.max(1, Math.floor(DIEN_TICH_TO_THAM_KHAO / (widthCm * heightCm)));
  return giaTheoTo / soTemUocLuong;
}

function getFullConfig() {
  const materials = db.prepare('SELECT * FROM materials ORDER BY sort_order, id').all()
    .map(m => ({ id: m.id, title: m.title, price: m.price, color: m.color, bullets: JSON.parse(m.bullets || '[]') }));
  const shapes = db.prepare('SELECT * FROM shapes ORDER BY sort_order, id').all()
    .map(s => ({ id: s.id, label: s.label, nhomBe: s.nhom_be || 'BETHUONG' }));
  const sides = db.prepare('SELECT * FROM sides_options ORDER BY sort_order, id').all()
    .map(s => ({ id: s.id, label: s.label, mult: s.mult }));
  const laminate = db.prepare('SELECT * FROM laminate_options ORDER BY sort_order, id').all()
    .map(s => ({ id: s.id, label: s.label, mult: s.mult }));
  const rush = db.prepare('SELECT * FROM rush_options ORDER BY sort_order, id').all()
    .map(s => ({ id: s.id, label: s.label, mult: s.mult }));
  const promoTiers = db.prepare('SELECT * FROM promo_tiers ORDER BY min_qty ASC').all()
    .map(t => ({ id: t.id, minQty: t.min_qty, rate: t.rate }));
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });

  return {
    floor: parseFloat(settings.floor_price || '200'),
    promoCode: { code: settings.promo_code || '', rate: parseFloat(settings.promo_code_rate || '0') },
    materials, shapes, sides, laminate, rush, promoTiers
  };
}

function replaceFullConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new Error('Payload rỗng hoặc sai định dạng');

  const tx = db.transaction((cfg) => {
    db.prepare('DELETE FROM materials').run();
    db.prepare('DELETE FROM shapes').run();
    db.prepare('DELETE FROM sides_options').run();
    db.prepare('DELETE FROM laminate_options').run();
    db.prepare('DELETE FROM rush_options').run();
    db.prepare('DELETE FROM promo_tiers').run();

    const im = db.prepare('INSERT INTO materials (title, price, color, bullets, sort_order) VALUES (?,?,?,?,?)');
    (cfg.materials || []).forEach((m, i) => im.run(m.title || 'Chất liệu', m.price || 0, m.color || '#F3EEE4', JSON.stringify(m.bullets || []), i));

    const isp = db.prepare('INSERT INTO shapes (label, surcharge, sort_order, nhom_be) VALUES (?,?,?,?)');
    (cfg.shapes || []).forEach((s, i) => isp.run(s.label || 'Kiểu bế', 0, i, s.nhomBe || 'BETHUONG'));

    const isd = db.prepare('INSERT INTO sides_options (label, mult, sort_order) VALUES (?,?,?)');
    (cfg.sides || []).forEach((s, i) => isd.run(s.label || 'Lựa chọn', s.mult || 1, i));

    const ilm = db.prepare('INSERT INTO laminate_options (label, mult, sort_order) VALUES (?,?,?)');
    (cfg.laminate || []).forEach((s, i) => ilm.run(s.label || 'Lựa chọn', s.mult || 1, i));

    const iru = db.prepare('INSERT INTO rush_options (label, mult, sort_order) VALUES (?,?,?)');
    (cfg.rush || []).forEach((s, i) => iru.run(s.label || 'Lựa chọn', s.mult || 1, i));

    const it = db.prepare('INSERT INTO promo_tiers (min_qty, rate, sort_order) VALUES (?,?,?)');
    (cfg.promoTiers || []).forEach((t, i) => it.run(t.minQty || 0, t.rate || 0, i));

    const us = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    us.run('floor_price', String(cfg.floor != null ? cfg.floor : 200));
    us.run('promo_code', (cfg.promoCode && cfg.promoCode.code) || '');
    us.run('promo_code_rate', String((cfg.promoCode && cfg.promoCode.rate) || 0));
  });

  tx(cfg);
}

function promoRateForQty(qty, tiers) {
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  for (const t of sorted) if (qty >= t.minQty) return t.rate;
  return 0;
}

// Single source of truth for the pricing formula — mirrors the client-side
// JS previously embedded in the static page, now computed server-side only.
function estimate({ materialId, shapeId, sidesId, laminateId, rushId, width, height, qty, promoCode }) {
  const cfg = getFullConfig();

  const material = cfg.materials.find(m => m.id === materialId) || cfg.materials[0];
  const shape = cfg.shapes.find(s => s.id === shapeId) || cfg.shapes[0];
  const sides = cfg.sides.find(s => s.id === sidesId) || cfg.sides[0];
  const laminate = cfg.laminate.find(s => s.id === laminateId) || cfg.laminate[0];
  const rush = cfg.rush.find(s => s.id === rushId) || cfg.rush[0];

  const w = Math.max(parseFloat(width) || 0, 1);
  const h = Math.max(parseFloat(height) || 0, 1);
  const q = Math.max(parseInt(qty, 10) || 1, 1);

  const area = w * h;
  const phuPhiBe = tinhPhuPhiBeTuExcel(shape, w, h, q);
  const rawUnit = (area * (material ? material.price : 0) + phuPhiBe) *
    (sides ? sides.mult : 1) * (laminate ? laminate.mult : 1) * (rush ? rush.mult : 1);
  const unit = Math.max(rawUnit, cfg.floor);
  const subtotal = unit * q;

  const promoRate = promoRateForQty(q, cfg.promoTiers);
  const promoAmount = subtotal * promoRate;
  const afterPromo = subtotal - promoAmount;

  let codeApplied = false;
  let codeAmount = 0;
  if (promoCode && cfg.promoCode.code && String(promoCode).trim().toUpperCase() === cfg.promoCode.code.toUpperCase()) {
    codeApplied = true;
    codeAmount = afterPromo * cfg.promoCode.rate;
  }
  const total = afterPromo - codeAmount;

  return {
    material: material ? material.title : null,
    shape: shape ? shape.label : null,
    quantity: q,
    unit: Math.round(unit),
    subtotal: Math.round(subtotal),
    promoRate,
    promoAmount: Math.round(promoAmount),
    codeApplied,
    codeAmount: Math.round(codeAmount),
    total: Math.round(total)
  };
}

module.exports = { getFullConfig, replaceFullConfig, estimate, setLegacySheets };
