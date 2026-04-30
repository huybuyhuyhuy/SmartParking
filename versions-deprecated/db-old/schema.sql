CREATE DATABASE IF NOT EXISTS smart_parking;
USE smart_parking;

CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ROLE_USER', 'ROLE_OPERATOR', 'ROLE_ADMIN') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE parking_lots (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    ev_supported BOOLEAN NOT NULL DEFAULT FALSE,
    price_per_hour DECIMAL(10, 2) NOT NULL,
    total_slots INT NOT NULL,
    available_slots INT NOT NULL,
    operator_id BIGINT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_operator FOREIGN KEY (operator_id) REFERENCES users(id)
);

CREATE TABLE slot_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parking_lot_id VARCHAR(36) NOT NULL,
    available_slots INT NOT NULL,
    source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_slot_lot FOREIGN KEY (parking_lot_id) REFERENCES parking_lots(id)
);

CREATE INDEX idx_parking_geo ON parking_lots(latitude, longitude);
CREATE INDEX idx_slot_events_created_at ON slot_events(created_at);
