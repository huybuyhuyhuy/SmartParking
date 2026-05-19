USE [$(DbName)];
GO

IF OBJECT_ID('dbo.parking_lots', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.parking_lots (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
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
    created_at DATETIME2 NULL DEFAULT SYSDATETIME()
  );
END
GO

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    full_name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) NOT NULL,
    phone NVARCHAR(20) NULL,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('USER','OPERATOR','ADMIN')),
    password_hash NVARCHAR(255) NOT NULL,
    created_at DATETIME2 NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_users_email UNIQUE (email)
  );
END
GO

IF OBJECT_ID('dbo.bookings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.bookings (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
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
    exit_qr_code_token NVARCHAR(512) NULL,
    created_at DATETIME2 NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_booking_lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.parking_lots(id)
  );
END
GO

IF COL_LENGTH('dbo.bookings', 'extra_charge') IS NULL
  ALTER TABLE dbo.bookings ADD extra_charge DECIMAL(10,2) NOT NULL CONSTRAINT DF_bookings_extra_charge DEFAULT 0.00;
GO

IF COL_LENGTH('dbo.bookings', 'scheduled_start') IS NULL
  ALTER TABLE dbo.bookings ADD scheduled_start DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.bookings', 'vehicle_type') IS NULL
  ALTER TABLE dbo.bookings ADD vehicle_type NVARCHAR(20) NOT NULL CONSTRAINT DF_bookings_vehicle_type DEFAULT 'CAR';
GO

IF COL_LENGTH('dbo.bookings', 'exit_qr_code_token') IS NULL
  ALTER TABLE dbo.bookings ADD exit_qr_code_token NVARCHAR(512) NULL;
GO

IF COL_LENGTH('dbo.parking_lots', 'price_per_hour_motorbike') IS NULL
  ALTER TABLE dbo.parking_lots ADD price_per_hour_motorbike DECIMAL(10,2) NULL;
GO

IF OBJECT_ID('dbo.slot_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.slot_events (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    parking_lot_id NVARCHAR(36) NOT NULL,
    available_slots INT NOT NULL,
    source NVARCHAR(32) NOT NULL,
    created_at DATETIME2 NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_slot_event_lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.parking_lots(id)
  );
END
GO

IF OBJECT_ID('dbo.gate_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.gate_events (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    gate_id NVARCHAR(64) NOT NULL,
    actor NVARCHAR(128) NOT NULL,
    role NVARCHAR(32) NOT NULL,
    direction NVARCHAR(16) NOT NULL,
    scanner_id NVARCHAR(64) NOT NULL,
    granted BIT NOT NULL,
    reason_code NVARCHAR(64) NULL,
    source NVARCHAR(32) NOT NULL DEFAULT 'SCANNER',
    created_at DATETIME2 NULL DEFAULT SYSDATETIME()
  );
END
GO

IF OBJECT_ID('dbo.sensors', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sensors (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    parking_lot_id NVARCHAR(36) NOT NULL,
    api_key_hash NVARCHAR(255) NOT NULL,
    status NVARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    last_seen DATETIME2 NULL,
    CONSTRAINT fk_sensor_lot FOREIGN KEY (parking_lot_id) REFERENCES dbo.parking_lots(id)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_booking_lot' AND object_id = OBJECT_ID('dbo.bookings'))
  CREATE INDEX idx_booking_lot ON dbo.bookings(parking_lot_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_slot_events_lot_time' AND object_id = OBJECT_ID('dbo.slot_events'))
  CREATE INDEX idx_slot_events_lot_time ON dbo.slot_events(parking_lot_id, created_at);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_gate_events_time' AND object_id = OBJECT_ID('dbo.gate_events'))
  CREATE INDEX idx_gate_events_time ON dbo.gate_events(created_at DESC, id DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sensor_lot' AND object_id = OBJECT_ID('dbo.sensors'))
  CREATE INDEX idx_sensor_lot ON dbo.sensors(parking_lot_id);
GO

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.parking_lots TO [$(AppLogin)];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.users TO [$(AppLogin)];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.bookings TO [$(AppLogin)];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.slot_events TO [$(AppLogin)];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.gate_events TO [$(AppLogin)];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.sensors TO [$(AppLogin)];
GO

PRINT 'Schema migration completed.';
GO
