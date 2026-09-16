package com.ennearock.orangefinance

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject
import java.security.MessageDigest

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var bridge: TrustedWebBridge
    private lateinit var documents: PrivateDocuments
    private lateinit var picker: NativeFileChooser
    private lateinit var content: FrameLayout
    private lateinit var progress: ProgressBar
    private lateinit var status: TextView
    private lateinit var navigation: LinearLayout
    private var quick: QuickEntryPanel? = null
    private var ready = false
    private var lastPage = "/"
    private var sessionFingerprint: String? = null
    private val entry: QuickEntryState by viewModels()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(250, 248, 245))
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        status = TextView(this).apply {
            textSize = 14f; setPadding(dp(16), dp(8), dp(16), dp(8)); visibility = View.GONE
            setTextColor(Color.rgb(132, 44, 19)); setBackgroundColor(Color.rgb(255, 238, 220))
            setOnClickListener { retry() }
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        root.addView(status)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        root.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
        content = FrameLayout(this)
        root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
        navigation = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(4), dp(4), dp(4), dp(4)) }
        root.addView(navigation, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
        documents = PrivateDocuments(this, ::message, ::login)
        documents.clear()
        picker = NativeFileChooser(this, ::message)
        webView = WebView(this)
        webView.isSaveEnabled = false
        content.addView(webView, FrameLayout.LayoutParams(-1, -1))
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
            safeBrowsingEnabled = true
            mediaPlaybackRequiresUserGesture = true
        }
        CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(webView, false) }
        sessionFingerprint = currentSessionFingerprint()
        bridge = TrustedWebBridge(webView)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (!request.isForMainFrame) return !AppPolicy.isTrusted(url)
                if (AppPolicy.isPrivateDocument(url)) {
                    if (request.hasGesture()) shareDocument(url)
                    return true
                }
                if (AppPolicy.isTrusted(url)) return false
                if (request.hasGesture()) openExternal(url)
                return true
            }
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                ready = false; bridge.cancelPending(); progress.visibility = View.VISIBLE
                if (!AppPolicy.isTrusted(url)) { view.stopLoading(); message("Cette page n’est pas autorisée."); return }
                if (Uri.parse(url).path == "/login") clearPrivateSession()
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (!AppPolicy.isTrusted(url)) return
                ready = true; progress.visibility = View.GONE
                CookieManager.getInstance().flush()
                checkSessionChange()
                if (Uri.parse(url).path != "/login") lastPage = Uri.parse(url).encodedPath.orEmpty() + (Uri.parse(url).encodedQuery?.let { "?$it" } ?: "")
            }
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                if (!AppPolicy.isTrusted(url)) return
                checkSessionChange()
                if (Uri.parse(url).path == "/login") clearPrivateSession()
            }
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel(); showOffline("La connexion sécurisée a échoué. Appuyez ici pour réessayer.")
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline("Connexion indisponible. Appuyez ici pour réessayer.")
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame && errorResponse.statusCode >= 500) showOffline("Le serveur est temporairement indisponible. Appuyez ici pour réessayer.")
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, value: Int) { progress.progress = value }
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) { callback.invoke(origin, false, false) }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if (!AppPolicy.isTrusted(view.url.orEmpty())) { callback.onReceiveValue(null); return true }
                return picker.open(callback, params)
            }
        }
        webView.setDownloadListener { url, _, _, _, _ -> shareDocument(url) }
        navButton("Accueil") { navigate("/") }
        navButton("Saisie") { showQuickEntry() }
        navButton("Journal") { navigate("/journal") }
        navButton("Plus") { showMore() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (entry.submitting) { message("Un encaissement est en cours. Attendez la réponse du serveur."); return }
                if (quick != null) { hideQuick(); return }
                if (webView.canGoBack()) webView.goBack()
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        webView.loadUrl(AppPolicy.ORIGIN)
    }

    private fun navButton(label: String, action: () -> Unit) {
        navigation.addView(Button(this).apply {
            text = label; isAllCaps = false; textSize = 12f
            minWidth = 0; minimumWidth = 0; minHeight = dp(52)
            setPadding(dp(2), dp(4), dp(2), dp(4)); setOnClickListener { action() }
        }, LinearLayout.LayoutParams(0, -2, 1f))
    }

    private fun showQuickEntry() {
        checkSessionChange()
        if (entry.submitting) { message("Un encaissement est déjà en cours."); return }
        if (!ready) { message("Attendez la fin du chargement, puis ouvrez Saisie."); return }
        if (Uri.parse(webView.url).path == "/login") { message("Connectez-vous avant d’encaisser."); return }
        hideQuick()
        quick = QuickEntryPanel(this, entry, bridge, ::connected, ::login, ::navigate, ::shareDocument)
        content.addView(quick, FrameLayout.LayoutParams(-1, -1))
        webView.visibility = View.INVISIBLE
    }

    private fun hideQuick() {
        quick?.dispose(); quick?.let { content.removeView(it) }; quick = null
        webView.visibility = View.VISIBLE
    }

    private fun navigate(path: String) {
        checkSessionChange()
        val url = AppPolicy.ORIGIN + path
        if (!AppPolicy.isTrusted(url)) return
        if (entry.submitting) { message("Un encaissement est en cours. Attendez la réponse du serveur."); return }
        hideQuick(); status.visibility = View.GONE; lastPage = path; webView.loadUrl(url)
    }

    private fun showMore() {
        checkSessionChange()
        if (!ready) { message("Attendez la fin du chargement."); return }
        bridge.request("GET", "/api/me") { response ->
            if (response.status == 401) { login(); return@request }
            if (!response.successful) { message(response.error()); return@request }
            val array = response.json().optJSONArray("permissions")
            val permissions = if (array == null) emptySet() else (0 until array.length()).map { array.getString(it) }.toSet()
            val modules = listOf(
                Triple("Dépenses", "/depenses", "expenses.view"),
                Triple("Demander une dépense", "/saisie?direction=OUT", "expenses.create"),
                Triple("Factures", "/factures", "invoices.view"),
                Triple("Ventes", "/ventes", "sales.view"),
                Triple("Clients", "/clients", "clients.view"),
                Triple("Caisses et remises", "/caisse", "cash.view"),
                Triple("Transactions", "/transactions", "transactions.view"),
                Triple("Rapports", "/rapports", "reports.view"),
                Triple("Paramètres", "/parametres", "dashboard.view"),
            ).filter { it.third in permissions }
            val labels = modules.map { it.first } + "Se déconnecter"
            AlertDialog.Builder(this).setTitle("Orange Finance")
                .setItems(labels.toTypedArray()) { _, index ->
                    if (index < modules.size) navigate(modules[index].second) else confirmLogout()
                }.setNegativeButton("Fermer", null).show()
        }
    }

    private fun confirmLogout() {
        if (entry.submitting) { message("Attendez la fin de l’encaissement avant de vous déconnecter."); return }
        AlertDialog.Builder(this).setTitle("Se déconnecter ?")
            .setMessage("Les documents privés et la saisie native en cours seront effacés de ce téléphone.")
            .setNegativeButton("Annuler", null).setPositiveButton("Se déconnecter") { _, _ ->
                bridge.request("POST", "/api/auth/logout", JSONObject()) { response ->
                    if (response.successful || response.status == 401) {
                        clearPrivateSession()
                        CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush(); login() }
                    } else message(response.error())
                }
            }.show()
    }

    private fun clearPrivateSession() {
        bridge.cancelPending()
        hideQuick(); entry.clearSession(); picker.cancel(); documents.clear()
        webView.clearCache(true); webView.clearHistory()
    }
    private fun login() { clearPrivateSession(); webView.loadUrl("${AppPolicy.ORIGIN}/login"); message("Connectez-vous pour continuer.") }
    private fun shareDocument(url: String) {
        if (!AppPolicy.isPrivateDocument(url)) { message("Ce lien ne correspond pas à un reçu ou justificatif autorisé."); return }
        message("Préparation du document…")
        documents.share(url, webView.settings.userAgentString)
    }
    private fun openExternal(url: String) {
        if (AppPolicy.externalScheme(url) == null) return
        AlertDialog.Builder(this).setTitle("Ouvrir une autre application ?")
            .setMessage("Ce lien va s’ouvrir en dehors d’Orange Finance.")
            .setNegativeButton("Annuler", null).setPositiveButton("Ouvrir") { _, _ ->
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)) }
                catch (_: Exception) { message("Aucune application ne permet d’ouvrir ce lien.") }
            }.show()
    }
    private fun retry() {
        if (!connected()) { message("Le téléphone est toujours hors connexion."); return }
        status.visibility = View.GONE
        if (quick == null) webView.loadUrl(AppPolicy.ORIGIN + lastPage)
    }
    private fun showOffline(text: String) {
        ready = false; progress.visibility = View.GONE; status.text = text; status.visibility = View.VISIBLE
    }
    private fun message(value: String) { Toast.makeText(this, value, Toast.LENGTH_LONG).show() }
    private fun connected(): Boolean {
        val manager = getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        return manager.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun currentSessionFingerprint(): String {
        val cookie = CookieManager.getInstance().getCookie(AppPolicy.ORIGIN).orEmpty()
            .split(';').map { it.trim() }.firstOrNull { it.startsWith("orange_session=") }.orEmpty()
        return MessageDigest.getInstance("SHA-256").digest(cookie.toByteArray()).joinToString("") { "%02x".format(it) }
    }
    private fun checkSessionChange() {
        val current = currentSessionFingerprint()
        if (sessionFingerprint != null && sessionFingerprint != current) clearPrivateSession()
        sessionFingerprint = current
    }
    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized && ::bridge.isInitialized) checkSessionChange()
    }
    override fun onDestroy() {
        // A rotation can interrupt the response after the server committed. Keep the
        // exact request and UUID in the ViewModel, but allow an explicit retry.
        entry.submitting = false
        quick?.dispose(); bridge.close(); picker.close(); documents.close()
        webView.stopLoading(); webView.destroy()
        super.onDestroy()
    }
}
