package app.igseek.mobile.data.models

enum class IGseekTab(val key: String, val labelRu: String, val labelEn: String) {
    CHAT("chat", "Чат", "Chat"),
    FLOW("flow", "Flow", "Flow"),
    LIBRARY("library", "Library", "Library"),
    SAVED("saved", "Сохранённое", "Saved"),
    ENGINE("engine", "Engine", "Engine"),
    WAVE("wave", "Wave", "Wave"),
    DOCS("docs", "Документация", "Docs"),
    MEMORY("memory", "Память", "Memory"),
    SETTINGS("settings", "Настройки", "Settings");

    fun label(lang: String): String = if (lang == "en") labelEn else labelRu
}

enum class AccentPresetId(val id: String, val title: String) {
    DEFAULT("default", "Default"),
    RED("red", "Red"),
    ORANGE("orange", "Orange"),
    BLACK("black", "Black"),
    EMERALD("emerald", "Emerald"),
    BLUE("blue", "Blue"),
    PURPLE("purple", "Purple"),
    PINK("pink", "Pink"),
    AMBER("amber", "Amber");

    companion object {
        fun fromId(raw: String?): AccentPresetId =
            entries.firstOrNull { it.id == raw } ?: DEFAULT
    }
}

enum class AiModelId(val apiId: String, val label: String, val badge: String) {
    INSTINCT("instinct", "IGseek 3.5 instinct", "Default"),
    CHAT("chat", "IGseek 3.2 chat", "Fast"),
    F1("f1", "IGseek F1", "Reasoning")
}

enum class AgentRoleId(val apiId: String, val labelRu: String, val labelEn: String, val systemHint: String) {
    UNIVERSAL(
        "universal",
        "Универсал",
        "Universal",
        "Ты IGseek — точный, умный и дружелюбный ИИ-ассистент. Отвечай структурированно, ясно и по делу, используя Markdown."
    ),
    CODER(
        "coder",
        "Кодер",
        "Coder",
        "Ты IGseek Coder — senior software engineer. Пиши чистый, производственный код с объяснением архитектуры и edge cases."
    ),
    HACKER(
        "hacker",
        "Кибер",
        "Security",
        "Ты IGseek Security — эксперт по информационной безопасности и DevSecOps. Помогай с защитой, аудитом и безопасной архитектурой."
    ),
    MENTOR(
        "mentor",
        "Ментор",
        "Mentor",
        "Ты IGseek Mentor — наставник и преподаватель. Объясняй сложные темы шаг за шагом с наглядными примерами."
    ),
    PSY(
        "psy",
        "Психолог",
        "Coach",
        "Ты IGseek Coach — внимательный и эмпатичный собеседник. Помогай разбирать мысли спокойно, бережно и конструктивно."
    ),
    CREATIVE(
        "creative",
        "Креатив",
        "Creative",
        "Ты IGseek Creative — сильный копирайтер, сценарист и концепт-дизайнер. Предлагай яркие, нестандартные и выразительные идеи."
    );

    fun label(lang: String): String = if (lang == "en") labelEn else labelRu
}

enum class CloudSyncStatus {
    IDLE,
    SYNCING,
    SYNCED,
    OFFLINE,
    LOCAL_ONLY,
    ERROR
}

data class AuthSession(
    val uid: String,
    val email: String,
    val displayName: String,
    val idToken: String,
    val refreshToken: String,
    val expiresAtMs: Long,
    val isGuest: Boolean = false
) {
    val isCloudSynced: Boolean
        get() = !isGuest && idToken.isNotBlank() && !idToken.startsWith("local_")
}

data class ProjectFolder(
    val id: String,
    val name: String,
    val updatedAtMs: Long
)

data class ChatThread(
    val id: String,
    val title: String,
    val updatedAtMs: Long,
    val isSaved: Boolean = false,
    val projectId: String? = null
)

data class GeneratedImageItem(
    val id: String,
    val title: String,
    val dataUrl: String
)

data class WebSourceItem(
    val title: String,
    val url: String,
    val snippet: String = ""
)

data class ChatAttachment(
    val name: String,
    val mimeType: String,
    val dataUrl: String,
    val sizeBytes: Long = 0L
)

data class ChatMessageItem(
    val id: String,
    val chatId: String,
    val role: String,
    val content: String,
    val reasoning: String = "",
    val images: List<GeneratedImageItem> = emptyList(),
    val webSources: List<WebSourceItem> = emptyList(),
    val attachmentNames: List<String> = emptyList(),
    val createdAtMs: Long = System.currentTimeMillis(),
    val isQueuedOffline: Boolean = false,
    val isError: Boolean = false,
    val isBookmarked: Boolean = false
)

data class OutboxQueuedMessage(
    val id: String,
    val chatId: String,
    val messageId: String,
    val text: String,
    val modelId: String,
    val agentId: String,
    val webSearch: Boolean,
    val reasoning: Boolean,
    val imageMode: Boolean = false,
    val idempotencyKey: String,
    val createdAtMs: Long
)

data class FlowStepItem(
    val id: String,
    val title: String,
    val description: String,
    val tool: String,
    val status: String = "pending",
    val output: String = "",
    val requiresApproval: Boolean = false
)

data class FlowTaskState(
    val title: String = "",
    val goal: String = "",
    val steps: List<FlowStepItem> = emptyList(),
    val isPlanning: Boolean = false,
    val isRunning: Boolean = false,
    val error: String? = null
)

data class EngineFileItem(
    val path: String,
    val content: String
)

data class EngineProjectItem(
    val id: String,
    val title: String,
    val prompt: String = "",
    val activeFile: String = "",
    val files: List<EngineFileItem> = emptyList(),
    val updatedAtMs: Long = System.currentTimeMillis()
)

data class LibraryFileItem(
    val id: String,
    val name: String,
    val type: String,
    val mimeType: String,
    val sizeBytes: Long = 0L,
    val source: String = "library",
    val chatTitle: String = "Library",
    val updatedAt: String = "",
    val content: String? = null,
    val dataUrl: String? = null,
    val downloadUrl: String? = null
)

data class MemoryEntryItem(
    val id: String,
    val content: String,
    val kind: String = "other",
    val createdAt: String = ""
)

data class SubscriptionInfo(
    val plan: String = "free",
    val isPro: Boolean = false,
    val status: String = "free",
    val daysLeft: Int = 0,
    val expiresAt: String? = null,
    val pendingTxnId: String? = null,
    val priceRub: Int = 149,
    val durationDays: Int = 30,
    val paymentConfigured: Boolean = false
)

data class MobileLayoutPrefs(
    val darkTheme: Boolean = true,
    val accent: AccentPresetId = AccentPresetId.DEFAULT,
    val language: String = "ru",
    val compactDensity: Boolean = false,
    val showQuickPrompts: Boolean = true,
    val showBottomBar: Boolean = false,
    val biometricLockEnabled: Boolean = false,
    val hapticsEnabled: Boolean = true,
    val tabOrder: List<IGseekTab> = listOf(
        IGseekTab.CHAT,
        IGseekTab.FLOW,
        IGseekTab.LIBRARY,
        IGseekTab.ENGINE
    )
)

data class SharedIncomingPayload(
    val text: String? = null,
    val attachment: ChatAttachment? = null
)
