import XCTest
@testable import OrangeFinance

final class AmountInputTests: XCTestCase {
    func testFrenchDecimalWithoutFloatingPoint() throws {
        XCTAssertEqual(try AmountInput.normalize("1 250,5"), "1250.50")
        XCTAssertEqual(try AmountInput.normalize("1\u{202F}250,50"), "1250.50")
        XCTAssertEqual(try AmountInput.normalize(" 00012.01 "), "12.01")
        XCTAssertEqual(try AmountInput.normalize("0,01"), "0.01")
        XCTAssertEqual(try AmountInput.normalize("999999999999,99"), "999999999999.99")
    }
    func testRejectsNegativeZeroAmbiguousOrExcessPrecision() {
        for input in ["0", "0,00", "-1", "+1", "1.001", "1,000.00", "1e3", "NaN", "12 34", "1000000000000", "١٠", "1\n20", "1,"] {
            XCTAssertThrowsError(try AmountInput.normalize(input), input)
        }
    }
}
