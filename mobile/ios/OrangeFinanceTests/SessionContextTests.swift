import XCTest
@testable import OrangeFinance

final class SessionContextTests: XCTestCase {
    func testPersonalSessionDecodesWithoutCompany() throws {
        let json = """
        {"user":{"id":"10000000-0000-4000-8000-000000000001","name":"Camille","role":"PERSONAL","usageType":"PERSONAL","personalCurrency":"EUR","cashAccountIds":[]},"company":null,"workspace":"PERSONAL","permissions":[]}
        """
        let session = try JSONDecoder().decode(SessionContext.self, from: Data(json.utf8))
        XCTAssertNil(session.company)
        XCTAssertTrue(session.isPersonal)
        XCTAssertEqual(session.user.personalCurrency, "EUR")
        XCTAssertFalse(session.can("cash.deposit"))
    }

    func testBusinessSessionRemainsCompatibleWithPreviousServerResponse() throws {
        let json = """
        {"user":{"id":"10000000-0000-4000-8000-000000000001","name":"Camille","role":"ADMIN"},"company":{"id":"20000000-0000-4000-8000-000000000001","name":"Entreprise","currency":"EUR"},"permissions":["cash.deposit"]}
        """
        let session = try JSONDecoder().decode(SessionContext.self, from: Data(json.utf8))
        XCTAssertFalse(session.isPersonal)
        XCTAssertEqual(session.company?.currency, "EUR")
        XCTAssertTrue(session.can("cash.deposit"))
    }
}
