import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./i18n";

createRoot(document.getElementById("root")).render(
  <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>Loading...</div>}>
    <App />
  </Suspense>
);
