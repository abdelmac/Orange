import UIKit
import WebKit

enum PDFError: LocalizedError {
    case invalid, tooLarge, expired, failed
    var errorDescription: String? {
        switch self {
        case .invalid: return "Ce lien ne correspond pas à un document autorisé."
        case .tooLarge: return "Le document dépasse la limite de 20 Mo."
        case .expired: return "Votre session a expiré. Reconnectez-vous."
        case .failed: return "Le téléchargement a échoué. Vérifiez votre connexion puis réessayez."
        }
    }
}

@MainActor
final class PrivatePDFStore {
    static let limit = 20 * 1024 * 1024
    private let directory: URL
    private var transfers: [UUID: PDFTransfer] = [:]
    private var generation = UUID()
    var sessionExpired: (() -> Void)?

    init() {
        directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("OrangePrivatePDFs", isDirectory: true)
        purge()
    }

    func purge() {
        generation = UUID()
        let running = Array(transfers.values)
        transfers.removeAll()
        running.forEach { $0.cancel() }
        // This directory is a fixed, app-private child of Caches, never a remote filename.
        try? FileManager.default.removeItem(at: directory)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
        var folder = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? folder.setResourceValues(values)
    }

    func remove(_ url: URL) {
        guard url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else { return }
        try? FileManager.default.removeItem(at: url)
    }

    func fetch(_ url: URL, cookieStore: WKHTTPCookieStore, completion: @escaping (Result<URL, Error>) -> Void) {
        guard OriginPolicy.allowsPDF(url) else { completion(.failure(PDFError.invalid)); return }
        let started = generation
        cookieStore.getAllCookies { [weak self] cookies in
            Task { @MainActor in
                guard let self, self.generation == started else { return }
                let cookies = OriginPolicy.sessionCookies(cookies)
                guard !cookies.isEmpty else { self.sessionExpired?(); completion(.failure(PDFError.expired)); return }
                var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 40)
                request.httpMethod = "GET"
                request.setValue("application/pdf,image/jpeg,image/png,image/webp", forHTTPHeaderField: "Accept")
                request.setValue(OriginPolicy.origin, forHTTPHeaderField: "Origin")
                request.setValue(HTTPCookie.requestHeaderFields(with: cookies)["Cookie"], forHTTPHeaderField: "Cookie")
                let id = UUID()
                let destination = self.directory.appendingPathComponent(id.uuidString).appendingPathExtension("pdf")
                let transfer = PDFTransfer(request: request, destination: destination) { [weak self] result in
                    Task { @MainActor in
                        guard let self, self.generation == started else { return }
                        self.transfers.removeValue(forKey: id)
                        if case .failure(let error) = result, let pdfError = error as? PDFError, case .expired = pdfError { self.sessionExpired?() }
                        completion(result)
                    }
                }
                self.transfers[id] = transfer
                transfer.start()
            }
        }
    }
}

/// Delegate callbacks are serialized on OperationQueue.main. Nothing is persisted beyond
/// the private PDF file; redirects, cookie writes, credentials and response caching are disabled.
private final class PDFTransfer: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let request: URLRequest
    private var destination: URL
    private let completion: (Result<URL, Error>) -> Void
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var handle: FileHandle?
    private var bytes = 0
    private var prefix = Data()
    private var completed = false
    private var mimeType = "application/pdf"
    private let maxBytes = 20 * 1024 * 1024

    init(request: URLRequest, destination: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        self.request = request; self.destination = destination; self.completion = completion
    }

    func start() {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil; config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForResource = 90
        let session = URLSession(configuration: config, delegate: self, delegateQueue: .main)
        self.session = session
        task = session.dataTask(with: request); task?.resume()
    }
    func cancel() { finish(.failure(PDFError.failed)) }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
        finish(.failure(PDFError.invalid))
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, OriginPolicy.allowsPDF(http.url) else { completionHandler(.cancel); finish(.failure(PDFError.invalid)); return }
        if http.statusCode == 401 { completionHandler(.cancel); finish(.failure(PDFError.expired)); return }
        let mime = response.mimeType?.lowercased() ?? ""
        let extensions = ["application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"]
        guard http.statusCode == 200, let suffix = extensions[mime], mime == "application/pdf" || http.url?.path.hasPrefix("/api/attachments/") == true else { completionHandler(.cancel); finish(.failure(PDFError.invalid)); return }
        mimeType = mime
        destination = destination.deletingPathExtension().appendingPathExtension(suffix)
        guard response.expectedContentLength <= Int64(maxBytes) else { completionHandler(.cancel); finish(.failure(PDFError.tooLarge)); return }
        do {
            guard FileManager.default.createFile(atPath: destination.path, contents: nil, attributes: [.protectionKey: FileProtectionType.complete]) else { throw PDFError.failed }
            handle = try FileHandle(forWritingTo: destination)
            completionHandler(.allow)
        } catch { completionHandler(.cancel); finish(.failure(PDFError.failed)) }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard !completed else { return }
        guard data.count <= maxBytes - bytes else { finish(.failure(PDFError.tooLarge)); return }
        bytes += data.count
        if prefix.count < 12 { prefix.append(data.prefix(12 - prefix.count)) }
        do { try handle?.write(contentsOf: data) } catch { finish(.failure(PDFError.failed)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard !completed else { return }
        guard error == nil, Self.validSignature(prefix, mime: mimeType) else { finish(.failure(PDFError.failed)); return }
        finish(.success(destination))
    }

    private static func validSignature(_ data: Data, mime: String) -> Bool {
        let bytes = [UInt8](data)
        switch mime {
        case "application/pdf": return data.starts(with: Data("%PDF-".utf8))
        case "image/jpeg": return bytes.count >= 3 && Array(bytes.prefix(3)) == [0xff, 0xd8, 0xff]
        case "image/png": return bytes.count >= 8 && Array(bytes.prefix(8)) == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        case "image/webp": return bytes.count >= 12 && data.prefix(4) == Data("RIFF".utf8) && Data(data.dropFirst(8).prefix(4)) == Data("WEBP".utf8)
        default: return false
        }
    }

    private func finish(_ result: Result<URL, Error>) {
        guard !completed else { return }; completed = true
        try? handle?.close(); handle = nil
        task?.cancel(); session?.invalidateAndCancel(); session = nil
        if case .failure = result { try? FileManager.default.removeItem(at: destination) }
        completion(result)
    }
}
