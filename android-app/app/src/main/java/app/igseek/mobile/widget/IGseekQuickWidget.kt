package app.igseek.mobile.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import app.igseek.mobile.MainActivity
import app.igseek.mobile.R
import app.igseek.mobile.data.local.LocalStore
import app.igseek.mobile.data.models.AccentPresetId

class IGseekQuickWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val store = runCatching { LocalStore(context.applicationContext) }.getOrNull()
        val layout = store?.loadLayoutPrefs()
        val isDark = layout?.darkTheme ?: true
        val accent = layout?.accent ?: AccentPresetId.DEFAULT
        val isEn = layout?.language == "en"

        val session = store?.loadSession()
        val memoriesCount = store?.loadCachedMemories()?.size ?: 0
        val chats = store?.listChats().orEmpty()
        val latestChat = chats.firstOrNull()
        val latestMessages = latestChat?.let { store?.listMessages(it.id).orEmpty() }.orEmpty()
        val latestSnippet = latestMessages.lastOrNull { it.content.isNotBlank() }?.content
            ?.replace(Regex("\\s+"), " ")
            ?.trim()
            ?.take(72)
            .orEmpty()

        val accentColor = resolveAccentColorInt(isDark, accent)
        val onAccentColor = if (isDark && accent == AccentPresetId.BLACK) Color.parseColor("#09090B") else Color.WHITE
        val cardBgRes = if (isDark) R.drawable.widget_card_dark else R.drawable.widget_card_light
        val surfaceBgRes = if (isDark) R.drawable.widget_surface_dark else R.drawable.widget_surface_light
        val textPrimary = if (isDark) Color.parseColor("#F4F4F5") else Color.parseColor("#09090B")
        val textSecondary = if (isDark) Color.parseColor("#D4D4D8") else Color.parseColor("#27272A")
        val textMuted = if (isDark) Color.parseColor("#8E8E98") else Color.parseColor("#71717A")
        val iconSubtle = if (isDark) Color.parseColor("#D4D4D8") else Color.parseColor("#18181B")
        val voiceCircleBg = if (isDark) Color.parseColor("#252530") else Color.parseColor("#E4E4E7")
        val logoTint = if (!isDark) Color.BLACK else if (accent == AccentPresetId.BLACK) Color.parseColor("#F4F4F5") else accentColor

        val userFirstName = session?.displayName
            ?.trim()
            ?.substringBefore(" ")
            ?.take(14)
            .orEmpty()

        val statusBadgeText = if (isEn) {
            if (memoriesCount > 0) "Memory · $memoriesCount" else "IGseek AI"
        } else {
            if (memoriesCount > 0) "Память · $memoriesCount" else "IGseek AI"
        }

        val askPlaceholder = if (userFirstName.isNotBlank()) {
            if (isEn) "Ask IGseek, $userFirstName…" else "Спросить IGseek, $userFirstName…"
        } else {
            if (isEn) "Ask IGseek anything…" else "Спросить IGseek…"
        }

        val recentTitle = latestChat?.title?.takeIf { it.isNotBlank() }
            ?: if (isEn) "Start your first conversation" else "Начните новый диалог"
        val recentSubtitle = latestSnippet.ifBlank {
            if (latestChat != null) {
                if (isEn) "Tap to resume conversation" else "Нажмите, чтобы продолжить чат"
            } else {
                if (isEn) "Chat, voice, AI images & memory" else "Чат, голос, фото ИИ и память"
            }
        }

        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_igseek_quick)

            // Apply live Dark / Light card & surface backgrounds
            views.setInt(R.id.widget_root, "setBackgroundResource", cardBgRes)
            views.setInt(R.id.widget_status_pill, "setBackgroundResource", surfaceBgRes)
            views.setInt(R.id.widget_ask_bar, "setBackgroundResource", surfaceBgRes)
            views.setInt(R.id.widget_recent_card, "setBackgroundResource", surfaceBgRes)
            views.setInt(R.id.widget_btn_flow, "setBackgroundResource", surfaceBgRes)
            views.setInt(R.id.widget_btn_engine, "setBackgroundResource", surfaceBgRes)
            views.setInt(R.id.widget_btn_library, "setBackgroundResource", surfaceBgRes)

            // Dynamic accent & icon tints
            views.setInt(R.id.widget_logo, "setColorFilter", logoTint)
            views.setInt(R.id.widget_voice_bg, "setColorFilter", voiceCircleBg)
            views.setInt(R.id.widget_voice_icon, "setColorFilter", iconSubtle)
            views.setInt(R.id.widget_image_bg, "setColorFilter", accentColor)
            views.setInt(R.id.widget_image_icon, "setColorFilter", onAccentColor)
            views.setInt(R.id.widget_recent_dot, "setColorFilter", accentColor)
            views.setInt(R.id.widget_chat_bg, "setColorFilter", accentColor)
            views.setInt(R.id.widget_chat_icon, "setColorFilter", onAccentColor)
            views.setInt(R.id.widget_flow_icon, "setColorFilter", iconSubtle)
            views.setInt(R.id.widget_engine_icon, "setColorFilter", iconSubtle)
            views.setInt(R.id.widget_library_icon, "setColorFilter", iconSubtle)

            // Dynamic text colors & localized content
            views.setTextColor(R.id.widget_title, textPrimary)
            views.setTextViewText(R.id.widget_status_text, statusBadgeText)
            views.setTextColor(R.id.widget_status_text, if (memoriesCount > 0) accentColor else textMuted)

            views.setTextViewText(R.id.widget_ask_prompt, askPlaceholder)
            views.setTextColor(R.id.widget_ask_prompt, textMuted)

            views.setTextViewText(R.id.widget_recent_title, recentTitle)
            views.setTextColor(R.id.widget_recent_title, textPrimary)
            views.setTextViewText(R.id.widget_recent_subtitle, recentSubtitle)
            views.setTextColor(R.id.widget_recent_subtitle, textMuted)

            views.setTextViewText(R.id.widget_chat_label, if (isEn) "Chat" else "Чат")
            views.setTextColor(R.id.widget_chat_label, onAccentColor)
            views.setTextColor(R.id.widget_flow_label, textSecondary)
            views.setTextColor(R.id.widget_engine_label, textSecondary)

            // Wire rich deep actions
            views.setOnClickPendingIntent(
                R.id.widget_status_pill,
                buildActionIntent(context, targetTab = "memory", action = null, chatId = null, requestCode = 201)
            )
            views.setOnClickPendingIntent(
                R.id.widget_ask_prompt,
                buildActionIntent(context, targetTab = "chat", action = ACTION_NEW_CHAT, chatId = null, requestCode = 202)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_voice,
                buildActionIntent(context, targetTab = "chat", action = ACTION_VOICE, chatId = null, requestCode = 203)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_image,
                buildActionIntent(context, targetTab = "chat", action = ACTION_IMAGE_MODE, chatId = null, requestCode = 204)
            )
            views.setOnClickPendingIntent(
                R.id.widget_recent_card,
                buildActionIntent(
                    context,
                    targetTab = "chat",
                    action = if (latestChat != null) ACTION_OPEN_CHAT else ACTION_NEW_CHAT,
                    chatId = latestChat?.id,
                    requestCode = 205
                )
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_chat,
                buildActionIntent(context, targetTab = "chat", action = ACTION_NEW_CHAT, chatId = null, requestCode = 206)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_flow,
                buildActionIntent(context, targetTab = "flow", action = null, chatId = null, requestCode = 207)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_engine,
                buildActionIntent(context, targetTab = "engine", action = null, chatId = null, requestCode = 208)
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_library,
                buildActionIntent(context, targetTab = "library", action = null, chatId = null, requestCode = 209)
            )

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    private fun resolveAccentColorInt(darkTheme: Boolean, accent: AccentPresetId): Int {
        if (!darkTheme) return Color.BLACK
        return when (accent) {
            AccentPresetId.DEFAULT, AccentPresetId.RED -> Color.parseColor("#EF4444")
            AccentPresetId.ORANGE -> Color.parseColor("#F97316")
            AccentPresetId.BLACK -> Color.parseColor("#E4E4E7")
            AccentPresetId.EMERALD -> Color.parseColor("#10B981")
            AccentPresetId.BLUE -> Color.parseColor("#3B82F6")
            AccentPresetId.PURPLE -> Color.parseColor("#8B5CF6")
            AccentPresetId.PINK -> Color.parseColor("#EC4899")
            AccentPresetId.AMBER -> Color.parseColor("#F59E0B")
        }
    }

    private fun buildActionIntent(
        context: Context,
        targetTab: String,
        action: String?,
        chatId: String?,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_START_TAB, targetTab)
            if (!action.isNullOrBlank()) putExtra(EXTRA_WIDGET_ACTION, action)
            if (!chatId.isNullOrBlank()) putExtra(EXTRA_WIDGET_CHAT_ID, chatId)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val EXTRA_START_TAB = "igseek_start_tab"
        const val EXTRA_WIDGET_ACTION = "igseek_widget_action"
        const val EXTRA_WIDGET_CHAT_ID = "igseek_widget_chat_id"

        const val ACTION_NEW_CHAT = "new_chat"
        const val ACTION_VOICE = "voice"
        const val ACTION_IMAGE_MODE = "image_mode"
        const val ACTION_OPEN_CHAT = "open_chat"

        fun requestUpdate(context: Context) {
            runCatching {
                val appContext = context.applicationContext
                val manager = AppWidgetManager.getInstance(appContext)
                val component = ComponentName(appContext, IGseekQuickWidget::class.java)
                val ids = manager.getAppWidgetIds(component)
                if (ids.isNotEmpty()) {
                    val intent = Intent(appContext, IGseekQuickWidget::class.java).apply {
                        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    }
                    appContext.sendBroadcast(intent)
                }
            }
        }
    }
}
