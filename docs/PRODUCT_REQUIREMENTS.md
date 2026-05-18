# Product Requirements — SmartParking

## 1. Mục tiêu sản phẩm

SmartParking giúp người lái xe tìm được chỗ đỗ phù hợp nhanh hơn, đặt chỗ trước, thanh toán, nhận QR để vào cổng; đồng thời giúp đội vận hành theo dõi công suất bãi, doanh thu và trạng thái hệ thống theo thời gian thực.

### North Star của trải nghiệm người dùng

Một phiên đỗ xe thành công nên đi theo đường thẳng:

```text
tìm bãi phù hợp → đặt chỗ → thanh toán → nhận QR → vào cổng → hoàn tất phiên đỗ
```

### Mục tiêu kinh doanh giai đoạn hiện tại

1. Chứng minh được luồng end-to-end có thể vận hành thật.
2. Giảm ma sát ở các bước tạo booking, thanh toán và vào cổng.
3. Tạo nền dữ liệu đủ tốt để IOC theo dõi hiệu quả vận hành và mở rộng quy mô sau này.

## 2. Người dùng mục tiêu

| Persona | Nhu cầu chính | Kỳ vọng thành công |
| --- | --- | --- |
| Người lái xe | Tìm chỗ gần, còn chỗ thật, giá rõ ràng, vào cổng nhanh | Có thể đặt và vào bãi mà không cần gọi hỗ trợ |
| Operator tại bãi/cổng | Xác thực nhanh, giảm ùn tắc, xử lý ngoại lệ | Quyết định cho qua/không cho qua rõ ràng trong vài giây |
| Admin/IOC | Theo dõi doanh thu, công suất, xu hướng, cảnh báo | Có dashboard đủ tin cậy để ra quyết định |
| Đội số hóa dữ liệu | Thêm/sửa bãi xe và polygon | Cập nhật dữ liệu bãi mà không làm hỏng hệ thống |

## 3. Phạm vi sản phẩm hiện tại

### Đang có trong hệ thống

- Tìm bãi gần theo vị trí GPS.
- Đăng ký, đăng nhập, xem hồ sơ.
- Tạo booking cho ô tô/xe máy.
- Thanh toán demo trực tiếp và thanh toán MoMo.
- Sinh QR cho booking đã thanh toán.
- Quét QR ở cổng, có anti-replay.
- Checkout và giải phóng chỗ.
- Dashboard IOC: doanh thu, booking, occupancy trend, utilization, forecast.
- Công cụ số hóa bãi xe bằng GeoJSON.

### Chưa nên coi là đã hoàn thiện

- Kiến trúc tài liệu đang mô tả microservices, nhưng code thực tế hiện vẫn là một backend monolith.
- API docs hiện có chỗ dùng `/api/v1/*`, còn code đang chạy thực tế là `/api/*`.
- Hệ thống đã có dashboard vận hành, nhưng chưa có telemetry sản phẩm chuẩn hóa theo funnel.
- Error response đang chủ yếu dùng `message`; chưa có `error.code` ổn định cho frontend và analytics.

## 4. Các luồng cốt lõi

### 4.1 Tìm bãi gần

### Mục tiêu

Giúp người lái xe tìm được bãi phù hợp theo vị trí hiện tại với thông tin tối thiểu cần để ra quyết định.

### Luồng chuẩn

1. Người dùng mở bản đồ.
2. Ứng dụng lấy `lat/lng`.
3. Backend trả danh sách bãi trong bán kính yêu cầu.
4. Mỗi bãi hiển thị tên, khoảng cách, giá, hỗ trợ EV và số chỗ còn lại.

### Yêu cầu chức năng

- Nhận `lat`, `lng`, `radius`.
- Từ chối request thiếu hoặc sai định dạng tọa độ.
- Trả kết quả theo từng bãi với `availableSlots`.
- Kết quả cần phản ánh slot state gần thời gian thực.

### Edge cases

- Thiếu GPS hoặc GPS lỗi.
- Bãi có dữ liệu slot cache cũ.
- Không có bãi nào trong bán kính tìm kiếm.

