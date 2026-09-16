package com.ennearock.orangefinance

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.WebMessageCompat
import org.json.JSONObject
import java.util.UUID

data class ApiResponse(val status: Int, val body: String) {
    fun json(): JSONObject = try { JSONObject(body) } catch (_: Exception) { JSONObject() }
    fun error(): String = json().optString("error", "La demande n’a pas abouti. Vous pouvez réessayer.")
    val successful: Boolean get() = status in 200..299
}

/** A response-only bridge. Web content cannot select a native operation or URL. */
class TrustedWebBridge(private val webView: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private val pending = mutableMapOf<String, (ApiResponse) -> Unit>()
    val available = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)

    init {
        if (available) {
            WebViewCompat.addWebMessageListener(webView, "OrangeNativeResponse", setOf(AppPolicy.ORIGIN)) {
                    _, message, sourceOrigin, isMainFrame, _ ->
                if (isMainFrame && AppPolicy.isTrusted(sourceOrigin.toString()) && message.type == WebMessageCompat.TYPE_STRING) {
                    val raw = message.data
                    if (raw != null && raw.length <= 2_000_000) {
                        try {
                            val payload = JSONObject(raw)
                            val callback = pending.remove(payload.getString("nonce"))
                            callback?.invoke(ApiResponse(payload.getInt("status"), payload.getString("body")))
                        } catch (_: Exception) { /* Unsolicited or malformed messages are ignored. */ }
                    }
                }
            }
        }
    }

    fun request(method: String, path: String, body: JSONObject? = null, callback: (ApiResponse) -> Unit) {
        check(AppPolicy.isBridgeRequest(method, path)) { "Route native non autorisée" }
        if (!available || !AppPolicy.isTrusted(webView.url.orEmpty())) {
            callback(error("Connectez-vous dans l’application avant de continuer."))
            return
        }
        val nonce = UUID.randomUUID().toString()
        pending[nonce] = callback
        val bodyExpression = if (body == null) "undefined" else JSONObject.quote(body.toString())
        val script = """
            (() => {
              if (location.origin !== ${JSONObject.quote(AppPolicy.ORIGIN)}) return;
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 30000);
              const send = (status, body) => window.OrangeNativeResponse.postMessage(JSON.stringify({
                nonce: ${JSONObject.quote(nonce)}, status, body
              }));
              fetch(${JSONObject.quote(path)}, {
                method: ${JSONObject.quote(method)}, credentials: 'same-origin', cache: 'no-store',
                redirect: 'error', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: $bodyExpression
              }).then(async response => send(response.status, await response.text()))
                .catch(() => send(0, JSON.stringify({error: 'Connexion interrompue. Vérifiez le journal puis réessayez avec le même formulaire.'})))
                .finally(() => clearTimeout(timer));
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
        main.postDelayed({
            pending.remove(nonce)?.invoke(error("Le serveur ne répond pas. Vérifiez le journal avant de réessayer."))
        }, 35_000)
    }

    fun cancelPending() {
        val callbacks = pending.values.toList()
        pending.clear()
        callbacks.forEach { it(error("La page a changé. Vérifiez le journal avant de réessayer.")) }
    }

    fun close() {
        pending.clear()
        main.removeCallbacksAndMessages(null)
        if (available) WebViewCompat.removeWebMessageListener(webView, "OrangeNativeResponse")
    }

    private fun error(message: String) = ApiResponse(0, JSONObject().put("error", message).toString())
}
