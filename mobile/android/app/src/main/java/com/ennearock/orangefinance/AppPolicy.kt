package com.ennearock.orangefinance

import java.net.URI
import java.math.BigDecimal

/** Pure policy shared by navigation, transport and downloads. No suffix-host matching. */
object AppPolicy {
    const val ORIGIN = "https://orange-finance.onrender.com"
    const val MAX_DOCUMENT_BYTES = 20L * 1024 * 1024
    private val uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    private val documentPath = Regex("/api/(transactions/$uuid/receipt|invoices/$uuid/pdf|attachments/$uuid)")

    private fun parse(value: String): URI? = try {
        if (value.any { it <= ' ' || it == '\\' }) null else URI(value)
    } catch (_: Exception) { null }

    fun isTrusted(value: String): Boolean {
        val uri = parse(value) ?: return false
        return uri.scheme == "https" && uri.host == "orange-finance.onrender.com" &&
            uri.rawUserInfo == null && (uri.port == -1 || uri.port == 443)
    }

    fun isPrivateDocument(value: String): Boolean {
        if (!isTrusted(value)) return false
        val uri = parse(value) ?: return false
        if (uri.rawPath != uri.path || uri.fragment != null) return false
        val pairs = uri.rawQuery?.split("&")?.map { it.split("=", limit = 2) } ?: emptyList()
        if (pairs.any { it.size != 2 }) return false
        val query = pairs.associate { it[0] to it[1] }
        if (query.size != pairs.size) return false
        if (documentPath.matches(uri.path)) return query.keys.all { it == "inline" } &&
            (query["inline"] == null || query["inline"] == "1")
        if (uri.path == "/api/exports") return query["format"] == "pdf" &&
            query["type"] in setOf("transactions", "sales", "invoices", "unpaid", "receivables", "expenses", "payables", "clients", "suppliers", "salespeople", "cash-accounts", "cash", "payments", "users", "audit", "roles") &&
            query.keys.all { it in setOf("format", "type", "period", "from", "to") } &&
            (query["period"] == null || query["period"] in setOf("today", "7d", "30d", "month", "last-month", "year", "custom")) &&
            listOf("from", "to").all { query[it].isNullOrEmpty() || query[it]!!.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")) }
        return uri.path == "/api/receipts" && query.keys.all { it in setOf("entity", "id", "inline") } &&
            query["entity"] in setOf("payment", "expense", "transaction") &&
            query["id"]?.matches(Regex(uuid)) == true &&
            (query["inline"] == null || query["inline"] == "1")
    }

    fun externalScheme(value: String): String? {
        val uri = parse(value) ?: return null
        return when (uri.scheme) {
            "https" -> if (!uri.host.isNullOrBlank() && uri.rawUserInfo == null) "https" else null
            "tel", "mailto" -> if (!uri.rawSchemeSpecificPart.isNullOrBlank()) uri.scheme else null
            else -> null
        }
    }

    fun isBridgeRequest(method: String, path: String): Boolean = when (method) {
        "GET" -> path == "/api/me" || path.matches(Regex("/api/cash-accounts\\?page=[1-9][0-9]{0,4}&pageSize=250"))
        "POST" -> path == "/api/quick-entries" || path == "/api/auth/logout"
        else -> false
    }

    /** Decimal input remains exact and is serialized as a decimal string. */
    fun normalizeAmount(input: String): String {
        val normalized = input.replace(Regex("[\\s\\u00a0\\u202f]"), "").replace(',', '.')
        require(normalized.matches(Regex("[0-9]{1,12}(\\.[0-9]{1,2})?"))) {
            "Saisissez un montant avec deux décimales au maximum."
        }
        val amount = BigDecimal(normalized)
        require(amount.signum() > 0) { "Le montant doit être supérieur à zéro." }
        return amount.setScale(2).toPlainString()
    }
}
