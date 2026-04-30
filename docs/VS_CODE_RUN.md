# Smart Parking Hue - Huong dan chay de nhat

## Cach nhanh nhat (1 click)

1. Mo thu muc `D:\SmartParking`
2. Double-click file `run-all.bat`
3. Cho 3 cua so terminal mo len tu dong:
   - Backend (port 3002)
   - User Map (Vite)
   - Digitalization Tool (Vite)

Khi dung:
- Double-click `stop-all.bat`

## Neu chay trong Eclipse

- Import folder `D:\SmartParking`
- Mo Terminal (hoac CMD) trong Eclipse
- Chay `run-all.bat` o root project

---

## Chay thu cong (neu can)

## 1) Cai dat cong cu

- Visual Studio Code
- Docker Desktop (Redis + Kafka)
- MySQL Workbench
- Postman

## 2) Khoi dong ha tang

```bash
docker compose -f infra/docker/docker-compose.yml up -d redis kafka mysql
```

## 3) Khoi tao DB

- Mo MySQL Workbench
- Chay script `Data/init_schema.sql`

## 4) Chay Backend (Express MVC)

```bash
npm install
set PORT=3002
npm run dev
```

Backend se chay tai `http://localhost:3002`.

## 5) Chay cac View React

Moi app la 1 module rieng:

- `Views/user-map`
- `Views/ioc-dashboard`
- `Views/digitalization-tool`

Voi tung module:

```bash
npm install
npm run dev
```

## 6) Test IoT ingress bang Postman

- Method: `PUT`
- URL: `http://localhost:3002/api/slots/HUE-P001`
- Header: `x-sensor-api-key: hue-iot-key`
- Body:

```json
{
  "availableSlots": 42
}
```

---

## Huong dan phan A (Digitalization)

1. Chay backend (`PORT=3002`) va `Views/digitalization-tool`.
2. Mo trang digitalization, ve 1 polygon tren ban do.
3. Dien form (ID, ten bai xe, capacity, gia, EV) -> bam **Save to GeoJSON**.
4. Mo file `Data/hue_parking_geometry.json` de xac nhan da luu.
5. Mo `Views/user-map` de thay polygon xanh/do.

## Huong dan phan B (Realtime Slots)

1. Chay backend (`PORT=3002`) va `Views/user-map`.
2. Trong panel ben trai user map, chon bai xe.
3. Nhap so cho trong moi -> bam **Update Slots**.
4. Polygon doi mau ngay:
   - Xanh: con cho (`availableSlots > 0`)
   - Do: day (`availableSlots = 0`)

5. Mo IOC dashboard (`Views/ioc-dashboard`) de xem timeline:
   - API: `GET /api/admin/slot-events?limit=20`
   - Hien thi lich su cap nhat slots theo thoi gian.

## Huong dan phan C (QR Gate Auth)

1. Mo IOC dashboard (`Views/ioc-dashboard`).
2. O muc **Part C - QR Issue**, nhap `Booking ID`, `Plate Number` -> bam **Issue User QR**.
3. Token QR se duoc sinh ra trong textarea.
4. O muc **Part C - Gate Scanner**, bam **Scan QR / Open Gate**.
5. Kiem tra ket qua:
   - `GRANTED` neu QR hop le
   - `DENIED` neu token sai/het han
6. Xem lich su scanner tai **Gate Events** (API `GET /api/admin/gate-events`).
