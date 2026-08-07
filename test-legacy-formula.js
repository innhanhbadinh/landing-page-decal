const path = require('path');
const { loadPricingData, tinhGia } = require('./src/legacyPricing');

const cases = [
  { kichThuocNgangMm: 30, kichThuocDocMm: 20, soLuongTem: 200, soLuongToIn: 0, loaiGiayChon: 'Decal giấy Oji 32x43', loaiCan: 'Không cán', loaiBe: 'Bế thường', loaiXen: '0' },
  { kichThuocNgangMm: 50, kichThuocDocMm: 50, soLuongTem: 2000, soLuongToIn: 0, loaiGiayChon: 'Decal nhựa', loaiCan: 'Cán BK bóng', loaiBe: 'Bế thường', loaiXen: '0' },
  { kichThuocNgangMm: 30, kichThuocDocMm: 30, soLuongTem: 1000, soLuongToIn: 0, loaiGiayChon: 'Decal 7 màu', loaiCan: 'Không cán', loaiBe: 'Bế thường', loaiXen: '0', temTron: true },
  { kichThuocNgangMm: 80, kichThuocDocMm: 80, soLuongTem: 0, soLuongToIn: 30, loaiGiayChon: 'Decal Kraft', loaiCan: 'Cán BK mờ', loaiBe: 'Kẻ thành phẩm', loaiXen: '15000' },
  { kichThuocNgangMm: 40, kichThuocDocMm: 25, soLuongTem: 5000, soLuongToIn: 0, loaiGiayChon: 'Vỡ dẻo', loaiCan: 'Cán BK mờ', loaiBe: 'Kẻ tem nhỏ 1,5cm', loaiXen: '0' }
];

// Kết quả tham chiếu lấy từ bản Python gốc (ref.py) chạy trên cùng 5 input này.
const expected = [
  { soTemTrenGiay: 182, soToGiayCanThiet: 3, chiPhiIn: 2000, chiPhiBe: 8000, chiPhiGiay: 1700, chiPhiCan: 0, chiPhiXen: 0, chiPhiTong: 41100, chiPhiTongLamTron: 42000 },
  { soTemTrenGiay: 40, soToGiayCanThiet: 51, chiPhiIn: 2500, chiPhiBe: 5000, chiPhiGiay: 3500, chiPhiCan: 84211, chiPhiXen: 0, chiPhiTong: 772711, chiPhiTongLamTron: 773000 },
  { soTemTrenGiay: 120, soToGiayCanThiet: 10, chiPhiIn: 3000, chiPhiBe: 8000, chiPhiGiay: 5000, chiPhiCan: 0, chiPhiXen: 0, chiPhiTong: 190000, chiPhiTongLamTron: 190000 },
  { soTemTrenGiay: 15, soToGiayCanThiet: 30, chiPhiIn: 1700, chiPhiBe: 4500, chiPhiGiay: 2000, chiPhiCan: 90000, chiPhiXen: 15000, chiPhiTong: 402000, chiPhiTongLamTron: 402000 },
  { soTemTrenGiay: 110, soToGiayCanThiet: 47, chiPhiIn: 2700, chiPhiBe: 6000, chiPhiGiay: 10000, chiPhiCan: 141000, chiPhiXen: 0, chiPhiTong: 1146800, chiPhiTongLamTron: 1147000 }
];

(async () => {
  const sheets = await loadPricingData(path.join(__dirname, 'data', 'bangtinh.xlsx'));
  let allPass = true;

  cases.forEach((c, i) => {
    const result = tinhGia(sheets, c);
    const exp = expected[i];
    let pass = true;
    const diffs = [];
    Object.keys(exp).forEach((k) => {
      if (result[k] !== exp[k]) { pass = false; diffs.push(`${k}: got ${result[k]}, expected ${exp[k]}`); }
    });
    console.log(`Case ${i + 1}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
    if (!pass) { diffs.forEach((d) => console.log('   ' + d)); allPass = false; }
  });

  console.log(allPass ? '\nTẤT CẢ TRÙNG KHỚP VỚI BẢN PYTHON GỐC.' : '\nCÓ SAI LỆCH — xem chi tiết ở trên.');
  process.exit(allPass ? 0 : 1);
})();
