package app.igseek.mobile.data.api

import app.igseek.mobile.BuildConfig
import app.igseek.mobile.data.models.AuthSession
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.ChatThread
import app.igseek.mobile.data.models.EngineFileItem
import app.igseek.mobile.data.models.EngineProjectItem
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.data.models.ProjectFolder
import app.igseek.mobile.data.models.SubscriptionInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.format.DateTimeFormatter

data class RemoteProfileData(
    val displayName: String? = null,
    val theme: String? = null,
    val accent: String? = null,
    val lang: String? = null,
    val subscription: SubscriptionInfo = SubscriptionInfo()
)

class FirestoreSyncClient(private val client: OkHttpClient) {

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val projectId: String = BuildConfig.FIREBASE_PROJECT_ID.trim()
    private val databaseId: String = BuildConfig.FIREBASE_DATABASE_ID.trim().ifBlank { "(default)" }

    val isConfigured: Boolean
        get() = projectId.isNotBlank()

    private fun docsBaseUrl(): String =
        "https://firestore.googleapis.com/v1/projects/$projectId/databases/$databaseId/documents"

    private fun canSync(session: AuthSession?): Boolean {
        return isConfigured && session != null && session.isCloudSynced && session.uid.isNotBlank()
    }

    private fun sanitizeDocId(rawId: String): String {
        val cleaned = rawId.replace(Regex("[^a-zA-Z0-9_\\-]"), "_").take(120)
        return cleaned.ifBlank { "doc_${System.currentTimeMillis()}" }
    }

    private fun nowIso(): String = DateTimeFormatter.ISO_INSTANT.format(Instant.now())

    private fun parseIsoToMs(iso: String?, fallback: Long = System.currentTimeMillis()): Long {
        if (iso.isNullOrBlank()) return fallback
        return runCatching { Instant.parse(iso).toEpochMilli() }.getOrDefault(fallback)
    }