### Acceptance criteria

- Khi `lat/lng` hợp lệ, API trả danh sách JSON hợp lệ.
- Khi `lat/lng` không hợp lệ, API trả lỗi chuẩn hóa.
- Người dùng nhìn thấy bãi gần, giá và số chỗ còn trước khi quyết định.

### KPI chính

- `nearby_search_success_rate`
- `time_to_first_lot_result`
- `availability_accuracy`

### 4.2 Tạo booking

### Mục tiêu

Cho phép người dùng giữ một chỗ trước với chi phí dự kiến rõ ràng.

### Luồng chuẩn

1. Người dùng chọn bãi.
2. Nhập biển số, loại xe, số giờ dự kiến, thời gian bắt đầu nếu có.
3. Backend kiểm tra bãi còn chỗ và kiểm tra trùng biển số đang hoạt động.
4. Tạo booking ở trạng thái `PENDING`.
5. Giảm slot khả dụng của bãi.

### Yêu cầu chức năng

- Cần `lotId` và `plateNumber`.
- Không cho phép một biển số có hơn một booking đang hoạt động (`PENDING` hoặc `PAID`).
- Hỗ trợ booking bắt đầu ngay hoặc trong tương lai.
- Tính tiền dự kiến theo loại xe và số giờ.

### Edge cases

- Bãi không tồn tại.
- Bãi đã hết chỗ.
- Biển số trùng booking đang hoạt động.
- `startTime` không hợp lệ hoặc nằm trong quá khứ.

### Acceptance criteria

- Booking hợp lệ tạo thành công và trả về `bookingId`.
- Khi hết chỗ, hệ thống không tạo booking mới.
- Khi biển số bị trùng, người dùng nhận được thông báo rõ ràng và có thể truy cập booking hiện có.

### KPI chính

- `booking_creation_rate`
- `booking_duplicate_rejection_rate`
- `slot_full_rejection_rate`

### 4.3 Thanh toán và phát QR

### Mục tiêu

Biến một booking hợp lệ thành quyền vào bãi có thể xác thực được.

### Luồng chuẩn

1. Người dùng thanh toán qua MoMo hoặc demo direct payment.
2. Hệ thống chuyển booking sang `PAID`.
3. Hệ thống phát QR chứa thông tin booking, bãi, gate, hướng đi.
4. QR có thời hạn 4 giờ.

### Yêu cầu chức năng

- Chỉ chủ booking, admin hoặc operator mới được xác nhận thanh toán trực tiếp.
- Demo direct payment phải có cờ cấu hình riêng.
- Payment callback thành công phải sinh QR.
- Trạng thái thanh toán phải có thể kiểm tra lại.

### Edge cases

- Booking không tồn tại.
- Thanh toán bị hủy/thất bại.
- Direct payment bị tắt ở môi trường thật.
- Provider callback đến trễ hoặc gửi lặp.

### Acceptance criteria

- Booking thanh toán thành công nhận được QR hợp lệ.
- Người dùng có thể truy vấn lại trạng thái thanh toán.
- Direct payment không thể dùng nếu hệ thống đã tắt chế độ demo.

### KPI chính

- `payment_success_rate`
- `payment_pending_duration`
- `qr_issue_success_rate`

### 4.4 Quét QR tại cổng

### Mục tiêu

Cho phép hoặc từ chối qua cổng một cách nhanh, chính xác, có dấu vết kiểm tra.

### Luồng chuẩn

1. Scanner gửi `qrToken`.
2. Backend kiểm tra chữ ký, thời hạn, role, anti-replay.
3. Với booking đặt trước, backend kiểm tra cửa sổ thời gian cho phép.
4. Nếu hợp lệ, trả `granted=true` và ghi event.
5. Khi hướng là `OUT`, hệ thống checkout và giải phóng chỗ.

### Yêu cầu chức năng

- Hỗ trợ xác thực bằng `x-gate-api-key` hoặc tài khoản admin/operator.
- QR chỉ được dùng một lần.
- Booking tương lai chỉ được vào từ 60 phút trước giờ hẹn đến tối đa 4 giờ sau giờ hẹn.
- Ghi lại event cổng cho dashboard.

