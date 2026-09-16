import Foundation

struct SessionContext: Decodable {
    struct User: Decodable { let id: String; let name: String; let role: String; let cashAccountIds: [String]? }
    struct Company: Decodable { let id: String; let name: String; let currency: String }
    let user: User
    let company: Company
    let permissions: [String]
    func can(_ permission: String) -> Bool { permissions.contains(permission) }
}

struct CashAccount: Decodable {
    let id: String
    let name: String
    let currency: String
    let active: Bool
}
struct CashList: Decodable { let items: [CashAccount] }
struct EntryResult: Decodable { let kind: String; let id: String; let transactionId: String?; let number: String; let status: String }
struct EmptyResult: Decodable { let ok: Bool }

enum APIError: LocalizedError {
    case untrusted, unavailable, invalidResponse, sessionExpired, server(Int, String)
    var errorDescription: String? {
        switch self {
        case .untrusted: return "Adresse non autorisée."
        case .unavailable: return "Ouvrez d’abord l’accueil et connectez-vous. Si le réseau est indisponible, réessayez une fois la connexion rétablie."
        case .invalidResponse: return "Réponse du serveur non reconnue. Vérifiez le journal avant toute nouvelle saisie."
        case .sessionExpired: return "Votre session a expiré. Reconnectez-vous depuis l’accueil."
        case .server(_, let message): return message
        }
    }
}
