# Hệ thống Smart Parking Huế

Hệ thống quản lý bãi đỗ xe thông minh cho thành phố Huế, hỗ trợ tìm kiếm vị trí, đặt chỗ, và số hóa bãi xe.

## Cấu trúc dự án (Đã sắp xếp)

Dự án đã được sắp xếp lại để tách biệt Backend và Frontend rõ ràng:

```text
backend/                # Node.js MVC API
  Controllers/          # Xử lý logic nghiệp vụ
  Models/               # Định nghĩa dữ liệu (MySQL)
  Data/                 # File cấu hình DB và hình học bãi xe
  server.js             # Điểm chạy chính của Backend
frontend/               # Các ứng dụng React
  user-map/             # Bản đồ cho người dùng tìm bãi xe
  digitalization-tool/  # Công cụ số hóa bãi xe (vẽ Polygon)
  ioc-dashboard/        # Dashboard giám sát trung tâm
docs/                   # Tài liệu API và kiến trúc
versions-deprecated/    # Các phiên bản cũ hoặc thử nghiệm (Java Microservices)
run-all.bat             # File chạy toàn bộ hệ thống
stop-all.bat            # File dừng tất cả các process
```

## Công nghệ sử dụng

- **Backend**: Node.js + Express
- **Frontend**: React + Leaflet/Mapbox
- **Database**: MySQL (Dữ liệu chính) + Redis (Cache/Realtime)
- **Message Broker**: Kafka (Log sự kiện bãi xe)

## Hướng dẫn sử dụng

### 1. Chuẩn bị
- Cài đặt [Node.js](https://nodejs.org/) (phiên bản LTS).
- Cài đặt MySQL và tạo database theo file `backend/Data/init_schema.sql`.
- Cài đặt Redis và Kafka (nếu muốn sử dụng đầy đủ tính năng realtime).

### 2. Cấu hình
- Sao chép file `backend/.env` và cập nhật thông tin kết nối Database, Redis, Kafka của bạn.

### 3. Chạy dự án
- **Cách nhanh nhất**: Click đúp vào file `run-all.bat`. Script sẽ tự động cài đặt dependencies và khởi chạy Backend cùng các Frontend.
- **Chỉ chạy Backend**: Click đúp vào `run-backend-only.bat`.

### 4. Kiểm tra
- Backend Health: [http://localhost:3002/health](http://localhost:3002/health)
- User Map: Xem URL trong terminal sau khi chạy (thường là http://localhost:5173).

## Master API Contract

- `GET /api/nearby?lat={}&lng={}&radius=1`: Tìm bãi xe gần đây.
- `PUT /api/slots/{id}`: Cập nhật trạng thái chỗ trống (yêu cầu `x-sensor-api-key`).

---
Dự án đã được tối ưu hóa và sắp xếp lại bởi AI Assistant.
