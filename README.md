# Hệ thống tính giá In Nhanh Ba Đình — bản gộp

Gộp lại từ 2 phần đã làm riêng trước đó thành **1 server duy nhất**, dễ deploy bằng 1 lần bấm trên Render:

1. **Landing page khách hàng** (`/`) — trang giới thiệu decal/tem nhãn, có bộ ước tính giá nhanh (công thức đơn giản: giá/cm² × bậc số lượng), quản lý nội dung qua `/admin.html`.
2. **Công cụ tính giá nội bộ** (`/tinh-gia-noi-bo.html`) — công thức thật, chi tiết, chuyển từ bản Python/Excel gốc của xưởng (tra bảng giá theo bậc số lượng, tính số tem xếp được trên tờ giấy, phí cán theo diện tích...).

Cả 2 dùng chung 1 server Node/Express, 1 lần deploy.

## Cấu trúc

```
server.js               → điểm khởi động, gộp cả 2 API + phục vụ file tĩnh
src/
  db.js, seed.js, pricing.js, routes/pricing.js   → công thức đơn giản (SQLite)
  legacyPricing.js, routes/legacyPricing.js       → công thức chi tiết (đọc bangtinh.xlsx)
public/
  index.html             → landing page khách hàng
  admin.html              → quản trị nội dung + cấu hình giá (công thức đơn giản)
  tinh-gia-noi-bo.html    → giao diện tính giá chi tiết (công thức thật)
data/
  bangtinh.xlsx           → dữ liệu giá gốc cho công thức chi tiết
  pricing.db              → database công thức đơn giản (tự tạo khi chạy lần đầu, không commit lên Git)
test-legacy-formula.js   → đối chiếu công thức chi tiết với kết quả Python gốc
```

## API

| Method | Endpoint | Quyền | Việc gì |
|---|---|---|---|
| GET | `/api/health` | công khai | Kiểm tra server sống |
| GET | `/api/pricing` | công khai | Cấu hình giá đơn giản (chất liệu, kiểu bế, số mặt...) |
| PUT | `/api/pricing` | cần `x-admin-token` | Ghi đè cấu hình giá đơn giản (từ admin.html) |
| POST | `/api/pricing/estimate` | công khai | Tính giá nhanh (landing page) |
| GET | `/api/legacy/loai-giay` | công khai | Danh sách loại giấy (công thức chi tiết) |
| POST | `/api/legacy/tinh-gia` | công khai | Tính giá chi tiết (đúng công thức Excel gốc) |

## Chạy thử ở máy mình

```bash
npm install
cp .env.example .env
# mở .env, đổi ADMIN_TOKEN thành chuỗi riêng của bạn
npm start
```

Mở trình duyệt:
- `http://localhost:5000/` — landing page
- `http://localhost:5000/admin.html` — quản trị (ô "Địa chỉ backend" để trống là được, vì đang mở qua chính server này)
- `http://localhost:5000/tinh-gia-noi-bo.html` — tính giá chi tiết

Kiểm tra công thức chi tiết còn đúng không:
```bash
node test-legacy-formula.js
```

## Đưa lên GitHub

```bash
git init
git add .
git commit -m "Gộp landing page + admin + công thức tính giá chi tiết"
git branch -M main
git remote add origin https://github.com/<tên-tài-khoản>/<tên-repo>.git
git push -u origin main
```

**⚠️ Cân nhắc trước khi để repo Public:** `data/bangtinh.xlsx` chứa toàn bộ bảng giá gốc
của xưởng (không chỉ giá cuối mà cả từng bậc giá in/giấy/bế/cán riêng lẻ) — nếu người ngoài
xem được file này thì thấy hết cơ cấu giá, chi tiết hơn cả những gì trang `/tinh-gia-noi-bo.html`
hiển thị ra. Nếu không muốn công khai, chọn **Private** khi tạo repo trên GitHub.

## Deploy lên Render (để có link công khai)

1. render.com → **New → Web Service** → chọn repo vừa push.
2. **Root Directory**: để trống (package.json đã ở gốc repo).
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Thêm biến môi trường: `ADMIN_TOKEN` (chuỗi bí mật của bạn). Không cần set `ALLOWED_ORIGINS` nếu chỉ dùng qua chính domain Render cấp.
6. Bấm **Create Web Service**, chờ deploy xong sẽ có link dạng `https://<tên>.onrender.com`.

Sau khi có link, cả 3 trang đều chạy ngay không cần chỉnh gì thêm (vì admin.html và
tinh-gia-noi-bo.html đều gọi API tương đối, tự động đúng domain đang mở):
- `https://<tên>.onrender.com/`
- `https://<tên>.onrender.com/admin.html`
- `https://<tên>.onrender.com/tinh-gia-noi-bo.html`

**Lưu ý gói Free của Render:**
- Server "ngủ" sau ~15 phút không có truy cập, lần vào tiếp theo chờ khoảng 30-50 giây để "thức dậy".
- Ổ đĩa tạm thời — mỗi lần deploy lại *code*, `data/pricing.db` (cấu hình giá đơn giản đã sửa qua admin) sẽ mất, quay về mặc định. `data/bangtinh.xlsx` thì không mất vì nó nằm trong code, không phải dữ liệu ghi runtime. Nếu cần `pricing.db` không mất khi deploy lại, cân nhắc mua thêm Persistent Disk của Render.

## Bảo mật cần nhớ

- `ADMIN_TOKEN` cho phép ghi đè cấu hình giá đơn giản — giữ kín, không commit `.env` lên Git (đã có trong `.gitignore`).
- `/api/legacy/tinh-gia` và `/tinh-gia-noi-bo.html` **không có xác thực** — ai có link cũng tính giá được và nhìn thấy breakdown từng khoản (tiền in/giấy/bế/cán tách riêng). Nếu muốn giới hạn chỉ nội bộ dùng, nói mình thêm 1 lớp mật khẩu đơn giản trước khi vào trang này.
