# KPI Framework — SmartParking

## 1. Nguyên tắc đo lường

Một hệ thống đỗ xe thông minh không nên chỉ đo “bao nhiêu booking được tạo”, mà phải đo xem người dùng có thực sự hoàn tất được một phiên đỗ xe hay không.

### North Star Metric

**Successful completed parking sessions**

Một phiên được tính khi:

1. booking được tạo,
2. thanh toán thành công,
3. QR vào cổng được chấp nhận,
4. phiên đỗ được checkout hợp lệ.

Đây là chỉ số tốt hơn doanh thu đơn thuần vì nó phản ánh đồng thời:

- nhu cầu thật,
- chất lượng luồng sản phẩm,
- độ chính xác vận hành,
- khả năng thu tiền.

## 2. Cây KPI tổng thể

```text
North Star
└── Successful completed parking sessions
    ├── Acquisition
    │   └── nearby searches
    ├── Activation
    │   └── users who find a viable lot
    ├── Conversion
    │   ├── booking creation rate
    │   ├── payment success rate
    │   └── gate grant rate
    ├── Experience quality
    │   ├── time to find lot
    │   ├── payment latency
    │   └── gate scan latency
    └── Operations
        ├── slot availability accuracy
        ├── active session count
        └── occupancy forecast risk
```

## 3. Funnel KPI

| Stage | Metric | Công thức | Ý nghĩa |
| --- | --- | --- | --- |
| Discover | `nearby_searches` | số event `nearby_search_performed` | Nhu cầu đầu vào |
| Activation | `lot_selection_rate` | `lot_selected / nearby_searches` | Người dùng có thấy lựa chọn đủ hấp dẫn không |
| Booking | `booking_creation_rate` | `booking_created / lot_selected` | Ma sát ở bước đặt chỗ |
| Payment | `payment_success_rate` | `payment_succeeded / payment_initiated` | Chất lượng thanh toán |
| Entry | `gate_grant_rate` | `gate_granted / gate_scanned` | Chất lượng quyền vào bãi |
| Completion | `session_completion_rate` | `checkout_completed / gate_granted` | Phiên đỗ có kết thúc đúng không |

## 4. KPI sản phẩm cốt lõi

| KPI | Công thức | Nguồn dữ liệu hiện tại | Cadence |
| --- | --- | --- | --- |
| Successful completed parking sessions | `checkout_completed` hợp lệ | Cần telemetry chuẩn hóa + booking/gate events | Ngày |
| Booking conversion | `booking_created / nearby_searches` | Cần bổ sung event funnel | Ngày |
| Payment success rate | `payment_succeeded / payment_initiated` | Payment logs + cần chuẩn hóa event | Giờ / ngày |
| Gate grant rate | `gate_granted / gate_scanned` | `gateEvents` / cần persist bền vững hơn | Giờ |
| Repeat usage rate | user có >= 2 phiên hoàn tất trong 30 ngày / user có phiên đầu | Cần cohort analytics | Tuần |
| Average realized revenue per session | doanh thu thực thu / phiên hoàn tất | `bookings.amount + extra_charge` | Ngày |

## 5. KPI vận hành

| KPI | Công thức | Mục tiêu ban đầu |
| --- | --- | --- |
| Availability accuracy | `1 - abs(displayed_slots - actual_slots) / capacity` | `>= 97%` |
| Nearby API latency p95 | p95 `/api/nearby` | `< 200ms` |
| Booking API latency p95 | p95 `/api/bookings` | `< 250ms` |
| Gate scan latency p95 | p95 `/api/gate/scan` | `< 300ms` |
| Payment callback lag | thời gian từ provider success đến booking `PAID` | `< 60s` |
| Forecast critical detection lead time | phút cảnh báo trước khi bãi đầy | `>= 30 phút` |
| System healthy ratio | thời gian `/health` ở trạng thái `ok` | `>= 99.5%` |

## 6. KPI chẩn đoán theo lỗi

| KPI | Nên nhóm theo |
| --- | --- |
| Booking failure rate | `error.code`, `lotId`, `vehicleType` |
| Payment failure rate | `provider`, `error.code` |
| Gate denial rate | `error.code`, `gateId`, `scannerId` |
| Slot update rejection rate | `error.code`, `lotId`, `source` |

Khi `ERROR_CODE_STANDARD.md` được áp dụng, dashboard nên cho phép drill-down trực tiếp theo `error.code`.

