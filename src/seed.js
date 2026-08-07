const db = require('./db');

// Only seeds when the database is empty — safe to call on every boot.
function seedIfEmpty() {
  const materialCount = db.prepare('SELECT COUNT(*) c FROM materials').get().c;
  if (materialCount > 0) return;

  const insertMaterial = db.prepare(
    'INSERT INTO materials (title, price, color, bullets, sort_order) VALUES (?,?,?,?,?)'
  );
  const materials = [
    ['Decal giấy', 15, '#F3EEE4', ['Giá tốt nhất trong các chất liệu', 'Hợp sản phẩm dùng một lần', 'Không khuyến khích nơi ẩm/nước']],
    ['Decal nhựa PVC', 20, '#7FB8F2', ['Chống nước, chống rách', 'Bền khi dán ngoài trời', 'Bề mặt bóng, cao cấp hơn giấy']],
    ['Decal trong', 18, '#D7E6F5', ['Nền trong suốt, thấy rõ sản phẩm', 'Hợp chai/lọ thuỷ tinh, nhựa trong', 'Không lộ viền trắng khi dán']],
    ['Decal sữa', 17, '#F7F7F5', ['Nền trắng đục, che phủ tốt', 'Không bóng, chống chói sáng', 'Hợp mỹ phẩm, thực phẩm']],
    ['Decal vỡ', 29, '#F0C9B0', ['Tự huỷ hoạ tiết khi bóc ra', 'Chống làm giả, chống tái sử dụng', 'Dùng cho tem bảo hành, niêm phong']],
    ['Tem 7 màu chống giả', 21, '#B5179E', ['Đổi ánh màu theo góc nhìn', 'Khó sao chép, khó làm giả', 'Có thể đi kèm mã số tem']],
    ['Decal chịu nhiệt', 19, '#FFB870', ['Chịu nhiệt độ cao, không bong', 'Không phai màu ngoài nắng', 'Hợp sản phẩm đóng gói nóng']],
    ['Decal nhũ vàng/bạc', 22, '#D9A93B', ['Ánh kim sang trọng', 'Hợp nhãn mỹ phẩm, rượu, quà tặng', 'Ép nhũ thật, không phải in giả']]
  ];
  materials.forEach((m, i) => insertMaterial.run(m[0], m[1], m[2], JSON.stringify(m[3]), i));

  // nhóm sheet giá bế: BETHUONG (tròn/oval/bo góc), KETP (chữ nhật/vuông thường), BEKHO (hoa/khác)
  const insertShape = db.prepare('INSERT INTO shapes (label, surcharge, sort_order, nhom_be) VALUES (?,?,?,?)');
  [
    ['Hình tròn', 0, 'BETHUONG'],
    ['Hình Oval', 0, 'BETHUONG'],
    ['Hình Vuông', 0, 'KETP'],
    ['Vuông Bo góc', 0, 'BETHUONG'],
    ['Hình CN', 0, 'KETP'],
    ['HCN Bo góc', 0, 'BETHUONG'],
    ['Hình hoa', 0, 'BEKHO'],
    ['Hình khác', 0, 'BEKHO']
  ].forEach((s, i) => insertShape.run(s[0], s[1], i, s[2]));

  const insertSide = db.prepare('INSERT INTO sides_options (label, mult, sort_order) VALUES (?,?,?)');
  [['1 mặt', 1], ['2 mặt', 1.6]].forEach((s, i) => insertSide.run(s[0], s[1], i));

  const insertLam = db.prepare('INSERT INTO laminate_options (label, mult, sort_order) VALUES (?,?,?)');
  [['Không cán màng', 1], ['Cán bóng', 1.15], ['Cán mờ', 1.15]].forEach((s, i) => insertLam.run(s[0], s[1], i));

  const insertRush = db.prepare('INSERT INTO rush_options (label, mult, sort_order) VALUES (?,?,?)');
  [['Giao thường (24h)', 1], ['Giao gấp (12h)', 1.25]].forEach((s, i) => insertRush.run(s[0], s[1], i));

  const insertTier = db.prepare('INSERT INTO promo_tiers (min_qty, rate, sort_order) VALUES (?,?,?)');
  [[500, 0.05], [1000, 0.08], [5000, 0.12]].forEach((t, i) => insertTier.run(t[0], t[1], i));

  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?,?)');
  insertSetting.run('floor_price', '100');
  insertSetting.run('promo_code', 'BADINH5');
  insertSetting.run('promo_code_rate', '0.05');

  console.log('Seeded default pricing data.');
}

module.exports = seedIfEmpty;
