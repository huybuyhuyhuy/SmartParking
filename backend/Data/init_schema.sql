-- ============================================================
-- SMART PARKING HUẾ - Schema Khởi Tạo (chỉ cấu trúc bảng)
-- ============================================================
-- File này CHỈ tạo cấu trúc bảng, KHÔNG có dữ liệu.
-- Dùng khi bạn muốn tạo database trống để phát triển.
--
-- CÁCH DÙNG:
--   mysql -u root -p < init_schema.sql
--
-- Để có đầy đủ dữ liệu (bãi xe + tài khoản admin), dùng file full_dump.sql
-- ============================================================

-- Tạo database nếu chưa có
CREATE DATABASE IF NOT EXISTS smart_parking_hue
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_parking_hue;

-- ----------------------------
-- Bảng 1: Người dùng (users)
-- ----------------------------
CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL            COMMENT 'Họ tên đầy đủ',
  email VARCHAR(255) NOT NULL UNIQUE          COMMENT 'Email đăng nhập',
  phone VARCHAR(20) NULL                      COMMENT 'Số điện thoại',
  role ENUM('USER', 'OPERATOR', 'ADMIN') NOT NULL COMMENT 'Vai trò: USER=người dùng, OPERATOR=nhân viên, ADMIN=quản trị',
  password_hash VARCHAR(255) NOT NULL         COMMENT 'Mật khẩu đã mã hóa (salt:hash)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- Bảng 2: Bãi đỗ xe (parking_lots)
-- ----------------------------
CREATE TABLE parking_lots (
  id VARCHAR(36) PRIMARY KEY                  COMMENT 'Mã bãi xe (vd: HUE-P001)',
  name VARCHAR(255) NOT NULL                   COMMENT 'Tên bãi xe',
  latitude DECIMAL(10,8) NOT NULL              COMMENT 'Vĩ độ (latitude)',
  longitude DECIMAL(11,8) NOT NULL             COMMENT 'Kinh độ (longitude)',
  total_slots INT NOT NULL                     COMMENT 'Tổng số chỗ đỗ',
  price_per_hour DECIMAL(10,2) NOT NULL        COMMENT 'Giá mỗi giờ (VNĐ)',
  ev_supported TINYINT(1) NOT NULL DEFAULT 0   COMMENT 'Có hỗ trợ xe điện không? 0=Không, 1=Có',
  polygon_geojson JSON NULL                    COMMENT 'Khu vực bãi xe dạng GeoJSON Polygon',
  image_url VARCHAR(512) NULL                  COMMENT 'Link ảnh bãi xe',
  open_time VARCHAR(10) DEFAULT '06:00'        COMMENT 'Giờ mở cửa',
  close_time VARCHAR(10) DEFAULT '22:00'       COMMENT 'Giờ đóng cửa',
  vehicle_type VARCHAR(50) DEFAULT 'CAR'       COMMENT 'Loại xe: CAR=ô tô, MOTO=xe máy',
  has_security TINYINT(1) DEFAULT 0            COMMENT 'Có bảo vệ không? 0=Không, 1=Có',
  contact_phone VARCHAR(20) NULL               COMMENT 'SĐT liên hệ bãi xe',
  description TEXT NULL                        COMMENT 'Mô tả thêm về bãi xe',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- Bảng 3: Đặt chỗ (bookings)
-- ----------------------------
CREATE TABLE bookings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL DEFAULT 0            COMMENT 'ID người đặt (0 nếu là khách vãng lai)',
  parking_lot_id VARCHAR(36) NOT NULL          COMMENT 'Mã bãi xe đã đặt',
  plate_number VARCHAR(20) NOT NULL            COMMENT 'Biển số xe',
  phone_number VARCHAR(20) NULL                COMMENT 'SĐT người đặt',
  estimated_hours INT DEFAULT 2                COMMENT 'Số giờ dự kiến gửi',
  started_at DATETIME NOT NULL                 COMMENT 'Thời gian bắt đầu gửi',
  ended_at DATETIME NULL                       COMMENT 'Thời gian kết thúc (lúc lấy xe ra)',
  amount DECIMAL(10,2) NULL                    COMMENT 'Tổng tiền thanh toán (VNĐ)',
  payment_provider VARCHAR(50) NULL            COMMENT 'Kênh thanh toán: MOMO, CASH',
  payment_status ENUM('PENDING', 'PAID', 'FAILED') DEFAULT 'PENDING' COMMENT 'Trạng thái thanh toán',
  qr_code_token VARCHAR(512) NULL              COMMENT 'Mã QR ra/vào bãi',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_lot FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id)
);

-- ----------------------------
-- Bảng 4: Cảm biến IoT (sensors)
-- ----------------------------
CREATE TABLE sensors (
  id VARCHAR(64) PRIMARY KEY                   COMMENT 'Mã cảm biến (chuỗi duy nhất)',
  parking_lot_id VARCHAR(36) NOT NULL          COMMENT 'Thuộc bãi xe nào',
  api_key_hash VARCHAR(255) NOT NULL           COMMENT 'Hash của API key dùng để xác thực',
  status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE' COMMENT 'Trạng thái hoạt động',
  last_seen DATETIME NULL                      COMMENT 'Lần cuối cảm biến gửi tín hiệu',
  CONSTRAINT fk_sensor_lot FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id)
);

-- ----------------------------
-- Bảng 5: Lịch sử chỗ trống (slot_events)
-- ----------------------------
CREATE TABLE slot_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  parking_lot_id VARCHAR(36) NOT NULL          COMMENT 'Mã bãi xe',
  available_slots INT NOT NULL                  COMMENT 'Số chỗ còn trống tại thời điểm ghi nhận',
  source VARCHAR(32) NOT NULL                   COMMENT 'Nguồn dữ liệu: IOT_SENSOR= cảm biến, GATE_SYSTEM=cổng',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slot_events_lot_time(parking_lot_id, created_at),
  CONSTRAINT fk_slot_event_lot FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id)
);
