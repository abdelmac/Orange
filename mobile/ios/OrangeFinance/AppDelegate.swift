import UIKit

@main
@MainActor
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var coordinator: AppCoordinator?
    private var privacyCover: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let coordinator = AppCoordinator(); self.coordinator = coordinator
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = coordinator.tabs; window.makeKeyAndVisible(); self.window = window
        return true
    }
    func applicationWillResignActive(_ application: UIApplication) {
        guard let window, privacyCover == nil else { return }
        let cover = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        cover.frame = window.bounds; cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.contentView.backgroundColor = .systemBackground
        let label = UILabel(); label.text = "Orange Finance"; label.font = .preferredFont(forTextStyle: .title1)
        label.textColor = .secondaryLabel; label.translatesAutoresizingMaskIntoConstraints = false
        cover.contentView.addSubview(label)
        NSLayoutConstraint.activate([label.centerXAnchor.constraint(equalTo: cover.contentView.centerXAnchor), label.centerYAnchor.constraint(equalTo: cover.contentView.centerYAnchor)])
        window.addSubview(cover); privacyCover = cover
    }
    func applicationDidBecomeActive(_ application: UIApplication) {
        privacyCover?.removeFromSuperview(); privacyCover = nil; coordinator?.verifySession()
    }
}
