# Smart Parking Huế - Hướng dẫn chạy

## Cách nhanh nhất

1. Mở thư mục `D:\SmartParking`
2. Double-click `run-all.bat`
3. Script sẽ mở 5 cửa sổ terminal:
   - Backend `3002`
   - User Map `5173`
   - Digitalization Tool `5174`
   - IOC Dashboard `5175`
   - Booking `5176`

Khi muốn dừng toàn bộ, double-click `stop-all.bat`.

## Chạy thủ công

### 1. Backend

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

Backend chạy tại `http://localhost:3002`.

### 2. Frontend

Chạy từng module riêng:

```bash
cd frontend/user-map
npm install
npm run dev
```

Lặp lại tương tự với:

- `frontend/digitalization-tool`
- `frontend/ioc-dashboard`
- `frontend/booking`

## Hạ tầng tùy chọn

- SQL Server: lưu dữ liệu lâu dài
- Redis: cache slot realtime
- Kafka: event streaming

Nếu chỉ demo nhanh, hệ thống vẫn chạy được khi SQL Server/Kafka chưa bật nhờ chế độ fallback in-memory.

## Biến môi trường quan trọng

Xem `backend/.env.example`:

- `DB_SERVER`, `DB_DATABASE`, `DB_PORT`
- `REDIS_URL`
- `KAFKA_ENABLED`, `KAFKA_BROKER`
- `SENSOR_API_KEY`
- `JWT_SECRET`
- `QR_JWT_SECRET`

## Test nhanh

### Health

```bash
curl http://localhost:3002/health
```

### Cập nhật slot từ sensor

```bash
curl -X PUT http://localhost:3002/api/slots/HUE-P001 ^
  -H "content-type: application/json" ^
  -H "x-sensor-api-key: hue-iot-key" ^
  -d "{\"availableSlots\":42}"
```

### Tài khoản admin demo

- Email: `admin@hue.vn`
- Mật khẩu: `123456`
