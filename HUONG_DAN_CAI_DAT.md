# Hướng dẫn cài đặt và chạy dự án Smart Parking Huế

Tài liệu này hướng dẫn cách thiết lập môi trường và chạy dự án Smart Parking Huế **trên một máy tính mới**.

---

## 1. Yêu cầu hệ thống

Trước khi bắt đầu, cần cài đặt các công cụ sau:

| Công cụ | Mục đích | Link tải |
|---|---|---|
| **Node.js** (>= 18.x) | Chạy backend + frontend | https://nodejs.org |
| **MariaDB** hoặc **MySQL** | Lưu trữ dữ liệu (database) | https://mariadb.org/download/ |
| **Redis** | Cache và hệ thống fallback | https://redis.io/download/ |

> **Ghi chú:** Kafka không bắt buộc - backend vẫn chạy bình thường nếu không có Kafka.

---

## 2. Cấu trúc thư mục

```
SmartParking/
├── backend/                  ← API Node.js/Express (cổng 3002)
│   ├── .env                  ← Cấu hình database, Redis, cổng
│   ├── Data/
│   │   ├── full_dump.sql     ← Database đầy đủ (schema + dữ liệu)
│   │   ├── init_schema.sql   ← Chỉ cấu trúc bảng (không dữ liệu)
│   │   └── hue_parking_geometry.json ← Dữ liệu bãi đỗ xe
│   └── server.js             ← File khởi chạy chính
├── frontend/
│   ├── user-map/             ← Bản đồ người dùng (cổng 5173)
│   ├── digitalization-tool/  ← Công cụ số hóa (cổng 5174)
│   ├── ioc-dashboard/        ← Bảng điều khiển (cổng 5175)
│   └── booking/              ← Đặt chỗ (cổng 5176)
├── run-all.bat               ← Script chạy tất cả
├── run-backend-only.bat      ← Script chỉ chạy backend
└── stop-all.bat              ← Script dừng tất cả
```

---

## 3. Cài đặt lần đầu trên máy mới

### Bước 1: Cài đặt MariaDB và Redis

**Cách nhanh (dùng winget - Windows 10/11):**
```bash
winget install MariaDB.Server --accept-source-agreements --accept-package-agreements
winget install Redis.Redis --accept-source-agreements --accept-package-agreements
```

Hoặc tải và cài đặt thủ công từ link ở mục 1.

### Bước 2: Khởi động MariaDB và Import database

Mở **PowerShell** hoặc **cmd** với quyền Administrator:

```bash
# Khởi động MariaDB (nếu chưa chạy)
& "C:\Program Files\MariaDB 12.2\bin\mariadbd.exe" --standalone

# Mở terminal khác, import database:
& "C:\Program Files\MariaDB 12.2\bin\mariadb.exe" -u root -p < backend\Data\full_dump.sql
```

> File `full_dump.sql` chứa TOÀN BỘ dữ liệu: cấu trúc bảng, 4 bãi đỗ xe, và tài khoản admin.
> Chỉ cần import 1 file này là xong phần database.

### Bước 3: Khởi động Redis

```bash
& "C:\Program Files\Redis\redis-server.exe"
```

### Bước 4: Cài đặt dependencies và chạy

```bash
# Cài backend
cd backend
npm install

# Cài các frontend
cd ../frontend/user-map && npm install
cd ../digitalization-tool && npm install
cd ../ioc-dashboard && npm install
cd ../booking && npm install
```

### Bước 5: Khởi động toàn bộ hệ thống

**Cách nhanh:** Chạy file `run-all.bat`

**Hoặc chạy thủ công** (mỗi lệnh trong 1 terminal riêng):
```bash
cd backend && npm run dev              # Backend: http://localhost:3002
cd frontend/user-map && npm run dev    # User Map: http://localhost:5173/user-map/
cd frontend/digitalization-tool && npm run dev  # Công cụ số hóa: http://localhost:5174/digitalization-tool/
cd frontend/ioc-dashboard && npm run dev  # IOC Dashboard: http://localhost:5175/ioc-dashboard/
cd frontend/booking && npm run dev    # Booking: http://localhost:5176/booking/
```

---

## 4. Các địa chỉ truy cập

| Thành phần | Địa chỉ |
|---|---|
| **Health Check API** | http://localhost:3002/health |
| **User Map** | http://localhost:5173/user-map/ |
| **Digitalization Tool** | http://localhost:5174/digitalization-tool/ |
| **IOC Dashboard** | http://localhost:5175/ioc-dashboard/ |
| **Booking** | http://localhost:5176/booking/ |

---

## 5. Tài khoản mặc định

| Email | Mật khẩu | Vai trò |
|---|---|---|
| `admin@hue.vn` | `123456` | ADMIN (quản trị viên) |

---

## 6. Lưu ý

- **File `.env`** trong `backend/` chứa cấu hình kết nối MySQL/Redis. Nếu MySQL có mật khẩu khác `root`, sửa dòng `MYSQL_PASSWORD=` trong file này.
- Nếu port 3002, 5173-5176 bị chiếm dụng, sửa port trong file `.env` hoặc `package.json` tương ứng.
- Redis không bắt buộc — backend tự động dùng bộ nhớ tạm (in-memory) nếu Redis không chạy.
- Để dừng tất cả: chạy `stop-all.bat` hoặc đóng từng cửa sổ terminal.

Chúc các bạn trải nghiệm dự án thuận lợi!
