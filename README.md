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
2. Nếu chỉ muốn demo nhanh, có thể chạy ngay bằng chế độ fallback in-memory.
3. Nếu muốn chạy đầy đủ, cấu hình SQL Server, Redis và Kafka theo `backend/.env.example`.
4. Double-click `run-all.bat`.

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

- Nếu SQL Server chưa chạy, backend tự chuyển sang bộ nhớ tạm để vẫn demo được.
- Nếu Redis chưa chạy, hệ thống tự dùng cache trong RAM.
- Nếu Kafka không cần cho buổi demo, đặt `KAFKA_ENABLED=false` để tránh retry gây chậm.

## Ghi chú trước khi triển khai thật

- Không dùng secret mặc định trong production.
- Đưa `.env` thật ra khỏi source control; chỉ giữ `.env.example`.
- Bật SQL Server, Redis và Kafka nếu muốn dữ liệu bền vững và pipeline realtime đầy đủ.
