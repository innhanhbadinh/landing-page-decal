/**
 * Chuyển đổi từ ghep_pdf-style Python/PySimpleGUI calculator sang JS.
 * Giữ nguyên toàn bộ logic tính giá gốc — chỉ khác:
 *  - Đọc Excel bằng exceljs (Node) thay vì pandas.
 *  - Bỏ phần GUI (PySimpleGUI), license/hết hạn, copy clipboard, mở Zalo, ghi log baogia.xlsx.
 *  - Hàm tinhTemTron() bỏ popup hỏi lại "Tem tròn được chọn?" — thay bằng tham số
 *    applyTrim (mặc định true), vì việc gọi hàm này đã đồng nghĩa người dùng chọn tem tròn rồi.
 *
 * Cách dùng:
 *   const { loadPricingData, tinhGia } = require('./pricingEngine');
 *   const sheets = await loadPricingData('./bangtinh.xlsx'); // load 1 lần khi khởi động
 *   const ketQua = tinhGia(sheets, { ... });                  // gọi nhiều lần, đồng bộ
 */

const ExcelJS = require('exceljs');

// ---------------------------------------------------------------------------
// Kích thước tờ giấy theo từng loại (cm) — giữ nguyên y hệt dict `loai_giay` gốc.
// LƯU Ý: 'Decal giấy Oji 33x45' ở đây (33x45) không khớp tên 'Decal giấy Oji 32x45'
// trong sheet GIAYDECAL của bangtinh.xlsx (32x45) — sai khác này đã có sẵn trong
// file gốc, không phải lỗi phát sinh khi chuyển sang JS. Nếu chọn loại giấy này,
// tra chi phí giấy (GIAYDECAL) sẽ không khớp được dòng nào và trả về 0, y hệt
// hành vi của bản Python gốc. Nên sửa lại tên cho khớp nếu đây là lỗi đánh máy.
// ---------------------------------------------------------------------------
const loaiGiay = {
  'Decal giấy Oji 32x40': [32, 40],
  'Decal giấy Oji 32x43': [32, 43],
  'Decal giấy Oji 33x45': [32, 45],
  'Decal giấy Oji 33x48': [32, 48],
  'Decal đế nhám': [32, 43],
  'amazon chấm đỏ': [32, 43],
  'amazon chấm xanh': [32, 43],
  'Decal Fasson': [32, 43],
  'Decal Kraft': [32, 43],
  'Decal nhựa': [32, 43],
  'Decal PP': [32, 43],
  'Decal 7 màu': [32, 43],
  'Decal Trong': [32, 48],
  'Decal Gương': [26.5, 48],
  'Vỡ dẻo': [26.5, 48],
  'Vỡ giòn': [26.5, 48],
  'Vỡ KoanHao': [26.5, 48],
  'Decal Bạc': [26.5, 48],
  'Gương vàng': [26.5, 48]
};

// Các loại giấy dùng bảng giá in "INGIAY"; còn lại dùng "INDECAL".
const NHOM_GIAY_THUONG = [
  'Decal giấy Oji 32x40', 'Decal giấy Oji 32x43', 'Decal giấy Oji 33x45', 'Decal giấy Oji 33x48',
  'Decal đế nhám', 'Decal Fasson', 'Decal Kraft'
];

const SHEET_NAMES = ['INDECAL', 'INGIAY', 'GIAYDECAL', 'BETHUONG', 'BEKHO', 'BETEMTO', 'KETEMNHO', 'KETP', 'KETEMVO'];

// ---------------------------------------------------------------------------
// Đọc bangtinh.xlsx — gọi 1 lần khi khởi động server/app, cache kết quả lại dùng dần.
// ---------------------------------------------------------------------------
async function loadPricingData(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheets = {};
  SHEET_NAMES.forEach((name) => {
    const ws = workbook.getWorksheet(name);
    sheets[name] = sheetToObjects(ws); // sheet không tồn tại (VD: KETEMVO) -> []
  });
  return sheets;
}

function sheetToObjects(worksheet) {
  if (!worksheet) return [];
  const rows = [];
  let headers = [];
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values; // exceljs: index 0 bỏ trống, cột A = index 1
    if (rowNumber === 1) {
      headers = values.slice(1).map((h) => (h == null ? '' : String(h).trim()));
    } else {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = values[i + 1]; });
      const hasData = Object.values(obj).some((v) => v !== undefined && v !== null && v !== '');
      if (hasData) rows.push(obj);
    }
  });
  return rows;
}

