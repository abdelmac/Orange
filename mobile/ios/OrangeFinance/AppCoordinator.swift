import UIKit
import WebKit

@MainActor
final class AppCoordinator: NSObject, WKHTTPCookieStoreObserver, UITabBarControllerDelegate {
    let tabs = UITabBarController()
    private let dataStore = WKWebsiteDataStore.default()
    private let bridge = WebAPIBridge()
    private let pdfs = PrivatePDFStore()
    private lazy var home = browser(title: "Accueil", path: "/")
    private lazy var journal = browser(title: "Journal", path: "/journal")
    private lazy var entry = EntryController(bridge: bridge)
    private lazy var more = MoreController(bridge: bridge)
    private var auxiliary: [BrowserController] = []
    private var sessionCookie: String?
    private var clearing = false
    private var privateGeneration = UUID()

    override init() {
        super.init()
        tabs.delegate = self
        tabs.view.tintColor = UIColor(red: 0.91, green: 0.31, blue: 0.09, alpha: 1)
        let controllers: [(UIViewController, String, String)] = [(home, "Accueil", "house"), (entry, "Encaisser", "plus.circle.fill"), (journal, "Journal", "list.bullet.rectangle"), (more, "Plus", "ellipsis.circle")]
        tabs.viewControllers = controllers.enumerated().map { index, item in
            let nav = UINavigationController(rootViewController: item.0)
            nav.tabBarItem = UITabBarItem(title: item.1, image: UIImage(systemName: item.2), tag: index)
            return nav
        }
        home.loadViewIfNeeded(); bridge.webView = home.webView
        bridge.sessionExpired = { [weak self] in self?.sessionLost() }
        pdfs.sessionExpired = { [weak self] in self?.sessionLost() }
        entry.onPDF = { [weak self] url, presenter in self?.downloadPDF(url, from: presenter) }
        entry.onRecord = { [weak self] path in self?.openPage("Justificatif", path: path) }
        more.openPage = { [weak self] title, path in self?.openPage(title, path: path) }
        more.logout = { [weak self] in self?.confirmLogout() }
        dataStore.httpCookieStore.add(self)
        cookiesDidChange(in: dataStore.httpCookieStore)
    }

    private func browser(title: String, path: String) -> BrowserController {
        let page = BrowserController(title: title, path: path, store: dataStore)
        page.onLogin = { [weak self] in if self?.sessionCookie != nil { self?.sessionLost() } else { self?.pdfs.purge() } }
        page.onPDF = { [weak self] url, presenter in self?.downloadPDF(url, from: presenter) }
        return page
    }

    private func openPage(_ title: String, path: String) {
        guard OriginPolicy.localURL(path) != nil else { return }
        let page = browser(title: title, path: path); auxiliary.append(page)
        tabs.selectedIndex = 3
        (tabs.viewControllers?[3] as? UINavigationController)?.pushViewController(page, animated: true)
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        cookieStore.getAllCookies { [weak self] cookies in
            Task { @MainActor in
                guard let self, !self.clearing else { return }
                let token = OriginPolicy.sessionCookies(cookies).first?.value
                guard token != self.sessionCookie else { return }
                let hadSession = self.sessionCookie != nil
                self.sessionCookie = token
                self.pdfs.purge(); self.privateGeneration = UUID()
                self.entry.clearSession(); self.more.clearSession()
                if token == nil { if hadSession { self.sessionLost() }; return }
                // All old private pages are discarded when the signed-in identity changes.
                if hadSession { self.resetPrivateViews() }
                self.home.load(path: "/"); self.journal.load(path: "/journal")
            }
        }
    }

