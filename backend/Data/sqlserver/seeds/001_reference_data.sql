USE [$(DbName)];
GO

MERGE dbo.parking_lots AS target
USING (VALUES
  ('HUE-P001', N'Bãi giữ xe Chợ Đông Ba', 16.46645000, 107.58440000, 50, 15000.00, 3000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5841,16.4667],[107.5847,16.4667],[107.5847,16.4662],[107.5841,16.4662],[107.5841,16.4667]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 3.000 – 5.000 VNĐ; Ô tô: Khoảng 15.000 VNĐ'),
  ('HUE-P002', N'Bãi xe Nguyễn Huệ', 16.45950000, 107.58050000, 36, 7000.00, 3000.00, 1, N'{"type":"Polygon","coordinates":[[[107.58,16.46],[107.581,16.46],[107.581,16.459],[107.58,16.459],[107.58,16.46]]]}', N'', '06:00', '22:00', 'CAR', 0, N'', N''),
  ('HUE-P003', N'Công viên Kim Đồng', 16.46400000, 107.58900000, 80, 12000.00, 4000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5885,16.4645],[107.5895,16.4645],[107.5895,16.4635],[107.5885,16.4635],[107.5885,16.4645]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: 4.000 – 7.000 VNĐ; Ô tô: 12.000 – 25.000 VNĐ'),
  ('HUE-P004', N'Bến xe Nguyễn Hoàng', 16.46675000, 107.57875000, 150, 15000.00, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.578,16.4675],[107.5795,16.4675],[107.5795,16.466],[107.578,16.466],[107.578,16.4675]]]}', N'', '06:00', '22:00', 'BOTH', 0, N'', N'Bãi đỗ xe có quản lý.'),
  ('HUE-P005', N'Vincom Plaza Huế', 16.46280890, 107.59424590, 100, 15000.00, 4000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5939659,16.4630889],[107.5945259,16.4630889],[107.5945259,16.4625289],[107.5939659,16.4625289],[107.5939659,16.4630889]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 4.000 VNĐ; Ô tô: Khoảng 15.000 – 20.000 VNĐ'),
  ('HUE-P006', N'GO! Huế', 16.45600000, 107.59600000, 100, 12000.00, 3000.00, 0, N'{"type":"Polygon","coordinates":[[[107.59572,16.45628],[107.59628,16.45628],[107.59628,16.45572],[107.59572,16.45572],[107.59572,16.45628]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 3.000 VNĐ; Ô tô: Khoảng 12.000 VNĐ'),
  ('HUE-P007', N'Co.opmart Huế', 16.46775100, 107.58420600, 80, 12000.00, 3000.00, 0, N'{"type":"Polygon","coordinates":[[[107.583926,16.468031],[107.584486,16.468031],[107.584486,16.467471],[107.583926,16.467471],[107.583926,16.468031]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 3.000 VNĐ; Ô tô: Khoảng 12.000 VNĐ'),
  ('HUE-P008', N'Bến Tòa Khâm', 16.46960810, 107.59183430, 80, 15000.00, 4000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5915543,16.4698881],[107.5921143,16.4698881],[107.5921143,16.4693281],[107.5915543,16.4693281],[107.5915543,16.4698881]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: 4.000 – 7.000 VNĐ; Ô tô: 15.000 – 30.000 VNĐ'),
  ('HUE-P009', N'Bãi xe Cửa Ngăn', 16.46796770, 107.58102500, 80, 15000.00, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.580745,16.4682477],[107.581305,16.4682477],[107.581305,16.4676877],[107.580745,16.4676877],[107.580745,16.4682477]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Chưa có giá chi tiết, hiển thị theo giá niêm yết.'),
  ('HUE-P010', N'Bãi xe Đại Nội Huế', 16.46897260, 107.57812660, 120, 20000.00, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5778466,16.4692526],[107.5784066,16.4692526],[107.5784066,16.4686926],[107.5778466,16.4686926],[107.5778466,16.4692526]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 5.000 VNĐ; Ô tô: Khoảng 20.000 – 30.000 VNĐ'),
  ('HUE-P011', N'Ga Huế', 16.45644760, 107.57805220, 80, 20000.00, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.5777722,16.4567276],[107.5783322,16.4567276],[107.5783322,16.4561676],[107.5777722,16.4561676],[107.5777722,16.4567276]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 5.000 VNĐ; Ô tô: Khoảng 20.000 VNĐ'),
  ('HUE-P012', N'Bệnh viện Trung ương Huế', 16.46224900, 107.58720900, 120, 10000.00, 3000.00, 0, N'{"type":"Polygon","coordinates":[[[107.586929,16.462529],[107.587489,16.462529],[107.587489,16.461969],[107.586929,16.461969],[107.586929,16.462529]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Xe máy: Khoảng 3.000 – 5.000 VNĐ; Ô tô: Khoảng 10.000 – 20.000 VNĐ'),
  ('HUE-P013', N'Phố Tây Võ Thị Sáu – Chu Văn An – Phạm Ngũ Lão', 16.46950000, 107.59530000, 60, 20000.00, 5000.00, 0, N'{"type":"Polygon","coordinates":[[[107.59502,16.46978],[107.59558,16.46978],[107.59558,16.46922],[107.59502,16.46922],[107.59502,16.46978]]]}', N'', '06:00', '22:00', 'BOTH', 1, N'', N'Khu vực phố Tây trung tâm Huế.')
) AS source (
  id, name, latitude, longitude, total_slots, price_per_hour, price_per_hour_motorbike, ev_supported,
  polygon_geojson, image_url, open_time, close_time, vehicle_type, has_security, contact_phone, description
)
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET
  name = source.name,
  latitude = source.latitude,
  longitude = source.longitude,
  total_slots = source.total_slots,
  price_per_hour = source.price_per_hour,
  price_per_hour_motorbike = source.price_per_hour_motorbike,
  ev_supported = source.ev_supported,
  polygon_geojson = source.polygon_geojson,
  image_url = source.image_url,
  open_time = source.open_time,
  close_time = source.close_time,
  vehicle_type = source.vehicle_type,
  has_security = source.has_security,
  contact_phone = source.contact_phone,
  description = source.description
WHEN NOT MATCHED THEN INSERT (
  id, name, latitude, longitude, total_slots, price_per_hour, price_per_hour_motorbike, ev_supported,
  polygon_geojson, image_url, open_time, close_time, vehicle_type, has_security, contact_phone, description
) VALUES (
  source.id, source.name, source.latitude, source.longitude, source.total_slots, source.price_per_hour,
  source.price_per_hour_motorbike, source.ev_supported, source.polygon_geojson, source.image_url,
  source.open_time, source.close_time, source.vehicle_type, source.has_security, source.contact_phone, source.description
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = 'admin@hue.vn')
BEGIN
  INSERT INTO dbo.users (full_name, email, phone, role, password_hash)
  VALUES (
    N'Administrator',
    'admin@hue.vn',
    '0900000000',
    'ADMIN',
    '0555b8cd08f6cc223fcd05d0142663fe:c3d1b0865e6db3f2f8750d338d544ce162ed61f6e7dd3aa4a803154792dc2ea0ec48a946cf1b01c1a548c610049ca7ae04d0779235cbeaba63822a6d52906cb4'
  );
END
GO

PRINT 'Reference seed completed.';
GO
