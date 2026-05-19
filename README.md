# Hệ thống Smart Parking Huế

Đây là hệ thống quản lý bãi đỗ xe thông minh gồm 4 ứng dụng giao diện và 1 backend:

```text
backend/                 # Node.js + Express API
frontend/user-map/       # Bản đồ cho người dùng tìm và đặt chỗ
frontend/booking/        # Trang xem chi tiết booking và QR
frontend/digitalization-tool/
                         # Công cụ số hóa bãi xe bằng GeoJSON
frontend/ioc-dashboard/  # Dashboard điều hành
docs/                    # Tài liệu dự án
```

## Công nghệ chính

- Backend: Node.js, Express, WebSocket
- Frontend: React, Vite, Leaflet, Recharts
- Database chính: SQL Server
- Cache/realtime phụ trợ: Redis
- Event streaming tùy chọn: Kafka

## Chạy nhanh

1. Cài Node.js LTS.
2. Copy `backend/.env.example` thành `backend/.env`, điền `DB_PASSWORD` thật.
3. Chạy bootstrap dữ liệu lần đầu:

```bash
cd backend
npm run db:bootstrap
npm run db:check
```

4. Nếu cần dữ liệu đẹp cho dashboard demo:

```bash
npm run db:seed:demo
```

5. Double-click `run-all.bat`.

Sau khi chạy:

- Backend health: http://localhost:3002/health
- User Map: http://localhost:5173/user-map/
- Digitalization Tool: http://localhost:5174/digitalization-tool/
- IOC Dashboard: http://localhost:5175/ioc-dashboard/
- Booking: http://localhost:5176/booking/

## Tài khoản demo

- Email: `admin@hue.vn`
- Mật khẩu: `123456`

## Các luồng chính

1. Người dùng mở bản đồ, lọc bãi xe, chọn bãi phù hợp và đặt chỗ.
2. Người dùng đăng nhập/đăng ký để lưu lịch sử cá nhân.
3. Hệ thống tạo booking, thanh toán, sinh QR vào cổng.
4. Cổng quét QR, cập nhật trạng thái ra/vào và số chỗ trống.
5. Dashboard theo dõi doanh thu, booking, tình trạng bãi và sự kiện realtime.
6. Digitalization Tool dùng để thêm/sửa dữ liệu bãi xe trực tiếp trên bản đồ.

## Điểm nhấn nâng cấp

- Gợi ý bãi xe phù hợp nhất theo khoảng cách, giá, độ trống và thời gian di chuyển.
- Dashboard có dự báo sức chứa 30/60 phút để nhận biết bãi có nguy cơ đầy.
- Lịch sử booking cá nhân và QR thật có thể mở lại sau khi đặt chỗ.

## Chế độ demo và chế độ đầy đủ

- `REQUIRE_DATABASE=true` buộc backend chỉ chạy khi SQL Server thật sẵn sàng.
- `ALLOW_MEMORY_FALLBACK=true` chỉ nên dùng cho demo nhanh; khi đó backend mới được phép chuyển sang bộ nhớ tạm.
- Nếu Redis chưa chạy, hệ thống tự dùng cache trong RAM.
- Nếu Kafka không cần cho buổi demo, đặt `KAFKA_ENABLED=false` để tránh retry gây chậm.
- Luồng thanh toán trực tiếp chỉ dành cho demo và được bật/tắt bằng `DEMO_DIRECT_PAYMENT_ENABLED`.
- Cổng quét QR thật có thể dùng `x-gate-api-key`; dashboard admin vẫn có thể mô phỏng quét bằng token đăng nhập.

## Ghi chú trước khi triển khai thật

- Không dùng secret mặc định trong production.
- Đưa `.env` thật ra khỏi source control; chỉ giữ `.env.example`.
- Bật SQL Server, Redis và Kafka nếu muốn dữ liệu bền vững và pipeline realtime đầy đủ.
- Tắt `DEMO_DIRECT_PAYMENT_ENABLED`, dùng callback xác thực từ nhà cung cấp thanh toán, và không hiển thị tài khoản demo trong bản build production.
- Không chạy seed demo tự động khi backend khởi động; bootstrap/migration/seed phải là bước có chủ đích.

## Lệnh dữ liệu

```bash
cd backend
npm run db:bootstrap   # tạo DB, login ứng dụng, schema và dữ liệu tham chiếu
npm run db:check       # kiểm tra kết nối + số lượng dữ liệu lõi
npm run db:migrate     # áp migration khi schema tiến hóa
npm run db:seed:reference # nạp lại dữ liệu tham chiếu lõi nếu cần
npm run db:seed:demo   # nạp dữ liệu trình diễn cho dashboard
```

Schema chuẩn hiện nằm trong `backend/Data/sqlserver/`; backend không còn tự vá schema hay tự nạp seed lúc khởi động nữa.

## Kiểm tra nhanh hàng rào bảo mật

Khi backend đang chạy:

```bash
cd backend
npm run smoke
```

Script này kiểm tra nhanh health, route admin, lịch sử booking, sinh QR và thanh toán demo không bị mở cho người chưa đăng nhập.