    func verifySession() {
        guard sessionCookie != nil, !home.webView.isLoading else { return }
        Task { let _: SessionContext? = try? await bridge.request("/api/me") }
    }
    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) { verifySession() }

    private func resetPrivateViews() {
        tabs.dismiss(animated: false)
        UIPrintInteractionController.shared.dismiss(animated: false)
        entry.clearSession(); more.clearSession()
        for page in auxiliary { page.webView.stopLoading(); page.webView.removeFromSuperview() }
        auxiliary.removeAll()
        (tabs.viewControllers?[3] as? UINavigationController)?.popToRootViewController(animated: false)
        home.resetToLogin(); journal.resetToLogin(); bridge.webView = home.webView
    }

    private func sessionLost() {
        guard !clearing else { return }; clearing = true
        sessionCookie = nil; privateGeneration = UUID(); pdfs.purge()
        resetPrivateViews(); tabs.selectedIndex = 0
        dataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            Task { @MainActor in
                guard let self else { return }; self.clearing = false
                self.home.load(path: "/login")
            }
        }
    }

    private func confirmLogout() {
        if entry.hasActiveWrite {
            let wait = UIAlertController(title: "Encaissement en cours", message: "Attendez la réponse avant de vous déconnecter.", preferredStyle: .alert)
            wait.addAction(UIAlertAction(title: "Fermer", style: .cancel)); more.present(wait, animated: true); return
        }
        let message = entry.hasUncertainWrite ? "Une tentative d’encaissement n’a pas reçu de confirmation. Vérifiez le journal avant de vous déconnecter : la clé de reprise sera effacée." : "Les reçus privés et les données affichées sur cet appareil seront effacés."
        let alert = UIAlertController(title: "Se déconnecter ?", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        alert.addAction(UIAlertAction(title: "Déconnexion", style: .destructive) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                let _: EmptyResult? = try? await self.bridge.request("/api/auth/logout", method: "POST", body: [:])
                self.sessionLost()
            }
        })
        more.present(alert, animated: true)
    }

    private func downloadPDF(_ url: URL, from presenter: UIViewController) {
        let started = privateGeneration
        pdfs.fetch(url, cookieStore: dataStore.httpCookieStore) { [weak self, weak presenter] result in
            guard let self, let presenter, self.privateGeneration == started else { return }
            switch result {
            case .failure(let error):
                let alert = UIAlertController(title: "Reçu indisponible", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "Fermer", style: .cancel)); presenter.present(alert, animated: true)
            case .success(let file): self.presentPDF(file, from: presenter)
            }
        }
    }

    private func presentPDF(_ file: URL, from presenter: UIViewController) {
        let alert = UIAlertController(title: "Document privé", message: "Choisissez une action. Le fichier reste privé dans l’application jusqu’au partage demandé.", preferredStyle: .actionSheet)
        alert.addAction(UIAlertAction(title: "Partager / enregistrer", style: .default) { [weak self, weak presenter] _ in
            guard let self, let presenter else { return }
            let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            share.completionWithItemsHandler = { [weak self] _, _, _, _ in self?.pdfs.remove(file) }
            share.popoverPresentationController?.sourceView = presenter.view
            share.popoverPresentationController?.sourceRect = self.anchor(in: presenter)
            presenter.present(share, animated: true)
        })
        if UIPrintInteractionController.canPrint(file) { alert.addAction(UIAlertAction(title: "Imprimer", style: .default) { [weak self, weak presenter] _ in
            guard let self, let presenter else { return }
            let printController = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil); info.jobName = "Reçu Orange Finance"; info.outputType = .general
            printController.printInfo = info; printController.printingItem = file
            let completion: (UIPrintInteractionController, Bool, Error?) -> Void = { [weak self] _, _, _ in self?.pdfs.remove(file) }
            if UIDevice.current.userInterfaceIdiom == .pad { printController.present(from: self.anchor(in: presenter), in: presenter.view, animated: true, completionHandler: completion) }
            else { printController.present(animated: true, completionHandler: completion) }
        }) }
        alert.addAction(UIAlertAction(title: "Fermer", style: .cancel) { [weak self] _ in self?.pdfs.remove(file) })
        alert.popoverPresentationController?.sourceView = presenter.view
        alert.popoverPresentationController?.sourceRect = anchor(in: presenter)
        presenter.present(alert, animated: true)
    }
    private func anchor(in presenter: UIViewController) -> CGRect { CGRect(x: presenter.view.bounds.midX, y: presenter.view.safeAreaLayoutGuide.layoutFrame.maxY - 1, width: 1, height: 1) }
}
