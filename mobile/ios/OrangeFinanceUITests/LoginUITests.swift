import XCTest

final class LoginUITests: XCTestCase {
    @MainActor
    func testLiveLoginFormBecomesReadyWithoutAuthentication() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        // This is the real remote login inside WKWebView, with no fixture,
        // injected JavaScript, credentials, submission, or financial write.
        // A fresh CI simulator must have no previously authenticated session.
        let webView = app.webViews.firstMatch
        let email = webView.textFields.firstMatch
        let password = webView.secureTextFields.firstMatch
        let signIn = webView.buttons.matching(identifier: "Se connecter").firstMatch
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in
                webView.exists && email.exists && password.exists
                    && signIn.exists && signIn.isEnabled
            },
            object: nil
        )

        // One shared deadline allows a cold server/WebKit process to start;
        // the enabled button also verifies that client hydration has finished.
        let result = XCTWaiter.wait(for: [ready], timeout: 120)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = result == .completed ? "Connexion prête" : "Connexion non prête après 120 secondes"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        XCTAssertEqual(result, .completed,
                       "La WebView doit afficher les champs email/mot de passe et un bouton Se connecter actif sous 120 secondes.")
    }
}
