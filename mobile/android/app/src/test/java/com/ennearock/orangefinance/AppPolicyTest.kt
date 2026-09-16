package com.ennearock.orangefinance

import org.junit.Assert.*
import org.junit.Test

class AppPolicyTest {
    private val id = "a78db3ef-b249-4e40-9312-a61de479d650"
    @Test fun trustedOriginIsExact() {
        assertTrue(AppPolicy.isTrusted("${AppPolicy.ORIGIN}/journal"))
        assertTrue(AppPolicy.isTrusted("${AppPolicy.ORIGIN}:443/"))
        listOf("http://orange-finance.onrender.com", "https://orange-finance.onrender.com.evil.test", "https://orange-finance.onrender.com@evil.test", "https://user@orange-finance.onrender.com", "https://orange-finance.onrender.com:444/", "https://orange-finance.onrender.com\\@evil.test", "javascript:alert(1)", "file:///etc/passwd").forEach {
            assertFalse(it, AppPolicy.isTrusted(it))
        }
    }
    @Test fun onlyPrivateDocumentEndpointsCanReadCookies() {
        assertTrue(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/transactions/$id/receipt?inline=1"))
        assertTrue(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/invoices/$id/pdf"))
        assertTrue(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/attachments/$id"))
        assertTrue(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/receipts?entity=payment&id=$id"))
        assertTrue(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/exports?type=transactions&format=pdf&period=month&from=&to="))
        assertFalse(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/exports?type=transactions&format=csv"))
        assertFalse(AppPolicy.isPrivateDocument("${AppPolicy.ORIGIN}/api/exports?type=secrets&format=pdf"))
        listOf("/api/me", "/api/attachments/../../me", "/api/attachments/%2e%2e/me", "/api/attachments/$id?redirect=https://evil.test", "/api/receipts?entity=payment&id=$id&id=$id", "/api/transactions/$id/receipt#bad", "/api/receipts?entity=users&id=$id").forEach {
            assertFalse(it, AppPolicy.isPrivateDocument(AppPolicy.ORIGIN + it))
        }
    }
    @Test fun bridgeHasFiniteReadAndWriteRoutes() {
        assertTrue(AppPolicy.isBridgeRequest("GET", "/api/cash-accounts?page=2&pageSize=250"))
        assertTrue(AppPolicy.isBridgeRequest("POST", "/api/quick-entries"))
        assertFalse(AppPolicy.isBridgeRequest("DELETE", "/api/quick-entries"))
        assertFalse(AppPolicy.isBridgeRequest("POST", "/api/users"))
        assertFalse(AppPolicy.isBridgeRequest("GET", "https://evil.test"))
    }
    @Test fun amountNormalizationIsExact() {
        assertEquals("4000.25", AppPolicy.normalizeAmount("4 000,25"))
        assertEquals("4000.00", AppPolicy.normalizeAmount("4\u202f000"))
        assertEquals("0.01", AppPolicy.normalizeAmount("0,01"))
        assertEquals("999999999999.99", AppPolicy.normalizeAmount("999999999999,99"))
    }
    @Test fun malformedAndOverpreciseAmountsAreRejected() {
        listOf("0", "-1", "1.999", "1e3", "NaN", "1,2,3", "1000000000000", "").forEach {
            try { AppPolicy.normalizeAmount(it); fail("Accepted $it") } catch (_: IllegalArgumentException) { }
        }
    }
    @Test fun externalLaunchBlocksExecutableSchemes() {
        assertEquals("tel", AppPolicy.externalScheme("tel:+33123456789"))
        assertEquals("mailto", AppPolicy.externalScheme("mailto:contact@example.com"))
        listOf("intent://scan", "javascript:alert(1)", "file:///tmp/a.pdf", "http://example.com", "https://u:p@example.com/").forEach {
            assertNull(AppPolicy.externalScheme(it))
        }
    }
}
