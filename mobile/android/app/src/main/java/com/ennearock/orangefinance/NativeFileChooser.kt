package com.ennearock.orangefinance

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/** System picker / camera: no camera or storage runtime permissions are requested. */
class NativeFileChooser(private val activity: ComponentActivity, private val error: (String) -> Unit) {
    private var callback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null
    private var cameraFile: File? = null
    @Volatile private var generation = 0
    private val worker = Executors.newSingleThreadExecutor()
    private val launcher = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val listener = callback
        callback = null
        val capture = cameraUri
        cameraUri = null
        if (capture != null) activity.revokeUriPermission(capture, Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (listener == null) return@registerForActivityResult
        if (result.resultCode != Activity.RESULT_OK) {
            cameraFile?.delete(); cameraFile = null
            listener.onReceiveValue(null)
            return@registerForActivityResult
        }
        val selected = result.data?.data
            ?: result.data?.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
            ?: capture?.takeIf { cameraFile?.length()?.let { length -> length > 0 } == true }
        if (selected == null) { listener.onReceiveValue(null); return@registerForActivityResult }
        val version = generation
        val capturedFile = cameraFile
        cameraFile = null
        worker.execute {
            var destination: File? = null
            try {
                require(selected.scheme == "content") { "Choisissez une image ou un PDF dans le sélecteur de fichiers." }
                require(selected.authority != "${activity.packageName}.files" || selected == capture) { "Ce fichier privé n’est pas autorisé." }
                val mime = activity.contentResolver.getType(selected).orEmpty()
                val suffix = when (mime) {
                    "application/pdf" -> "pdf"
                    "image/jpeg" -> "jpg"
                    "image/png" -> "png"
                    "image/webp" -> "webp"
                    else -> throw IllegalArgumentException("Choisissez un fichier PDF, JPEG, PNG ou WebP.")
                }
                val directory = File(activity.cacheDir, "camera").also { it.mkdirs() }
                val target = File(directory, "upload-${UUID.randomUUID()}.$suffix")
                destination = target
                activity.contentResolver.openInputStream(selected).use { input ->
                    checkNotNull(input) { "Le fichier ne peut pas être lu." }
                    target.outputStream().use { output ->
                        val buffer = ByteArray(8192)
                        var size = 0L
                        while (true) {
                            check(version == generation) { "Sélection interrompue." }
                            val count = input.read(buffer)
                            if (count < 0) break
                            size += count
                            check(size <= 10L * 1024 * 1024) { "Le justificatif dépasse 10 Mo." }
                            output.write(buffer, 0, count)
                        }
                        check(size > 0) { "Le fichier est vide." }
                    }
                }
                val complete = target
                activity.runOnUiThread {
                    if (version != generation) { complete.delete(); listener.onReceiveValue(null) }
                    else listener.onReceiveValue(arrayOf(FileProvider.getUriForFile(activity, "${activity.packageName}.files", complete)))
                }
            } catch (failure: Exception) {
                destination?.delete()
                activity.runOnUiThread {
                    if (version == generation) error(failure.message ?: "Impossible de lire le fichier.")
                    listener.onReceiveValue(null)
                }
            } finally { capturedFile?.delete() }
        }
    }

    fun open(valueCallback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        cancel()
        callback = valueCallback
        val documentIntent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "image/jpeg", "image/png", "image/webp"))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        val wantsImages = params.acceptTypes.isEmpty() || params.acceptTypes.any { it.isBlank() || it == "*/*" || it.startsWith("image/") }
        try {
            val chooser = Intent.createChooser(documentIntent, "Ajouter un justificatif")
            if (wantsImages && cameraIntent.resolveActivity(activity.packageManager) != null) {
                val folder = File(activity.cacheDir, "camera").also { it.mkdirs() }
                cameraFile = File(folder, "capture-${UUID.randomUUID()}.jpg")
                cameraUri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", cameraFile!!)
                cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                cameraIntent.clipData = ClipData.newRawUri("Photo du justificatif", cameraUri)
                cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
            }
            launcher.launch(chooser)
        } catch (_: Exception) {
            cancel()
            error("Aucune application ne permet de choisir un document.")
        }
        return true
    }

    fun cancel() {
        generation++
        callback?.onReceiveValue(null); callback = null
        cameraUri?.let { activity.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
        cameraUri = null; cameraFile?.delete(); cameraFile = null
    }
    fun close() { cancel(); worker.shutdownNow() }
}
