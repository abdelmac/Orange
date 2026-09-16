package com.ennearock.orangefinance

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

class PrivateDocuments(
    private val context: Context,
    private val onError: (String) -> Unit,
    private val onUnauthorized: () -> Unit,
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var generation = 0
    private val shared = mutableListOf<Uri>()

    fun clear() {
        generation++
        shared.forEach { context.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        shared.clear()
        listOf("receipts", "camera").forEach { name ->
            File(context.cacheDir, name).takeIf { it.exists() }?.deleteRecursively()
        }
    }

    fun share(url: String, userAgent: String) {
        if (!AppPolicy.isPrivateDocument(url)) {
            onError("Ce document ne peut pas être ouvert par l’application.")
            return
        }
        val sessionCookies = CookieManager.getInstance().getCookie(AppPolicy.ORIGIN).orEmpty()
            .split(';').map { it.trim() }.firstOrNull { it.startsWith("orange_session=") }.orEmpty()
        val requestGeneration = generation
        executor.execute {
            var connection: HttpURLConnection? = null
            var file: File? = null
            try {
                connection = URL(url).openConnection() as HttpURLConnection
                connection.instanceFollowRedirects = false
                connection.connectTimeout = 20_000
                connection.readTimeout = 30_000
                connection.setRequestProperty("Cookie", sessionCookies)
                connection.setRequestProperty("User-Agent", userAgent)
                connection.setRequestProperty("Accept", "application/pdf,image/jpeg,image/png,image/webp")
                connection.setRequestProperty("Cache-Control", "no-store")
                val status = connection.responseCode
                if (status == 401) {
                    main.post { if (generation == requestGeneration) onUnauthorized() }
                    return@execute
                }
                check(status == 200) { if (status == 403) "Vous n’avez pas accès à ce document." else "Téléchargement indisponible ($status)." }
                val mime = connection.contentType.orEmpty().substringBefore(';').lowercase()
                val extension = when (mime) {
                    "application/pdf" -> "pdf"
                    "image/jpeg" -> "jpg"
                    "image/png" -> "png"
                    "image/webp" -> "webp"
                    else -> throw IllegalStateException("Type de document non autorisé.")
                }
                if (!URL(url).path.startsWith("/api/attachments/")) check(mime == "application/pdf") { "Le serveur n’a pas renvoyé un PDF." }
                check(connection.contentLengthLong <= AppPolicy.MAX_DOCUMENT_BYTES) { "Ce document dépasse 20 Mo." }
                val folder = File(context.cacheDir, "receipts").also { it.mkdirs() }
                val target = File(folder, "orange-${UUID.randomUUID()}.$extension")
                file = target
                connection.inputStream.use { input ->
                    target.outputStream().use { output ->
                        val buffer = ByteArray(8192)
                        var total = 0L
                        while (true) {
                            check(generation == requestGeneration) { "Téléchargement interrompu." }
                            val count = input.read(buffer)
                            if (count < 0) break
                            total += count
                            check(total <= AppPolicy.MAX_DOCUMENT_BYTES) { "Ce document dépasse 20 Mo." }
                            output.write(buffer, 0, count)
                        }
                    }
                }
                if (mime == "application/pdf") {
                    val prefix = target.inputStream().use { input ->
                        val bytes = ByteArray(5)
                        var read = 0
                        while (read < bytes.size) {
                            val count = input.read(bytes, read, bytes.size - read)
                            if (count < 0) break
                            read += count
                        }
                        String(bytes, 0, read, Charsets.US_ASCII)
                    }
                    check(prefix == "%PDF-") { "Le document PDF est invalide." }
                }
                val completed = target
                main.post {
                    if (generation != requestGeneration) { completed.delete(); return@post }
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", completed)
                    shared.add(uri)
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = mime
                        putExtra(Intent.EXTRA_STREAM, uri)
                        clipData = ClipData.newRawUri("Document Orange Finance", uri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    try { context.startActivity(Intent.createChooser(send, "Ouvrir ou partager le document")) }
                    catch (_: Exception) { onError("Aucune application ne peut ouvrir ce document.") }
                }
            } catch (error: Exception) {
                file?.delete()
                main.post { if (generation == requestGeneration) onError(error.message ?: "Téléchargement impossible.") }
            } finally { connection?.disconnect() }
        }
    }

    fun close() { generation++; executor.shutdownNow() }
}
