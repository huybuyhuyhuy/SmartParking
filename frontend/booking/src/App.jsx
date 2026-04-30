import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlBookingId = urlParams.get("bookingId");

  const [bookingView, setBookingView] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!urlBookingId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/bookings/${urlBookingId}`);
        if (res.ok) {
          const data = await res.json();
          setBookingView(data);
          if (data.payment_status !== "PAID") {
            const payRes = await fetch(`${API_BASE}/api/payments/status/${urlBookingId}`);
            if (payRes.ok) {
              const payData = await payRes.json();
              setBookingView((prev) => ({ ...prev, qr_code_token: payData.qrToken, qrDataUrl: payData.qrDataUrl, payment_status: payData.paymentStatus }));
            }
          }
        }
      } catch (_e) {} finally { setLoading(false); }
    })();
  }, [urlBookingId]);

  const formatCurrency = (n) => Number(n || 0).toLocaleString() + "đ";
  const paymentLabel = (s) => s === "PAID" ? "Đã thanh toán" : s === "PENDING" ? "Chờ thanh toán" : "Thất bại";
  const paymentColor = (s) => s === "PAID" ? "#16a34a" : s === "PENDING" ? "#d97706" : "#dc2626";

  if (!urlBookingId) {
    return (
      <div className="login-page" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)" }}>
        <div className="booking-result-card" style={{ textAlign: "center" }}>
          <h1 style={{ color: "#1e3a5f", marginBottom: 16 }}>Đặt Chỗ Smart Parking Huế</h1>
          <p style={{ color: "#64748b", marginBottom: 24 }}>Vui lòng đặt chỗ từ bản đồ để xem thông tin chi tiết.</p>
          <button className="btn btn-primary" onClick={() => { window.location.href = "http://localhost:5173/user-map/"; }}>
            Về bản đồ đặt chỗ
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="login-page"><div className="booking-result-card"><p>Đang tải thông tin đặt chỗ...</p></div></div>;
  }

  if (!bookingView) {
    return <div className="login-page"><div className="booking-result-card"><p>Không tìm thấy mã đặt chỗ #{urlBookingId}</p></div></div>;
  }

  return (
    <div className="login-page" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)" }}>
      <div className="booking-result-card">
        <div className="booking-result-header">
          <div className="success-icon large">&#10003;</div>
          <h1>Đặt chỗ thành công!</h1>
          <p className="booking-id-label">Mã đặt chỗ: <b>#{bookingView.id}</b></p>
        </div>
        <div className="booking-details">
          <div className="detail-row"><span>Bãi xe</span><span><b>{bookingView.lot_name || bookingView.parking_lot_id}</b></span></div>
          <div className="detail-row"><span>Biển số xe</span><span><b>{bookingView.plate_number}</b></span></div>
          <div className="detail-row"><span>Số tiền</span><span className="amount">{formatCurrency(bookingView.amount)}</span></div>
          <div className="detail-row"><span>Trạng thái</span><span style={{ color: paymentColor(bookingView.payment_status), fontWeight: 700 }}>{paymentLabel(bookingView.payment_status)}</span></div>
          <div className="detail-row"><span>Nhà cung cấp</span><span>{bookingView.payment_provider || "MOMO"}</span></div>
          <div className="detail-row"><span>Ngày đặt</span><span>{new Date(bookingView.created_at).toLocaleString("vi-VN")}</span></div>
        </div>
        {bookingView.qr_code_token && (
          <div className="qr-section">
            <p>Mã QR vào cổng:</p>
            <img src={bookingView.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingView.qr_code_token)}`} alt="QR Code" className="qr-image" />
            <p className="qr-expire">QR có hiệu lực 4 giờ. Lưu lại để quét tại cổng bãi xe.</p>
          </div>
        )}
        {(bookingView.payment_status === "PENDING" || !bookingView.qr_code_token) && (
          <div className="payment-section">
            <p className="payment-hint">Vui lòng thanh toán qua MoMo để nhận mã QR:</p>
            <a href={`${API_BASE}/api/payments/momo`} className="btn btn-momo btn-block" onClick={async (e) => {
              e.preventDefault();
              try {
                const momoRes = await fetch(`${API_BASE}/api/payments/momo`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ bookingId: bookingView.id, amount: bookingView.amount, orderInfo: `Gửi xe - ${bookingView.plate_number}` })
                });
                const momoData = await momoRes.json();
                if (momoData.payUrl) window.open(momoData.payUrl, "_blank");
              } catch (_e) {}
            }}>Thanh toán qua MoMo</a>
            <p className="waiting-text">Sau khi thanh toán, tải lại trang để xem QR.</p>
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={() => { window.location.href = "http://localhost:5173/user-map/"; }} style={{ marginTop: 20 }}>
          Quay lại bản đồ
        </button>
      </div>
    </div>
  );
}
