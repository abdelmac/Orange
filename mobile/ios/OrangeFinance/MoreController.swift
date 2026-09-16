import UIKit

@MainActor
final class MoreController: UITableViewController {
    private let bridge: WebAPIBridge
    var openPage: ((String, String) -> Void)?
    var logout: (() -> Void)?
    private var rows: [(String, String)] = []
    private var generation = UUID()
    private let destinations = [
        ("Dépenses et justificatifs", "/depenses", "expenses.view"),
        ("Clients", "/clients", "clients.view"), ("Factures", "/factures", "invoices.view"),
        ("Ventes", "/ventes", "sales.view"), ("Caisses", "/caisse", "cash.view"),
        ("Transactions", "/transactions", "transactions.view"), ("Rapports", "/rapports", "reports.view"),
        ("Utilisateurs", "/utilisateurs", "users.view"), ("Paramètres du compte", "/parametres", "")
    ]
    init(bridge: WebAPIBridge) { self.bridge = bridge; super.init(style: .insetGrouped); title = "Plus" }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "item")
        refreshControl = UIRefreshControl(); refreshControl?.addTarget(self, action: #selector(refresh), for: .valueChanged)
    }
    override func viewWillAppear(_ animated: Bool) { super.viewWillAppear(animated); refresh() }
    @objc private func refresh() {
        let started = generation
        Task {
            defer { refreshControl?.endRefreshing() }
            do {
                let context: SessionContext = try await bridge.request("/api/me")
                guard generation == started else { return }
                rows = destinations.filter { $0.2.isEmpty || context.can($0.2) }.map { ($0.0, $0.1) }
                rows.append(("Déconnexion", "logout"))
                navigationItem.prompt = context.company.name
            } catch { rows = [("Se connecter depuis l’accueil", "login")]; navigationItem.prompt = nil }
            tableView.reloadData()
        }
    }
    func clearSession() { generation = UUID(); rows = [("Se connecter depuis l’accueil", "login")]; navigationItem.prompt = nil; if isViewLoaded { tableView.reloadData() } }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "item", for: indexPath)
        var config = cell.defaultContentConfiguration(); config.text = rows[indexPath.row].0
        config.textProperties.color = rows[indexPath.row].1 == "logout" ? .systemRed : .label
        cell.contentConfiguration = config; cell.accessoryType = .disclosureIndicator
        return cell
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let row = rows[indexPath.row]
        if row.1 == "logout" { logout?() }
        else { openPage?(row.0, row.1 == "login" ? "/login" : row.1) }
    }
}
