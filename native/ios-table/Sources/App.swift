// CROSSADE — нативная обёртка над столом из HTML (`server/table-client`). Внутри тот же самый стол, что в
// Telegram, один в один; приложение добавляет только то, чего вебу не дано:
//   • ARKit — где телефон в комнате и куда смотрит, каждый кадр, → `window.__arFrame` (`arNative.ts`);
//   • камеру — под прозрачной страницей, пока стол в AR.
// Вход — ссылкой из бота или из настроек стола: crossade://table?room=…&pass=…&host=…

import ARKit
import UIKit
import WebKit

@main
final class App: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    let table = TableController()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window!.rootViewController = table
        window!.makeKeyAndVisible()
        // Открыли ссылкой — её принесёт `open url` следом; открыли с иконки — садимся за последний стол.
        if options?[.url] == nil { table.resume() }
        return true
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        table.opened(url)
        return true
    }
}

final class TableController: UIViewController, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate, ARSessionDelegate {
    /** Постоянный адрес стола: реле отдаёт страницу мака, где бы мак сейчас ни жил. */
    static let relay = "https://crossade-deck-server.fly.dev"
    /** Мост в страницу: она зовёт камеру приложения (`arNative.ts`). */
    static let bridge = "window.__crossadeNative = { version: 1, ar: function (on) { window.webkit.messageHandlers.crossade.postMessage({ ar: !!on }); } };"

