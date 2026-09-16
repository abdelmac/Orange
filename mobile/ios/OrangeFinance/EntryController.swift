import UIKit

@MainActor
final class EntryController: UIViewController {
    private let bridge: WebAPIBridge
    var onPDF: ((URL, UIViewController) -> Void)?
    var onRecord: ((String) -> Void)?
    private let stack = UIStackView()
    private let status = UILabel()
    private let amount = UITextField(), nameField = UITextField(), phone = UITextField(), memo = UITextField(), reference = UITextField()
    private let kindButton = UIButton(type: .system), methodButton = UIButton(type: .system), accountButton = UIButton(type: .system)
    private let submit = UIButton(type: .system), receipt = UIButton(type: .system), fresh = UIButton(type: .system)
    private let attachment = UIButton(type: .system)
    private var context: SessionContext?
    private var accounts: [CashAccount] = []
    private var accountID: String?
    private var kind = "CLIENT", method = "CASH"
    private var key = UUID().uuidString
    private var pending: [String: Any]?
    private var result: EntryResult?
    private var busy = false
    private var generation = UUID()
    var hasActiveWrite: Bool { busy && pending != nil }
    var hasUncertainWrite: Bool { pending != nil && result == nil }
    private let kinds = [("CLIENT", "Client"), ("DRIVER", "Chauffeur"), ("SALESPERSON", "Commercial"), ("EMPLOYEE", "Employé"), ("SUPPLIER", "Fournisseur"), ("OTHER", "Autre")]
    private let methods = [("CASH", "Espèces"), ("CARD", "Carte"), ("TRANSFER", "Virement"), ("CHECK", "Chèque"), ("OTHER", "Autre")]

