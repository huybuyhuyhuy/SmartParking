# Error Code Standard — SmartParking API

## 1. Mục đích

Hiện tại backend phần lớn trả về:

```json
{ "message": "..." }
```

Cách này đủ cho demo, nhưng chưa đủ ổn định cho frontend, analytics và hỗ trợ khách hàng. Tài liệu này định nghĩa chuẩn lỗi đích để:

- frontend xử lý theo `code` thay vì so khớp chuỗi,
- dashboard phân tích nguyên nhân thất bại,
- log và support truy vết nhanh hơn,
- mở đường cho i18n mà không làm vỡ contract API.

## 2. Response envelope chuẩn

### Lỗi

```json
{
  "error": {
    "code": "BOOKING_DUPLICATE_PLATE",
    "message": "Biển số đã có booking đang hoạt động.",
    "details": {
      "existingBookingId": 1024
    },
    "requestId": "req_01H..."
  }
}
```

### Thành công

```json
{
  "data": {},
  "requestId": "req_01H..."
}
```

### Quy ước

- `code`: máy đọc, viết hoa, dạng `DOMAIN_REASON`.
- `message`: câu người dùng có thể hiểu; cho phép bản địa hóa.
- `details`: metadata có cấu trúc, không chứa secret.
- `requestId`: dùng để dò log; nên trả ở mọi response.

## 3. HTTP status mapping

| HTTP | Dùng khi |
| --- | --- |
| `400 Bad Request` | Request sai định dạng hoặc thiếu dữ liệu |
| `401 Unauthorized` | Chưa xác thực hoặc token/key không hợp lệ |
| `403 Forbidden` | Đã xác thực nhưng không đủ quyền hoặc bị chặn theo rule nghiệp vụ |
| `404 Not Found` | Tài nguyên không tồn tại |
| `409 Conflict` | Xung đột trạng thái, ví dụ booking trùng |
| `422 Unprocessable Entity` | Dữ liệu hợp lệ về cú pháp nhưng không đạt rule nghiệp vụ phức tạp |
| `429 Too Many Requests` | Bị giới hạn tần suất |
| `500 Internal Server Error` | Lỗi hệ thống không dự kiến |
| `503 Service Unavailable` | Phụ thuộc hệ thống bắt buộc đang không sẵn sàng |

## 4. Danh mục mã lỗi đề xuất

### 4.1 Auth và phân quyền

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | Thiếu bearer token |
| `AUTH_TOKEN_INVALID` | 401 | Token sai hoặc hết hạn |
| `AUTH_CREDENTIALS_INVALID` | 401 | Email/mật khẩu sai |
| `AUTH_EMAIL_ALREADY_REGISTERED` | 409 | Email đã tồn tại |
| `AUTH_ADMIN_OR_OPERATOR_REQUIRED` | 403 | Route chỉ cho admin/operator |
| `AUTH_ADMIN_REQUIRED` | 403 | Route chỉ cho admin |
| `GATE_API_KEY_INVALID` | 401 | Gate key không hợp lệ |

### 4.2 Validation chung

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `VALIDATION_REQUIRED_FIELD` | 400 | Thiếu field bắt buộc |
| `VALIDATION_INVALID_COORDINATES` | 400 | `lat/lng` thiếu hoặc sai định dạng |
| `VALIDATION_INVALID_DATE` | 400 | Ngày giờ không parse được |
| `VALIDATION_DATE_MUST_BE_FUTURE` | 400 | `startTime` không nằm trong tương lai |
| `VALIDATION_INVALID_INTEGER` | 400 | Giá trị số nguyên không hợp lệ |
| `VALIDATION_INVALID_GEOJSON` | 400 | GeoJSON feature sai cấu trúc |

### 4.3 Parking lot và slot

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `PARKING_LOT_NOT_FOUND` | 404 | Không tìm thấy bãi |
| `PARKING_LOT_INVALID_POLYGON` | 400 | Polygon thiếu điểm hoặc không khép kín |
| `SLOT_FULL` | 409 | Bãi đã hết chỗ |
| `SLOT_AVAILABLE_COUNT_INVALID` | 400 | `availableSlots` âm hoặc không phải số nguyên |

### 4.4 Booking

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `BOOKING_NOT_FOUND` | 404 | Không tìm thấy booking |
| `BOOKING_DUPLICATE_PLATE` | 409 | Biển số đã có booking hoạt động |
| `BOOKING_ACTIVE_NOT_FOUND` | 404 | Không có booking đã thanh toán cho biển số/bãi được tìm |
| `BOOKING_ACCESS_DENIED` | 403 | Người dùng truy cập booking không thuộc về mình |
| `BOOKING_ALREADY_CHECKED_OUT` | 409 | Booking đã kết thúc trước đó |
| `BOOKING_NOT_PAID` | 409 | Chưa thanh toán nên chưa thể checkout |

