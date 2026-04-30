-- Migration v2: Add new columns to existing tables
-- Run this if you already have the v1 schema set up

USE smart_parking_hue;

-- Add new columns to parking_lots
ALTER TABLE parking_lots
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50) DEFAULT 'CAR' AFTER polygon_geojson,
  ADD COLUMN IF NOT EXISTS open_time VARCHAR(10) DEFAULT '06:00' AFTER vehicle_type,
  ADD COLUMN IF NOT EXISTS close_time VARCHAR(10) DEFAULT '22:00' AFTER open_time,
  ADD COLUMN IF NOT EXISTS has_security TINYINT(1) DEFAULT 0 AFTER close_time,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20) NULL AFTER has_security,
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER contact_phone,
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(512) NULL AFTER description;

-- Add new columns to bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS plate_number VARCHAR(20) NOT NULL DEFAULT '' AFTER parking_lot_id,
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) NULL AFTER plate_number,
  ADD COLUMN IF NOT EXISTS estimated_hours INT DEFAULT 2 AFTER phone_number;

-- Add phone to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL AFTER email;
