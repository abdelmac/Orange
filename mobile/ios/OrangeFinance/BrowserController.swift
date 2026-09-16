import UIKit
import WebKit

@MainActor
final class BrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private(set) var webView: WKWebView
    var onLogin: (() -> Void)?
    var onPDF: ((URL, UIViewController) -> Void)?
    private let initialPath: String
    private var lastPath: String
    private let offline = UIStackView()
    private let message = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private var urlObservation: NSKeyValueObservation?
    private var notifyLogin = true

    init(title: String, path: String, store: WKWebsiteDataStore) {
        initialPath = path; lastPath = path
        let config = WKWebViewConfiguration()
        config.websiteDataStore = store
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: config)
        super.init(nibName: nil, bundle: nil)
        self.title = title
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        attachWebView()
        message.text = "Connexion indisponible. Vos opérations ne sont jamais mises en attente automatiquement."
        message.numberOfLines = 0; message.textAlignment = .center
        message.font = .preferredFont(forTextStyle: .body); message.adjustsFontForContentSizeCategory = true
        var config = UIButton.Configuration.filled(); config.title = "Réessayer"
        let retry = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.retry() })
        offline.axis = .vertical; offline.spacing = 20; offline.alignment = .fill
        offline.addArrangedSubview(message); offline.addArrangedSubview(retry)
        offline.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(offline)
        NSLayoutConstraint.activate([offline.centerYAnchor.constraint(equalTo: view.centerYAnchor), offline.centerXAnchor.constraint(equalTo: view.centerXAnchor), offline.widthAnchor.constraint(lessThanOrEqualToConstant: 440), offline.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 28), offline.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -28)])
        offline.isHidden = true
        navigationItem.leftBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(back))
        navigationItem.rightBarButtonItems = [UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(retry)), UIBarButtonItem(customView: spinner)]
        load(path: lastPath)
    }

    private func attachWebView() {
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
            Task { @MainActor in
                guard let self, self.notifyLogin, webView.url?.path == "/login" else { return }
                self.onLogin?()
            }
        }
        view.insertSubview(webView, at: 0)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    func load(path: String) {
        guard let url = OriginPolicy.localURL(path) else { return }
        lastPath = path
        notifyLogin = path != "/login"
        if !isViewLoaded { loadViewIfNeeded(); return }
        offline.isHidden = true; webView.isHidden = false; spinner.startAnimating()
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    func resetToLogin() {
        webView.stopLoading()
        // A fresh WKWebView drops all in-memory pages and back/forward snapshots from the previous user.
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = webView.configuration.websiteDataStore
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView.navigationDelegate = nil; webView.uiDelegate = nil; webView.removeFromSuperview()
        urlObservation = nil
        webView = WKWebView(frame: .zero, configuration: configuration)
        if isViewLoaded { attachWebView() }
        load(path: "/login")
    }

    @objc private func retry() { load(path: lastPath) }
    @objc private func back() { if webView.canGoBack { webView.goBack() } }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        guard OriginPolicy.isTrusted(url) else {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated, navigationAction.sourceFrame.isMainFrame, OriginPolicy.isExternalUserLink(url) {
                let alert = UIAlertController(title: "Ouvrir un lien externe ?", message: url.host ?? url.scheme, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Annuler", style: .cancel))
                alert.addAction(UIAlertAction(title: "Ouvrir", style: .default) { _ in UIApplication.shared.open(url) })
                present(alert, animated: true)
            }
            return
        }
        if navigationAction.targetFrame == nil {
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated {
                if OriginPolicy.allowsPDF(url) { onPDF?(url, self) } else { webView.load(navigationAction.request) }
            }
            return
        }
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        if OriginPolicy.allowsPDF(url), navigationAction.navigationType == .linkActivated { decisionHandler(.cancel); onPDF?(url, self); return }
        if navigationAction.targetFrame?.isMainFrame == true, navigationAction.request.httpMethod == "GET" {
            lastPath = url.path + (url.query.map { "?" + $0 } ?? "")
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard OriginPolicy.isTrusted(navigationResponse.response.url) else { decisionHandler(.cancel); return }
        let response = navigationResponse.response as? HTTPURLResponse
        if navigationResponse.response.mimeType == "application/pdf" || response?.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().contains("attachment") == true {
            decisionHandler(.download)
        } else { decisionHandler(navigationResponse.canShowMIMEType ? .allow : .cancel) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating(); offline.isHidden = true; webView.isHidden = false
        if notifyLogin, webView.url?.path == "/login" { onLogin?() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showOffline(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showOffline(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { showOffline(APIError.unavailable) }
    private func showOffline(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        spinner.stopAnimating(); webView.isHidden = true; offline.isHidden = false
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        // Transfer using the bounded streaming downloader. Never trust suggestedFilename,
        // and never let WebKit write an unbounded private response to disk.
        completionHandler(nil)
        if let url = response.url, OriginPolicy.allowsPDF(url) { onPDF?(url, self) }
    }
    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) { decisionHandler(.cancel) }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { /* Deliberate cancellation: native streaming owns the download. */ }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
}