### 4.5 Payment

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `PAYMENT_PROVIDER_UNSUPPORTED` | 400 | Provider không được endpoint hỗ trợ |
| `PAYMENT_DIRECT_DISABLED` | 403 | Demo direct payment đã tắt |
| `PAYMENT_ACCESS_DENIED` | 403 | Người dùng không có quyền thao tác booking đó |
| `PAYMENT_CREATE_FAILED` | 502 | Provider từ chối tạo giao dịch |
| `PAYMENT_PROVIDER_UNAVAILABLE` | 503 | Provider thanh toán lỗi hoặc mất kết nối |
| `PAYMENT_STATUS_NOT_FOUND` | 404 | Không tìm thấy trạng thái thanh toán |

### 4.6 QR và gate

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `QR_REQUIRED` | 400 | Thiếu `qrToken` |
| `QR_INVALID_OR_EXPIRED` | 401 | QR sai chữ ký hoặc hết hạn |
| `QR_ROLE_NOT_ALLOWED` | 403 | Role trong token không được phép |
| `QR_REPLAY_DETECTED` | 403 | Token đã được dùng trước đó |
| `GATE_TOO_EARLY` | 403 | Tới trước cửa sổ booking cho phép |
| `GATE_BOOKING_WINDOW_EXPIRED` | 403 | Đã quá cửa sổ booking cho phép |

### 4.7 System

| Code | HTTP | Khi dùng |
| --- | --- | --- |
| `SYSTEM_INTERNAL_ERROR` | 500 | Lỗi chưa phân loại |
| `SYSTEM_DATABASE_REQUIRED_UNAVAILABLE` | 503 | DB là bắt buộc nhưng đang down |
| `SYSTEM_DEPENDENCY_UNAVAILABLE` | 503 | Phụ thuộc ngoài không sẵn sàng |

## 5. Mapping từ code hiện tại sang chuẩn đích

| Hành vi hiện tại trong code | Code chuẩn nên dùng |
| --- | --- |
| `"lat/lng is required and must be numeric"` | `VALIDATION_INVALID_COORDINATES` |
| `"lotId and plateNumber are required"` | `VALIDATION_REQUIRED_FIELD` |
| `"Parking lot not found"` | `PARKING_LOT_NOT_FOUND` |
| `"Bai xe da het cho..."` | `SLOT_FULL` |
| Duplicate plate với `409` | `BOOKING_DUPLICATE_PLATE` |
| `"Authentication required"` | `AUTH_REQUIRED` |
| `"Invalid or expired token"` | `AUTH_TOKEN_INVALID` |
| `"Admin/Operator access required"` | `AUTH_ADMIN_OR_OPERATOR_REQUIRED` |
| `"Only ADMIN can access this resource"` | `AUTH_ADMIN_REQUIRED` |
| `"Direct demo payment is disabled"` | `PAYMENT_DIRECT_DISABLED` |
| `"Invalid or expired QR"` | `QR_INVALID_OR_EXPIRED` |
| `"Token already used (anti-replay)"` | `QR_REPLAY_DETECTED` |
| `"availableSlots must be a non-negative integer"` | `SLOT_AVAILABLE_COUNT_INVALID` |

## 6. Quy tắc đặt tên

1. Dùng danh từ miền nghiệp vụ ở đầu: `BOOKING`, `PAYMENT`, `QR`, `GATE`, `AUTH`.
2. Lý do ở sau, ngắn và ổn định: `NOT_FOUND`, `ACCESS_DENIED`, `DUPLICATE_PLATE`.
3. Không nhét ngôn ngữ tự nhiên vào `code`.
4. Một lỗi nghiệp vụ chỉ nên có một `code` chuẩn; message có thể thay đổi.

## 7. Kế hoạch migrate không phá hệ thống

### Giai đoạn 1

- Giữ `message` hiện tại.
- Bổ sung thêm `error.code` trong response lỗi.
- Bổ sung middleware sinh `requestId`.

### Giai đoạn 2

- Cập nhật frontend đọc `error.code`.
- Bổ sung event analytics theo `error.code`.
- Đồng bộ `docs/API_CONTRACT.md` và OpenAPI với response mới.

### Giai đoạn 3

- Chuẩn hóa toàn bộ endpoint về envelope `{ data, requestId }` / `{ error }`.
- Chuyển dần API sang versioned path, ví dụ `/api/v1/*`, sau khi chốt contract.

## 8. Ví dụ thực thi

### Duplicate plate

```json
{
  "error": {
    "code": "BOOKING_DUPLICATE_PLATE",
    "message": "Biển số 75A-12345 đã có booking đang hoạt động.",
    "details": {
      "existingBookingId": 1042
    },
    "requestId": "req_1042"
  }
}
```

### Gate replay

```json
{
  "error": {
    "code": "QR_REPLAY_DETECTED",
    "message": "QR đã được sử dụng trước đó.",
    "requestId": "req_gate_882"
  }
}
```

## 9. Điều kiện hoàn thành

- Mọi endpoint lỗi đều trả `error.code`.
- Frontend không còn phụ thuộc vào so khớp chuỗi `message`.
- Dashboard có thể nhóm thất bại theo `error.code`.
- API docs và code không còn lệch nhau về contract lỗi.
