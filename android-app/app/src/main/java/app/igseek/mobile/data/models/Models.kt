package app.igseek.mobile.data.models

enum class IGseekTab(val key: String, val labelRu: String) {
    CHAT("chat", "Чат"),
    FLOW("flow", "Flow"),
    LIBRARY("library", "Library"),
    MEMORY("memory", "Память"),
    SETTINGS("settings", "Ещё")
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

enum class AiModelId(val apiId: String, val label: String) {
    INSTINCT("instinct", "IGseek 4.0 instinct"),
    CHAT("chat", "IGseek 3.2 chat"),
    F1("f1", "IGseek F1")
}

enum class AgentRoleId(val apiId: String, val label: String) {
    UNIVERSAL("universal", "Универсал"),
    CODER("coder", "Кодер"),
    HACKER("hacker", "Кибер"),
    MENTOR("mentor", "Ментор"),
    PSY("psy", "Психолог"),
    CREATIVE("creative", "Креатив")
}

data class AuthSession(
    val uid: String,
    val email: String,
    val displayName: String,
    val idToken: String,
    val refreshToken: String,
    val expiresAtMs: Long,
    val isGuest: Boolean = false
)

data class ChatThread(
    val id: String,
    val title: String,
    val updatedAtMs: Long
)

data class GeneratedImageItem(
    val id: String,
    val title: String,
    val dataUrl: String
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
    val attachmentNames: List<String> = emptyList(),
    val createdAtMs: Long = System.currentTimeMillis(),
    val isQueuedOffline: Boolean = false,
    val isError: Boolean = false
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
    val compactDensity: Boolean = false,
    val showQuickPrompts: Boolean = true,
    val biometricLockEnabled: Boolean = false,
    val hapticsEnabled: Boolean = true,
    val tabOrder: List<IGseekTab> = listOf(
        IGseekTab.CHAT,
        IGseekTab.FLOW,
        IGseekTab.LIBRARY,
        IGseekTab.MEMORY,
        IGseekTab.SETTINGS
    )
)

data class SharedIncomingPayload(
    val text: String? = null,
    val attachment: ChatAttachment? = null
)
