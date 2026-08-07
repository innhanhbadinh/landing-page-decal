const db = require('./db');
const { vlookup } = require('./legacyPricing');

// Sheets Excel (BETHUONG/KETP/BEKHO...) được server.js nạp 1 lần lúc khởi động
// và inject vào đây qua setLegacySheets() — dùng chung với công thức tính giá chi tiết.
let legacySheets = null;
function setLegacySheets(sheets) { legacySheets = sheets; }

// Diện tích tờ giấy tham khảo (cm²) x hệ số hao hụt khi xếp hình lên tờ — dùng để ước lượng
// số tem xếp được trên 1 tờ, từ đó suy ra số TỜ GIẤY cần in cho cả đơn hàng.
const DIEN_TICH_TO_THAM_KHAO = 32 * 43 * 0.7;

// Các chất liệu dùng bảng giá in "INGIAY" (giấy/kraft/fasson...); còn lại dùng "INDECAL" —
// khớp đúng danh sách NHOM_GIAY_THUONG trong công thức chi tiết (legacyPricing.js).
const NHOM_GIAY_THUONG = [
  'Decal giấy Oji 32x40', 'Decal giấy Oji 32x43', 'Decal giấy Oji 32x45', 'Decal giấy Oji 33x45', 'Decal giấy Oji 33x48',
  'Decal đế nhám', 'Decal Fasson', 'Decal Kraft'
];

// Quy tắc xác định nhóm sheet giá bế theo hình dạng + kích thước (đã xác nhận với người dùng):
// - Cạnh nhỏ nhất < 2cm -> luôn BEKHO (bất kể hình gì)
// - Còn lại thì theo nhóm đã gán sẵn cho từng hình (nhom_be trong bảng shapes)
function xacDinhNhomBe(shape, widthCm, heightCm) {
  const minDim = Math.min(widthCm, heightCm);
  if (minDim < 2) return 'BEKHO';
  return (shape && shape.nhomBe) || 'BETHUONG';
}

function uocLuongSoTemMoiTo(widthCm, heightCm) {
  return Math.max(1, Math.floor(DIEN_TICH_TO_THAM_KHAO / (widthCm * heightCm)));
}

// Tính TOÀN BỘ chi phí giấy + in + bế cho cả đơn hàng, rồi mới chia lại về giá mỗi tem —
// QUAN TRỌNG: các bảng giá Excel (BETHUONG/KETP/BEKHO/INGIAY/INDECAL) chia bậc giá theo
// SỐ TỜ GIẤY cần in, KHÔNG PHẢI theo số tem khách đặt — một đơn 500 tem tròn 5cm chỉ cần
// ~11 tờ giấy, phải tính theo bậc giá của 11 tờ (đắt hơn nhiều), không phải bậc giá của "500".
// Bản trước đây tra nhầm theo số tem trực tiếp nên ra giá thấp hơn thực tế 2-3 lần.
function tinhChiPhiSheetBased(material, shape, widthCm, heightCm, qty) {
  if (!legacySheets || !material) return 0;

  const soTemMoiTo = uocLuongSoTemMoiTo(widthCm, heightCm);
  const soToGiayCanThiet = Math.max(1, Math.ceil(qty / soTemMoiTo));

  const dungGiayThuong = NHOM_GIAY_THUONG.indexOf(material.excelLoaiGiay) !== -1;
  const sheetIn = dungGiayThuong ? legacySheets.INGIAY : legacySheets.INDECAL;
  const chiPhiIn = vlookup(sheetIn, soToGiayCanThiet * 2);

  const nhomBe = xacDinhNhomBe(shape, widthCm, heightCm);
  const chiPhiBe = vlookup(legacySheets[nhomBe], soToGiayCanThiet);

  const chiPhiGiay = vlookup(legacySheets.GIAYDECAL, 1, { tenDecal: material.excelLoaiGiay });

  const tongChiPhiSheetBased = (chiPhiIn * 2 + chiPhiBe + chiPhiGiay) * soToGiayCanThiet;
  return tongChiPhiSheetBased / qty; // quy đổi về giá mỗi tem để khớp mô hình "đơn giá x số lượng" hiện tại
}

function getFullConfig() {
  const materials = db.prepare('SELECT * FROM materials ORDER BY sort_order, id').all()
    .map(m => ({ id: m.id, title: m.title, color: m.color, bullets: JSON.parse(m.bullets || '[]'), excelLoaiGiay: m.excel_loai_giay || 'Decal giấy Oji 32x43' }));
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

    const im = db.prepare('INSERT INTO materials (title, price, color, bullets, sort_order, excel_loai_giay) VALUES (?,?,?,?,?,?)');
    (cfg.materials || []).forEach((m, i) => im.run(m.title || 'Chất liệu', 0, m.color || '#F3EEE4', JSON.stringify(m.bullets || []), i, m.excelLoaiGiay || 'Decal giấy Oji 32x43'));

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

function lamTronChanHangNghin(so) {
  return Math.ceil(so / 1000) * 1000;
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

  const unitFromSheets = tinhChiPhiSheetBased(material, shape, w, h, q);
  const rawUnit = unitFromSheets *
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
  const total = lamTronChanHangNghin(afterPromo - codeAmount);

  // Đảm bảo "Đơn giá x Số lượng" hiển thị luôn trừ khớp chính xác với "Khuyến mãi" và
  // "Thành tiền" — dùng floor (không phải round) để đơn giá x SL không bao giờ vượt quá
  // subtotal đã làm tròn, rồi định nghĩa lại subtotal hiển thị = đúng đơn giá x SL đó.
  const subtotalRounded = lamTronChanHangNghin(subtotal);
  const displayUnit = Math.floor(subtotalRounded / q);
  const displaySubtotal = displayUnit * q;
  const displayPromo = Math.max(0, displaySubtotal - total);

  return {
    material: material ? material.title : null,
    shape: shape ? shape.label : null,
    quantity: q,
    unit: displayUnit,
    subtotal: displaySubtotal,
    promoRate,
    promoAmount: displayPromo,
    codeApplied,
    codeAmount: 0,
    total
  };
}

module.exports = { getFullConfig, replaceFullConfig, estimate, setLegacySheets };