## 7. Bộ event telemetry đề xuất

### 7.1 Event bắt buộc cho funnel

| Event | Khi bắn | Thuộc tính tối thiểu |
| --- | --- | --- |
| `map_viewed` | Mở user map | `userId?`, `sessionId`, `ts` |
| `nearby_search_performed` | Gọi tìm bãi | `lat`, `lng`, `radius`, `resultCount`, `ts` |
| `lot_selected` | Chọn bãi | `lotId`, `distanceKm`, `availableSlots`, `ts` |
| `booking_created` | Tạo booking thành công | `bookingId`, `lotId`, `vehicleType`, `amount`, `ts` |
| `booking_creation_failed` | Tạo booking thất bại | `lotId`, `errorCode`, `ts` |
| `payment_initiated` | Bắt đầu thanh toán | `bookingId`, `provider`, `amount`, `ts` |
| `payment_succeeded` | Thanh toán thành công | `bookingId`, `provider`, `amount`, `ts` |
| `payment_failed` | Thanh toán thất bại | `bookingId`, `provider`, `errorCode`, `ts` |
| `qr_issued` | Sinh QR | `bookingId`, `direction`, `expiresAt`, `ts` |
| `gate_scanned` | Scanner gửi QR | `gateId`, `scannerId`, `ts` |
| `gate_granted` | Cho qua | `bookingId`, `gateId`, `direction`, `ts` |
| `gate_denied` | Từ chối | `gateId`, `scannerId`, `errorCode`, `ts` |
| `checkout_completed` | Kết thúc phiên đỗ | `bookingId`, `lotId`, `actualHours`, `extraCharge`, `ts` |

### 7.2 Event vận hành hữu ích

| Event | Khi bắn |
| --- | --- |
| `slot_state_updated` | IoT hoặc hệ thống cập nhật slot |
| `parking_lot_upserted` | Admin thêm/sửa bãi |
| `parking_lot_deleted` | Admin xóa bãi |
| `health_state_changed` | SQL/Redis/Kafka thay đổi trạng thái |

## 8. Dashboard nên có

### Product dashboard

- Funnel từ `nearby_search_performed` đến `checkout_completed`.
- Tỷ lệ rơi ở từng bước.
- Payment success theo provider.
- Gate denial theo nguyên nhân.
- Repeat usage theo cohort tuần.

### Operations dashboard

- `p95` latency theo endpoint.
- Slot availability accuracy theo bãi.
- Bãi có rủi ro đầy trong 30/60 phút.
- Số phiên đang hoạt động.
- Health của SQL Server, Redis, Kafka.

## 9. Metric đang đo được ngay từ code hiện tại

### Đã có hoặc gần như đã có

- `todayRevenue`
- `todayBookings`
- `paidBookings`
- `activeSessions`
- `gateEventsToday`
- `revenueChart`
- `occupancyTrend`
- `lotUtilization`
- `capacityForecast`

### Chưa đủ để hiểu sản phẩm

- Không có funnel chuẩn từ search → booking → payment → gate.
- Không có `lot_selected`.
- Không có cohort retention.
- Không có chuẩn lỗi để biết vì sao user rơi khỏi funnel.
- `gateEvents` hiện chủ yếu giữ trong memory, cần persist ổn định nếu dùng cho KPI dài hạn.

## 10. Mục tiêu giai đoạn 30 ngày đầu

| Hạng mục | Mục tiêu |
| --- | --- |
| Telemetry | Có đủ event từ `nearby_search_performed` đến `checkout_completed` |
| Error analytics | 100% lỗi quan trọng có `error.code` |
| Dashboard | Có funnel dashboard và operations dashboard tách riêng |
| Baseline | Ghi nhận baseline 2 tuần trước khi tối ưu |
| Review cadence | Review KPI sản phẩm hàng tuần, KPI vận hành hàng ngày |

## 11. Cách dùng tài liệu này

1. Product dùng để chốt KPI nào thật sự quan trọng.
2. Engineering dùng để biết cần instrument gì.
3. Ops dùng để biết dashboard nào phải có.
4. Sau mỗi release, dùng KPI để trả lời ba câu hỏi:
   - người dùng có đi xa hơn trong funnel không,
   - hệ thống có đáng tin hơn không,
   - giá trị kinh doanh có thực sự tăng không.