### Edge cases

- QR hết hạn.
- QR dùng lại.
- Vào quá sớm.
- Booking window đã hết hạn.
- Scanner thiếu key hoặc key sai.

### Acceptance criteria

- QR hợp lệ được duyệt trong một request.
- QR đã dùng hoặc hết hạn bị từ chối rõ ràng.
- Sự kiện cổng xuất hiện trong lịch sử vận hành.

### KPI chính

- `gate_grant_rate`
- `gate_denial_rate_by_reason`
- `gate_scan_latency_p95`

### 4.5 Dashboard IOC và quản trị bãi

### Mục tiêu

Cho đội vận hành thấy được tình hình hệ thống và cập nhật dữ liệu bãi một cách có kiểm soát.

### Luồng chuẩn

1. Admin/Operator đăng nhập.
2. Xem doanh thu, số booking, active sessions, utilization, forecast.
3. Admin cập nhật hoặc xóa bãi xe nếu cần.

### Yêu cầu chức năng

- Operator được xem số liệu vận hành.
- Chỉ Admin mới được thêm/sửa/xóa bãi.
- Dashboard dùng dữ liệu thật khi DB khả dụng, fallback khi demo.

### Edge cases

- Dữ liệu bãi không hợp lệ.
- GeoJSON polygon không khép kín.
- Chênh lệch giữa dữ liệu cache, file và DB.

### Acceptance criteria

- Operator xem được dashboard nhưng không chỉnh sửa cấu hình bãi.
- Admin cập nhật bãi hợp lệ và dữ liệu được phản ánh lại trong hệ thống.
- Bãi sai cấu trúc bị từ chối với lỗi rõ ràng.

### KPI chính

- `dashboard_data_freshness`
- `parking_lot_update_success_rate`
- `forecast_risk_detection_rate`

## 5. Yêu cầu phi chức năng

| Nhóm | Yêu cầu tối thiểu |
| --- | --- |
| Hiệu năng | API cốt lõi nên hướng tới `p95 < 200ms` trong điều kiện bình thường |
| Sẵn sàng | Có `/health`; production nên chạy với SQL Server bắt buộc và không dùng memory fallback |
| Bảo mật | JWT cho user, phân quyền theo role, gate key riêng, không dùng secret mặc định ở production |
| Dữ liệu | Slot availability phải nhất quán đủ để người dùng tin cậy trước khi đặt |
| Quan sát hệ thống | Mọi request quan trọng nên có `requestId`, log cấu trúc, metric và dashboard |
| Quốc tế hóa | Giao diện hiện hỗ trợ `vi/en`; thông điệp lỗi cần giữ được khả năng bản địa hóa |

## 6. Các quyết định sản phẩm cần chốt tiếp

1. Có cho phép giữ chỗ mà không thanh toán ngay trong bao lâu?
2. Booking tương lai nên giữ slot ngay từ lúc tạo hay chỉ gần thời điểm bắt đầu?
3. Với người dùng không đăng nhập, có cho phép lookup booking bằng biển số không hay phải xác thực thêm?
4. Phạm vi role trong tương lai có cần thêm `SUPER_ADMIN`, `LOT_MANAGER`, `SUPPORT` không?
5. Khi mở rộng nhiều thành phố, định danh bãi và cấu trúc pricing sẽ đổi thế nào?

## 7. Ngoài phạm vi giai đoạn hiện tại

- Dynamic pricing theo cung/cầu.
- Tối ưu điều hướng đường đi tới bãi.
- Chương trình khách hàng thân thiết.
- API đối tác công khai.
- Tách backend thành microservices thật ở production.

## 8. Definition of Done cho một luồng mới

Một luồng chỉ nên được coi là hoàn thành khi có đủ:

1. PRD-lite rõ mục tiêu và edge cases.
2. API contract + error codes.
3. Telemetry events.
4. Unit/integration tests tối thiểu.
5. Dashboard hoặc log để vận hành theo dõi.
6. Tài liệu cập nhật đồng bộ với code thực tế.
