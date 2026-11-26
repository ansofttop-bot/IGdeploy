package app.igseek.mobile.data.local

import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import app.igseek.mobile.BuildConfig
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.AuthSession
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.ChatThread
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.data.models.MobileLayoutPrefs
import app.igseek.mobile.data.models.OutboxQueuedMessage
import org.json.JSONArray
import org.json.JSONObject

class LocalStore(context: Context) : SQLiteOpenHelper(context, "igseek_mobile.db", null, 1) {

    private val prefs: SharedPreferences = createSecurePrefs(context)

    private fun createSecurePrefs(context: Context): SharedPreferences {
        return runCatching {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "igseek_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }.getOrElse {
            context.getSharedPreferences("igseek_fallback_prefs", Context.MODE_PRIVATE)
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                updated_at_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                images_json TEXT NOT NULL,
                attachments_json TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                is_queued_offline INTEGER NOT NULL,
                is_error INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS outbox (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                text TEXT NOT NULL,
                model_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                web_search INTEGER NOT NULL,
                reasoning INTEGER NOT NULL,
                idempotency_key TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS kv_cache (
                k TEXT PRIMARY KEY,
                v TEXT NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Initial v1 schema
    }

    // ==================== SERVER & SESSION ====================

    fun getServerBaseUrl(): String {
        return prefs.getString("server_base_url", null)?.takeIf { it.isNotBlank() }
            ?: BuildConfig.DEFAULT_API_BASE_URL
    }

    fun setServerBaseUrl(url: String) {
        prefs.edit().putString("server_base_url", url.trim().trimEnd('/')).apply()
    }

    fun saveSession(session: AuthSession) {
        val obj = JSONObject().apply {
            put("uid", session.uid)
            put("email", session.email)
            put("displayName", session.displayName)
            put("idToken", session.idToken)
            put("refreshToken", session.refreshToken)
            put("expiresAtMs", session.expiresAtMs)
            put("isGuest", session.isGuest)
        }
        prefs.edit().putString("auth_session", obj.toString()).apply()
    }

    fun loadSession(): AuthSession? {
        val raw = prefs.getString("auth_session", null) ?: return null
        return runCatching {
            val o = JSONObject(raw)
            AuthSession(
                uid = o.optString("uid"),
                email = o.optString("email"),
                displayName = o.optString("displayName"),
                idToken = o.optString("idToken"),
                refreshToken = o.optString("refreshToken"),
                expiresAtMs = o.optLong("expiresAtMs", 0L),
                isGuest = o.optBoolean("isGuest", false)
            )
        }.getOrNull()?.takeIf { it.uid.isNotBlank() }
    }

    fun clearSession() {
        prefs.edit().remove("auth_session").apply()
    }

    // ==================== LAYOUT PREFERENCES ====================

    fun saveLayoutPrefs(layout: MobileLayoutPrefs) {
        val tabs = JSONArray().apply { layout.tabOrder.forEach { put(it.key) } }
        val obj = JSONObject().apply {
            put("darkTheme", layout.darkTheme)
            put("accent", layout.accent.id)
            put("compactDensity", layout.compactDensity)
            put("showQuickPrompts", layout.showQuickPrompts)
            put("biometricLockEnabled", layout.biometricLockEnabled)
            put("hapticsEnabled", layout.hapticsEnabled)
            put("tabOrder", tabs)
        }
        prefs.edit().putString("layout_prefs", obj.toString()).apply()
    }

    fun loadLayoutPrefs(): MobileLayoutPrefs {
        val raw = prefs.getString("layout_prefs", null) ?: return MobileLayoutPrefs()
        return runCatching {
            val o = JSONObject(raw)
            val tabsArr = o.optJSONArray("tabOrder")
            val parsedTabs = mutableListOf<IGseekTab>()
            if (tabsArr != null) {
                for (i in 0 until tabsArr.length()) {
                    val key = tabsArr.optString(i)
                    IGseekTab.entries.firstOrNull { it.key == key }?.let {
                        if (it !in parsedTabs) parsedTabs.add(it)
                    }
                }
            }
            IGseekTab.entries.forEach { if (it !in parsedTabs) parsedTabs.add(it) }
            MobileLayoutPrefs(
                darkTheme = o.optBoolean("darkTheme", true),
                accent = AccentPresetId.fromId(o.optString("accent")),
                compactDensity = o.optBoolean("compactDensity", false),
                showQuickPrompts = o.optBoolean("showQuickPrompts", true),
                biometricLockEnabled = o.optBoolean("biometricLockEnabled", false),
                hapticsEnabled = o.optBoolean("hapticsEnabled", true),
                tabOrder = parsedTabs
            )
        }.getOrDefault(MobileLayoutPrefs())
    }

    // ==================== CHATS & MESSAGES ====================

    fun upsertChat(chat: ChatThread) {
        val cv = ContentValues().apply {
            put("id", chat.id)
            put("title", chat.title)
            put("updated_at_ms", chat.updatedAtMs)
        }
        writableDatabase.insertWithOnConflict("chats", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun listChats(): List<ChatThread> {
        val out = mutableListOf<ChatThread>()
        readableDatabase.rawQuery("SELECT id, title, updated_at_ms FROM chats ORDER BY updated_at_ms DESC", null).use { c ->
            while (c.moveToNext()) {
                out.add(ChatThread(c.getString(0), c.getString(1), c.getLong(2)))
            }
        }
        return out
    }

    fun deleteChat(chatId: String) {
        writableDatabase.delete("messages", "chat_id = ?", arrayOf(chatId))
        writableDatabase.delete("outbox", "chat_id = ?", arrayOf(chatId))
        writableDatabase.delete("chats", "id = ?", arrayOf(chatId))
    }

    fun upsertMessage(msg: ChatMessageItem) {
        val imgsJson = JSONArray().apply {
            msg.images.forEach { img ->
                put(JSONObject().apply {
                    put("id", img.id)
                    put("title", img.title)
                    put("dataUrl", img.dataUrl)
                })
            }
        }.toString()
        val attJson = JSONArray().apply { msg.attachmentNames.forEach { put(it) } }.toString()

        val cv = ContentValues().apply {
            put("id", msg.id)
            put("chat_id", msg.chatId)
            put("role", msg.role)
            put("content", msg.content)
            put("reasoning", msg.reasoning)
            put("images_json", imgsJson)
            put("attachments_json", attJson)
            put("created_at_ms", msg.createdAtMs)
            put("is_queued_offline", if (msg.isQueuedOffline) 1 else 0)
            put("is_error", if (msg.isError) 1 else 0)
        }
        writableDatabase.insertWithOnConflict("messages", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun listMessages(chatId: String): List<ChatMessageItem> {
        val out = mutableListOf<ChatMessageItem>()
        readableDatabase.rawQuery(
            "SELECT id, chat_id, role, content, reasoning, images_json, attachments_json, created_at_ms, is_queued_offline, is_error FROM messages WHERE chat_id = ? ORDER BY created_at_ms ASC",
            arrayOf(chatId)
        ).use { c ->
            while (c.moveToNext()) {
                val imgs = mutableListOf<GeneratedImageItem>()
                runCatching {
                    val arr = JSONArray(c.getString(5))
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        imgs.add(GeneratedImageItem(o.optString("id"), o.optString("title"), o.optString("dataUrl")))
                    }
                }
                val atts = mutableListOf<String>()
                runCatching {
                    val arr = JSONArray(c.getString(6))
                    for (i in 0 until arr.length()) atts.add(arr.optString(i))
                }
                out.add(
                    ChatMessageItem(
                        id = c.getString(0),
                        chatId = c.getString(1),
                        role = c.getString(2),
                        content = c.getString(3),
                        reasoning = c.getString(4),
                        images = imgs,
                        attachmentNames = atts,
                        createdAtMs = c.getLong(7),
                        isQueuedOffline = c.getInt(8) == 1,
                        isError = c.getInt(9) == 1
                    )
                )
            }
        }
        return out
    }

    // ==================== OFFLINE OUTBOX ====================

    fun enqueueOutbox(item: OutboxQueuedMessage) {
        val cv = ContentValues().apply {
            put("id", item.id)
            put("chat_id", item.chatId)
            put("message_id", item.messageId)
            put("text", item.text)
            put("model_id", item.modelId)
            put("agent_id", item.agentId)
            put("web_search", if (item.webSearch) 1 else 0)
            put("reasoning", if (item.reasoning) 1 else 0)
            put("idempotency_key", item.idempotencyKey)
            put("created_at_ms", item.createdAtMs)
        }
        writableDatabase.insertWithOnConflict("outbox", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun listOutbox(): List<OutboxQueuedMessage> {
        val out = mutableListOf<OutboxQueuedMessage>()
        readableDatabase.rawQuery(
            "SELECT id, chat_id, message_id, text, model_id, agent_id, web_search, reasoning, idempotency_key, created_at_ms FROM outbox ORDER BY created_at_ms ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    OutboxQueuedMessage(
                        id = c.getString(0),
                        chatId = c.getString(1),
                        messageId = c.getString(2),
                        text = c.getString(3),
                        modelId = c.getString(4),
                        agentId = c.getString(5),
                        webSearch = c.getInt(6) == 1,
                        reasoning = c.getInt(7) == 1,
                        idempotencyKey = c.getString(8),
                        createdAtMs = c.getLong(9)
                    )
                )
            }
        }
        return out
    }

    fun removeOutbox(id: String) {
        writableDatabase.delete("outbox", "id = ?", arrayOf(id))
    }

    // ==================== CACHE FOR LIBRARY & MEMORY ====================

    private fun putCache(key: String, value: String) {
        val cv = ContentValues().apply {
            put("k", key)
            put("v", value)
        }
        writableDatabase.insertWithOnConflict("kv_cache", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun getCache(key: String): String? {
        readableDatabase.rawQuery("SELECT v FROM kv_cache WHERE k = ?", arrayOf(key)).use { c ->
            return if (c.moveToFirst()) c.getString(0) else null
        }
    }

    fun cacheLibraryFiles(items: List<LibraryFileItem>) {
        val arr = JSONArray()
        items.take(150).forEach { it ->
            arr.put(JSONObject().apply {
                put("id", it.id)
                put("name", it.name)
                put("type", it.type)
                put("mimeType", it.mimeType)
                put("sizeBytes", it.sizeBytes)
                put("source", it.source)
                put("chatTitle", it.chatTitle)
                put("updatedAt", it.updatedAt)
                if (it.content != null && it.content.length <= 20_000) put("content", it.content)
                if (it.downloadUrl != null) put("downloadUrl", it.downloadUrl)
            })
        }
        putCache("library_files", arr.toString())
    }

    fun loadCachedLibraryFiles(): List<LibraryFileItem> {
        val raw = getCache("library_files") ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            List(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                LibraryFileItem(
                    id = o.optString("id"),
                    name = o.optString("name"),
                    type = o.optString("type", "doc"),
                    mimeType = o.optString("mimeType", "application/octet-stream"),
                    sizeBytes = o.optLong("sizeBytes", 0L),
                    source = o.optString("source", "library"),
                    chatTitle = o.optString("chatTitle", "Library"),
                    updatedAt = o.optString("updatedAt"),
                    content = o.optString("content").takeIf { it.isNotBlank() },
                    downloadUrl = o.optString("downloadUrl").takeIf { it.isNotBlank() }
                )
            }
        }.getOrDefault(emptyList())
    }

    fun cacheMemories(items: List<MemoryEntryItem>) {
        val arr = JSONArray()
        items.forEach { m ->
            arr.put(JSONObject().apply {
                put("id", m.id)
                put("content", m.content)
                put("kind", m.kind)
                put("createdAt", m.createdAt)
            })
        }
        putCache("memories", arr.toString())
    }

    fun loadCachedMemories(): List<MemoryEntryItem> {
        val raw = getCache("memories") ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            List(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                MemoryEntryItem(
                    id = o.optString("id"),
                    content = o.optString("content"),
                    kind = o.optString("kind", "other"),
                    createdAt = o.optString("createdAt")
                )
            }
        }.getOrDefault(emptyList())
    }
}
