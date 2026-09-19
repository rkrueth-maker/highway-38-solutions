import UIKit
import WebKit

@available(iOS 16.0, *)
final class H38WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private static let officeURL = URL(string: "https://highway38solutions.com/commercial-app/")!
    private static let nativeHandler = "h38Native"

    private let scannerBridge = H38SiteScannerBridge()
    private var webView: WKWebView!
    private let launchCover = UIView()
    private let launchLabel = UILabel()
    private var launchFallback: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 11 / 255, green: 36 / 255, blue: 56 / 255, alpha: 1)
        configureWebView()
        configureLaunchCover()
        loadOffice()
    }

    deinit {
        launchFallback?.cancel()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.nativeHandler)
    }

    private func configureWebView() {
        let controller = WKUserContentController()
        controller.add(self, name: Self.nativeHandler)
        controller.addUserScript(WKUserScript(
            source: nativeBridgeScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = "H38SiteScannerIOS/0.1.0"

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureLaunchCover() {
        launchCover.translatesAutoresizingMaskIntoConstraints = false
        launchCover.backgroundColor = UIColor(red: 11 / 255, green: 36 / 255, blue: 56 / 255, alpha: 1)

        launchLabel.translatesAutoresizingMaskIntoConstraints = false
        launchLabel.text = "H38 Office\nOpening securely…"
        launchLabel.textColor = .white
        launchLabel.numberOfLines = 0
        launchLabel.textAlignment = .center
        launchLabel.font = .systemFont(ofSize: 20, weight: .bold)

        launchCover.addSubview(launchLabel)
        view.addSubview(launchCover)

        NSLayoutConstraint.activate([
            launchCover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            launchCover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            launchCover.topAnchor.constraint(equalTo: view.topAnchor),
            launchCover.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            launchLabel.centerXAnchor.constraint(equalTo: launchCover.centerXAnchor),
            launchLabel.centerYAnchor.constraint(equalTo: launchCover.centerYAnchor),
            launchLabel.leadingAnchor.constraint(greaterThanOrEqualTo: launchCover.leadingAnchor, constant: 24),
            launchLabel.trailingAnchor.constraint(lessThanOrEqualTo: launchCover.trailingAnchor, constant: -24)
        ])

        let fallback = DispatchWorkItem { [weak self] in
            self?.hideLaunchCover()
        }
        launchFallback = fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: fallback)
    }

    private func loadOffice() {
        var request = URLRequest(url: Self.officeURL)
        request.cachePolicy = .reloadRevalidatingCacheData
        webView.load(request)
    }

    private func nativeBridgeScript() -> String {
        let capabilities = jsonLiteral(scannerBridge.getCapabilities())
        return """
        (function(){
          const capabilities = (capabilities);
          window.__h38NativePending = window.__h38NativePending || {};
          window.__h38NativeComplete = window.__h38NativeComplete || function(requestId, ok, payload){
            const pending = window.__h38NativePending[requestId];
            if(!pending) return;
            delete window.__h38NativePending[requestId];
            if(ok){
              try { pending.resolve(typeof payload === 'string' ? JSON.parse(payload) : payload); }
              catch(error){ pending.reject(error); }
            } else {
              pending.reject(new Error(typeof payload === 'string' ? payload : (payload && payload.message) || 'Native scan failed.'));
            }
          };
          window.H38NativeHost = {
            platform: 'ios',
            officeReady: function(kind){
              try { window.webkit.messageHandlers.h38Native.postMessage({action:'officeReady', kind:String(kind || '')}); }
              catch(error){}
            }
          };
          window.H38NativeScanner = {
            getCapabilities: function(){ return Object.assign({}, capabilities); },
            start: function(options){
              return new Promise(function(resolve, reject){
                const requestId = 'IOS-NATIVE-' + Date.now() + '-' + Math.random().toString(16).slice(2);
                window.__h38NativePending[requestId] = {resolve:resolve, reject:reject};
                try {
                  window.webkit.messageHandlers.h38Native.postMessage({
                    action:'start',
                    requestId:requestId,
                    options:options || {}
                  });
                } catch(error) {
                  delete window.__h38NativePending[requestId];
                  reject(error);
                }
              });
            }
          };
          window.dispatchEvent(new CustomEvent('h38:native-scanner-ready'));
        })();
        """
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == Self.nativeHandler,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else {
            return
        }

        switch action {
        case "officeReady":
            hideLaunchCover()
        case "start":
            guard let requestId = body["requestId"] as? String,
                  let options = body["options"] as? [String: Any] else {
                return
            }
            startNativeScan(requestId: requestId, options: options)
        default:
            break
        }
    }

    private func startNativeScan(requestId: String, options: [String: Any]) {
        let capabilities = scannerBridge.getCapabilities()
        guard capabilities["roomPlan"] as? Bool == true else {
            completeNativeRequest(
                requestId: requestId,
                result: .failure(H38SiteScannerBridge.ScannerError.unsupportedDevice)
            )
            return
        }

        let controller = H38RoomScannerViewController(
            bridge: scannerBridge,
            options: options
        ) { [weak self] result in
            self?.completeNativeRequest(requestId: requestId, result: result)
        }
        present(controller, animated: true)
    }

    private func completeNativeRequest(
        requestId: String,
        result: Result<[String: Any], Error>
    ) {
        let script: String
        switch result {
        case .success(let payload):
            script = "window.__h38NativeComplete((jsonLiteral(requestId)),true,(jsonLiteral(payload)));"
        case .failure(let error):
            script = "window.__h38NativeComplete((jsonLiteral(requestId)),false,(jsonLiteral(error.localizedDescription)));"
        }
        webView.evaluateJavaScript(script)
    }

    private func hideLaunchCover() {
        guard !launchCover.isHidden else { return }
        launchFallback?.cancel()
        UIView.animate(withDuration: 0.18, animations: {
            self.launchCover.alpha = 0
        }, completion: { _ in
            self.launchCover.isHidden = true
        })
    }

    private func jsonLiteral(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value) || value is String else {
            return "null"
        }
        do {
            let data: Data
            if value is String {
                data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
            } else {
                data = try JSONSerialization.data(withJSONObject: value, options: [])
            }
            return String(data: data, encoding: .utf8) ?? "null"
        } catch {
            return "null"
        }
    }

    private func isTrustedH38Host(_ host: String) -> Bool {
        host == "highway38solutions.com" || host.hasSuffix(".highway38solutions.com")
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(isTrustedH38Host(origin.host) ? .grant : .deny)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        launchLabel.text = "H38 Office\n(error.localizedDescription)"
    }
}
