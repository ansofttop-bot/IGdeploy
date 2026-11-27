package app.igseek.mobile.data.api

import android.util.Base64
import app.igseek.mobile.BuildConfig
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.AuthSession
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.EngineFileItem
import app.igseek.mobile.data.models.EngineProjectItem
import app.igseek.mobile.data.models.FlowStepItem
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.data.models.SubscriptionInfo
import app.igseek.mobile.data.models.WebSourceItem
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID

data class StreamChatResult(
    val content: String,
    val reasoning: String,
    val images: List<GeneratedImageItem>,
    val webSources: List<WebSourceItem>
)

data class FlowPlanResult(
    val title: String,
    val steps: List<FlowStepItem>
)

class IGseekApiClient(
    private val client: OkHttpClient,
    private val baseUrlProvider: () -> String
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val nonRedirectClient: OkHttpClient by lazy {
        client.newBuilder()
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
    }

    @Volatile
    private var activeChatCall: Call? = null

    fun cancelActiveStream() {
        runCatching { activeChatCall?.cancel() }
        activeChatCall = null
    }

    private fun resolveGatewayUrl(): String {
        val configured = baseUrlProvider().trim().trimEnd('/')
        if (configured.isNotBlank()) return configured
        val defaultApi = BuildConfig.DEFAULT_API_BASE_URL.trim().trimEnd('/')
        if (defaultApi.isNotBlank()) return defaultApi
        val bridge = BuildConfig.DEFAULT_AUTH_BRIDGE_URL.trim().trimEnd('/')
        if (bridge.isNotBlank()) return bridge
        return "https://i-gdeploy-luan.vercel.app"
    }

    private fun gatewayHeaders(builder: Request.Builder, session: AuthSession?): Request.Builder {
        if (session != null && !session.isGuest && session.idToken.isNotBlank()) {
            builder.header("Authorization", "Bearer ${session.idToken}")
        }
        return builder
    }

    // ==================== DIRECT WEB SEARCH GROUNDING ====================

    suspend fun searchWebDirect(query: String, lang: String = "ru"): List<WebSourceItem> = withContext(Dispatchers.IO) {
        val clean = query.trim().take(180)
        if (clean.isBlank()) return@withContext emptyList()
        val encoded = URLEncoder.encode(clean, StandardCharsets.UTF_8.name())
        val results = mutableListOf<WebSourceItem>()

        val wikiLang = if (lang == "en" && !clean.any { it in '\u0400'..'\u04FF' }) "en" else "ru"
        runCatching {
            val wikiUrl = "https://$wikiLang.wikipedia.org/w/api.php?action=query&list=search&srsearch=$encoded&srlimit=4&utf8=&format=json"
            val req = Request.Builder()
                .url(wikiUrl)
                .header("User-Agent", "IGseekAndroid/2.0")
                .get()
                .build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@use
                val obj = JSONObject(res.body?.string().orEmpty())
                val arr = obj.optJSONObject("query")?.optJSONArray("search") ?: return@use
                for (i in 0 until arr.length()) {
                    val item = arr.optJSONObject(i) ?: continue
                    val title = item.optString("title").trim()
                    val snippet = item.optString("snippet")
                        .replace(Regex("<[^>]+>"), "")
                        .replace("&quot;", "\"")
                        .replace("&amp;", "&")
                        .trim()
                    if (title.isNotBlank()) {
                        val slug = URLEncoder.encode(title.replace(' ', '_'), StandardCharsets.UTF_8.name())
                        results.add(
                            WebSourceItem(
                                title = title,
                                url = "https://$wikiLang.wikipedia.org/wiki/$slug",
                                snippet = snippet
                            )
                        )
                    }
                }
            }
        }

        runCatching {
            val ddgUrl = "https://api.duckduckgo.com/?q=$encoded&format=json&no_html=1&skip_disambig=1"
            val req = Request.Builder()
                .url(ddgUrl)
                .header("User-Agent", "IGseekAndroid/2.0")
                .get()
                .build()
            client.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@use
                val obj = JSONObject(res.body?.string().orEmpty())
                val abstractText = obj.optString("AbstractText").trim()
                val abstractUrl = obj.optString("AbstractURL").trim()
                val heading = obj.optString("Heading").trim()
                if (abstractText.isNotBlank() && abstractUrl.isNotBlank()) {
                    results.add(
                        0,
                        WebSourceItem(
                            title = heading.ifBlank { "DuckDuckGo" },
                            url = abstractUrl,
                            snippet = abstractText.take(280)
                        )
                    )
                }
            }
        }

        results.distinctBy { it.url }.take(5)
    }

    // ==================== POLLINATIONS IMAGE GENERATION (ALL PLANS) ====================

    suspend fun generateImageDirect(prompt: String): GeneratedImageItem = withContext(Dispatchers.IO) {
        val cleanPrompt = prompt.trim().ifBlank { "modern futuristic red fox minimal dark aesthetic artwork" }
        val encoded = URLEncoder.encode(cleanPrompt, StandardCharsets.UTF_8.name()).replace("+", "%20")
        val seed = (System.currentTimeMillis() % 999_999L).toInt()
        var lastError: Throwable? = null

        for (modelName in listOf("flux", "turbo")) {
            val url = "https://image.pollinations.ai/prompt/$encoded?width=1024&height=1024&nologo=true&seed=$seed&model=$modelName"
            val req = Request.Builder()
                .url(url)
                .header("User-Agent", "IGseekAndroid/2.0")
                .header("Accept", "image/png,image/jpeg,image/webp,image/*")
                .header("Connection", "close")
                .get()
                .build()

            val result = runCatching {
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) {
                        throw IllegalStateException("Pollinations ($modelName) HTTP ${res.code}")
                    }
                    val bytes = res.body?.bytes() ?: throw IllegalStateException("Пустой ответ от Pollinations")
                    if (bytes.size < 512) {
                        throw IllegalStateException("Pollinations вернул некорректное изображение")
                    }
                    val mime = res.header("Content-Type")?.substringBefore(';')?.ifBlank { "image/jpeg" } ?: "image/jpeg"
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    GeneratedImageItem(
                        id = "img_${UUID.randomUUID().toString().take(10)}",
                        title = cleanPrompt.take(70),
                        dataUrl = "data:$mime;base64,$b64"
                    )
                }
            }
            result.onSuccess { return@withContext it }
            lastError = result.exceptionOrNull()
        }

        throw IllegalStateException(
            lastError?.message ?: "Не удалось сгенерировать изображение через Pollinations"
        )
    }

    // ==================== STREAMING CHAT (SERVER OPENROUTER DEEPSEEK < V4.0 + POLLINATIONS) ====================

    suspend fun streamChat(
        session: AuthSession?,
        history: List<ChatMessageItem>,
        model: AiModelId,
        agent: AgentRoleId,
        webSearch: Boolean,
        reasoning: Boolean,
        imageMode: Boolean,
        memories: List<MemoryEntryItem>,
        language: String,
        attachments: List<ChatAttachment>,
        idempotencyKey: String,
        onDelta: (String) -> Unit,
        onReasoning: (String) -> Unit,
        onImage: (GeneratedImageItem) -> Unit,
        onSources: (List<WebSourceItem>) -> Unit
    ): StreamChatResult = withContext(Dispatchers.IO) {
        val lastUserText = history.lastOrNull { it.role == "user" }?.content.orEmpty().trim()

        // Pollinations handles image generation directly when Image Mode or /img /imagine is used (all plans: Free & Pro)
        if (imageMode || lastUserText.startsWith("/img ", ignoreCase = true) || lastUserText.startsWith("/imagine ", ignoreCase = true)) {
            val prompt = lastUserText
                .removePrefix("/img ")
                .removePrefix("/imagine ")
                .trim()
                .ifBlank { lastUserText }
            onDelta(if (language == "en") "Generating image with Pollinations…" else "Генерирую изображение через Pollinations…")
            val img = generateImageDirect(prompt)
            onImage(img)
            val caption = if (language == "en") {
                "Done! Generated image with Pollinations for: **$prompt**"
            } else {
                "Готово! Сгенерировал изображение через Pollinations по запросу: **$prompt**"
            }
            onDelta(caption)
            return@withContext StreamChatResult(
                content = caption,
                reasoning = "",
                images = listOf(img),
                webSources = emptyList()
            )
        }

        val gateway = resolveGatewayUrl()
        val result = streamChatViaGateway(
            gateway = gateway,
            session = session,
            history = history,
            model = model,
            agent = agent,
            webSearch = webSearch,
            reasoning = reasoning,
            attachments = attachments,
            idempotencyKey = idempotencyKey,
            onDelta = onDelta,
            onReasoning = onReasoning,
            onImage = onImage
        )

        if (webSearch && result.webSources.isEmpty() && lastUserText.isNotBlank()) {
            val sources = runCatching { searchWebDirect(lastUserText, language) }.getOrDefault(emptyList())
            if (sources.isNotEmpty()) {
                onSources(sources)
                return@withContext result.copy(webSources = sources)
            }
        }
        result
    }

    private fun decodeJsonDataValue(raw: String): Any? {
        return runCatching { org.json.JSONTokener(raw).nextValue() }.getOrNull()
    }

    private fun streamChatViaGateway(
        gateway: String,
        session: AuthSession?,
        history: List<ChatMessageItem>,
        model: AiModelId,
        agent: AgentRoleId,
        webSearch: Boolean,
        reasoning: Boolean,
        attachments: List<ChatAttachment>,
        idempotencyKey: String,
        onDelta: (String) -> Unit,
        onReasoning: (String) -> Unit,
        onImage: (GeneratedImageItem) -> Unit
    ): StreamChatResult {
        val messagesJson = JSONArray()
        history.takeLast(14).forEach { msg ->
            if (msg.content.isNotBlank()) {
                messagesJson.put(JSONObject().apply {
                    put("role", if (msg.role == "user") "user" else "assistant")
                    put("content", msg.content)
                })
            }
        }
        val filesJson = JSONArray()
        attachments.forEach { att ->
            filesJson.put(JSONObject().apply {
                put("name", att.name)
                put("type", att.mimeType)
                put("dataUrl", att.dataUrl)
            })
        }

        val payload = JSONObject().apply {
            put("messages", messagesJson)
            put("model", model.apiId)
            put("agent", agent.apiId)
            put("webSearch", webSearch)
            put("reasoning", reasoning)
            if (filesJson.length() > 0) put("userAttachments", filesJson)
        }

        // Force fresh TCP stream per SSE chat request ("Connection: close") to prevent 2nd-request socket stalls
        val reqBuilder = Request.Builder()
            .url("$gateway/api/chat")
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "close")
            .header("X-Idempotency-Key", idempotencyKey)
            .post(payload.toString().toRequestBody(jsonMedia))
        gatewayHeaders(reqBuilder, session)

        val contentBuf = StringBuilder()
        val reasoningBuf = StringBuilder()
        val images = mutableListOf<GeneratedImageItem>()
        var serverError: String? = null

        val call = client.newCall(reqBuilder.build())
        activeChatCall = call
        try {
            call.execute().use { res ->
                val finalUrl = res.request.url.toString()
                if (finalUrl.contains("cookie_check", ignoreCase = true) || finalUrl.contains("accounts.google", ignoreCase = true)) {
                    throw IllegalStateException(
                        "Адрес $gateway защищён окном браузера. Укажите публичный URL вашего сервера IGseek (например Vercel/Northflank) в Настройки → Сервер IGseek API."
                    )
                }

                if (!res.isSuccessful) {
                    val errText = runCatching { res.body?.string().orEmpty() }.getOrDefault("")
                    val errMsg = runCatching { JSONObject(errText).optString("error") }.getOrNull()
                        ?.takeIf { it.isNotBlank() }
                        ?: "Сервер IGseek ($gateway) вернул HTTP ${res.code}"
                    throw IllegalStateException(errMsg)
                }

                val contentType = res.header("Content-Type").orEmpty()
                if (contentType.contains("text/html", ignoreCase = true)) {
                    throw IllegalStateException(
                        "Сервер $gateway вернул HTML вместо потока DeepSeek. Укажите корректный URL бэкенда в Настройки → Сервер IGseek API."
                    )
                }

                val body = res.body ?: throw IllegalStateException("Пустой ответ от сервера IGseek")
                BufferedReader(InputStreamReader(body.byteStream(), StandardCharsets.UTF_8)).use { reader ->
                    var currentEvent = ""
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        if (call.isCanceled()) break
                        val rawLine = line ?: continue
                        val trimmed = rawLine.trim()
                        if (trimmed.isEmpty()) {
                            currentEvent = ""
                            continue
                        }
                        if (trimmed.startsWith(":")) continue
                        if (trimmed.startsWith("event:")) {
                            currentEvent = trimmed.removePrefix("event:").trim()
                            continue
                        }
                        if (!trimmed.startsWith("data:")) continue
                        val data = trimmed.removePrefix("data:").trim()
                        if (data.isEmpty() || data == "[DONE]") continue

                        if (currentEvent == "done") break

                        val decoded = decodeJsonDataValue(data)
                        when (currentEvent) {
                            "delta" -> {
                                val chunk = decoded as? String ?: data
                                if (chunk.isNotEmpty()) {
                                    contentBuf.append(chunk)
                                    onDelta(contentBuf.toString())
                                }
                            }
                            "reasoning" -> {
                                val chunk = decoded as? String ?: data
                                if (chunk.isNotEmpty()) {
                                    reasoningBuf.append(chunk)
                                    onReasoning(reasoningBuf.toString())
                                }
                            }
                            "image" -> {
                                val obj = decoded as? JSONObject
                                val dataUrl = obj?.optString("dataUrl").orEmpty()
                                if (dataUrl.isNotBlank()) {
                                    val img = GeneratedImageItem(
                                        id = obj?.optString("id").orEmpty().ifBlank { UUID.randomUUID().toString() },
                                        title = obj?.optString("title", "IGseek Image").orEmpty().ifBlank { "IGseek Image" },
                                        dataUrl = dataUrl
                                    )
                                    images.add(img)
                                    onImage(img)
                                }
                            }
                            "error" -> {
                                val msg = (decoded as? String)
                                    ?: (decoded as? JSONObject)?.optString("message")
                                    ?: data
                                if (msg.isNotBlank()) {
                                    serverError = msg
                                }
                                break
                            }
                            else -> {
                                val obj = decoded as? JSONObject
                                if (obj != null) {
                                    val errObj = obj.optJSONObject("error")?.optString("message")
                                    if (!errObj.isNullOrBlank()) {
                                        serverError = errObj
                                        break
                                    }
                                    val delta = obj.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("delta")
                                    if (delta != null) {
                                        val c = delta.optString("content")
                                        if (c.isNotEmpty() && c != "null") {
                                            contentBuf.append(c)
                                            onDelta(contentBuf.toString())
                                        }
                                        val r = delta.optString("reasoning_content")
                                        if (r.isNotEmpty() && r != "null") {
                                            reasoningBuf.append(r)
                                            onReasoning(reasoningBuf.toString())
                                        }
                                    }
                                    if (obj.optString("type") == "image_generated") {
                                        val dataUrl = obj.optString("dataUrl")
                                        if (dataUrl.isNotBlank()) {
                                            val img = GeneratedImageItem(
                                                id = obj.optString("id").ifBlank { UUID.randomUUID().toString() },
                                                title = obj.optString("title", "IGseek Image"),
                                                dataUrl = dataUrl
                                            )
                                            images.add(img)
                                            onImage(img)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (ce: CancellationException) {
            throw ce
        } finally {
            if (activeChatCall === call) {
                activeChatCall = null
            }
        }

        if (serverError != null && contentBuf.isEmpty() && images.isEmpty()) {
            throw IllegalStateException(serverError)
        }
        return StreamChatResult(contentBuf.toString(), reasoningBuf.toString(), images, emptyList())
    }

    // ==================== AUTONOMOUS FLOW VIA BACKEND DEEPSEEK ====================

    suspend fun planFlow(session: AuthSession?, goal: String, language: String = "ru"): FlowPlanResult = withContext(Dispatchers.IO) {
        val gateway = resolveGatewayUrl()
        val payload = JSONObject().apply {
            put("action", "plan")
            put("goal", goal)
            put("autonomy", "semi-auto")
            put("model", "instinct")
        }
        val reqBuilder = Request.Builder()
            .url("$gateway/api/flow")
            .header("Connection", "close")
            .post(payload.toString().toRequestBody(jsonMedia))
        gatewayHeaders(reqBuilder, session)

        runCatching {
            nonRedirectClient.newCall(reqBuilder.build()).execute().use { res ->
                if (!res.isSuccessful) throw IllegalStateException("Flow plan HTTP ${res.code}")
                val raw = res.body?.string().orEmpty()
                val obj = JSONObject(raw)
                val planObj = obj.optJSONObject("plan") ?: obj
                val stepsArr = planObj.optJSONArray("steps") ?: JSONArray()
                val steps = mutableListOf<FlowStepItem>()
                for (i in 0 until stepsArr.length()) {
                    val s = stepsArr.optJSONObject(i) ?: continue
                    steps.add(
                        FlowStepItem(
                            id = s.optString("id").ifBlank { "step_${i + 1}" },
                            title = s.optString("title").ifBlank { "Шаг ${i + 1}" },
                            description = s.optString("description"),
                            tool = s.optString("tool").ifBlank { "analyze" },
                            requiresApproval = s.optBoolean("requiresApproval", false)
                        )
                    )
                }
                if (steps.isNotEmpty()) {
                    return@withContext FlowPlanResult(
                        title = planObj.optString("title").ifBlank { goal.take(60) },
                        steps = steps
                    )
                }
            }
        }

        FlowPlanResult(
            title = goal.take(60),
            steps = if (language == "en") {
                listOf(
                    FlowStepItem("s1", "Analyze goal & requirements", "Define structure and criteria", "analyze"),
                    FlowStepItem("s2", "Gather facts & context", "Collect relevant sources", "web_search"),
                    FlowStepItem("s3", "Produce final deliverable", "Format result in Markdown", "write")
                )
            } else {
                listOf(
                    FlowStepItem("s1", "Анализ цели и требований", "Определение ключевых критериев успеха и структуры задачи", "analyze"),
                    FlowStepItem("s2", "Сбор данных и фактов", "Поиск актуальной информации и лучших практик по теме", "web_search"),
                    FlowStepItem("s3", "Подготовка итогового решения", "Формирование структурированного результата в Markdown", "write")
                )
            }
        )
    }

    suspend fun executeFlowStep(
        session: AuthSession?,
        goal: String,
        step: FlowStepItem,
        previousOutputs: List<Pair<String, String>>,
        language: String = "ru"
    ): String = withContext(Dispatchers.IO) {
        val gateway = resolveGatewayUrl()
        val prevJson = JSONArray()
        previousOutputs.forEach { (title, output) ->
            prevJson.put(JSONObject().apply {
                put("title", title)
                put("tool", "write")
                put("status", "done")
                put("output", output.take(1500))
            })
        }
        val payload = JSONObject().apply {
            put("action", "run_step")
            put("step", JSONObject().apply {
                put("id", step.id)
                put("title", step.title)
                put("description", step.description)
                put("tool", step.tool)
                put("requiresApproval", step.requiresApproval)
            })
            put("taskContext", JSONObject().apply {
                put("goal", goal)
                put("autonomy", "semi-auto")
                put("model", "instinct")
                put("previousSteps", prevJson)
            })
        }
        val reqBuilder = Request.Builder()
            .url("$gateway/api/flow")
            .header("Connection", "close")
            .post(payload.toString().toRequestBody(jsonMedia))
        gatewayHeaders(reqBuilder, session)

        nonRedirectClient.newCall(reqBuilder.build()).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                val errMsg = runCatching { JSONObject(raw).optString("error") }.getOrNull()?.takeIf { it.isNotBlank() }
                    ?: "Ошибка Flow (${res.code})"
                throw IllegalStateException(errMsg)
            }
            val obj = JSONObject(raw)
            val stepRes = obj.optJSONObject("stepResult")
            stepRes?.optString("output")?.takeIf { it.isNotBlank() }
                ?: stepRes?.optString("error")?.takeIf { it.isNotBlank() }
                ?: "Шаг выполнен."
        }
    }

    // ==================== ENGINE CODE BUILDER VIA BACKEND DEEPSEEK ====================

    suspend fun generateEngineProject(prompt: String, language: String = "ru"): EngineProjectItem = withContext(Dispatchers.IO) {
        val sysPrompt = """
            You are IGseek Engine — an elite full-stack code generator.
            Generate a clean, complete multi-file starter project for the user's prompt.
            Return ONLY valid JSON:
            {"title":"Project Name","files":[{"path":"index.html","content":"..."},{"path":"styles.css","content":"..."},{"path":"app.js","content":"..."}]}
            Keep code concise, modern, and production-ready (2 to 4 files).
            User prompt: $prompt
        """.trimIndent()

        val gateway = resolveGatewayUrl()
        val streamed = streamChatViaGateway(
            gateway = gateway,
            session = null,
            history = listOf(
                ChatMessageItem(
                    id = "eng_prompt",
                    chatId = "eng",
                    role = "user",
                    content = sysPrompt,
                    createdAtMs = System.currentTimeMillis()
                )
            ),
            model = AiModelId.INSTINCT,
            agent = AgentRoleId.CODER,
            webSearch = false,
            reasoning = false,
            attachments = emptyList(),
            idempotencyKey = UUID.randomUUID().toString(),
            onDelta = {},
            onReasoning = {},
            onImage = {}
        )

        val raw = streamed.content
        val parsed = extractJsonObject(raw)
        val files = mutableListOf<EngineFileItem>()
        var title = prompt.take(48)

        if (parsed != null) {
            title = parsed.optString("title").ifBlank { title }
            val arr = parsed.optJSONArray("files")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val f = arr.optJSONObject(i) ?: continue
                    val path = f.optString("path").trim()
                    val content = f.optString("content")
                    if (path.isNotBlank() && content.isNotBlank()) {
                        files.add(EngineFileItem(path = path, content = content))
                    }
                }
            }
        }

        if (files.isEmpty()) {
            files.add(EngineFileItem(path = "README.md", content = raw.ifBlank { "# $title\n\nПроект создан в IGseek Engine." }))
        }

        EngineProjectItem(
            id = "eng_${UUID.randomUUID().toString().replace("-", "").take(12)}",
            title = title,
            prompt = prompt,
            activeFile = files.first().path,
            files = files,
            updatedAtMs = System.currentTimeMillis()
        )
    }

    // ==================== SUBSCRIPTION LICENSE KEY REDEMPTION ====================

    private fun parseSubscriptionJson(obj: JSONObject): SubscriptionInfo = SubscriptionInfo(
        plan = obj.optString("plan", "free"),
        isPro = obj.optBoolean("isPro", false),
        status = obj.optString("status", "free"),
        daysLeft = obj.optInt("daysLeft", 0),
        expiresAt = obj.optString("expiresAt").takeIf { it.isNotBlank() && it != "null" },
        lastKeyId = obj.optString("lastKeyId").takeIf { it.isNotBlank() && it != "null" },
        durationDays = obj.optInt("durationDays", 30)
    )

    suspend fun getSubscription(session: AuthSession): SubscriptionInfo = withContext(Dispatchers.IO) {
        if (session.isGuest || session.idToken.isBlank()) return@withContext SubscriptionInfo()
        val gateway = resolveGatewayUrl()
        val req = gatewayHeaders(Request.Builder().url("$gateway/api/subscription").get(), session).build()
        runCatching {
            nonRedirectClient.newCall(req).execute().use { res ->
                if (!res.isSuccessful) return@use SubscriptionInfo()
                parseSubscriptionJson(JSONObject(res.body?.string().orEmpty()))
            }
        }.getOrDefault(SubscriptionInfo())
    }

    suspend fun redeemLicenseKey(session: AuthSession, rawKey: String): SubscriptionInfo = withContext(Dispatchers.IO) {
        val gateway = resolveGatewayUrl()
        val payload = JSONObject().apply {
            put("action", "redeem")
            put("key", rawKey.trim())
        }
        val req = gatewayHeaders(
            Request.Builder()
                .url("$gateway/api/subscription")
                .post(payload.toString().toRequestBody(jsonMedia)),
            session
        ).build()
        nonRedirectClient.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            val obj = runCatching { JSONObject(raw) }.getOrNull()
            if (!res.isSuccessful) {
                val errMsg = obj?.optString("error")?.ifBlank { null }
                    ?: "Не удалось активировать ключ (${res.code})"
                throw IllegalStateException(errMsg)
            }
            val subObj = obj?.optJSONObject("subscription")
                ?: throw IllegalStateException("Сервер вернул некорректный ответ подписки")
            parseSubscriptionJson(subObj)
        }
    }

    private fun extractJsonObject(raw: String): JSONObject? {
        val cleaned = raw
            .replace(Regex("^```(?:json)?\\s*", RegexOption.MULTILINE), "")
            .replace(Regex("```\\s*$", RegexOption.MULTILINE), "")
            .trim()
        runCatching { return JSONObject(cleaned) }
        val start = cleaned.indexOf('{')
        val end = cleaned.lastIndexOf('}')
        if (start >= 0 && end > start) {
            runCatching { return JSONObject(cleaned.substring(start, end + 1)) }
        }
        return null
    }
}
