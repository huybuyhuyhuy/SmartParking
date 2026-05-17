import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import LangSwitcher from "./components/LangSwitcher.jsx";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";

const formatCurrency = (n, locale) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "VND", minimumFractionDigits: 0 }).format(n || 0);

const formatDate = (d, locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

const paymentStatusKey = (s) =>
  s === "PAID" ? "statusPaid" : s === "PENDING" ? "statusPending" : "statusFailed";

const paymentColor = (s) =>
  s === "PAID" ? "#16a34a" : s === "PENDING" ? "#d97706" : "#dc2626";

export default function App() {
  const { t, i18n } = useTranslation();
  const urlParams = new URLSearchParams(window.location.search);
  const urlBookingId = urlParams.get("bookingId");

  const [bookingView, setBookingView] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = t("appTitle");
  }, [t]);

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

  if (!urlBookingId) {
    return (
      <div className="login-page" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)" }}>
        <LangSwitcher />
        <div className="booking-result-card" style={{ textAlign: "center" }}>
          <h1 style={{ color: "#1e3a5f", marginBottom: 16 }}>{t("noBookingHeader")}</h1>
          <p style={{ color: "#64748b", marginBottom: 24 }}>{t("noBookingInstructions")}</p>
          <button className="btn btn-primary" onClick={() => { window.location.href = "http://localhost:5173/user-map/"; }}>
            {t("goToMap")}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-page">
        <LangSwitcher />
        <div className="booking-result-card"><p>{t("loading")}</p></div>
      </div>
    );
  }

  if (!bookingView) {
    return (
      <div className="login-page">
        <LangSwitcher />
        <div className="booking-result-card"><p>{t("bookingNotFound", { id: urlBookingId })}</p></div>
      </div>
    );
  }

  return (
    <div className="login-page" style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dbeafe 100%)" }}>
      <LangSwitcher />
      <div className="booking-result-card">
        <div className="booking-result-header">
          <div className="success-icon large">&#10003;</div>
          <h1>{t("bookingSuccess")}</h1>
          <p className="booking-id-label">{t("bookingId")}: <b>#{bookingView.id}</b></p>
        </div>
        <div className="booking-details">
          <div className="detail-row"><span>{t("parkingLot")}</span><span><b>{bookingView.lot_name || bookingView.parking_lot_id}</b></span></div>
          <div className="detail-row"><span>{t("plateNumber")}</span><span><b>{bookingView.plate_number}</b></span></div>
          <div className="detail-row"><span>{t("amount")}</span><span className="amount">{formatCurrency(bookingView.amount, i18n.language)}</span></div>
          <div className="detail-row"><span>{t("status")}</span><span style={{ color: paymentColor(bookingView.payment_status), fontWeight: 700 }}>{t(paymentStatusKey(bookingView.payment_status))}</span></div>
          <div className="detail-row"><span>{t("provider")}</span><span>{bookingView.payment_provider || "MOMO"}</span></div>
          <div className="detail-row"><span>{t("bookingDate")}</span><span>{formatDate(bookingView.created_at, i18n.language)}</span></div>
        </div>
        {bookingView.qr_code_token && (
          <div className="qr-section">
            <p>{t("qrCodeLabel")}</p>
            <img src={bookingView.qrDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingView.qr_code_token)}`} alt="QR Code" className="qr-image" />
            <p className="qr-expire">{t("qrExpiry")}</p>
          </div>
        )}
        {(bookingView.payment_status === "PENDING" || !bookingView.qr_code_token) && (
          <div className="payment-section">
            <p className="payment-hint">{t("paymentHint")}</p>
            <a href={`${API_BASE}/api/payments/momo`} className="btn btn-momo btn-block" onClick={async (e) => {
              e.preventDefault();
              try {
                const orderInfo = i18n.language === "en"
                  ? `Parking - ${bookingView.plate_number}`
                  : `Gửi xe - ${bookingView.plate_number}`;
                const momoRes = await fetch(`${API_BASE}/api/payments/momo`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ bookingId: bookingView.id, amount: bookingView.amount, orderInfo })
                });
                const momoData = await momoRes.json();
                if (momoData.payUrl) window.open(momoData.payUrl, "_blank");
              } catch (_e) {}
            }}>{t("payWithMomo")}</a>
            <p className="waiting-text">{t("reloadForQr")}</p>
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={() => { window.location.href = "http://localhost:5173/user-map/"; }} style={{ marginTop: 20 }}>
          {t("backToMap")}
        </button>
      </div>
    </div>
  );
}
