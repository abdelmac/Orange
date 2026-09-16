import XCTest
import WebKit
@testable import OrangeFinance

@MainActor
final class WebAPIBridgeTests: XCTestCase {
    func testUntrustedRequestFailsBeforeJavaScriptExecution() async {
        let bridge = WebAPIBridge()
        do {
            let _: EmptyResult = try await bridge.request("https://evil.test/api/quick-entries", method: "POST", body: ["partyName": "' + alert(1) + '"])
            XCTFail("Foreign origin accepted")
        } catch APIError.untrusted { } catch { XCTFail("Unexpected error") }
    }
    func testUnloadedPageCannotReceiveFinancialWrite() async {
        let bridge = WebAPIBridge()
        bridge.webView = WKWebView(frame: .zero)
        do {
            let _: EmptyResult = try await bridge.request("/api/quick-entries", method: "POST", body: ["amount": "10.00"])
            XCTFail("Unloaded page accepted")
        } catch APIError.unavailable { } catch { XCTFail("Unexpected error") }
    }
    func testFetchDoesNotExposeCookieOrAuthorizationThroughJavaScript() {
        XCTAssertTrue(WebAPIBridge.script.contains("credentials: 'same-origin'"))
        XCTAssertTrue(WebAPIBridge.script.contains("redirect: 'error'"))
        XCTAssertTrue(WebAPIBridge.script.contains("JSON.stringify(body)"))
        XCTAssertFalse(WebAPIBridge.script.contains("document.cookie"))
        XCTAssertFalse(WebAPIBridge.script.contains("Authorization"))
        XCTAssertFalse(WebAPIBridge.script.contains("localStorage"))
    }
}
