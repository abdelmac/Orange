package com.ennearock.orangefinance

import android.content.Context
import android.graphics.Color
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.ViewModel
import org.json.JSONObject
import java.util.UUID

class QuickEntryState : ViewModel() {
    var key = UUID.randomUUID().toString()
    var amount = ""
    var name = ""
    var description = ""
    var phone = ""
    var kind = 0
    var method = 0
    var cashId = ""
    var userId = ""
    var currency = ""
    var result: JSONObject? = null
    var submitting = false
    var requestBody: String? = null
    fun newEntry() {
        key = UUID.randomUUID().toString()
        amount = ""; name = ""; description = ""; phone = ""; kind = 0
        result = null; submitting = false; requestBody = null
    }
    fun clearSession() { newEntry(); userId = ""; cashId = ""; method = 0; currency = "" }
}

/** Native form; only the authenticated, same-origin WebView performs API requests. */
class QuickEntryPanel(
    context: Context,
    private val state: QuickEntryState,
    private val bridge: TrustedWebBridge,
    private val connected: () -> Boolean,
    private val login: () -> Unit,
    private val navigate: (String) -> Unit,
    private val document: (String) -> Unit,
) : ScrollView(context) {
    private val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(32)) }
    private val kinds = listOf("CLIENT" to "Client", "DRIVER" to "Chauffeur", "SALESPERSON" to "Commercial", "EMPLOYEE" to "Employé", "SUPPLIER" to "Fournisseur", "OTHER" to "Autre personne")
    private val methods = listOf("CASH" to "Espèces", "CARD" to "Carte", "TRANSFER" to "Virement", "CHECK" to "Chèque", "OTHER" to "Autre")
    private var disposed = false
    private var user: JSONObject? = null
    private var permissions = setOf<String>()
    private val accounts = mutableListOf<JSONObject>()

    init {
        // Android must not serialize a financial draft in saved view state.
        isSaveEnabled = false
        isSaveFromParentEnabled = false
        setBackgroundColor(Color.rgb(250, 248, 245))
        isFillViewport = true
        addView(column, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        text("Encaisser", 28f, true)
        text("Un reçu, en quelques secondes. La saisie est enregistrée dans votre entreprise.", 15f)
        if (!bridge.available) {
            text("Mettez à jour Android System WebView ou Chrome pour utiliser la saisie native.", 16f)
            button("Ouvrir la saisie web") { navigate("/saisie?direction=IN") }
        } else loadSession()
    }

    fun dispose() { disposed = true }

    private fun loadSession() {
        val progress = ProgressBar(context).also { column.addView(it) }
        bridge.request("GET", "/api/me") { response ->
            if (disposed) return@request
            if (response.status == 401) { login(); return@request }
            if (!response.successful) {
                column.removeView(progress)
                text(response.error(), 16f)
                button("Réessayer") { column.removeAllViews(); loadSession() }
                return@request
            }
            val data = response.json()
            user = data.optJSONObject("user")
            val userId = user?.optString("id").orEmpty()
            if (state.userId.isNotEmpty() && state.userId != userId) state.clearSession()
            state.userId = userId
            state.currency = data.optJSONObject("company")?.optString("currency").orEmpty()
            if (!state.currency.matches(Regex("[A-Z]{3}"))) {
                column.removeView(progress)
                text("La devise de l’entreprise n’est pas configurée. Contactez votre administrateur.", 16f)
                return@request
            }
            val allowed = data.optJSONArray("permissions")
            permissions = if (allowed == null) emptySet() else (0 until allowed.length()).map { allowed.getString(it) }.toSet()
            val salesperson = user?.optString("role") == "SALESPERSON"
            if (!(if (salesperson) "payments.create" in permissions else "cash.deposit" in permissions)) {
                column.removeView(progress)
                text("Votre rôle ne permet pas d’encaisser. Vous pouvez consulter les fonctions autorisées dans le menu Plus.", 16f)
                if ("expenses.create" in permissions) button("Demander une dépense") { navigate("/saisie?direction=OUT") }
                return@request
            }
            if (salesperson) render() else loadAccounts(1)
        }
    }

    private fun loadAccounts(page: Int) {
        bridge.request("GET", "/api/cash-accounts?page=$page&pageSize=250") { response ->
            if (disposed) return@request
            if (response.status == 401) { login(); return@request }
            if (!response.successful) {
                column.removeAllViews()
                text(response.error(), 16f)
                button("Réessayer") { accounts.clear(); column.removeAllViews(); loadSession() }
                return@request
            }
            val items = response.json().optJSONArray("items")
            val count = items?.length() ?: 0
            for (index in 0 until count) {
                val item = items!!.getJSONObject(index)
                if (item.optBoolean("active", true)) accounts.add(item)
            }
            if (count == 250 && page < 99999) loadAccounts(page + 1) else render()
        }
    }

    private fun render() {
        column.removeAllViews()
        if (state.result != null) { renderSuccess(state.result!!); return }
        text("Encaisser", 28f, true)
        val wallet = user?.optString("role") == "SALESPERSON"
        if (!wallet && accounts.isEmpty()) {
            text("Aucune caisse accessible. Demandez à votre administrateur de créer une caisse ou de vous y affecter.", 16f)
            if ("cash.create" in permissions) button("Créer une caisse") { navigate("/caisse?new=1") }
            return
        }
        text(if (wallet) "L’argent sera enregistré dans votre portefeuille personnel." else "L’argent sera enregistré dans la caisse sélectionnée.", 15f)
        val editable = mutableListOf<View>()
        val amount = input("Montant (${state.currency})", "0,00", state.amount, InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL, 24).apply {
            textSize = 34f
            doAfterTextChanged { state.amount = it.toString() }
        }.also { editable.add(it) }
        spinner("Cette personne est…", kinds.map { it.second }, state.kind) { state.kind = it }.also { editable.add(it) }
        input("Nom de la personne ou de l’entreprise", "Ex. Jean Dupont", state.name, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS, 160).apply {
            doAfterTextChanged { state.name = it.toString() }
        }.also { editable.add(it) }
        input("Motif", "Ex. règlement de livraison", state.description, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, 500).apply {
            doAfterTextChanged { state.description = it.toString() }
        }.also { editable.add(it) }
        spinner("Mode de paiement", methods.map { it.second }, state.method) { state.method = it }.also { editable.add(it) }
        if (wallet) text("Destination : mon portefeuille", 16f, true)
        else {
            val selected = accounts.indexOfFirst { it.optString("id") == state.cashId }.coerceAtLeast(0)
            state.cashId = accounts[selected].getString("id")
            spinner("Caisse", accounts.map { it.getString("name") }, selected) { state.cashId = accounts[it].getString("id") }.also { editable.add(it) }
        }
        val phoneLabel = text("Téléphone (facultatif)", 14f)
        val phone = input(null, "+33…", state.phone, InputType.TYPE_CLASS_PHONE, 60).apply { doAfterTextChanged { state.phone = it.toString() } }
        phoneLabel.visibility = GONE; phone.visibility = GONE
        editable.add(phone)
        button("Ajouter un téléphone (facultatif)") {
            phoneLabel.visibility = VISIBLE; phone.visibility = VISIBLE; phone.requestFocus()
        }.also { editable.add(it) }
        val error = text("", 15f).apply { setTextColor(Color.rgb(163, 38, 30)); accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        val submit = button("Enregistrer l’encaissement") { }
        if (state.requestBody != null) {
            editable.forEach { it.isEnabled = false }
            submit.text = "Réessayer le même encaissement"
            error.text = "La réponse précédente est incertaine. Vérifiez le journal. Une nouvelle tentative utilise exactement la même demande, sans créer de doublon."
        }
        submit.isEnabled = !state.submitting
        submit.setOnClickListener {
            if (state.submitting) return@setOnClickListener
            try {
                val normalized = AppPolicy.normalizeAmount(state.amount)
                require(state.name.trim().length >= 2) { "Indiquez le nom de la personne (au moins deux caractères)." }
                require(state.description.trim().length >= 3) { "Décrivez le motif (au moins trois caractères)." }
                check(connected()) { "Vous êtes hors connexion. Aucun encaissement n’a été envoyé. Réessayez une fois connecté." }
                val freshBody = JSONObject().put("direction", "IN").put("amount", normalized)
                    .put("partyName", state.name.trim()).put("partyKind", kinds[state.kind].first)
                    .put("description", state.description.trim()).put("method", methods[state.method].first)
                    .put("idempotencyKey", state.key)
                if (state.phone.isNotBlank()) freshBody.put("phone", state.phone.trim())
                if (wallet) freshBody.put("salespersonId", state.userId) else freshBody.put("cashAccountId", state.cashId)
                val body = state.requestBody?.let { JSONObject(it) } ?: freshBody
                state.requestBody = body.toString()
                error.text = ""
                state.submitting = true
                submit.isEnabled = false; submit.text = "Enregistrement…"
                editable.forEach { it.isEnabled = false }
                (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(amount.windowToken, 0)
                bridge.request("POST", "/api/quick-entries", body) { response ->
                    state.submitting = false
                    if (response.successful) state.result = response.json()
                    if (response.status in 400..499 && response.status != 409) state.requestBody = null
                    if (disposed) return@request
                    if (response.status == 401) { login(); return@request }
                    if (response.successful) render()
                    else {
                        val uncertain = state.requestBody != null
                        error.text = response.error() + if (uncertain) " Vérifiez le journal ; la nouvelle tentative conservera exactement cette demande." else ""
                        submit.isEnabled = true; submit.text = if (uncertain) "Réessayer le même encaissement" else "Réessayer l’encaissement"
                        editable.forEach { it.isEnabled = !uncertain }
                    }
                }
            } catch (failure: Exception) { error.text = failure.message ?: "Vérifiez les informations saisies." }
        }
        button("Régler une facture") { navigate("/encaissements?new=1") }
        button("Consulter le journal") { navigate("/journal") }
        amount.requestFocus()
    }

    private fun renderSuccess(result: JSONObject) {
        val reversed = result.optString("status") == "REVERSED"
        text(if (reversed) "Encaissement déjà annulé" else "Encaissement enregistré", 27f, true)
        text("${state.amount} ${state.currency}", 32f, true)
        text(result.optString("number"), 17f)
        text(if (reversed) "Cette demande correspond à une opération annulée. Aucune nouvelle entrée d’argent n’a été créée. Consultez le journal." else "Le reçu est disponible. Les soldes et le journal ont été mis à jour.", 16f)
        val id = result.optString("transactionId")
        if (id.isNotBlank()) {
            button("Ouvrir / partager le reçu PDF") { document("${AppPolicy.ORIGIN}/api/transactions/$id/receipt") }
            button("Ajouter un justificatif") { navigate("/transactions?detail=$id") }
        }
        button("Nouvel encaissement") { state.newEntry(); render() }
        button("Voir le journal") { navigate("/journal") }
    }

    private fun text(value: String, size: Float, strong: Boolean = false): TextView = TextView(context).apply {
        text = value; textSize = size; setTextColor(Color.rgb(39, 43, 40))
        if (strong) setTypeface(typeface, android.graphics.Typeface.BOLD)
        column.addView(this, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) })
    }
    private fun input(label: String?, hint: String, value: String, type: Int, max: Int): EditText {
        val title = if (label == null) null else text(label, 14f)
        return EditText(context).apply {
            isSaveEnabled = false
            id = View.generateViewId(); title?.labelFor = id
            this.hint = hint; contentDescription = label ?: "Téléphone facultatif"
            inputType = type; setText(value); filters = arrayOf(InputFilter.LengthFilter(max)); setSingleLine(true)
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            column.addView(this, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(58)).apply { bottomMargin = dp(12) })
        }
    }
    private fun spinner(label: String, labels: List<String>, selected: Int, change: (Int) -> Unit): Spinner {
        val title = text(label, 14f)
        return Spinner(context).apply {
            id = View.generateViewId(); title.labelFor = id; contentDescription = label
            adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, labels)
            setSelection(selected.coerceIn(0, labels.lastIndex))
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, itemId: Long) = change(position)
                override fun onNothingSelected(parent: AdapterView<*>?) = Unit
            }
            column.addView(this, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(52)).apply { bottomMargin = dp(12) })
        }
    }
    private fun button(label: String, action: () -> Unit): Button = Button(context).apply {
        text = label; isAllCaps = false; minHeight = dp(52); setOnClickListener { action() }
        column.addView(this, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