    private fun msToIso(ms: Long): String =
        runCatching { DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(ms)) }.getOrElse { nowIso() }

    // ==================== FIRESTORE VALUE HELPERS ====================

    private fun strVal(v: String): JSONObject = JSONObject().put("stringValue", v)
    private fun boolVal(v: Boolean): JSONObject = JSONObject().put("booleanValue", v)
    private fun intVal(v: Long): JSONObject = JSONObject().put("integerValue", v.toString())
    private fun nullVal(): JSONObject = JSONObject().put("nullValue", JSONObject.NULL)

    private fun optStr(fields: JSONObject?, key: String): String? {
        val f = fields?.optJSONObject(key) ?: return null
        return if (f.has("stringValue")) f.optString("stringValue") else null
    }

    private fun optBool(fields: JSONObject?, key: String, default: Boolean = false): Boolean {
        val f = fields?.optJSONObject(key) ?: return default
        return if (f.has("booleanValue")) f.optBoolean("booleanValue", default) else default
    }

    private fun optLong(fields: JSONObject?, key: String, default: Long = 0L): Long {
        val f = fields?.optJSONObject(key) ?: return default
        return when {
            f.has("integerValue") -> f.optString("integerValue").toLongOrNull() ?: default
            f.has("doubleValue") -> f.optDouble("doubleValue", default.toDouble()).toLong()
            else -> default
        }
    }

    private fun extractDocId(docName: String): String = docName.substringAfterLast('/')

    private fun runUserCollectionQuery(
        session: AuthSession,
        collectionId: String,
        limit: Int = 100
    ): List<Pair<String, JSONObject>> {
        val results = LinkedHashMap<String, JSONObject>()
        var anySucceeded = false
        var lastError: Throwable? = null
        for (ownerField in listOf("user_id", "userId")) {
            val queryBody = JSONObject().put(
                "structuredQuery",
                JSONObject().apply {
                    put("from", JSONArray().put(JSONObject().put("collectionId", collectionId)))
                    put(
                        "where",
                        JSONObject().put(
                            "fieldFilter",
                            JSONObject().apply {
                                put("field", JSONObject().put("fieldPath", ownerField))
                                put("op", "EQUAL")
                                put("value", strVal(session.uid))
                            }
                        )
                    )
                    put("limit", limit)
                }
            )
            val req = Request.Builder()
                .url("${docsBaseUrl()}:runQuery")
                .header("Authorization", "Bearer ${session.idToken}")
                .post(queryBody.toString().toRequestBody(jsonMedia))
                .build()
            runCatching {
                client.newCall(req).execute().use { res ->
                    val raw = res.body?.string().orEmpty()
                    if (!res.isSuccessful) {
                        lastError = IllegalStateException("Firestore $collectionId HTTP ${res.code}: ${raw.take(160)}")
                        return@use
                    }
                    anySucceeded = true
                    val arr = JSONArray(raw)
                    for (i in 0 until arr.length()) {
                        val row = arr.optJSONObject(i) ?: continue
                        val doc = row.optJSONObject("document") ?: continue
                        val docName = doc.optString("name")
                        val fields = doc.optJSONObject("fields") ?: continue
                        if (docName.isNotBlank()) {
                            results[extractDocId(docName)] = fields
                        }
                    }
                }
            }.onFailure { lastError = it }
        }
        if (!anySucceeded && lastError != null) {
            throw lastError!!
        }
        return results.entries.map { it.key to it.value }
    }

    private fun patchDocument(
        session: AuthSession,
        collectionId: String,
        docId: String,
        fields: JSONObject
    ): Boolean {
        val safeId = sanitizeDocId(docId)
        val body = JSONObject().put("fields", fields)
        val req = Request.Builder()
            .url("${docsBaseUrl()}/$collectionId/$safeId")
            .header("Authorization", "Bearer ${session.idToken}")
            .patch(body.toString().toRequestBody(jsonMedia))
            .build()
        return runCatching {
            client.newCall(req).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    private fun deleteDocument(
        session: AuthSession,
        collectionId: String,
        docId: String
    ): Boolean {
        val safeId = sanitizeDocId(docId)
        val req = Request.Builder()
            .url("${docsBaseUrl()}/$collectionId/$safeId")
            .header("Authorization", "Bearer ${session.idToken}")
            .delete()
            .build()
        return runCatching {
            client.newCall(req).execute().use { it.isSuccessful || it.code == 404 }
        }.getOrDefault(false)
    }

    // ==================== PROFILE & SUBSCRIPTION ====================

    suspend fun fetchProfile(session: AuthSession): RemoteProfileData? = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext null
        val safeUid = sanitizeDocId(session.uid)
        val req = Request.Builder()
            .url("${docsBaseUrl()}/profiles/$safeUid")
            .header("Authorization", "Bearer ${session.idToken}")
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val raw = res.body?.string().orEmpty()
            if (res.code == 404) return@use null
            if (!res.isSuccessful) {
                throw IllegalStateException("Firestore profile HTTP ${res.code}: ${raw.take(140)}")
            }
            val obj = JSONObject(raw)
            val fields = obj.optJSONObject("fields") ?: return@use null
            val plan = optStr(fields, "plan") ?: "free"
            val status = optStr(fields, "subscription_status")
                ?: optStr(fields, "subscriptionStatus")
                ?: plan
            val expiresAt = optStr(fields, "subscription_expires_at")
                ?: optStr(fields, "subscriptionExpiresAt")
            val lifetime = optBool(fields, "pro_lifetime") || optBool(fields, "proLifetime")
            val expiresMs = expiresAt?.let { parseIsoToMs(it, 0L) } ?: 0L
            val daysLeft = if (expiresMs > System.currentTimeMillis()) {
                ((expiresMs - System.currentTimeMillis()) / 86_400_000L).toInt().coerceAtLeast(1)
            } else 0
            val isPro = lifetime || plan.equals("pro", ignoreCase = true) ||
                (status.equals("active", ignoreCase = true) && (expiresMs == 0L || expiresMs > System.currentTimeMillis()))

            RemoteProfileData(
                displayName = optStr(fields, "display_name") ?: optStr(fields, "displayName"),
                theme = optStr(fields, "theme"),
                accent = optStr(fields, "accent"),
                lang = optStr(fields, "lang"),
                subscription = SubscriptionInfo(
                    plan = if (isPro) "pro" else "free",
                    isPro = isPro,
                    status = if (isPro) "active" else status,
                    daysLeft = if (lifetime) 9999 else daysLeft,
                    expiresAt = expiresAt,
                    lastKeyId = optStr(fields, "subscription_txn_id") ?: optStr(fields, "subscriptionTxnId"),
                    durationDays = 30
                )
            )
        }
    }

    suspend fun ensureProfileExists(
        session: AuthSession,
        theme: String,
        accent: String,
        lang: String
    ) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val existing = runCatching { fetchProfile(session) }.getOrNull()
        if (existing != null) return@withContext

        val safeUid = sanitizeDocId(session.uid)
        val now = nowIso()
        val resolvedName = session.displayName.take(120).ifBlank {
            session.email.substringBefore("@").take(120).ifBlank { "User" }
        }
        val fields = JSONObject().apply {
            put("id", strVal(session.uid))
            put("email", strVal(session.email))
            put("display_name", strVal(resolvedName))
            put("displayName", strVal(resolvedName))
            put("theme", strVal(theme))
            put("accent", strVal(accent))
            put("lang", strVal(lang))
            put("model", strVal("instinct"))
            put("agent", strVal("universal"))
            put("plan", strVal("free"))
            put("pro_lifetime", boolVal(false))
            put("proLifetime", boolVal(false))
            put("defaults_v2_migrated", boolVal(true))
            put("created_at", strVal(now))
            put("createdAt", strVal(now))
            put("updated_at", strVal(now))
            put("updatedAt", strVal(now))
        }
        val maskParams = listOf(
            "id", "email", "display_name", "displayName", "theme", "accent", "lang",
            "model", "agent", "plan", "pro_lifetime", "proLifetime", "defaults_v2_migrated",
            "created_at", "createdAt", "updated_at", "updatedAt"
        ).joinToString("&") { "updateMask.fieldPaths=$it" }
        val req = Request.Builder()
            .url("${docsBaseUrl()}/profiles/$safeUid?$maskParams")
            .header("Authorization", "Bearer ${session.idToken}")
            .patch(JSONObject().put("fields", fields).toString().toRequestBody(jsonMedia))
            .build()
        runCatching { client.newCall(req).execute().close() }
    }

    suspend fun saveProfilePrefs(
        session: AuthSession,
        theme: String,
        accent: String,
        lang: String
    ) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val safeUid = sanitizeDocId(session.uid)
        val now = nowIso()
        val resolvedName = session.displayName.take(120).ifBlank {
            session.email.substringBefore("@").take(120).ifBlank { "User" }
        }
        val fields = JSONObject().apply {
            put("id", strVal(session.uid))
            put("email", strVal(session.email))
            put("display_name", strVal(resolvedName))
            put("displayName", strVal(resolvedName))
            put("theme", strVal(theme))
            put("accent", strVal(accent))
            put("lang", strVal(lang))
            put("updated_at", strVal(now))
            put("updatedAt", strVal(now))
        }
        val maskParams = listOf(
            "id", "email", "display_name", "displayName", "theme", "accent", "lang", "updated_at", "updatedAt"
        ).joinToString("&") { "updateMask.fieldPaths=$it" }
        val req = Request.Builder()
            .url("${docsBaseUrl()}/profiles/$safeUid?$maskParams")
            .header("Authorization", "Bearer ${session.idToken}")
            .patch(JSONObject().put("fields", fields).toString().toRequestBody(jsonMedia))
            .build()
        runCatching { client.newCall(req).execute().close() }
    }

    // ==================== PROJECTS ====================

    suspend fun fetchProjects(session: AuthSession): List<ProjectFolder> = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext emptyList()
        runUserCollectionQuery(session, "projects", 80).mapNotNull { (id, f) ->
            val name = optStr(f, "name")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val updated = optStr(f, "updated_at") ?: optStr(f, "updatedAt")
            ProjectFolder(id = id, name = name, updatedAtMs = parseIsoToMs(updated))
        }.sortedByDescending { it.updatedAtMs }
    }

    suspend fun syncProject(session: AuthSession, project: ProjectFolder) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val iso = msToIso(project.updatedAtMs)
        val fields = JSONObject().apply {
            put("user_id", strVal(session.uid))
            put("userId", strVal(session.uid))
            put("name", strVal(project.name.take(100)))
            put("created_at", strVal(iso))
            put("createdAt", strVal(iso))
            put("updated_at", strVal(iso))
            put("updatedAt", strVal(iso))
        }
        patchDocument(session, "projects", project.id, fields)
    }

    suspend fun deleteProject(session: AuthSession, projectId: String) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        deleteDocument(session, "projects", projectId)
    }

    // ==================== CHATS & MESSAGES ====================

    suspend fun fetchChats(session: AuthSession): List<ChatThread> = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext emptyList()
        runUserCollectionQuery(session, "chats", 120).map { (id, f) ->
            val title = optStr(f, "title")?.takeIf { it.isNotBlank() } ?: "Новый чат"
            val updated = optStr(f, "updated_at") ?: optStr(f, "updatedAt") ?: optStr(f, "created_at")
            val saved = optBool(f, "is_saved") || optBool(f, "isSaved")
            val projectId = optStr(f, "project_id") ?: optStr(f, "projectId")
            ChatThread(
                id = id,
                title = title,
                updatedAtMs = parseIsoToMs(updated),
                isSaved = saved,
                projectId = projectId?.takeIf { it.isNotBlank() }
            )
        }.sortedByDescending { it.updatedAtMs }
    }

    suspend fun syncChat(session: AuthSession, chat: ChatThread) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val iso = msToIso(chat.updatedAtMs)
        val fields = JSONObject().apply {
            put("user_id", strVal(session.uid))
            put("userId", strVal(session.uid))
            put("title", strVal(chat.title.take(200)))
            put("chat_type", strVal("chat"))
            put("chatType", strVal("chat"))
            put("is_saved", boolVal(chat.isSaved))
            put("isSaved", boolVal(chat.isSaved))
            val projId = chat.projectId
            if (!projId.isNullOrBlank()) {
                put("project_id", strVal(projId))
                put("projectId", strVal(projId))
            } else {
                put("project_id", nullVal())
                put("projectId", nullVal())
            }
            put("updated_at", strVal(iso))
            put("updatedAt", strVal(iso))
            put("created_at", strVal(iso))
            put("createdAt", strVal(iso))
        }
        patchDocument(session, "chats", chat.id, fields)
    }

    suspend fun deleteChat(session: AuthSession, chatId: String) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        deleteDocument(session, "chats", chatId)
    }

    suspend fun fetchMessagesForChat(session: AuthSession, chatId: String): List<ChatMessageItem> = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext emptyList()
        val all = runUserCollectionQuery(session, "chat_messages", 400)
        all.mapNotNull { (id, f) ->
            val msgChatId = optStr(f, "chat_id") ?: optStr(f, "chatId") ?: return@mapNotNull null
            if (msgChatId != chatId) return@mapNotNull null
            val role = optStr(f, "role") ?: "assistant"
            val content = optStr(f, "content") ?: ""
            val reasoning = optStr(f, "reasoning") ?: ""
            val createdAt = optStr(f, "created_at") ?: optStr(f, "createdAt")
            val pos = optLong(f, "position", 0L)
            val imgs = parseFirestoreImages(f.optJSONObject("images"))
            ChatMessageItem(
                id = id,
                chatId = msgChatId,
                role = role,
                content = content,
                reasoning = reasoning,
                images = imgs,
                createdAtMs = parseIsoToMs(createdAt, pos)
            )
        }.sortedBy { it.createdAtMs }
    }

    private fun parseFirestoreImages(field: JSONObject?): List<GeneratedImageItem> {
        val values = field?.optJSONObject("arrayValue")?.optJSONArray("values") ?: return emptyList()
        val out = mutableListOf<GeneratedImageItem>()
        for (i in 0 until values.length()) {
            val mapFields = values.optJSONObject(i)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
            val dataUrl = optStr(mapFields, "dataUrl") ?: continue
            val title = optStr(mapFields, "title") ?: "IGseek Image"
            val id = optStr(mapFields, "id") ?: "img_$i"
            out.add(GeneratedImageItem(id = id, title = title, dataUrl = dataUrl))
        }
        return out
    }

    suspend fun syncMessage(session: AuthSession, msg: ChatMessageItem, position: Int) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val iso = msToIso(msg.createdAtMs)
        val fields = JSONObject().apply {
            put("user_id", strVal(session.uid))
            put("userId", strVal(session.uid))
            put("chat_id", strVal(msg.chatId))
            put("chatId", strVal(msg.chatId))
            put("role", strVal(if (msg.role == "user") "user" else "assistant"))
            put("content", strVal(msg.content.take(900_000)))
            if (msg.reasoning.isNotBlank()) {
                put("reasoning", strVal(msg.reasoning.take(400_000)))
            }
            if (msg.images.isNotEmpty()) {
                val imgValues = JSONArray()
                var totalImgChars = 0
                for (img in msg.images.take(6)) {
                    if (img.dataUrl.length > 220_000 || totalImgChars + img.dataUrl.length > 550_000) continue
                    totalImgChars += img.dataUrl.length
                    val mapFields = JSONObject().apply {
                        put("id", strVal(img.id.take(120)))
                        put("title", strVal(img.title.take(200)))
                        put("dataUrl", strVal(img.dataUrl))
                    }
                    imgValues.put(JSONObject().put("mapValue", JSONObject().put("fields", mapFields)))
                }
                if (imgValues.length() > 0) {
                    put("images", JSONObject().put("arrayValue", JSONObject().put("values", imgValues)))
                }
            }
            put("position", intVal(position.toLong()))
            put("created_at", strVal(iso))
            put("createdAt", strVal(iso))
            put("updated_at", strVal(iso))
            put("updatedAt", strVal(iso))
        }
        patchDocument(session, "chat_messages", msg.id, fields)
    }

    // ==================== MEMORIES ====================

    suspend fun fetchMemories(session: AuthSession): List<MemoryEntryItem> = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext emptyList()
        runUserCollectionQuery(session, "memories", 150).mapNotNull { (id, f) ->
            val content = optStr(f, "content")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            MemoryEntryItem(
                id = id,
                content = content,
                kind = optStr(f, "kind") ?: "other",
                createdAt = optStr(f, "created_at") ?: optStr(f, "createdAt") ?: ""
            )
        }.sortedByDescending { it.createdAt }
    }

    suspend fun syncMemory(session: AuthSession, entry: MemoryEntryItem) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val iso = entry.createdAt.ifBlank { nowIso() }
        val now = nowIso()
        val fields = JSONObject().apply {
            put("user_id", strVal(session.uid))
            put("userId", strVal(session.uid))
            put("content", strVal(entry.content.take(4000)))
            put("kind", strVal(entry.kind.take(50).ifBlank { "other" }))
            put("created_at", strVal(iso))
            put("createdAt", strVal(iso))
            put("updated_at", strVal(now))
            put("updatedAt", strVal(now))
        }
        patchDocument(session, "memories", entry.id, fields)
    }

    suspend fun deleteMemory(session: AuthSession, id: String) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        deleteDocument(session, "memories", id)
    }

    // ==================== LIBRARY FILES ====================

    suspend fun fetchLibraryFiles(session: AuthSession): List<LibraryFileItem> = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext emptyList()
        runUserCollectionQuery(session, "library_files", 120).mapNotNull { (id, f) ->
            val name = optStr(f, "name")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val type = optStr(f, "type") ?: "doc"
            val content = optStr(f, "content")
            val isDataImage = content?.startsWith("data:image/") == true
            LibraryFileItem(
                id = id,
                name = name,
                type = if (isDataImage) "image" else type,
                mimeType = if (isDataImage) "image/jpeg" else "text/plain",
                sizeBytes = content?.length?.toLong() ?: 0L,
                source = optStr(f, "source") ?: "library",
                chatTitle = optStr(f, "taskTitle") ?: "Library",
                updatedAt = optStr(f, "updatedAt") ?: optStr(f, "updated_at") ?: "",
                content = if (isDataImage) null else content,
                dataUrl = if (isDataImage) content else null
            )
        }.sortedByDescending { it.updatedAt }
    }

    suspend fun syncLibraryFile(session: AuthSession, item: LibraryFileItem) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val bodyText = (item.dataUrl ?: item.content ?: "").take(850_000)
        val iso = item.updatedAt.ifBlank { nowIso() }
        val fields = JSONObject().apply {
            put("user_id", strVal(session.uid))
            put("userId", strVal(session.uid))
            put("name", strVal(item.name.take(260)))
            put("type", strVal(item.type.take(50).ifBlank { "doc" }))
            put("content", strVal(bodyText))
            put("source", strVal(item.source.take(40).ifBlank { "library" }))
            put("taskTitle", strVal(item.chatTitle.take(200)))
            put("created_at", strVal(iso))
            put("createdAt", strVal(iso))
            put("updated_at", strVal(iso))
            put("updatedAt", strVal(iso))
        }
        patchDocument(session, "library_files", item.id, fields)
    }

    suspend fun deleteLibraryFile(session: AuthSession, id: String) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        deleteDocument(session, "library_files", id)
    }

    // ==================== ENGINE PROJECTS ====================

    suspend fun fetchEngineProjects(session: AuthSession): List<EngineProjectItem> = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext emptyList()
        runUserCollectionQuery(session, "engine_projects", 50).mapNotNull { (id, f) ->
            val title = optStr(f, "title")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val activeFile = optStr(f, "activeFile") ?: ""
            val updated = optStr(f, "updatedAt") ?: optStr(f, "updated_at")
            val filesMap = f.optJSONObject("files")?.optJSONObject("mapValue")?.optJSONObject("fields")
            val files = mutableListOf<EngineFileItem>()
            if (filesMap != null) {
                val keys = filesMap.keys()
                while (keys.hasNext()) {
                    val path = keys.next()
                    val code = optStr(filesMap, path) ?: ""
                    files.add(EngineFileItem(path = path, content = code))
                }
            }
            EngineProjectItem(
                id = id,
                title = title,
                activeFile = activeFile.ifBlank { files.firstOrNull()?.path.orEmpty() },
                files = files.sortedBy { it.path },
                updatedAtMs = parseIsoToMs(updated)
            )
        }.sortedByDescending { it.updatedAtMs }
    }

    suspend fun syncEngineProject(session: AuthSession, project: EngineProjectItem) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        val iso = msToIso(project.updatedAtMs)
        val fileFields = JSONObject()
        project.files.forEach { file ->
            fileFields.put(file.path, strVal(file.content.take(200_000)))
        }
        val fields = JSONObject().apply {
            put("user_id", strVal(session.uid))
            put("userId", strVal(session.uid))
            put("title", strVal(project.title.take(200)))
            put("activeFile", strVal(project.activeFile.take(260)))
            put("files", JSONObject().put("mapValue", JSONObject().put("fields", fileFields)))
            put("created_at", strVal(iso))
            put("createdAt", strVal(iso))
            put("updated_at", strVal(iso))
            put("updatedAt", strVal(iso))
        }
        patchDocument(session, "engine_projects", project.id, fields)
    }

    suspend fun deleteEngineProject(session: AuthSession, id: String) = withContext(Dispatchers.IO) {
        if (!canSync(session)) return@withContext
        deleteDocument(session, "engine_projects", id)
    }
}
