// Which system the webview runs on. Only used to decide whether the title bar needs room for the macOS
// window buttons (spec window-polish D-4): the Overlay title bar exists on macOS only. WKWebView reports
// "Macintosh" in its user agent. No plugin or dependency needed.
export const isMac = (): boolean => typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