// ---------------------------------------------------------------------------
// vlookup — dò bảng giá theo bậc số lượng, giống VLOOKUP(..., TRUE) trong Excel:
// lấy dòng có "Số lượng" lớn nhất mà vẫn <= soLuong đang cần tra.
// ---------------------------------------------------------------------------
function vlookup(rows, soLuong, { tenDecal, loaiXuLy } = {}) {
  if (!rows || rows.length === 0) return 0;
  let filtered = rows;

  if (tenDecal && 'Loại giấy' in rows[0]) {
    filtered = filtered.filter((r) => r['Loại giấy'] === tenDecal);
  }
  if (loaiXuLy && 'Loại' in rows[0]) {
    filtered = filtered.filter((r) => r['Loại'] === loaiXuLy);
  }

  const eligible = filtered
    .filter((r) => typeof r['Số lượng'] === 'number' && r['Số lượng'] <= soLuong)
    .sort((a, b) => a['Số lượng'] - b['Số lượng']);

  if (eligible.length === 0) return 0;
  return eligible[eligible.length - 1]['Giá'] || 0;
}

// ---------------------------------------------------------------------------
// Chi phí cán màng — công thức riêng, không tra Excel.
// ---------------------------------------------------------------------------
function tinhChiPhiCan(loaiCan, chieuDaiGiay, chieuRongGiay, soToGiayCanThiet) {
  let chiPhi = 0;
  if (soToGiayCanThiet < 50) {
    if (loaiCan === 'Cán BK bóng') chiPhi = 2500 * soToGiayCanThiet;
    else if (loaiCan === 'Cán BK mờ') chiPhi = 3000 * soToGiayCanThiet;
    else chiPhi = 0; // Không cán / khác
  } else {
    if (loaiCan === 'Cán nhiệt') chiPhi = chieuDaiGiay * chieuRongGiay * 0.5 * soToGiayCanThiet;
    else if (loaiCan === 'Cán BK bóng') chiPhi = chieuDaiGiay * chieuRongGiay * 1.2 * soToGiayCanThiet;
    else if (loaiCan === 'Cán BK mờ') chiPhi = chieuDaiGiay * chieuRongGiay * 1.5 * soToGiayCanThiet;
    else chiPhi = 0;
  }
  return Math.round(chiPhi);
}

// ---------------------------------------------------------------------------
// Chi phí in + chi phí bế/kẻ + chi phí giấy — tra từ các sheet Excel tương ứng.
// soLuong ở đây là SỐ TỜ GIẤY cần in (không phải số tem).
// ---------------------------------------------------------------------------
function docChiPhiTuExcel(sheets, tenDecal, soLuong, loaiCan, loaiBe) {
  const chiPhiIn = NHOM_GIAY_THUONG.includes(tenDecal)
    ? vlookup(sheets.INGIAY, soLuong * 2)
    : vlookup(sheets.INDECAL, soLuong * 2);

  let chiPhiBe = 0;
  const BE_SHEET_MAP = {
    'Bế thường': 'BETHUONG',
    'Bế khó<1,5cm': 'BEKHO',
    'Kẻ tem vỡ<1,5cm': 'KETEMVO',
    'Kẻ tem nhỏ 1,5cm': 'KETEMNHO',
    'Kẻ thành phẩm': 'KETP',
    'Bế tem to': 'BETEMTO'
  };
  const sheetKey = BE_SHEET_MAP[loaiBe];
  if (sheetKey) {
    chiPhiBe = vlookup(sheets[sheetKey], soLuong, { loaiXuLy: loaiBe });
  }

  const chiPhiGiay = vlookup(sheets.GIAYDECAL, soLuong, { tenDecal });

  return { chiPhiIn, chiPhiBe, chiPhiGiay };
}

