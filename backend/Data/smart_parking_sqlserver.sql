-- ============================================================
-- SMART PARKING HUẾ - SQL Server Schema
-- ============================================================
-- Cách import:
--   sqlcmd -S .\SQLEXPRESS01 -i smart_parking_sqlserver.sql
-- Tài khoản admin: admin@hue.vn / 123456
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'SmartParking')
  CREATE DATABASE SmartParking;
GO

USE SmartParking;
GO

-- ============================================================
-- Table: parking_lots (must be created first due to FK references)
-- ============================================================
IF OBJECT_ID('dbo.slot_events', 'U') IS NOT NULL DROP TABLE dbo.slot_events;
IF OBJECT_ID('dbo.sensors', 'U') IS NOT NULL DROP TABLE dbo.sensors;
IF OBJECT_ID('dbo.bookings', 'U') IS NOT NULL DROP TABLE dbo.bookings;
IF OBJECT_ID('dbo.parking_lots', 'U') IS NOT NULL DROP TABLE dbo.parking_lots;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;
GO

CREATE TABLE dbo.parking_lots (
  id NVARCHAR(36) NOT NULL,
  name NVARCHAR(255) NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  total_slots INT NOT NULL,
  price_per_hour DECIMAL(10,2) NOT NULL,
  price_per_hour_motorbike DECIMAL(10,2) NULL,
  ev_supported BIT NOT NULL DEFAULT 0,
  polygon_geojson NVARCHAR(MAX) NULL,
  image_url NVARCHAR(512) NULL,
  open_time NVARCHAR(10) DEFAULT '06:00',
  close_time NVARCHAR(10) DEFAULT '22:00',
  vehicle_type NVARCHAR(50) DEFAULT 'CAR',
  has_security BIT DEFAULT 0,
  contact_phone NVARCHAR(20) NULL,
  description NVARCHAR(MAX) NULL,
  created_at DATETIME2 NULL DEFAULT GETDATE(),
  PRIMARY KEY (id)
);
GO

-- ============================================================
-- Table: users
-- ============================================================
CREATE TABLE dbo.users (
  id BIGINT IDENTITY(1,1) NOT NULL,
  full_name NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL,
  phone NVARCHAR(20) NULL,
  role NVARCHAR(20) NOT NULL CHECK (role IN ('USER','OPERATOR','ADMIN')),
  password_hash NVARCHAR(255) NOT NULL,
  created_at DATETIME2 NULL DEFAULT GETDATE(),
  PRIMARY KEY (id),
  CONSTRAINT UQ_users_email UNIQUE (email)
);
GO

-- ============================================================
-- Table: bookings
-- ============================================================
CREATE TABLE dbo.bookings (
  id BIGINT IDENTITY(1,1) NOT NULL,
  user_id BIGINT NOT NULL DEFAULT 0,
  parking_lot_id NVARCHAR(36) NOT NULL,
  plate_number NVARCHAR(20) NOT NULL,
  vehicle_type NVARCHAR(20) NOT NULL DEFAULT 'CAR',
  phone_number NVARCHAR(20) NULL,
  estimated_hours INT DEFAULT 2,
  scheduled_start DATETIME2 NULL,
  started_at DATETIME2 NOT NULL,
  ended_at DATETIME2 NULL,
  amount DECIMAL(10,2) NULL,
  extra_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  payment_provider NVARCHAR(50) NULL,
  payment_status NVARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING','PAID','FAILED')),
  qr_code_token NVARCHAR(512) NULL,
  created_at DATETIME2 NULL DEFAULT GETDATE(),
  PRIMARY KEY (id),
  CONSTRAINT fk_booking_lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.parking_lots(id)
);
CREATE INDEX idx_booking_lot ON dbo.bookings(parking_lot_id);
GO

-- ============================================================
-- Table: slot_events
-- ============================================================
CREATE TABLE dbo.slot_events (
  id BIGINT IDENTITY(1,1) NOT NULL,
  parking_lot_id NVARCHAR(36) NOT NULL,
  available_slots INT NOT NULL,
  source NVARCHAR(32) NOT NULL,
  created_at DATETIME2 NULL DEFAULT GETDATE(),
  PRIMARY KEY (id),
  CONSTRAINT fk_slot_event_lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.parking_lots(id)
);
CREATE INDEX idx_slot_events_lot_time ON dbo.slot_events(parking_lot_id, created_at);
GO

-- ============================================================
-- Table: sensors
-- ============================================================
CREATE TABLE dbo.sensors (
  id NVARCHAR(64) NOT NULL,
  parking_lot_id NVARCHAR(36) NOT NULL,
  api_key_hash NVARCHAR(255) NOT NULL,
  status NVARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  last_seen DATETIME2 NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_sensor_lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.parking_lots(id)
);
CREATE INDEX idx_sensor_lot ON dbo.sensors(parking_lot_id);
GO

-- ============================================================
-- Seed data: parking_lots
-- ============================================================
INSERT INTO dbo.parking_lots (id, name, latitude, longitude, total_slots, price_per_hour, ev_supported, polygon_geojson, image_url, open_time, close_time, vehicle_type, has_security, contact_phone, description, created_at)
VALUES
('HUE-P001', N'Bãi xe Đông Ba', 16.46670000, 107.58410000, 50, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5841,16.4667],[107.5847,16.4667],[107.5847,16.4662],[107.5841,16.4662],[107.5841,16.4667]]]}', N'', '06:00', '22:00', 'CAR', 0, N'', N'', '2026-04-30 16:16:04'),
('HUE-P002', N'Bãi xe Nguyễn Huệ', 16.46000000, 107.58000000, 36, 7000.00, 1, N'{"type":"Polygon","coordinates":[[[107.58,16.46],[107.581,16.46],[107.581,16.459],[107.58,16.459],[107.58,16.46]]]}', N'', '06:00', '22:00', 'CAR', 0, N'', N'', '2026-04-30 16:16:04'),
('HUE-P003', N'Bãi đỗ xe Công viên Kim Đồng', 16.46450000, 107.58850000, 80, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5885,16.4645],[107.5895,16.4645],[107.5895,16.4635],[107.5885,16.4635],[107.5885,16.4645]]]}', N'', '06:00', '22:00', 'CAR', 0, N'', N'', '2026-04-30 16:16:04'),
('HUE-P004', N'Bến xe Nguyễn Hoàng', 16.46750000, 107.57800000, 150, 10000.00, 0, N'{"type":"Polygon","coordinates":[[[107.578,16.4675],[107.5795,16.4675],[107.5795,16.466],[107.578,16.466],[107.578,16.4675]]]}', N'', '06:00', '22:00', 'CAR', 0, N'', N'', '2026-04-30 16:16:04');
GO

-- ============================================================
-- Seed data: admin user (password: 123456)
-- ============================================================
INSERT INTO dbo.users (full_name, email, phone, role, password_hash, created_at)
VALUES (N'Administrator', 'admin@hue.vn', '0900000000', 'ADMIN', '0555b8cd08f6cc223fcd05d0142663fe:c3d1b0865e6db3f2f8750d338d544ce162ed61f6e7dd3aa4a803154792dc2ea0ec48a946cf1b01c1a548c610049ca7ae04d0779235cbeaba63822a6d52906cb4', '2026-04-30 16:07:23');
GO

PRINT 'Schema and seed data imported successfully.';
GO
