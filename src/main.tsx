import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isMac } from "./lib/platform";
import { installTitleBarGuard } from "./lib/titleBarGuard";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Only inside the real Tauri window on macOS (not in a plain browser, tests or the screenshot harness).
if (isMac() && (window as unknown as { __TAURI_INTERNALS__?: { metadata?: unknown } }).__TAURI_INTERNALS__?.metadata) {
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => installTitleBarGuard(getCurrentWindow()))
    .catch(() => undefined);
}
