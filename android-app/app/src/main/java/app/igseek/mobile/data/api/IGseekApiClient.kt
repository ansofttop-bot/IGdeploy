package app.igseek.mobile.data.api

import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.FlowStepItem
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.data.models.SubscriptionInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID

class IGseekApiClient(
    private val client: OkHttpClient,
    private val baseUrlProvider: () -> String
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private fun endpoint(path: String): String = "${baseUrlProvider().trimEnd('/')}$path"

    data class StreamCallbacks(
        val onTextDelta: (String) -> Unit,
        val onReasoningDelta: (String) -> Unit,
        val onImageGenerated: (GeneratedImageItem) -> Unit,
        val onStatus: (String) -> Unit
    )

    suspend fun streamChat(
        token: String?,
        history: List<ChatMessageItem>,
        modelApiId: String,
        agentApiId: String,
        webSearch: Boolean,
        reasoning: Boolean,
        attachments: List<ChatAttachment>,
        idempotencyKey: String,
        callbacks: StreamCallbacks
    ) = withContext(Dispatchers.IO) {
        val msgsArr = JSONArray()
        history.takeLast(24).forEachIndexed { idx, msg ->
            val isLast = idx == history.takeLast(24).lastIndex
            val obj = JSONObject().apply {
                put("role", msg.role)
                put("content", msg.content)
                if (isLast && attachments.isNotEmpty() && msg.role == "user") {
                    val attArr = JSONArray()
                    attachments.forEach { a ->
                        attArr.put(JSONObject().apply {
                            put("name", a.name)
                            put("type", a.mimeType)
                            put("size", a.sizeBytes)
                            put("dataUrl", a.dataUrl)
                        })
                    }
                    put("attachments", attArr)
                }
            }
            msgsArr.put(obj)
        }

        val bodyJson = JSONObject().apply {
            put("messages", msgsArr)
            put("model", modelApiId)
            put("agent", agentApiId)
            put("webSearch", webSearch)
            put("reasoning", reasoning)
            put("idempotencyKey", idempotencyKey)
        }

        val reqBuilder = Request.Builder()
            .url(endpoint("/api/chat"))
            .header("Accept", "text/event-stream")
            .header("Idempotency-Key", idempotencyKey)
            .post(bodyJson.toString().toRequestBody(jsonMedia))
        if (!token.isNullOrBlank()) {
            reqBuilder.header("Authorization", "Bearer $token")
        }

        client.newCall(reqBuilder.build()).execute().use { res ->
            if (!res.isSuccessful) {
                val errBody = res.body?.string().orEmpty().take(240)
                throw IllegalStateException("HTTP ${res.code}: $errBody")
            }
            val body = res.body ?: throw IllegalStateException("Пустой ответ сервера")
            BufferedReader(InputStreamReader(body.byteStream(), Charsets.UTF_8)).use { reader ->
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    val raw = line?.trim() ?: continue
                    if (!raw.startsWith("data:")) continue
                    val payload = raw.removePrefix("data:").trim()
                    if (payload == "[DONE]" || payload.isEmpty()) continue
                    val evt = runCatching { JSONObject(payload) }.getOrNull() ?: continue
                    when (evt.optString("type")) {
                        "delta", "text", "content" -> {
                            val chunk = evt.optString("text").ifEmpty { evt.optString("content") }
                            if (chunk.isNotEmpty()) callbacks.onTextDelta(chunk)
                        }
                        "reasoning", "thought" -> {
                            val chunk = evt.optString("text").ifEmpty { evt.optString("content") }
                            if (chunk.isNotEmpty()) callbacks.onReasoningDelta(chunk)
                        }
                        "image" -> {
                            val url = evt.optString("dataUrl").ifEmpty { evt.optString("url") }
                            if (url.isNotBlank()) {
                                callbacks.onImageGenerated(
                                    GeneratedImageItem(
                                        id = evt.optString("id").ifBlank { UUID.randomUUID().toString() },
                                        title = evt.optString("title", "Изображение IGseek"),
                                        dataUrl = url
                                    )
                                )
                            }
                        }
                        "status" -> {
                            val msg = evt.optString("message").ifEmpty { evt.optString("text") }
                            if (msg.isNotBlank()) callbacks.onStatus(msg)
                        }
                        "error" -> {
                            throw IllegalStateException(evt.optString("message", "Ошибка генерации"))
                        }
                        else -> {
                            // OpenAI SSE compatibility fallback
                            val delta = evt.optJSONArray("choices")
                                ?.optJSONObject(0)
                                ?.optJSONObject("delta")
                            val content = delta?.optString("content").orEmpty()
                            val rContent = delta?.optString("reasoning_content").orEmpty()
                            if (rContent.isNotEmpty()) callbacks.onReasoningDelta(rContent)
                            if (content.isNotEmpty()) callbacks.onTextDelta(content)
                        }
                    }
                }
            }
        }
    }

    suspend fun transcribeAudio(base64Audio: String): String = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("audioBase64", base64Audio)
            put("mimeType", "audio/mp4")
            put("lang", "ru")
        }
        val req = Request.Builder()
            .url(endpoint("/api/transcribe"))
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) {
                throw IllegalStateException(obj?.optString("error") ?: "Ошибка транскрибации (${res.code})")
            }
            obj?.optString("text").orEmpty().trim()
        }
    }

    // ==================== FLOW ====================

    suspend fun planFlow(
        token: String?,
        goal: String,
        modelApiId: String,
        agentApiId: String
    ): Pair<String, List<FlowStepItem>> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("action", "plan")
            put("goal", goal)
            put("model", modelApiId)
            put("agent", agentApiId)
        }
        val req = Request.Builder()
            .url(endpoint("/api/flow"))
            .apply { if (!token.isNullOrBlank()) header("Authorization", "Bearer $token") }
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) {
                throw IllegalStateException(obj?.optString("error") ?: "Ошибка планирования Flow (${res.code})")
            }
            val title = obj?.optString("title").orEmpty().ifBlank { goal.take(48) }
            val arr = obj?.optJSONArray("steps") ?: JSONArray()
            val steps = List(arr.length()) { i ->
                val s = arr.getJSONObject(i)
                FlowStepItem(
                    id = s.optString("id").ifBlank { "step_${i + 1}" },
                    title = s.optString("title", "Шаг ${i + 1}"),
                    description = s.optString("description"),
                    tool = s.optString("tool", "reason"),
                    requiresApproval = s.optBoolean("requiresApproval", false)
                )
            }
            title to steps
        }
    }

    suspend fun runFlowStep(
        token: String?,
        goal: String,
        step: FlowStepItem,
        previousSteps: List<FlowStepItem>,
        modelApiId: String,
        agentApiId: String
    ): String = withContext(Dispatchers.IO) {
        val prevArr = JSONArray()
        previousSteps.forEach { ps ->
            prevArr.put(JSONObject().apply {
                put("title", ps.title)
                put("output", ps.output.take(1500))
            })
        }
        val body = JSONObject().apply {
            put("action", "run_step")
            put("goal", goal)
            put("model", modelApiId)
            put("agent", agentApiId)
            put("step", JSONObject().apply {
                put("id", step.id)
                put("title", step.title)
                put("description", step.description)
                put("tool", step.tool)
            })
            put("previousSteps", prevArr)
        }
        val req = Request.Builder()
            .url(endpoint("/api/flow"))
            .apply { if (!token.isNullOrBlank()) header("Authorization", "Bearer $token") }
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) {
                throw IllegalStateException(obj?.optString("error") ?: "Ошибка шага Flow (${res.code})")
            }
            obj?.optString("output").orEmpty().ifBlank { obj?.optString("result").orEmpty() }
        }
    }

    // ==================== LIBRARY (PG RLS + S3 PRESIGNED) ====================

    suspend fun listLibrary(token: String): List<LibraryFileItem> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(endpoint("/api/library"))
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) {
                throw IllegalStateException(obj?.optString("error") ?: "Ошибка загрузки Library (${res.code})")
            }
            val arr = obj?.optJSONArray("items") ?: JSONArray()
            List(arr.length()) { i ->
                val it = arr.getJSONObject(i)
                LibraryFileItem(
                    id = it.optString("id"),
                    name = it.optString("name"),
                    type = it.optString("type", "doc"),
                    mimeType = it.optString("mimeType", "application/octet-stream"),
                    sizeBytes = it.optLong("size", 0L),
                    source = it.optString("source", "library"),
                    chatTitle = it.optString("chatTitle", "Library"),
                    updatedAt = it.optString("updatedAt"),
                    content = it.optString("content").takeIf { s -> s.isNotBlank() },
                    dataUrl = it.optString("dataUrl").takeIf { s -> s.isNotBlank() },
                    downloadUrl = it.optString("downloadUrl").takeIf { s -> s.isNotBlank() }
                )
            }
        }
    }

    suspend fun uploadLibraryFile(
        token: String,
        name: String,
        mimeType: String,
        bytes: ByteArray,
        dataUrl: String
    ) = withContext(Dispatchers.IO) {
        val fileType = if (mimeType.startsWith("image/")) "image" else "doc"

        // 1. Try presigned direct S3 upload
        val presignBody = JSONObject().apply {
            put("action", "presign_upload")
            put("name", name)
            put("mimeType", mimeType)
            put("size", bytes.size)
            put("type", fileType)
            put("source", "user_upload")
        }
        val presignReq = Request.Builder()
            .url(endpoint("/api/library"))
            .header("Authorization", "Bearer $token")
            .post(presignBody.toString().toRequestBody(jsonMedia))
            .build()

        val presigned = runCatching {
            client.newCall(presignReq).execute().use { res ->
                if (!res.isSuccessful) null
                else JSONObject(res.body?.string().orEmpty())
            }
        }.getOrNull()

        if (presigned?.optBoolean("presigned", false) == true) {
            val uploadUrl = presigned.optString("uploadUrl")
            val fileId = presigned.optString("fileId")
            if (uploadUrl.isNotBlank() && fileId.isNotBlank()) {
                val putReq = Request.Builder()
                    .url(uploadUrl)
                    .put(bytes.toRequestBody(mimeType.toMediaType()))
                    .build()
                client.newCall(putReq).execute().use { putRes ->
                    if (!putRes.isSuccessful) throw IllegalStateException("Ошибка загрузки в S3 (${putRes.code})")
                }
                val confirmBody = JSONObject().apply {
                    put("action", "confirm_upload")
                    put("fileId", fileId)
                }
                val confirmReq = Request.Builder()
                    .url(endpoint("/api/library"))
                    .header("Authorization", "Bearer $token")
                    .post(confirmBody.toString().toRequestBody(jsonMedia))
                    .build()
                client.newCall(confirmReq).execute().use { cRes ->
                    if (!cRes.isSuccessful) throw IllegalStateException("Ошибка подтверждения загрузки")
                }
                return@withContext
            }
        }

        // 2. Fallback standard JSON upload
        val fallbackBody = JSONObject().apply {
            put("name", name)
            put("type", fileType)
            put("mimeType", mimeType)
            put("size", bytes.size)
            put("source", "user_upload")
            if (mimeType.startsWith("text/") && bytes.size <= 500_000) {
                put("content", String(bytes, Charsets.UTF_8))
            } else if (dataUrl.isNotBlank()) {
                put("dataUrl", dataUrl)
            }
        }
        val req = Request.Builder()
            .url(endpoint("/api/library"))
            .header("Authorization", "Bearer $token")
            .post(fallbackBody.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("Ошибка загрузки файла (${res.code})")
        }
    }

    suspend fun deleteLibraryFile(token: String, id: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().apply { put("id", id) }
        val req = Request.Builder()
            .url(endpoint("/api/library"))
            .header("Authorization", "Bearer $token")
            .delete(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("Ошибка удаления файла (${res.code})")
        }
    }

    // ==================== MEMORY ====================

    suspend fun listMemories(token: String): List<MemoryEntryItem> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(endpoint("/api/memory"))
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) throw IllegalStateException(obj?.optString("error") ?: "Ошибка загрузки памяти")
            parseMemoryList(obj)
        }
    }

    suspend fun saveMemory(token: String, content: String, kind: String): List<MemoryEntryItem> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("content", content)
            put("kind", kind)
        }
        val req = Request.Builder()
            .url(endpoint("/api/memory"))
            .header("Authorization", "Bearer $token")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) throw IllegalStateException(obj?.optString("error") ?: "Ошибка сохранения памяти")
            parseMemoryList(obj)
        }
    }

    suspend fun deleteMemory(token: String, id: String) = withContext(Dispatchers.IO) {
        val body = JSONObject().apply { put("id", id) }
        val req = Request.Builder()
            .url(endpoint("/api/memory"))
            .header("Authorization", "Bearer $token")
            .delete(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("Ошибка удаления памяти")
        }
    }

    private fun parseMemoryList(obj: JSONObject?): List<MemoryEntryItem> {
        val arr = obj?.optJSONArray("memories") ?: obj?.optJSONArray("items") ?: JSONArray()
        return List(arr.length()) { i ->
            val m = arr.getJSONObject(i)
            MemoryEntryItem(
                id = m.optString("id"),
                content = m.optString("content"),
                kind = m.optString("kind", "other"),
                createdAt = m.optString("created_at").ifBlank { m.optString("createdAt") }
            )
        }
    }

    // ==================== SUBSCRIPTION ====================

    suspend fun fetchSubscription(token: String?): SubscriptionInfo = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(endpoint("/api/subscription"))
            .apply { if (!token.isNullOrBlank()) header("Authorization", "Bearer $token") }
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@withContext SubscriptionInfo()
            val obj = JSONObject(res.body?.string().orEmpty())
            parseSub(obj)
        }
    }

    suspend fun createSubscriptionCheckout(
        token: String,
        email: String,
        paymentMethod: Int,
        idempotencyKey: String
    ): Pair<String, String> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("paymentMethod", paymentMethod)
            put("email", email)
            put("idempotencyKey", idempotencyKey)
        }
        val req = Request.Builder()
            .url(endpoint("/api/create-payment"))
            .header("Authorization", "Bearer $token")
            .header("Idempotency-Key", idempotencyKey)
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) {
                throw IllegalStateException(obj?.optString("error") ?: "Не удалось создать платёж")
            }
            val txnId = obj?.optString("transactionId").orEmpty()
            val url = obj?.optString("paymentUrl").orEmpty()
            if (txnId.isBlank() || !url.startsWith("https://")) {
                throw IllegalStateException("Получена некорректная ссылка на оплату")
            }
            txnId to url
        }
    }

    suspend fun verifySubscriptionPayment(token: String, txnId: String?): SubscriptionInfo = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("action", "verify")
            if (!txnId.isNullOrBlank()) put("transactionId", txnId)
        }
        val req = Request.Builder()
            .url(endpoint("/api/subscription"))
            .header("Authorization", "Bearer $token")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { res ->
            val obj = runCatching { JSONObject(res.body?.string().orEmpty()) }.getOrNull()
            if (!res.isSuccessful) {
                throw IllegalStateException(obj?.optString("error") ?: "Ошибка проверки платежа")
            }
            parseSub(obj?.optJSONObject("subscription") ?: obj ?: JSONObject())
        }
    }

    private fun parseSub(obj: JSONObject): SubscriptionInfo = SubscriptionInfo(
        plan = obj.optString("plan", "free"),
        isPro = obj.optBoolean("isPro", false),
        status = obj.optString("status", "free"),
        daysLeft = obj.optInt("daysLeft", 0),
        expiresAt = obj.optString("expiresAt").takeIf { it.isNotBlank() && it != "null" },
        pendingTxnId = obj.optString("pendingTxnId").takeIf { it.isNotBlank() && it != "null" },
        priceRub = obj.optInt("priceRub", 149),
        durationDays = obj.optInt("durationDays", 30),
        paymentConfigured = obj.optBoolean("paymentConfigured", false)
    )
}