    let camera = ARSCNView()
    var web: WKWebView!
    let note = UILabel()
    /** Таблетка Crossade вокруг островка — как у PWA из client2: только на айфоне с вырезом. */
    let badge = UILabel()
    var arOn = false
    var lastFrame: TimeInterval = 0

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.07, green: 0.05, blue: 0.03, alpha: 1)

        camera.frame = view.bounds
        camera.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        camera.isHidden = true
        camera.automaticallyUpdatesLighting = false
        camera.session.delegate = self
        view.addSubview(camera)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.addUserScript(WKUserScript(source: Self.bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "crossade")
        web = WKWebView(frame: view.bounds, configuration: config)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.uiDelegate = self
        web.navigationDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view.addSubview(web)

        note.frame = view.bounds.insetBy(dx: 32, dy: 0)
        note.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        note.numberOfLines = 0
        note.textAlignment = .center
        note.textColor = UIColor(red: 0.96, green: 0.92, blue: 0.82, alpha: 1)
        note.font = .systemFont(ofSize: 16)
        view.addSubview(note)

        badge.text = "🃏 crossade"
        badge.font = UIFont(name: "Tiny5-Regular", size: 15) ?? .monospacedSystemFont(ofSize: 15, weight: .regular)
        badge.textColor = UIColor(red: 0.17, green: 0.11, blue: 0.04, alpha: 1)
        badge.backgroundColor = UIColor(red: 0.95, green: 0.76, blue: 0.31, alpha: 1)
        badge.textAlignment = .center
        badge.layer.cornerRadius = 11
        badge.layer.masksToBounds = true
        badge.isUserInteractionEnabled = false
        view.addSubview(badge)
    }

    // ─── safe-зоны ───────────────────────────────────────────────────────────────────────────────
    // Страница стола отступает от выреза и полоски «домой» по переменным Telegram (`--tg-safe-area-inset-*`):
    // приложение ставит их сами, из настоящих отступов экрана, — и в Telegram, и здесь вёрстка одна.
    func insetsJs() -> String {
        let i = view.window?.safeAreaInsets ?? view.safeAreaInsets
        return "(function(){var s=document.documentElement.style;"
            + "s.setProperty('--tg-safe-area-inset-top','\(Int(i.top))px');s.setProperty('--tg-safe-area-inset-bottom','\(Int(i.bottom))px');"
            + "s.setProperty('--tg-safe-area-inset-left','\(Int(i.left))px');s.setProperty('--tg-safe-area-inset-right','\(Int(i.right))px');})();"
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        web?.evaluateJavaScript(insetsJs())
        placeBadge()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        placeBadge()
    }

    /** По центру верхней safe-зоны; нет выреза (зона меньше 30 pt) — таблетки нет. */
    func placeBadge() {
        let top = view.safeAreaInsets.top
        badge.isHidden = top < 30
        let size = badge.intrinsicContentSize
        badge.bounds = CGRect(x: 0, y: 0, width: size.width + 24, height: 22)
        badge.center = CGPoint(x: view.bounds.midX, y: top / 2)
        view.bringSubviewToFront(badge)
    }

    // ─── вход ────────────────────────────────────────────────────────────────────────────────────
    // КЛЮЧ ПРИЛОЖЕНИЯ называет человека (`appPass.ts`): с ним открываются «Мои комнаты» и любой его стол. Старая
    // ссылка с пропуском на один стол тоже годится — тогда только этот стол.
    func opened(_ url: URL) {
        guard url.scheme == "crossade", let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        var room: String?, pass: String?, key: String?
        for item in parts.queryItems ?? [] {
            if item.name == "room" { room = item.value }
            if item.name == "pass" { pass = item.value }
            if item.name == "key" { key = item.value }
        }
        let keep = UserDefaults.standard
        if let key { keep.set(key, forKey: "key") }
        if let room, let pass { keep.set(room, forKey: "room"); keep.set(pass, forKey: "pass") }
        load(room: room, pass: key == nil ? pass : nil)
    }

    /** С иконки: есть ключ — «Мои комнаты»; есть только старый пропуск — его стол. */
    func resume() {
        loadViewIfNeeded()
        let keep = UserDefaults.standard
        if keep.string(forKey: "key") != nil { return load(room: nil, pass: nil) }
        if let room = keep.string(forKey: "room"), let pass = keep.string(forKey: "pass") { return load(room: room, pass: pass) }
        note.text = "Открой стол ссылкой из Telegram: кнопка «В приложении» у бота или /app в личке с ним."
    }

    /** `room` нет — «Мои комнаты»; `pass` нет — входим ключом. */
    func load(room: String?, pass: String?) {
        loadViewIfNeeded()
        note.text = nil
        setAr(false)
        var items: [URLQueryItem] = []
        if let room { items.append(URLQueryItem(name: "room", value: room)) } else { items.append(URLQueryItem(name: "rooms", value: "")) }
        if let pass { items.append(URLQueryItem(name: "pass", value: pass)) }
        else if let key = UserDefaults.standard.string(forKey: "key") { items.append(URLQueryItem(name: "key", value: key)) }
        var url = URLComponents(string: Self.relay + "/t/")!
        url.queryItems = items
        // Отступы — до первых скриптов страницы: иначе кнопки на первом кадре сидят под островком.
        let scripts = web.configuration.userContentController
        scripts.removeAllUserScripts()
        scripts.addUserScript(WKUserScript(source: Self.bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        scripts.addUserScript(WKUserScript(source: insetsJs(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web.load(URLRequest(url: url.url!))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func failed(_ error: Error) { note.text = "Стол не открылся: \(error.localizedDescription)" }

    // Голос за столом — микрофон странице без второго вопроса: приложение уже спросило своё.
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // ─── AR ──────────────────────────────────────────────────────────────────────────────────────
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let on = body["ar"] as? Bool else { return }
        setAr(on)
    }

    func setAr(_ on: Bool) {
        guard on != arOn else { return }
        arOn = on
        if on {
            let config = ARWorldTrackingConfiguration()
            config.worldAlignment = .gravity
            config.planeDetection = [.horizontal]
            camera.session.run(config, options: [.resetTracking, .removeExistingAnchors])
            camera.isHidden = false
        } else {
            camera.session.pause()
            camera.isHidden = true
        }
    }

    /** Каждый кадр камеры — в страницу: поворот и место телефона, обзор под экран, уверен ли ARKit. */
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard arOn, frame.timestamp - lastFrame > 1.0 / 60 else { return }
        lastFrame = frame.timestamp
        let cam = frame.camera
        let m = cam.viewMatrix(for: .portrait).inverse
        let q = simd_quatf(simd_float3x3(simd_make_float3(m.columns.0), simd_make_float3(m.columns.1), simd_make_float3(m.columns.2)))
        let p = cam.projectionMatrix(for: .portrait, viewportSize: view.bounds.size, zNear: 0.01, zFar: 100)
        let fov = 2 * atan(1 / p.columns.1.y) * 180 / .pi
        let sure = cam.trackingState == .normal ? 1 : 0
        let js = String(format: "window.__arFrame&&window.__arFrame(%.5f,%.5f,%.5f,%.5f,%.4f,%.4f,%.4f,%.3f,%d)",
                        q.imag.x, q.imag.y, q.imag.z, q.real, m.columns.3.x, m.columns.3.y, m.columns.3.z, fov, sure)
        web.evaluateJavaScript(js)
    }
}
