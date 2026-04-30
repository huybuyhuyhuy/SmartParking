-- ============================================================
-- SMART PARKING HUẾ - Database Dump Đầy Đủ
-- ============================================================
-- File này chứa TOÀN BỘ dữ liệu của hệ thống Smart Parking Huế:
--   - Cấu trúc bảng (5 bảng)
--   - Dữ liệu bãi đỗ xe (4 bãi)
--   - Tài khoản admin mặc định
--
-- CÁCH DÙNG KHI CHUYỂN SANG MÁY MỚI:
--   1. Cài đặt MariaDB/MySQL trên máy mới
--   2. Mở terminal (cmd hoặc PowerShell) tại thư mục backend/Data/
--   3. Chạy lệnh sau để import:
--      mysql -u root -p < full_dump.sql
--   4. Nhập mật khẩu MySQL khi được hỏi
--   5. Xong! Database đã sẵn sàng để chạy backend
--
-- LƯU Ý:
--   - File sẽ XÓA database cũ nếu đã tồn tại rồi tạo lại từ đầu
--   - Tài khoản admin: admin@hue.vn / 123456
--   - Nếu MySQL có mật khẩu khác, sửa file .env cho khớp
-- ============================================================

/*M!999999\- enable the sandbox mode */
-- MariaDB dump 10.19-12.2.2-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: smart_parking_hue
-- ------------------------------------------------------
-- Server version	12.2.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `smart_parking_hue`
--

/*!40000 DROP DATABASE IF EXISTS `smart_parking_hue`*/;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `smart_parking_hue` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `smart_parking_hue`;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL DEFAULT 0,
  `parking_lot_id` varchar(36) NOT NULL,
  `plate_number` varchar(20) NOT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `estimated_hours` int(11) DEFAULT 2,
  `started_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `payment_provider` varchar(50) DEFAULT NULL,
  `payment_status` enum('PENDING','PAID','FAILED') DEFAULT 'PENDING',
  `qr_code_token` varchar(512) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_booking_lot` (`parking_lot_id`),
  CONSTRAINT `fk_booking_lot` FOREIGN KEY (`parking_lot_id`) REFERENCES `parking_lots` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `parking_lots`
--

DROP TABLE IF EXISTS `parking_lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `parking_lots` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `total_slots` int(11) NOT NULL,
  `price_per_hour` decimal(10,2) NOT NULL,
  `ev_supported` tinyint(1) NOT NULL DEFAULT 0,
  `polygon_geojson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`polygon_geojson`)),
  `image_url` varchar(512) DEFAULT NULL,
  `open_time` varchar(10) DEFAULT '06:00',
  `close_time` varchar(10) DEFAULT '22:00',
  `vehicle_type` varchar(50) DEFAULT 'CAR',
  `has_security` tinyint(1) DEFAULT 0,
  `contact_phone` varchar(20) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parking_lots`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `parking_lots` WRITE;
/*!40000 ALTER TABLE `parking_lots` DISABLE KEYS */;
INSERT INTO `parking_lots` VALUES
('HUE-P001','Bãi xe Đông Ba',16.46670000,107.58410000,50,5000.00,0,'{\"type\":\"Polygon\",\"coordinates\":[[[107.5841,16.4667],[107.5847,16.4667],[107.5847,16.4662],[107.5841,16.4662],[107.5841,16.4667]]]}','','06:00','22:00','CAR',0,'','','2026-04-30 16:16:04'),
('HUE-P002','Bãi xe Nguyễn Huệ',16.46000000,107.58000000,36,7000.00,1,'{\"type\":\"Polygon\",\"coordinates\":[[[107.58,16.46],[107.581,16.46],[107.581,16.459],[107.58,16.459],[107.58,16.46]]]}','','06:00','22:00','CAR',0,'','','2026-04-30 16:16:04'),
('HUE-P003','Bãi đỗ xe Công viên Kim Đồng',16.46450000,107.58850000,80,5000.00,0,'{\"type\":\"Polygon\",\"coordinates\":[[[107.5885,16.4645],[107.5895,16.4645],[107.5895,16.4635],[107.5885,16.4635],[107.5885,16.4645]]]}','','06:00','22:00','CAR',0,'','','2026-04-30 16:16:04'),
('HUE-P004','Bến xe Nguyễn Hoàng',16.46750000,107.57800000,150,10000.00,0,'{\"type\":\"Polygon\",\"coordinates\":[[[107.578,16.4675],[107.5795,16.4675],[107.5795,16.466],[107.578,16.466],[107.578,16.4675]]]}','','06:00','22:00','CAR',0,'','','2026-04-30 16:16:04');
/*!40000 ALTER TABLE `parking_lots` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sensors`
--

DROP TABLE IF EXISTS `sensors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sensors` (
  `id` varchar(64) NOT NULL,
  `parking_lot_id` varchar(36) NOT NULL,
  `api_key_hash` varchar(255) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
  `last_seen` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_sensor_lot` (`parking_lot_id`),
  CONSTRAINT `fk_sensor_lot` FOREIGN KEY (`parking_lot_id`) REFERENCES `parking_lots` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sensors`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sensors` WRITE;
/*!40000 ALTER TABLE `sensors` DISABLE KEYS */;
/*!40000 ALTER TABLE `sensors` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `slot_events`
--

DROP TABLE IF EXISTS `slot_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `slot_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `parking_lot_id` varchar(36) NOT NULL,
  `available_slots` int(11) NOT NULL,
  `source` varchar(32) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_slot_events_lot_time` (`parking_lot_id`,`created_at`),
  CONSTRAINT `fk_slot_event_lot` FOREIGN KEY (`parking_lot_id`) REFERENCES `parking_lots` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `slot_events`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `slot_events` WRITE;
/*!40000 ALTER TABLE `slot_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `slot_events` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `role` enum('USER','OPERATOR','ADMIN') NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'Administrator','admin@hue.vn','0900000000','ADMIN','0555b8cd08f6cc223fcd05d0142663fe:c3d1b0865e6db3f2f8750d338d544ce162ed61f6e7dd3aa4a803154792dc2ea0ec48a946cf1b01c1a548c610049ca7ae04d0779235cbeaba63822a6d52906cb4','2026-04-30 16:07:23');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Dumping events for database 'smart_parking_hue'
--

--
-- Dumping routines for database 'smart_parking_hue'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-04-30 23:22:58