    init(bridge: WebAPIBridge) { self.bridge = bridge; super.init(nibName: nil, bundle: nil); title = "Encaisser" }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        let scroll = UIScrollView(); scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(scroll)
        stack.axis = .vertical; stack.spacing = 15; stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor), scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 22), stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -26),
            stack.centerXAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerXAnchor), stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40)
        ])
        let intro = UILabel(); intro.text = "Entrée d’argent"; intro.font = .preferredFont(forTextStyle: .largeTitle); intro.adjustsFontForContentSizeCategory = true
        stack.addArrangedSubview(intro)
        status.numberOfLines = 0; status.font = .preferredFont(forTextStyle: .body); status.adjustsFontForContentSizeCategory = true
        stack.addArrangedSubview(status)
        addField(amount, title: "Montant", placeholder: "0,00", keyboard: .decimalPad)
        addField(nameField, title: "Nom du payeur", placeholder: "Personne ou entreprise")
        addMenu(kindButton, title: "Qualité du payeur")
        addField(phone, title: "Téléphone (facultatif)", placeholder: "+33…", keyboard: .phonePad)
        addField(memo, title: "Motif", placeholder: "À quoi correspond ce versement ?")
        addMenu(methodButton, title: "Mode de paiement")
        addMenu(accountButton, title: "Destination")
        addField(reference, title: "Référence (facultatif)", placeholder: "Numéro de chèque, tournée…")
        configure(submit, title: "Enregistrer l’encaissement", prominent: true)
        submit.addTarget(self, action: #selector(confirm), for: .touchUpInside)
        configure(receipt, title: "Partager ou imprimer le reçu", prominent: false)
        receipt.addTarget(self, action: #selector(openReceipt), for: .touchUpInside); receipt.isHidden = true
        configure(attachment, title: "Photographier / joindre un justificatif", prominent: false)
        attachment.addTarget(self, action: #selector(openRecord), for: .touchUpInside); attachment.isHidden = true
        configure(fresh, title: "Nouvelle saisie", prominent: false)
        fresh.addTarget(self, action: #selector(newEntry), for: .touchUpInside); fresh.isHidden = true
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(refresh))
        buildMenus(); refresh()
    }
    override func viewWillAppear(_ animated: Bool) { super.viewWillAppear(animated); if pending == nil && !busy { refresh() } }

    private var fields: [UIControl] { [amount, nameField, phone, memo, reference, kindButton, methodButton, accountButton] }
    private func addField(_ field: UITextField, title: String, placeholder: String, keyboard: UIKeyboardType = .default) {
        field.placeholder = placeholder; field.borderStyle = .roundedRect; field.keyboardType = keyboard
        field.font = .preferredFont(forTextStyle: .body); field.adjustsFontForContentSizeCategory = true
        field.autocorrectionType = .no
        field.accessibilityLabel = title
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 46).isActive = true
        let toolbar = UIToolbar(); toolbar.sizeToFit(); toolbar.items = [UIBarButtonItem(systemItem: .flexibleSpace), UIBarButtonItem(title: "Terminé", style: .done, target: self, action: #selector(endEditing))]
        field.inputAccessoryView = toolbar
        label(title); stack.addArrangedSubview(field)
    }
    private func label(_ title: String) { let label = UILabel(); label.text = title; label.font = .preferredFont(forTextStyle: .subheadline); label.adjustsFontForContentSizeCategory = true; stack.addArrangedSubview(label) }
    private func addMenu(_ button: UIButton, title: String) { label(title); configure(button, title: title, prominent: false); button.showsMenuAsPrimaryAction = true; button.accessibilityLabel = title }
    private func configure(_ button: UIButton, title: String, prominent: Bool) {
        var config = prominent ? UIButton.Configuration.filled() : UIButton.Configuration.tinted()
        config.title = title; config.cornerStyle = .medium; config.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 14, bottom: 13, trailing: 14)
        button.configuration = config; stack.addArrangedSubview(button)
    }
    @objc private func endEditing() { view.endEditing(true) }
    private func buildMenus() {
        kindButton.setTitle(kinds.first { $0.0 == kind }?.1, for: .normal)
        kindButton.menu = UIMenu(children: kinds.map { item in UIAction(title: item.1, state: kind == item.0 ? .on : .off) { [weak self] _ in self?.kind = item.0; self?.buildMenus() } })
        methodButton.setTitle(methods.first { $0.0 == method }?.1, for: .normal)
        methodButton.menu = UIMenu(children: methods.map { item in UIAction(title: item.1, state: method == item.0 ? .on : .off) { [weak self] _ in self?.method = item.0; self?.buildMenus() } })
        if context?.user.role == "SALESPERSON" {
            accountButton.setTitle("Mon portefeuille commercial", for: .normal); accountButton.menu = nil
        } else {
            accountButton.setTitle(accounts.first { $0.id == accountID }?.name ?? "Choisir une caisse", for: .normal)
            accountButton.menu = UIMenu(children: accounts.map { item in UIAction(title: item.name, state: accountID == item.id ? .on : .off) { [weak self] _ in self?.accountID = item.id; self?.buildMenus() } })
        }
    }

    @objc private func refresh() {
        guard !busy else { return }; busy = true; submit.isEnabled = false
        let started = generation
        Task {
            defer { if generation == started { busy = false } }
            do {
                let current: SessionContext = try await bridge.request("/api/me")
                guard generation == started else { return }
                if let context, context.user.id != current.user.id || context.company.id != current.company.id { clearSession(); return }
                context = current
                if current.user.role == "SALESPERSON" {
                    guard current.can("payments.create") else { throw APIError.server(403, "Votre rôle ne permet pas d’encaisser dans votre portefeuille.") }
                    accounts = []
                } else {
                    guard current.can("cash.deposit"), current.can("cash.view") else { throw APIError.server(403, "Votre rôle ne permet pas l’encaissement. Vos autres fonctions restent disponibles dans l’accueil.") }
                    var all: [CashAccount] = []; var page = 1
                    while true {
                        let list: CashList = try await bridge.request("/api/cash-accounts?pageSize=250&page=\(page)")
                        guard generation == started else { return }
                        all.append(contentsOf: list.items)
                        if list.items.count < 250 { break }
                        guard all.count <= 10000 else { throw APIError.server(400, "La liste des caisses est trop volumineuse. Utilisez la recherche dans l’accueil.") }
                        page += 1
                    }
                    accounts = all.filter { $0.active && $0.currency == current.company.currency && (current.user.role != "CASHIER" || (current.user.cashAccountIds ?? []).contains($0.id)) }
                    if !accounts.contains(where: { $0.id == accountID }) { accountID = accounts.first?.id }
                    guard !accounts.isEmpty else { throw APIError.server(403, "Aucune caisse active autorisée n’est disponible dans la devise de l’entreprise.") }
                }
                buildMenus()
                if pending == nil { status.text = "\(current.company.name) · \(current.company.currency)\nEnregistrement immédiat dans le registre de l’entreprise." }
                submit.isEnabled = result == nil
            } catch { if generation == started { status.text = error.localizedDescription; submit.isEnabled = pending != nil && result == nil } }
        }
    }

    private func payload() throws -> [String: Any] {
        guard let context else { throw APIError.unavailable }
        let cleanName = (nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMemo = (memo.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhone = (phone.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanReference = (reference.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...200).contains(cleanName.count), (3...5000).contains(cleanMemo.count), cleanPhone.count <= 60, cleanReference.count <= 300 else { throw APIError.server(400, "Indiquez le payeur et un motif d’au moins 3 caractères. Vérifiez la longueur du téléphone et de la référence.") }
        let normalized: String
        do { normalized = try AmountInput.normalize(amount.text ?? "") } catch { throw APIError.server(400, "Saisissez un montant positif, avec au plus deux décimales, par exemple 1 250,50.") }
        var body: [String: Any] = ["direction": "IN", "amount": normalized, "partyName": cleanName, "partyKind": kind, "description": cleanMemo, "method": method, "idempotencyKey": key]
        if !cleanPhone.isEmpty { body["phone"] = cleanPhone }; if !cleanReference.isEmpty { body["reference"] = cleanReference }
        if context.user.role == "SALESPERSON" { body["salespersonId"] = context.user.id }
        else if let accountID { body["cashAccountId"] = accountID }
        else { throw APIError.server(400, "Choisissez une caisse autorisée.") }
        return body
    }

    @objc private func confirm() {
        guard !busy, result == nil else { return }; endEditing()
        do {
            let body = try pending ?? payload()
            let alert = UIAlertController(title: "Confirmer l’encaissement", message: "\(body["amount"] as? String ?? "") \(context?.company.currency ?? "") reçus de \(body["partyName"] as? String ?? "").", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Annuler", style: .cancel))
            alert.addAction(UIAlertAction(title: pending == nil ? "Enregistrer" : "Réessayer la même opération", style: .default) { [weak self] _ in self?.send(body) })
            present(alert, animated: true)
        } catch { status.text = error.localizedDescription }
    }
    private func send(_ body: [String: Any]) {
        guard !busy, let original = context else { return }
        busy = true; pending = body; fields.forEach { $0.isEnabled = false }; submit.isEnabled = false; fresh.isHidden = false
        status.text = "Enregistrement en cours…"; let started = generation
        Task {
            defer { if generation == started { busy = false } }
            do {
                let current: SessionContext = try await bridge.request("/api/me")
                guard generation == started else { return }
                guard current.user.id == original.user.id, current.company.id == original.company.id else { clearSession(); throw APIError.sessionExpired }
                let saved: EntryResult = try await bridge.request("/api/quick-entries", method: "POST", body: body)
                guard generation == started else { return }
                result = saved
                status.text = saved.status == "REVERSED" ? "\(saved.number) a été annulée. Consultez le journal." : "Encaissement enregistré : \(saved.number)."
                receipt.isHidden = saved.transactionId == nil; attachment.isHidden = saved.transactionId == nil || !current.can("attachments.create"); submit.isEnabled = false
                UIAccessibility.post(notification: .announcement, argument: status.text)
            } catch {
                guard generation == started else { return }
                status.text = error.localizedDescription + "\nEn cas de doute, consultez le journal. Réessayer conserve la même clé et les mêmes données pour éviter un doublon."
                submit.setTitle("Réessayer la même opération", for: .normal); submit.isEnabled = true
            }
        }
    }
    @objc private func openReceipt() {
        guard let id = result?.transactionId, UUID(uuidString: id) != nil, let url = OriginPolicy.localURL("/api/transactions/\(id)/receipt") else { return }
        onPDF?(url, self)
    }
    @objc private func openRecord() {
        guard let id = result?.transactionId, UUID(uuidString: id) != nil else { return }
        onRecord?("/transactions?detail=\(id)")
    }
    @objc private func newEntry() {
        guard !busy else { return }
        if pending != nil && result == nil {
            let alert = UIAlertController(title: "Abandonner cette tentative ?", message: "L’opération a peut-être été enregistrée. Vérifiez le journal avant de commencer une nouvelle saisie avec une nouvelle clé.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Conserver pour réessayer", style: .cancel))
            alert.addAction(UIAlertAction(title: "Nouvelle saisie", style: .destructive) { [weak self] _ in self?.resetDraft() })
            present(alert, animated: true)
        } else { resetDraft() }
    }
    private func resetDraft() {
        generation = UUID(); busy = false; key = UUID().uuidString; pending = nil; result = nil
        [amount, nameField, phone, memo, reference].forEach { $0.text = "" }
        fields.forEach { $0.isEnabled = true }; receipt.isHidden = true; attachment.isHidden = true; fresh.isHidden = true
        submit.setTitle("Enregistrer l’encaissement", for: .normal); refresh()
    }
    func clearSession() {
        generation = UUID(); context = nil; pending = nil; result = nil; key = UUID().uuidString; busy = false
        [amount, nameField, phone, memo, reference].forEach { $0.text = "" }
        accounts = []; accountID = nil; receipt.isHidden = true; attachment.isHidden = true; fresh.isHidden = true; submit.isEnabled = false
        fields.forEach { $0.isEnabled = true }; status.text = "Connectez-vous depuis l’accueil pour enregistrer un encaissement."
    }
}
