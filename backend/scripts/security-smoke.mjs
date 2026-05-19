const API_BASE = process.env.API_BASE || "http://localhost:3002";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const body = await res.json().catch(() => null);
  return { res, body };
}

function assertStatus(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${actual}`);
  }
}

function assertTruthy(value, label) {
  if (!value) {
    throw new Error(`${label}: expected truthy value`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function run() {
  const health = await request("/health");
  assertStatus(health.res.status, 200, "health");

  const anonymousAdmin = await request("/api/admin/stats");
  assertStatus(anonymousAdmin.res.status, 401, "anonymous admin route");
  assertTruthy(anonymousAdmin.res.headers.get("x-request-id"), "anonymous admin request id header");
  assertEqual(anonymousAdmin.body?.error?.code, "AUTH_REQUIRED", "anonymous admin error code");

  const anonymousPayment = await request("/api/payments/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bookingId: 1, provider: "DIRECT" })
  });
  assertStatus(anonymousPayment.res.status, 401, "anonymous direct payment");

  const anonymousHistory = await request("/api/users/1/bookings");
  assertStatus(anonymousHistory.res.status, 401, "anonymous booking history");

  const anonymousQrIssue = await request("/api/qr/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bookingId: 1 })
  });
  assertStatus(anonymousQrIssue.res.status, 401, "anonymous QR issue");

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@hue.vn", password: "123456" })
  });
  assertStatus(login.res.status, 200, "admin login");
  const token = login.body?.token;
  if (!token) throw new Error("admin login: token missing");

  const adminStats = await request("/api/admin/stats", {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus(adminStats.res.status, 200, "admin stats");

  const productFunnel = await request("/api/admin/product-funnel", {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus(productFunnel.res.status, 200, "admin product funnel");

  console.log("security smoke checks passed");
}

run().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