// ---------------------------------------------------------------------------
// Số tem xếp được trên 1 tờ in — thử 4 cách xoay (tem gốc/xoay × giấy gốc/xoay),
// lấy phương án nhiều tem nhất.
// ---------------------------------------------------------------------------
function tinhSoTemTrenToIn(kichThuocNgang, kichThuocDoc, chieuRongGiayIn, chieuDaiGiayIn, loaiBe) {
  let chieuRongGiay = chieuRongGiayIn;
  let chieuDaiGiay = chieuDaiGiayIn;

  if (loaiBe !== 'Xén thành phẩm') {
    chieuRongGiay -= 1;
    chieuDaiGiay -= 1;
  }

  let khoangCachNgang = 0.2;
  let khoangCachDoc = 0.2;
  if (['Kẻ thành phẩm', 'Kẻ tem nhỏ 1,5cm', 'Kẻ tem vỡ<1,5cm', 'Không gia công'].includes(loaiBe)) {
    khoangCachNgang = 0;
    khoangCachDoc = 0;
  }

  const tinhSoTem = (kn, kd, cr, cd, kcn, kcd) => {
    const sn = Math.floor(cr / (kn + kcn));
    const sd = Math.floor(cd / (kd + kcd));
    return sn * sd;
  };

  const soTem1 = tinhSoTem(kichThuocNgang, kichThuocDoc, chieuRongGiay, chieuDaiGiay, khoangCachNgang, khoangCachDoc);
  const soTem2 = tinhSoTem(kichThuocDoc, kichThuocNgang, chieuRongGiay, chieuDaiGiay, khoangCachNgang, khoangCachDoc);
  const soTem3 = tinhSoTem(kichThuocNgang, kichThuocDoc, chieuDaiGiay, chieuRongGiay, khoangCachNgang, khoangCachDoc);
  const soTem4 = tinhSoTem(kichThuocDoc, kichThuocNgang, chieuDaiGiay, chieuRongGiay, khoangCachNgang, khoangCachDoc);

  return Math.max(soTem1, soTem2, soTem3, soTem4);
}

// ---------------------------------------------------------------------------
// Số tem TRÒN xếp được trên 1 tờ in (xếp kiểu tam giác đều/tổ ong).
// Có 3 mốc đường kính đặc biệt (3/5/6cm) lấy số cố định — giữ nguyên từ bản gốc.
// applyTrim thay cho popup "Tem tròn được chọn?" trong bản Python (mặc định true).
// ---------------------------------------------------------------------------
function tinhTemTron(kichThuocNgang, chieuRongGiayIn, chieuDaiGiayIn, applyTrim = true) {
  const duongKinh = kichThuocNgang;
  const khoangCach = 0.1;
  const khoangCachX = duongKinh + khoangCach;
  const khoangCachY = (Math.sqrt(3) * duongKinh) / 2 + khoangCach;

  let chieuRongGiay = chieuRongGiayIn;
  let chieuDaiGiay = chieuDaiGiayIn;
  if (applyTrim) {
    chieuRongGiay -= 2;
    chieuDaiGiay -= 3;
  }

  if (duongKinh === 3) return 120;
  if (duongKinh === 5) return 50;
  if (duongKinh === 6) return 30;

  const soLuongTrucX = Math.floor(chieuRongGiay / khoangCachX);
  const soLuongTrucY = Math.floor(chieuDaiGiay / khoangCachY);

  let tong = 0;
  for (let hang = 0; hang < soLuongTrucY; hang++) {
    let soTrongHang;
    if (hang % 2 === 0) {
      soTrongHang = soLuongTrucX;
    } else {
      soTrongHang = (soLuongTrucX * khoangCachX) + (khoangCachX / 2) > chieuRongGiay
        ? soLuongTrucX - 1
        : soLuongTrucX;
    }
    tong += soTrongHang;
  }
  return tong;
}

