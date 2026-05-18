# Phân tích dự án SmartParking theo góc nhìn sản phẩm

## 1) Tóm tắt sản phẩm hiện tại
SmartParking là một nền tảng quản lý đỗ xe thông minh cho thành phố Huế, gồm:
- 1 backend Node.js/Express (API + realtime WebSocket).
- 4 frontend React/Vite theo vai trò: User Map, Booking, IOC Dashboard, Digitalization Tool.
- Dữ liệu chính trên SQL Server, có fallback in-memory khi môi trường chưa đầy đủ.
- Hỗ trợ tích hợp Redis/Kafka ở mức tùy chọn.

Điểm mạnh nổi bật:
- Có thể demo nhanh ngay cả khi chưa có full hạ tầng production.
- Luồng nghiệp vụ end-to-end đã có: tìm bãi → đặt chỗ → thanh toán → phát QR → quét cổng → thống kê dashboard.
- Có tài liệu kiến trúc/API cơ bản.

## 2) Chân dung người dùng & giá trị cốt lõi
### Nhóm người dùng
1. **Người lái xe**: cần tìm chỗ gần, biết còn chỗ thật, đặt nhanh, vào cổng mượt.
2. **Nhân sự vận hành bãi/cổng**: cần xác thực QR nhanh, giảm tắc nghẽn.
3. **Trung tâm điều hành (IOC/City Ops)**: cần KPI tức thời, dự báo thiếu chỗ, giám sát doanh thu.
4. **Đội số hóa dữ liệu**: cần cập nhật polygon/bản đồ bãi linh hoạt.

### Giá trị cốt lõi hiện tại
- Giảm thời gian tìm chỗ.
- Tăng minh bạch công suất bãi theo thời gian thực.
- Chuẩn hóa quy trình vào/ra bằng QR.
- Hỗ trợ vận hành đa vai trò với nhiều ứng dụng chuyên biệt.

## 3) Đánh giá maturity theo lớp sản phẩm
### 3.1 Product Scope (độ đầy đủ tính năng)
- Đã có core workflow tương đối đầy đủ (search, booking, payment callback, QR, gate scan, analytics).
- Có quản trị bãi xe và sự kiện cổng.
- Có i18n (vi/en) trên frontend.

### 3.2 Technical Architecture
- **Thực tế code hiện tại là monolith backend** (một server Express), trong khi tài liệu architecture mô tả hướng microservices.
- Đây là bước hợp lý giai đoạn MVP, nhưng cần lộ trình tách dịch vụ khi scale.

### 3.3 Operability
- Có `/health`, có fallback mode khi SQL/Redis/Kafka không sẵn sàng.
- Chưa thấy runbook SRE/incident hoặc SLO rõ ràng trong docs hiện có.

### 3.4 Product Analytics
- Dashboard đã có revenue, occupancy trend, utilization, forecast.
- Chưa thấy bộ KPI sản phẩm cấp business (conversion funnel, CAC, retention, churn theo cohort).

## 4) Các khoảng trống nên bổ sung (ưu tiên theo tác động)
## P0 — Nên làm ngay (ảnh hưởng trực tiếp chất lượng sản phẩm)
1. **Chuẩn hóa Product Requirement (PRD-lite) cho từng luồng**
   - Search nearby, booking, payment, gate, admin.
   - Mỗi luồng cần: mục tiêu, pre/post-condition, edge cases, KPI.
2. **API versioning + error contract thống nhất**
   - Thêm quy chuẩn mã lỗi nghiệp vụ (VD: BOOKING_DUPLICATE_PLATE, SLOT_FULL, QR_EXPIRED).
3. **Bảo mật & phân quyền rõ ràng hơn cho admin routes**
   - Ràng buộc role-based guard nhất quán (không chỉ auth mà cả quyền).
4. **Bộ test hồi quy tối thiểu cho backend**
   - Unit test controller quan trọng + integration test các API chính.

## P1 — Nên làm kế tiếp (tăng tốc scale và vận hành)
5. **Product telemetry chuẩn hóa**
   - Track funnel: view_map → select_lot → create_booking → pay_success → gate_granted.
6. **Observability đầy đủ**
   - Structured logging, request-id, metrics latency/error rate per endpoint.
7. **Rà soát đồng bộ tài liệu vs code**
   - docs/architecture cần nêu rõ “hiện trạng monolith” + “định hướng microservices”.
8. **Quản trị dữ liệu bãi xe**
   - Versioning cho GeoJSON + workflow approve thay đổi dữ liệu vận hành.

## P2 — Nên đưa vào roadmap nâng cao
9. **Pricing engine linh hoạt** (khung giờ, ngày lễ, dynamic pricing).
10. **Dự báo thông minh hơn** (theo sự kiện thành phố/thời tiết/khung giờ).
11. **Kịch bản B2B/B2G mở rộng** (API cho đối tác, chuẩn hóa SLA).

## 5) Đề xuất roadmap 90 ngày
### Giai đoạn 1 (Tuần 1–3): Ổn định nền tảng
- Chốt PRD-lite 5 luồng cốt lõi.
- Chuẩn hóa error contract + tài liệu API cập nhật.
- Viết test regression cho booking + payment + gate.

### Giai đoạn 2 (Tuần 4–7): Đo lường & vận hành
- Cài telemetry funnel và dashboard KPI sản phẩm.
- Bổ sung logging/metrics/tracing cơ bản.
- Cập nhật runbook vận hành và xử lý sự cố.

### Giai đoạn 3 (Tuần 8–12): Chuẩn bị scale
- Refactor từng module theo service boundary (logical first).
- Tách dần slot/analytics sang worker hoặc service riêng nếu cần tải lớn.
- Thiết kế SLA/SLO cho production.

## 6) Danh sách tài liệu nên thêm ngay trong thư mục docs/
1. `docs/PRODUCT_REQUIREMENTS.md` ✅
   - Mục tiêu sản phẩm, persona, user journey, acceptance criteria.
2. `docs/KPI_FRAMEWORK.md` ✅
   - North Star Metric, funnel KPI, operational KPI.
3. `docs/ERROR_CODE_STANDARD.md` ✅
   - Danh mục mã lỗi API, mapping HTTP status.
4. `docs/SECURITY_RBAC.md`
   - Ma trận quyền theo vai trò (user, operator, admin, super-admin).
5. `docs/OBSERVABILITY_RUNBOOK.md`
   - Cảnh báo, dashboard vận hành, quy trình incident response.
6. `docs/ROADMAP_Q3_Q4.md`
   - Backlog ưu tiên và mốc phát hành.

## 7) Các chỉ số cần theo dõi để biết sản phẩm đang đi đúng hướng
- **Activation**: tỷ lệ user tìm được bãi phù hợp trong <= 60 giây.
- **Conversion**: booking_created / nearby_search.
- **Payment success rate**: pay_success / payment_initiated.
- **Gate success rate**: gate_granted / gate_scan.
- **Availability accuracy**: chênh lệch slot thực tế vs slot hiển thị.
- **Operational latency**: p95 API nearby/booking/gate scan.

## 8) Kết luận nhanh
Dự án đã vượt qua mức prototype và đang ở ngưỡng “MVP có thể vận hành demo thực tế”.
Để trở thành sản phẩm production-ready, ưu tiên cao nhất là: chuẩn hóa yêu cầu nghiệp vụ, test hồi quy, bảo mật RBAC, và hệ đo lường sản phẩm/vận hành. Sau đó mới tiến đến tách dịch vụ để scale an toàn.
