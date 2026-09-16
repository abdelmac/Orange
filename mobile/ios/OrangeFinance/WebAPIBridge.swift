import Foundation
import WebKit

@MainActor
final class WebAPIBridge {
    weak var webView: WKWebView?
    var sessionExpired: (() -> Void)?

    // No interpolated user data, injected handlers, persistent token, or native authentication header.
    static let script = """
    if (window.location.origin !== expectedOrigin) throw new Error('Untrusted origin');
    const target = new URL(path, window.location.origin);
    if (target.origin !== expectedOrigin) throw new Error('Untrusted destination');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(target.href, {
        method, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', ...(method === 'POST' ? {'Content-Type':'application/json'} : {}) },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}), signal: controller.signal
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let size = 0, text = '';
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1048576) { await reader.cancel(); throw new Error('Response too large'); }
        text += decoder.decode(chunk.value, {stream:true});
      }
      text += decoder.decode();
      return {status:response.status, data:JSON.parse(text)};
    } finally { clearTimeout(timer); }
    """

    func request<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> T {
        guard OriginPolicy.allowsAPI(path: path, method: method) else { throw APIError.untrusted }
        guard let webView, OriginPolicy.isTrusted(webView.url), !webView.isLoading else { throw APIError.unavailable }
        let value: Any
        do {
            value = try await webView.callAsyncJavaScript(Self.script,
                arguments: ["path": path, "method": method, "body": body.map { $0 as Any } ?? NSNull(), "expectedOrigin": OriginPolicy.origin],
                in: nil, contentWorld: .page)
        } catch { throw APIError.unavailable }
        // A response from a destroyed page belongs to an earlier session. In particular,
        // its late 401 must never sign out a user who has since connected in a new WebView.
        guard self.webView === webView, OriginPolicy.isTrusted(webView.url) else { throw APIError.unavailable }
        guard let result = value as? [String: Any], let status = result["status"] as? Int, let data = result["data"] else { throw APIError.invalidResponse }
        if status == 401 { sessionExpired?(); throw APIError.sessionExpired }
        guard (200..<300).contains(status) else {
            let message = (data as? [String: Any])?["error"] as? String ?? "Opération refusée par le serveur."
            throw APIError.server(status, String(message.prefix(1200)))
        }
        do { return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: data)) }
        catch { throw APIError.invalidResponse }
    }
}