function lamTronChanHangNghin(so) {
  return Math.ceil(so / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Phân tích nhanh 1 dòng lệnh báo giá dạng tự do, VD:
// "200 tem 30x20mm decal giấy oji không cán bế thường"
// (Bản port của extract_information — dùng để tự điền form, không phải bắt buộc).
// ---------------------------------------------------------------------------
function kieuCan(inputText) {
  const t = (inputText || '').toLowerCase();
  if (t.includes('bóng')) return 'Cán BK bóng';
  if (t.includes('mờ')) return 'Cán BK mờ';
  return 'Không cán';
}

function extractInformation(inputText) {
  const text = inputText || '';
  const soLuongToMatch = text.match(/(\d+)\s+tờ/i);
  const soLuongTemMatch = text.match(/(\d+)\s+tem/i);

  const kichThuocPattern = /(\d+(\.\d+)?)\s*(?:\*\s*|\s*x\s*)\s*(\d+(\.\d+)?)\s*(cm|mm)|(\d+(\.\d+)?)\s*(cm|mm)/i;
  const m = text.match(kichThuocPattern);
  let kichThuocNgang = null;
  let kichThuocDoc = null;
  if (m) {
    if (m[1] && m[3]) { kichThuocNgang = m[1]; kichThuocDoc = m[3]; }
    else if (m[1]) { kichThuocNgang = m[1]; }
  }

  let loaiGiayText = '';
  for (const key of Object.keys(loaiGiay)) {
    const distinctiveWord = key.split(' ')[1]; // giữ đúng logic gốc: chỉ so khớp từ thứ 2 trong tên
    if (distinctiveWord && new RegExp(escapeRegex(distinctiveWord), 'i').test(text)) {
      loaiGiayText = key;
      break;
    }
  }

  const loaiCan = kieuCan(text.toLowerCase());

  let loaiBe = '';
  for (const item of ['Xén thành phẩm', 'Bế thường', 'Bế hình khó <1,5cm', 'Không gia công', 'Kẻ thành phẩm']) {
    const firstWord = item.split(' ')[0];
    if (new RegExp(escapeRegex(firstWord), 'i').test(text)) { loaiBe = item; break; }
  }

  return {
    soLuongTo: soLuongToMatch ? soLuongToMatch[1] : null,
    soLuongTem: soLuongTemMatch ? soLuongTemMatch[1] : null,
    kichThuocNgang, kichThuocDoc, loaiGiayText, loaiCan, loaiBe
  };
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------------------------------------------------------------------------
// Hàm chính — tương đương toàn bộ nhánh xử lý nút "Tính toán" trong bản gốc.
// ---------------------------------------------------------------------------
function tinhGia(sheets, input) {
  const {
    kichThuocNgangMm, kichThuocDocMm,
    soLuongTem = 0, soLuongToIn = 0,
    loaiGiayChon, loaiCan, loaiBe, loaiXen = 0,
    temTron = false
  } = input;

  if (!loaiGiay[loaiGiayChon]) {
    throw new Error(`Không tìm thấy loại giấy "${loaiGiayChon}"`);
  }

  const kichThuocNgang = kichThuocNgangMm / 10; // mm -> cm
  const kichThuocDoc = kichThuocDocMm / 10;
  const [chieuRongGiay, chieuDaiGiay] = loaiGiay[loaiGiayChon];

  const soTemTrenGiay = temTron
    ? tinhTemTron(kichThuocNgang, chieuRongGiay, chieuDaiGiay)
    : tinhSoTemTrenToIn(kichThuocNgang, kichThuocDoc, chieuRongGiay, chieuDaiGiay, loaiBe);

  let soToGiayCanThiet;
  if (soLuongTem) {
    soToGiayCanThiet = (soLuongToIn && soLuongToIn > 0)
      ? soLuongToIn
      : Math.ceil(soLuongTem / soTemTrenGiay) + 1; // bù hao 1 tờ
  } else {
    soToGiayCanThiet = soLuongToIn;
  }

  const { chiPhiIn, chiPhiBe, chiPhiGiay } = docChiPhiTuExcel(sheets, loaiGiayChon, soToGiayCanThiet, loaiCan, loaiBe);
  const chiPhiCan = tinhChiPhiCan(loaiCan, chieuDaiGiay, chieuRongGiay, soToGiayCanThiet);
  const chiPhiXen = parseFloat(loaiXen) || 0;

  const chiPhiTong = (chiPhiIn * 2 * soToGiayCanThiet) + (chiPhiBe * soToGiayCanThiet) +
    (chiPhiGiay * soToGiayCanThiet) + chiPhiCan + chiPhiXen;
  const chiPhiTongLamTron = lamTronChanHangNghin(chiPhiTong);

  return {
    soTemTrenGiay,
    soToGiayCanThiet,
    chiPhiIn,
    chiPhiBe,
    chiPhiGiay,
    chiPhiCan,
    chiPhiXen,
    chiPhiTong,
    chiPhiTongLamTron
  };
}

module.exports = {
  loaiGiay,
  loadPricingData,
  vlookup,
  tinhChiPhiCan,
  docChiPhiTuExcel,
  tinhSoTemTrenToIn,
  tinhTemTron,
  lamTronChanHangNghin,
  kieuCan,
  extractInformation,
  tinhGia
};
