import XCTest
@testable import OrangeFinance

final class OriginPolicyTests: XCTestCase {
    func testExactHTTPSOriginOnly() {
        XCTAssertTrue(OriginPolicy.isTrusted(URL(string: "https://orange-finance.onrender.com/clients")))
        XCTAssertTrue(OriginPolicy.isTrusted(URL(string: "https://orange-finance.onrender.com:443/")))
        for value in ["http://orange-finance.onrender.com", "https://orange-finance.onrender.com.evil.test", "https://evil.orange-finance.onrender.com", "https://orange-finance.onrender.com:444", "https://user:secret@orange-finance.onrender.com", "file:///private/file", "javascript:alert(1)"] {
            XCTAssertFalse(OriginPolicy.isTrusted(URL(string: value)), value)
        }
    }
    func testStructuredNativeAPIAccessIsAllowlisted() {
        XCTAssertTrue(OriginPolicy.allowsAPI(path: "/api/me", method: "GET"))
        XCTAssertTrue(OriginPolicy.allowsAPI(path: "/api/cash-accounts?limit=100", method: "GET"))
        XCTAssertTrue(OriginPolicy.allowsAPI(path: "/api/quick-entries", method: "POST"))
        XCTAssertFalse(OriginPolicy.allowsAPI(path: "//evil.test/api/me", method: "GET"))
        XCTAssertFalse(OriginPolicy.allowsAPI(path: "/api/users", method: "POST"))
        XCTAssertFalse(OriginPolicy.allowsAPI(path: "/api/quick-entries", method: "DELETE"))
        XCTAssertFalse(OriginPolicy.allowsAPI(path: "/api/me#foreign", method: "GET"))
    }
    func testPrivatePDFURLsAndRedirectDestinations() {
        let id = "10000000-0000-4000-8000-000000000001"
        XCTAssertTrue(OriginPolicy.allowsPDF(OriginPolicy.localURL("/api/transactions/\(id)/receipt")))
        XCTAssertTrue(OriginPolicy.allowsPDF(OriginPolicy.localURL("/api/receipts?entity=payment&id=\(id)")))
        XCTAssertFalse(OriginPolicy.allowsPDF(URL(string: "https://evil.test/api/transactions/\(id)/receipt")))
        XCTAssertFalse(OriginPolicy.allowsPDF(OriginPolicy.localURL("/api/transactions/not-a-uuid/receipt")))
        XCTAssertFalse(OriginPolicy.allowsPDF(OriginPolicy.localURL("/api/receipts?entity=user&id=\(id)")))
    }
    func testNativeDownloadForwardsOnlySecureExactHostSessionCookie() {
        func cookie(_ domain: String, _ name: String, _ secure: Bool = true, path: String = "/") -> HTTPCookie {
            var properties: [HTTPCookiePropertyKey: Any] = [.domain: domain, .path: path, .name: name, .value: "test-cookie"]
            if secure { properties[.secure] = "TRUE" }
            return HTTPCookie(properties: properties)!
        }
        let cookies = [cookie(OriginPolicy.host, "orange_session"), cookie(".onrender.com", "orange_session"), cookie("evil.test", "orange_session"), cookie(OriginPolicy.host, "tracking"), cookie(OriginPolicy.host, "orange_session", false), cookie(OriginPolicy.host, "orange_session", path: "/private")]
        let allowed = OriginPolicy.sessionCookies(cookies)
        XCTAssertEqual(allowed.count, 1)
        XCTAssertEqual(allowed.first?.domain, OriginPolicy.host)
        XCTAssertEqual(allowed.first?.name, "orange_session")
    }
}
