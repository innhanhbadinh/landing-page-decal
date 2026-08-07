const db = require('./db');

function getFullConfig() {
  const materials = db.prepare('SELECT * FROM materials ORDER BY sort_order, id').all()
    .map(m => ({ id: m.id, title: m.title, price: m.price, color: m.color, bullets: JSON.parse(m.bullets || '[]') }));
  const shapes = db.prepare('SELECT * FROM shapes ORDER BY sort_order, id').all()
    .map(s => ({ id: s.id, label: s.label, surcharge: s.surcharge }));
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

    const isp = db.prepare('INSERT INTO shapes (label, surcharge, sort_order) VALUES (?,?,?)');
    (cfg.shapes || []).forEach((s, i) => isp.run(s.label || 'Kiểu bế', s.surcharge || 0, i));

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
  const rawUnit = (area * (material ? material.price : 0) + (shape ? shape.surcharge : 0)) *
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

module.exports = { getFullConfig, replaceFullConfig, estimate };
