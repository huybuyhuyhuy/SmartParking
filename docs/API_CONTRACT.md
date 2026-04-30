# Smart Parking Hue - API Contract

## GET /api/nearby

Tim bai xe gan vi tri GPS.

Query params:
- `lat` (required)
- `lng` (required)
- `radius` (optional, default 1 km)

Example:

```http
GET /api/nearby?lat=16.4637&lng=107.5909&radius=1
```

Response:

```json
[
  {
    "id": "HUE-P001",
    "name": "Bai xe Dong Ba",
    "lat": 16.4667,
    "lng": 107.5841,
    "distanceKm": 0.82,
    "pricePerHour": 5000,
    "evSupported": true,
    "availableSlots": 42
  }
]
```

## PUT /api/slots/{id}

Cap nhat cho trong tu IoT sensor.

Headers:
- `x-sensor-api-key: <key>`

Body:

```json
{
  "availableSlots": 42
}
```

Response:

```json
{
  "ok": true,
  "lotId": "HUE-P001",
  "availableSlots": 42
}
```

## POST /api/admin/qr/verify

Xac thuc QR cho Admin/Operator de mo cong.

## POST /api/payments/confirm

Callback thanh toan (VNPAY/RazorPay), sinh QR token cho booking.

## POST /api/qr/issue

Sinh QR token cho user/booking de vao cong.

## POST /api/gate/scan

Scanner cong vao verify QR, tra ve `granted=true/false`.

## GET /api/admin/gate-events?limit=20

Lay lich su su kien mo cong/tu choi.
