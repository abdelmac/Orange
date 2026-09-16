import Foundation

enum OriginPolicy {
    static let origin = "https://orange-finance.onrender.com"
    static let host = "orange-finance.onrender.com"
    static let baseURL = URL(string: origin)!

    static func isTrusted(_ url: URL?) -> Bool {
        guard let url, let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return parts.scheme?.lowercased() == "https" && parts.host?.lowercased() == host
            && (parts.port == nil || parts.port == 443) && parts.user == nil && parts.password == nil
    }

    static func localURL(_ path: String) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"),
              !path.unicodeScalars.contains(where: { $0.value < 32 }),
              let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
              isTrusted(url) else { return nil }
        return url
    }

    static func allowsAPI(path: String, method: String) -> Bool {
        guard let url = localURL(path), url.fragment == nil else { return false }
        if method == "GET" { return ["/api/me", "/api/cash-accounts"].contains(url.path) }
        return method == "POST" && url.query == nil && ["/api/quick-entries", "/api/auth/logout"].contains(url.path)
    }

    static func allowsPDF(_ url: URL?) -> Bool {
        guard let url, isTrusted(url), url.fragment == nil else { return false }
        let path = url.path.split(separator: "/").map(String.init)
        if path.count == 4 && path[0] == "api" && UUID(uuidString: path[2]) != nil {
            return (path[1] == "transactions" && path[3] == "receipt") || (path[1] == "invoices" && path[3] == "pdf")
        }
        if path.count == 3 && path[0] == "api" && path[1] == "attachments" { return UUID(uuidString: path[2]) != nil }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if url.path == "/api/receipts" {
            return query.contains { $0.name == "entity" && ["transaction", "payment", "expense"].contains($0.value ?? "") }
                && query.contains { $0.name == "id" && UUID(uuidString: $0.value ?? "") != nil }
        }
        return url.path == "/api/exports" && query.contains { $0.name == "format" && $0.value == "pdf" }
    }

    static func isExternalUserLink(_ url: URL) -> Bool {
        ["https", "http", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") && !isTrusted(url)
    }

    static func sessionCookies(_ cookies: [HTTPCookie]) -> [HTTPCookie] {
        cookies.filter {
            $0.name == "orange_session" && [$0.domain.lowercased(), String($0.domain.dropFirst()).lowercased()].contains(host)
                && ($0.domain.lowercased() == host || $0.domain.lowercased() == "." + host)
                && $0.path == "/" && $0.isSecure && ($0.expiresDate == nil || $0.expiresDate! > Date())
        }
    }
}

enum AmountInput {
    enum Invalid: Error { case amount }

    /// String-only decimal normalization, matching the server's 12+2 digit limit.
    static func normalize(_ raw: String) throws -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let value = trimmed.replacingOccurrences(of: "\u{202F}", with: " ").replacingOccurrences(of: "\u{00A0}", with: " ")
        let pattern = "^(?:[0-9]{1,12}|[0-9]{1,3}(?: [0-9]{3}){1,3})(?:[,.][0-9]{1,2})?$"
        guard value.range(of: pattern, options: .regularExpression) != nil else { throw Invalid.amount }
        let clean = value.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ",", with: ".")
        let pieces = clean.split(separator: ".", omittingEmptySubsequences: false)
        let whole = String(pieces[0].drop(while: { $0 == "0" }))
        let cents = pieces.count == 2 ? String(pieces[1]).padding(toLength: 2, withPad: "0", startingAt: 0) : "00"
        guard whole.count <= 12, !whole.isEmpty || cents != "00" else { throw Invalid.amount }
        return (whole.isEmpty ? "0" : whole) + "." + cents
    }
}
