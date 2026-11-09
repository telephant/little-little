// DEV ONLY: renders the app (shot.html on the vite dev server) in WKWebView — the engine Tauri uses on macOS, which draws
// SVG filters and scrollbars differently from Chrome — opens the memories and counts the pixels that change around the
// reflection. Build and run:
//   swiftc -O scripts/wk-snap.swift -o /tmp/wk-snap
//   RIGHT_PAD=0 /tmp/wk-snap "http://localhost:1420/shot.html?view=journal&memories=peek" <outdir> 1000 560 [-AppleShowScrollBars Always]
// PRE_JS runs extra JavaScript first (e.g. to try a CSS change). The trailing -AppleShowScrollBars Always forces classic scrollbars for
// this process only (no system setting is changed). It flashes a small window for ~15 s.
import Cocoa
import WebKit

// usage: snap <url> <outdir> <w> <h>   — renders in WKWebView (the engine Tauri uses), clicks .memories-toggle, diffs the reflection box
let args = CommandLine.arguments
let url = URL(string: args[1])!
let outDir = args[2]
let W = CGFloat(Double(args[3])!), H = CGFloat(Double(args[4])!)

final class Runner: NSObject, WKNavigationDelegate {
  let app = NSApplication.shared
  var win: NSWindow!
  var web: WKWebView!

  func wait(_ s: Double) { RunLoop.current.run(until: Date().addingTimeInterval(s)) }

  func js(_ code: String) -> Any? {
    var out: Any? = nil; var done = false
    web.evaluateJavaScript(code) { r, e in out = r; if let e = e { print("js error:", e) }; done = true }
    while !done { wait(0.05) }
    return out
  }

  func snap(_ name: String) -> NSBitmapImageRep? {
    var rep: NSBitmapImageRep? = nil; var done = false
    web.takeSnapshot(with: nil) { img, err in
      if let img = img, let tiff = img.tiffRepresentation, let r = NSBitmapImageRep(data: tiff) {
        rep = r
        if let png = r.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "\(outDir)/\(name).png")) }
      } else { print("snapshot error:", String(describing: err)) }
      done = true
    }
    while !done { wait(0.05) }
    return rep
  }

  func run() {
    app.setActivationPolicy(.accessory)
    let cfg = WKWebViewConfiguration()
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: W, height: H), configuration: cfg)
    web.navigationDelegate = self
    win = NSWindow(contentRect: NSRect(x: 40, y: 40, width: W, height: H), styleMask: [.titled], backing: .buffered, defer: false)
    win.contentView = web
    win.orderFrontRegardless()
    web.load(URLRequest(url: url))
    wait(9) // app boot + scripted unlock in shot.html
    if let pre = ProcessInfo.processInfo.environment["PRE_JS"] { _ = js(pre); wait(0.8) }
    // reflection box in CSS px
    guard let box = js(#"(()=>{const e=document.querySelector('[data-testid="reflection"]'); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left,b.top,b.width,b.height, devicePixelRatio];})()"#) as? [Double] else {
      print("no reflection on the page"); return
    }
    print("reflection box css px:", box)
    guard let a = snap("A-closed") else { return }
    _ = js("document.querySelector('.memories-toggle').click()")
    wait(1.0)
    let box2 = js(#"(()=>{const e=document.querySelector('[data-testid="reflection"]'); const b=e.getBoundingClientRect(); return [b.left,b.top,b.width,b.height];})()"#) as? [Double]
    print("reflection box after open:", box2 ?? [])
    guard let b = snap("B-open") else { return }
    // diff inside the reflection box (padded by 20px each side to include the wash edge)
    let scale = Double(a.pixelsWide) / Double(W)
    let x0 = max(0, Int((box[0] - 20) * scale)), y0 = max(0, Int((box[1] - 20) * scale))
    let rightPad = Double(ProcessInfo.processInfo.environment["RIGHT_PAD"] ?? "20")!
    let x1 = min(a.pixelsWide, Int((box[0] + box[2] + rightPad) * scale)), y1 = min(a.pixelsHigh, Int((box[1] + box[3] + 20) * scale))
    var diff = 0, total = 0
    for y in y0..<y1 { for x in x0..<x1 {
      total += 1
      guard let ca = a.colorAt(x: x, y: y), let cb = b.colorAt(x: x, y: y) else { continue }
      if abs(ca.redComponent - cb.redComponent) > 0.02 || abs(ca.greenComponent - cb.greenComponent) > 0.02 || abs(ca.blueComponent - cb.blueComponent) > 0.02 || abs(ca.alphaComponent - cb.alphaComponent) > 0.02 { diff += 1 }
    } }
    print("pixels in reflection area: \(total), changed after opening memories: \(diff)")
  }
}
Runner().run()
