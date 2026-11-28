package app.igseek.mobile.ui.screens

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.CalendarContract
import android.provider.OpenableColumns
import android.speech.RecognizerIntent
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.CalendarEventItem
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.data.models.GmailEventItem
import app.igseek.mobile.data.models.TaskEventItem
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.state.PendingImageState
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import kotlinx.coroutines.delay
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.roundToInt
import kotlin.math.sin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val listState = rememberLazyListState()
    val isEn = state.layoutPrefs.language == "en"
    var showModelSheet by remember { mutableStateOf(false) }

    val activeChat = state.chats.firstOrNull { it.id == state.activeChatId }
    val isChatSaved = activeChat?.isSaved == true

    // File / Photo picker
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                var name = "file_${System.currentTimeMillis()}"
                context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0 && c.moveToFirst()) name = c.getString(idx) ?: name
                }
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching
                if (bytes.size > 6 * 1024 * 1024) {
                    viewModel.showToast("Файл больше 6 МБ")
                    return@runCatching
                }
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                viewModel.addAttachment(ChatAttachment(name, mime, "data:$mime;base64,$b64", bytes.size.toLong()))
            }
        }
    }

    // Native Android Voice Input
    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val matches = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            val spoken = matches?.firstOrNull()
            if (!spoken.isNullOrBlank()) {
                viewModel.appendVoiceTranscript(spoken)
            }
        }
    }

    LaunchedEffect(state.messages.size, state.messages.lastOrNull()?.content?.length) {
        if (state.messages.isNotEmpty()) {
            listState.scrollToItem(state.messages.lastIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        // Slim IGseek Header with Lucide Icons
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = onOpenDrawer) {
                Icon(
                    imageVector = LucideIcons.Menu,
                    contentDescription = "Menu",
                    tint = palette.textPrimary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Centered Pill Model Selector
            Surface(
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .clickable { showModelSheet = true },
                shape = RoundedCornerShape(50),
                color = palette.glassBg,
                border = BorderStroke(1.dp, palette.glassBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 13.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    val planBadge = if (state.subscription.isPro) "Pro" else "Free"
                    IGseekFoxLogo(size = 17.dp, showGlow = false)
                    Text(
                        text = state.selectedModel.label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        maxLines = 1
                    )
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = if (state.subscription.isPro) palette.brandSoft else palette.glassBg,
                        border = BorderStroke(
                            1.dp,
                            if (state.subscription.isPro) palette.brandBorder else palette.glassBorder
                        )
                    ) {
                        Text(
                            text = planBadge,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = if (state.subscription.isPro) palette.brand else palette.textMuted,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            maxLines = 1
                        )
                    }
                    Icon(
                        imageVector = LucideIcons.ChevronDown,
                        contentDescription = null,
                        tint = palette.textMuted,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = { viewModel.toggleSaveChat(state.activeChatId) },
                    modifier = Modifier.size(38.dp)
                ) {
                    Icon(
                        imageVector = if (isChatSaved) LucideIcons.BookmarkFilled else LucideIcons.Bookmark,
                        contentDescription = "Save Chat",
                        tint = if (isChatSaved) palette.brand else palette.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }
                IconButton(
                    onClick = { viewModel.createNewChat() },
                    modifier = Modifier.size(38.dp)
                ) {
                    Icon(
                        imageVector = LucideIcons.SquarePen,
                        contentDescription = "New Chat",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }

        // Offline Outbox Pill
        if (!state.isOnline || state.outboxCount > 0) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 2.dp),
                shape = RoundedCornerShape(12.dp),
                color = palette.brandSoft,
                border = BorderStroke(1.dp, palette.brandBorder)
            ) {
                Text(
                    text = if (!state.isOnline) {
                        "Оффлайн · В очереди: ${state.outboxCount}. Отправится автоматически при подключении."
                    } else {
                        "Отправка отложенных сообщений (${state.outboxCount})…"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.textPrimary,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                )
            }
        }

        // Empty Hero or Messages Feed
        if (state.messages.isEmpty()) {
            ChatWelcomeHero(
                state = state,
                onPromptClick = { prompt -> viewModel.sendMessage(prompt) },
                modifier = Modifier.weight(1f)
            )
        } else {
            val lastAssistantId = state.messages.lastOrNull { it.role == "assistant" }?.id
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(
                    horizontal = 14.dp,
                    vertical = if (state.layoutPrefs.compactDensity) 6.dp else 12.dp
                ),
                verticalArrangement = Arrangement.spacedBy(if (state.layoutPrefs.compactDensity) 10.dp else 16.dp)
            ) {
                items(state.messages, key = { it.id }) { msg ->
                    ChatMessageRow(
                        msg = msg,
                        isLastAssistant = msg.id == lastAssistantId && !state.isStreaming,
                        pendingImage = state.pendingImage?.takeIf { it.messageId == msg.id },
                        isEn = isEn,
                        onCopy = {
                            clipboard.setText(AnnotatedString(msg.content))
                            viewModel.showToast(if (isEn) "Copied" else "Скопировано")
                        },
                        onBookmark = { viewModel.toggleBookmarkMessage(msg.id) },
                        onRegenerate = { viewModel.regenerateLastReply() },
                        onShare = {
                            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, msg.content)
                            }
                            runCatching { context.startActivity(Intent.createChooser(sendIntent, if (isEn) "Share" else "Поделиться")) }
                        },
                        onSaveImage = { img -> viewModel.saveGeneratedImageToLibrary(img) },
                        onOpenUrl = { url ->
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                        },
                        onConfirmCalendarEvent = { evt ->
                            viewModel.confirmCalendarEvent(msg.id, evt)
                            openNativeCalendarInsert(context, evt)
                            viewModel.showToast(if (isEn) "Opening Calendar…" else "Открываем Календарь…")
                        },
                        onConfirmTaskEvent = { task ->
                            viewModel.confirmTaskEvent(msg.id, task)
                            val taskCopy = listOf(task.title, task.notes).filter { it.isNotBlank() }.joinToString("\n")
                            if (taskCopy.isNotBlank()) clipboard.setText(AnnotatedString(taskCopy))
                            openNativeGoogleTasks(context)
                            viewModel.showToast(
                                if (isEn) "Reminder saved · opening Google Tasks (title copied)"
                                else "Напоминание сохранено · открываем Google Tasks (текст скопирован)"
                            )
                        },
                        onConfirmGmailEvent = { email ->
                            viewModel.confirmGmailEvent(msg.id, email)
                            openNativeGmailCompose(context, email)
                            viewModel.showToast(if (isEn) "Opening Gmail…" else "Открываем Gmail…")
                        }
                    )
                }
            }
        }

        // Simplified, Uncluttered IGseek Glass Composer (zero clipping, full functionality via "+" menu)
        ChatGlassComposer(
            state = state,
            onDraftChange = { viewModel.updateDraft(it) },
            onAttachClick = { filePicker.launch("*/*") },
            onRemoveAttachment = { viewModel.removeAttachment(it) },
            onToggleWeb = { viewModel.toggleWebSearch() },
            onToggleReasoning = { viewModel.toggleReasoning() },
            onToggleImage = { viewModel.toggleImageMode() },
            onVoiceClick = {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (isEn) Locale.US.toLanguageTag() else "ru-RU")
                    putExtra(RecognizerIntent.EXTRA_PROMPT, if (isEn) "Speak to IGseek…" else "Говорите с IGseek…")
                }
                runCatching { voiceLauncher.launch(intent) }
                    .onFailure { viewModel.showToast("Голосовой ввод недоступен на этом устройстве") }
            },
            onSend = { viewModel.sendMessage() },
            onStop = { viewModel.stopStreaming() }
        )
    }

    // Model & Agent Selector Bottom Sheet
    if (showModelSheet) {
        ModalBottomSheet(
            onDismissRequest = { showModelSheet = false },
            containerColor = palette.sidebarBg,
            contentColor = palette.textPrimary
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    IGseekFoxLogo(size = 20.dp)
                    Text(
                        text = if (isEn) "Model & Agent" else "Модель и агент",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                }

                Spacer(Modifier.height(14.dp))
                Text(
                    text = if (isEn) "MODEL" else "МОДЕЛЬ",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted
                )
                Spacer(Modifier.height(8.dp))

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val planBadge = if (state.subscription.isPro) "Pro" else "Free"
                    AiModelId.entries.forEach { model ->
                        val active = state.selectedModel == model
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .clickable {
                                    viewModel.setModel(model)
                                    showModelSheet = false
                                },
                            shape = RoundedCornerShape(16.dp),
                            color = if (active) palette.brandSoft else palette.glassBg,
                            border = BorderStroke(1.dp, if (active) palette.brandBorder else palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        Text(
                                            text = model.label,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = palette.textPrimary
                                        )
                                        Surface(
                                            shape = RoundedCornerShape(50),
                                            color = if (state.subscription.isPro) palette.brandSoft else palette.glassBg,
                                            border = BorderStroke(
                                                1.dp,
                                                if (state.subscription.isPro) palette.brandBorder else palette.glassBorder
                                            )
                                        ) {
                                            Text(
                                                text = planBadge,
                                                style = MaterialTheme.typography.labelSmall,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (state.subscription.isPro) palette.brand else palette.textMuted,
                                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = model.badge,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (active) palette.brand else palette.textMuted
                                    )
                                }
                                if (active) {
                                    Icon(LucideIcons.Check, contentDescription = null, tint = palette.brand, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))
                Text(
                    text = if (isEn) "AGENT PERSONA" else "РОЛЬ АГЕНТА",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted
                )
                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AgentRoleId.entries.forEach { agent ->
                        IGseekGlassChip(
                            label = agent.label(state.layoutPrefs.language),
                            selected = state.selectedAgent == agent,
                            onClick = { viewModel.setAgent(agent) }
                        )
                    }
                }
                Spacer(Modifier.height(18.dp))
            }
        }
    }
}

private data class StarterCardData(
    val icon: ImageVector,
    val title: String,
    val hint: String,
    val prompt: String
)

@Composable
private fun ChatWelcomeHero(
    state: IGseekUiState,
    onPromptClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"

    val suggestions = if (isEn) {
        listOf(
            StarterCardData(LucideIcons.TrendingUp, "Analyze trends", "in your niche this week", "Analyze the biggest emerging trends in tech and AI productivity this week"),
            StarterCardData(LucideIcons.Code2, "Write clean code", "architecture & edge cases", "Write a clean TypeScript utility with strong types and edge-case handling"),
            StarterCardData(LucideIcons.Compass, "Build a roadmap", "14-day focused plan", "Create a structured 14-day roadmap to launch a side project from scratch"),
            StarterCardData(LucideIcons.Sparkles, "Brainstorm ideas", "fresh angles & concepts", "Give me 5 original product ideas that solve real everyday problems")
        )
    } else {
        listOf(
            StarterCardData(LucideIcons.TrendingUp, "Объясни просто", "сложные темы на примерах", "Объясни простыми словами, как работают нейросети и трансформеры"),
            StarterCardData(LucideIcons.Code2, "Напиши код", "чисто и с разбором", "Напиши чистый и современный скрипт с разбором архитектуры и крайних случаев"),
            StarterCardData(LucideIcons.Compass, "Составь план", "пошагово с приоритетами", "Составь пошаговый план запуска IT-проекта на 14 дней с приоритетами"),
            StarterCardData(LucideIcons.Sparkles, "Придумай идеи", "свежие решения и концепты", "Предложи 5 свежих идей для продукта, которые реально решают повседневные задачи")
        )
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        IGseekFoxLogo(size = 60.dp, showGlow = true)
        Spacer(Modifier.height(12.dp))
        Text(
            text = if (isEn) "How can I help today?" else "Чем помочь сегодня?",
            style = MaterialTheme.typography.headlineMedium,
            color = palette.textPrimary,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "${state.selectedModel.label} · ${if (state.subscription.isPro) "Pro" else "Free"} · ${state.selectedAgent.label(state.layoutPrefs.language)}",
            style = MaterialTheme.typography.bodySmall,
            color = palette.textMuted
        )

        if (state.layoutPrefs.showQuickPrompts) {
            Spacer(Modifier.height(24.dp))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                suggestions.chunked(2).forEach { pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        pair.forEach { card ->
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(18.dp))
                                    .clickable { onPromptClick(card.prompt) },
                                shape = RoundedCornerShape(18.dp),
                                color = palette.glassBg,
                                border = BorderStroke(1.dp, palette.glassBorder)
                            ) {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Icon(
                                        imageVector = card.icon,
                                        contentDescription = null,
                                        tint = palette.brand,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    Text(
                                        text = card.title,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = palette.textPrimary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = card.hint,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textMuted,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatMessageRow(
    msg: ChatMessageItem,
    isLastAssistant: Boolean,
    pendingImage: PendingImageState?,
    isEn: Boolean,
    onCopy: () -> Unit,
    onBookmark: () -> Unit,
    onRegenerate: () -> Unit,
    onShare: () -> Unit,
    onSaveImage: (GeneratedImageItem) -> Unit,
    onOpenUrl: (String) -> Unit,
    onConfirmCalendarEvent: (CalendarEventItem) -> Unit,
    onConfirmTaskEvent: (TaskEventItem) -> Unit,
    onConfirmGmailEvent: (GmailEventItem) -> Unit
) {
    val palette = LocalIGseekPalette.current
    val isUser = msg.role == "user"
    var showReasoning by remember(msg.id) { mutableStateOf(false) }

    if (isUser) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.End
        ) {
            Surface(
                modifier = Modifier.widthIn(max = 308.dp),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 6.dp, bottomStart = 20.dp, bottomEnd = 20.dp),
                color = palette.userBubbleBg,
                border = BorderStroke(1.dp, palette.userBubbleBorder)
            ) {
                Column(modifier = Modifier.padding(horizontal = 15.dp, vertical = 10.dp)) {
                    if (msg.attachmentNames.isNotEmpty()) {
                        Text(
                            text = msg.attachmentNames.joinToString(" · "),
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.userBubbleText.copy(alpha = 0.78f),
                            modifier = Modifier.padding(bottom = 4.dp)
                        )
                    }
                    Text(
                        text = msg.content,
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.userBubbleText
                    )
                    if (msg.isQueuedOffline) {
                        Text(
                            text = "В очереди (оффлайн)",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.userBubbleText.copy(alpha = 0.75f),
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }
        }
    } else {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(palette.brandSoft),
                    contentAlignment = Alignment.Center
                ) {
                    IGseekFoxLogo(size = 16.dp, showGlow = false)
                }
                Text(
                    text = "IGseek",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = palette.textPrimary
                )
            }

            if (msg.reasoning.isNotBlank()) {
                IGseekGlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showReasoning = !showReasoning },
                    shape = RoundedCornerShape(16.dp),
                    contentPadding = 12.dp
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(LucideIcons.Sparkles, contentDescription = null, tint = palette.brand, modifier = Modifier.size(14.dp))
                            Text(
                                text = "Ход рассуждений",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.textSecondary
                            )
                        }
                        Icon(
                            imageVector = if (showReasoning) LucideIcons.ChevronUp else LucideIcons.ChevronDown,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    if (showReasoning) {
                        HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 8.dp))
                        Text(
                            text = msg.reasoning,
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.textMuted
                        )
                    }
                }
            }

            if (msg.content.isNotBlank()) {
                IGseekMarkdownText(
                    markdown = msg.content,
                    textColor = if (msg.isError) MaterialTheme.colorScheme.error else palette.textPrimary
                )
            } else if (
                pendingImage == null &&
                msg.images.isEmpty() &&
                msg.calendarEvents.isEmpty() &&
                msg.taskEvents.isEmpty() &&
                msg.gmailEvents.isEmpty()
            ) {
                Text(
                    text = if (isEn) "Thinking…" else "Думаю…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.textMuted
                )
            }

            if (pendingImage != null) {
                PhotoGeneratingCanvasCard(
                    title = pendingImage.title,
                    prompt = pendingImage.prompt,
                    isEn = isEn
                )
            }

            msg.calendarEvents.forEach { evt ->
                MobileCalendarEventCard(
                    event = evt,
                    isEn = isEn,
                    onConfirm = { onConfirmCalendarEvent(evt) }
                )
            }

            msg.taskEvents.forEach { task ->
                MobileTaskEventCard(
                    task = task,
                    isEn = isEn,
                    onConfirm = { onConfirmTaskEvent(task) }
                )
            }

            msg.gmailEvents.forEach { email ->
                MobileGmailEventCard(
                    email = email,
                    isEn = isEn,
                    onConfirm = { onConfirmGmailEvent(email) }
                )
            }

            msg.images.forEach { img ->
                val bmp = remember(img.dataUrl) { decodeDataUrlBitmap(img.dataUrl) }
                if (bmp != null) {
                    var imageVisible by remember(img.id) { mutableStateOf(false) }
                    LaunchedEffect(img.id) { imageVisible = true }
                    val revealAlpha by animateFloatAsState(
                        targetValue = if (imageVisible) 1f else 0.15f,
                        animationSpec = tween(durationMillis = 520, easing = FastOutSlowInEasing),
                        label = "photoRevealAlpha"
                    )
                    val revealScale by animateFloatAsState(
                        targetValue = if (imageVisible) 1f else 1.045f,
                        animationSpec = tween(durationMillis = 620, easing = FastOutSlowInEasing),
                        label = "photoRevealScale"
                    )
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        contentPadding = 8.dp
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(260.dp)
                                .clip(RoundedCornerShape(13.dp))
                        ) {
                            Image(
                                bitmap = bmp.asImageBitmap(),
                                contentDescription = img.title,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .graphicsLayer {
                                        alpha = revealAlpha
                                        scaleX = revealScale
                                        scaleY = revealScale
                                    }
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = img.title,
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(Modifier.width(8.dp))
                            IGseekGlassChip(
                                label = if (isEn) "Save to Library" else "В Library",
                                selected = false,
                                onClick = { onSaveImage(img) }
                            )
                        }
                    }
                }
            }

            if (msg.webSources.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    msg.webSources.forEach { src ->
                        Surface(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .clickable { onOpenUrl(src.url) },
                            shape = RoundedCornerShape(50),
                            color = palette.chipBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                Icon(LucideIcons.Globe, contentDescription = null, tint = palette.brand, modifier = Modifier.size(12.dp))
                                Text(
                                    text = src.title.take(28),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textSecondary,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }

            if (msg.content.isNotBlank()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.clickable(onClick = onCopy)
                    ) {
                        Icon(LucideIcons.Copy, contentDescription = "Copy", tint = palette.textMuted, modifier = Modifier.size(13.dp))
                        Text("Копировать", style = MaterialTheme.typography.labelSmall, color = palette.textMuted)
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.clickable(onClick = onBookmark)
                    ) {
                        Icon(
                            imageVector = if (msg.isBookmarked) LucideIcons.BookmarkFilled else LucideIcons.Bookmark,
                            contentDescription = "Save",
                            tint = if (msg.isBookmarked) palette.brand else palette.textMuted,
                            modifier = Modifier.size(13.dp)
                        )
                        Text(
                            text = if (msg.isBookmarked) "Сохранено" else "Сохранить",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (msg.isBookmarked) palette.brand else palette.textMuted
                        )
                    }
                    if (isLastAssistant) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.clickable(onClick = onRegenerate)
                        ) {
                            Icon(LucideIcons.RefreshCw, contentDescription = "Retry", tint = palette.textMuted, modifier = Modifier.size(13.dp))
                            Text("Ещё раз", style = MaterialTheme.typography.labelSmall, color = palette.textMuted)
                        }
                    }
                    Icon(
                        imageVector = LucideIcons.Share2,
                        contentDescription = "Share",
                        tint = palette.textMuted,
                        modifier = Modifier.size(14.dp).clickable(onClick = onShare)
                    )
                }
            }
        }
    }
}

/**
 * Clean, uncluttered IGseek Composer — no clipped chips!
 * "+" opens a crisp Lucide tools menu (Attach, Web Search, Reasoning, Image Gen),
 * active tools appear cleanly above the composer, and the action row holds only (+, Globe, Mic, ArrowUp).
 */
@Composable
private fun ChatGlassComposer(
    state: IGseekUiState,
    onDraftChange: (String) -> Unit,
    onAttachClick: () -> Unit,
    onRemoveAttachment: (String) -> Unit,
    onToggleWeb: () -> Unit,
    onToggleReasoning: () -> Unit,
    onToggleImage: () -> Unit,
    onVoiceClick: () -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"
    val canSend = !state.isStreaming && (state.draftInput.isNotBlank() || state.pendingAttachments.isNotEmpty())
    var showToolsMenu by remember { mutableStateOf(false) }

    val hasActiveModes = state.webSearchEnabled || state.reasoningEnabled || state.imageModeEnabled

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        // Removable pills above composer ONLY when an attachment or tool mode is active
        if (state.pendingAttachments.isNotEmpty() || hasActiveModes) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(bottom = 7.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (state.webSearchEnabled) {
                    ActiveModeBadge(
                        icon = LucideIcons.Globe,
                        label = if (isEn) "Web Search" else "Веб-поиск",
                        onClear = onToggleWeb
                    )
                }
                if (state.reasoningEnabled) {
                    ActiveModeBadge(
                        icon = LucideIcons.Sparkles,
                        label = if (isEn) "Thinking" else "Мышление",
                        onClear = onToggleReasoning
                    )
                }
                if (state.imageModeEnabled) {
                    ActiveModeBadge(
                        icon = LucideIcons.Image,
                        label = if (isEn) "Image" else "Фото",
                        onClear = onToggleImage
                    )
                }
                state.pendingAttachments.forEach { att ->
                    ActiveModeBadge(
                        icon = LucideIcons.Paperclip,
                        label = att.name.take(22),
                        onClear = { onRemoveAttachment(att.name) }
                    )
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = palette.composerBg,
            border = BorderStroke(
                width = 1.dp,
                color = if (hasActiveModes) palette.brandBorder else palette.composerBorder
            )
        ) {
            Column(
                modifier = Modifier.padding(start = 16.dp, end = 10.dp, top = 13.dp, bottom = 9.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(end = 6.dp, bottom = 10.dp)
                ) {
                    if (state.draftInput.isEmpty()) {
                        Text(
                            text = when {
                                state.imageModeEnabled -> if (isEn) "Describe the image to create…" else "Опишите изображение…"
                                isEn -> "Ask IGseek anything…"
                                else -> "Спросите IGseek о чём угодно…"
                            },
                            style = MaterialTheme.typography.bodyLarge,
                            color = palette.textMuted
                        )
                    }
                    BasicTextField(
                        value = state.draftInput,
                        onValueChange = onDraftChange,
                        textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.textPrimary),
                        cursorBrush = SolidColor(palette.brand),
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // Clean, breathable single-row toolbar: [+] [Globe]      [Mic] [ArrowUp]
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box {
                            Surface(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .clickable { showToolsMenu = true },
                                shape = CircleShape,
                                color = palette.chipBg,
                                border = BorderStroke(1.dp, palette.chipBorder)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = LucideIcons.Plus,
                                        contentDescription = "Tools & Attach",
                                        tint = palette.textSecondary,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            }

                            DropdownMenu(
                                expanded = showToolsMenu,
                                onDismissRequest = { showToolsMenu = false },
                                containerColor = palette.surfaceElevated
                            ) {
                                DropdownMenuItem(
                                    text = { Text(if (isEn) "Attach file or photo" else "Прикрепить файл или фото", color = palette.textPrimary) },
                                    leadingIcon = { Icon(LucideIcons.Paperclip, contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(17.dp)) },
                                    onClick = {
                                        showToolsMenu = false
                                        onAttachClick()
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isEn) "Web Search" else "Веб-поиск", color = palette.textPrimary) },
                                    leadingIcon = { Icon(LucideIcons.Globe, contentDescription = null, tint = if (state.webSearchEnabled) palette.brand else palette.textSecondary, modifier = Modifier.size(17.dp)) },
                                    trailingIcon = if (state.webSearchEnabled) {
                                        { Icon(LucideIcons.Check, contentDescription = null, tint = palette.brand, modifier = Modifier.size(15.dp)) }
                                    } else null,
                                    onClick = {
                                        showToolsMenu = false
                                        onToggleWeb()
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isEn) "Deep Thinking" else "Глубокое мышление", color = palette.textPrimary) },
                                    leadingIcon = { Icon(LucideIcons.Sparkles, contentDescription = null, tint = if (state.reasoningEnabled) palette.brand else palette.textSecondary, modifier = Modifier.size(17.dp)) },
                                    trailingIcon = if (state.reasoningEnabled) {
                                        { Icon(LucideIcons.Check, contentDescription = null, tint = palette.brand, modifier = Modifier.size(15.dp)) }
                                    } else null,
                                    onClick = {
                                        showToolsMenu = false
                                        onToggleReasoning()
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isEn) "Generate image" else "Создать изображение", color = palette.textPrimary) },
                                    leadingIcon = { Icon(LucideIcons.Image, contentDescription = null, tint = if (state.imageModeEnabled) palette.brand else palette.textSecondary, modifier = Modifier.size(17.dp)) },
                                    trailingIcon = if (state.imageModeEnabled) {
                                        { Icon(LucideIcons.Check, contentDescription = null, tint = palette.brand, modifier = Modifier.size(15.dp)) }
                                    } else null,
                                    onClick = {
                                        showToolsMenu = false
                                        onToggleImage()
                                    }
                                )
                            }
                        }

                        // Quick Web Search toggle button (crisp icon pill, zero overflow)
                        Surface(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .clickable(onClick = onToggleWeb),
                            shape = CircleShape,
                            color = if (state.webSearchEnabled) palette.brandSoft else palette.chipBg,
                            border = BorderStroke(
                                1.dp,
                                if (state.webSearchEnabled) palette.brandBorder else palette.chipBorder
                            )
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = LucideIcons.Globe,
                                    contentDescription = "Web Search",
                                    tint = if (state.webSearchEnabled) palette.brand else palette.textSecondary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Surface(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .clickable(onClick = onVoiceClick),
                            shape = CircleShape,
                            color = palette.chipBg,
                            border = BorderStroke(1.dp, palette.chipBorder)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = LucideIcons.Mic,
                                    contentDescription = "Voice",
                                    tint = palette.textSecondary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }

                        if (state.isStreaming) {
                            Surface(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .clickable(onClick = onStop),
                                shape = CircleShape,
                                color = palette.textPrimary
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = LucideIcons.Square,
                                        contentDescription = if (isEn) "Stop generation" else "Остановить генерацию",
                                        tint = palette.bg,
                                        modifier = Modifier.size(13.dp)
                                    )
                                }
                            }
                        } else {
                            Surface(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .clickable(enabled = canSend, onClick = onSend),
                                shape = CircleShape,
                                color = if (canSend) palette.brand else palette.chipBg
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = LucideIcons.ArrowUp,
                                        contentDescription = "Send",
                                        tint = if (canSend) palette.brandOn else palette.textMuted,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ActiveModeBadge(
    icon: ImageVector,
    label: String,
    onClear: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    Surface(
        shape = RoundedCornerShape(50),
        color = palette.brandSoft,
        border = BorderStroke(1.dp, palette.brandBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            Icon(icon, contentDescription = null, tint = palette.brand, modifier = Modifier.size(13.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = palette.textPrimary,
                maxLines = 1
            )
            Icon(
                imageVector = LucideIcons.X,
                contentDescription = "Clear",
                tint = palette.textMuted,
                modifier = Modifier
                    .size(13.dp)
                    .clickable(onClick = onClear)
            )
        }
    }
}

@Composable
private fun PhotoGeneratingCanvasCard(
    title: String,
    prompt: String,
    isEn: Boolean
) {
    val palette = LocalIGseekPalette.current
    val isDark = (palette.glassBg.red + palette.glassBg.green + palette.glassBg.blue) / 3f < 0.5f

    var elapsedSec by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val started = System.currentTimeMillis()
        while (true) {
            elapsedSec = (System.currentTimeMillis() - started) / 1000f
            delay(100L)
        }
    }

    val stageIndex = when {
        elapsedSec < 2.6f -> 0
        elapsedSec < 6.2f -> 1
        elapsedSec < 11.5f -> 2
        else -> 3
    }
    val stageLabel = if (isEn) {
        when (stageIndex) {
            0 -> "Composing scene"
            1 -> "Shaping light & color"
            2 -> "Refining fine details"
            else -> "Finalizing photo"
        }
    } else {
        when (stageIndex) {
            0 -> "Выстраиваем композицию"
            1 -> "Прорабатываем свет и цвет"
            2 -> "Детализируем изображение"
            else -> "Завершаем проявку"
        }
    }
    val progress = (0.10 + 0.84 * (1.0 - exp(-elapsedSec / 7.5))).toFloat().coerceAtMost(0.94f)

    val transition = rememberInfiniteTransition(label = "igseekPhotoStudio")
    val driftPhase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2f * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 7600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "driftPhase"
    )
    val scanY by transition.animateFloat(
        initialValue = -0.22f,
        targetValue = 1.22f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 3100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "scanY"
    )
    val apertureAngle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 9000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "apertureAngle"
    )
    val breatheScale by transition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.04f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "breatheScale"
    )

    val canvasBg = if (isDark) Color(0xFF0C0C10) else Color(0xFFF3F3F6)
    val auraA = if (isDark) Color(0xFFF43F5E).copy(alpha = 0.24f) else Color(0xFFF59E0B).copy(alpha = 0.20f)
    val auraB = if (isDark) Color(0xFFF59E0B).copy(alpha = 0.20f) else Color(0xFF38BDF8).copy(alpha = 0.20f)
    val auraC = if (isDark) palette.brand.copy(alpha = 0.22f) else Color(0xFF71717A).copy(alpha = 0.16f)
    val gridColor = if (isDark) Color.White.copy(alpha = 0.045f) else Color(0xFF18181B).copy(alpha = 0.045f)
    val bracketColor = if (isDark) Color.White.copy(alpha = 0.32f) else Color(0xFF71717A).copy(alpha = 0.55f)
    val scanLineColor = if (isDark) Color.White.copy(alpha = 0.42f) else Color(0xFF18181B).copy(alpha = 0.28f)
    val scanTrailColor = if (isDark) Color.White.copy(alpha = 0.10f) else Color(0xFF18181B).copy(alpha = 0.06f)
    val ringOuterColor = if (isDark) Color.White.copy(alpha = 0.26f) else Color(0xFF18181B).copy(alpha = 0.22f)
    val brandAccent = palette.brand

    IGseekGlassCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        contentPadding = 0.dp
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Studio Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(11.dp),
                    color = palette.chipBg,
                    border = BorderStroke(1.dp, palette.glassBorder),
                    modifier = Modifier.size(32.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = LucideIcons.Image,
                            contentDescription = null,
                            tint = palette.brand,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = title.ifBlank { if (isEn) "IGseek Image" else "Изображение IGseek" },
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                        color = palette.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "IGseek Studio · ${String.format(Locale.US, "%.1fs", elapsedSec)}",
                        style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                        color = palette.textMuted,
                        maxLines = 1
                    )
                }
                Text(
                    text = "${(progress * 100f).roundToInt()}%",
                    style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                    fontWeight = FontWeight.SemiBold,
                    color = palette.textSecondary
                )
            }

            HorizontalDivider(color = palette.divider)

            // Developing Canvas
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp)
                    .height(260.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(canvasBg)
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val w = size.width
                    val h = size.height

                    // 1. Living organic pigment washes
                    val c1 = Offset(
                        x = w * (0.28f + 0.18f * cos(driftPhase)),
                        y = h * (0.30f + 0.14f * sin(driftPhase))
                    )
                    drawCircle(
                        brush = Brush.radialGradient(listOf(auraA, Color.Transparent), center = c1, radius = w * 0.55f),
                        radius = w * 0.55f,
                        center = c1
                    )

                    val c2 = Offset(
                        x = w * (0.74f + 0.16f * sin(driftPhase * 0.85f)),
                        y = h * (0.68f + 0.14f * cos(driftPhase * 0.85f))
                    )
                    drawCircle(
                        brush = Brush.radialGradient(listOf(auraB, Color.Transparent), center = c2, radius = w * 0.58f),
                        radius = w * 0.58f,
                        center = c2
                    )

                    val c3 = Offset(
                        x = w * (0.50f + 0.14f * cos(driftPhase * 1.25f + 1.4f)),
                        y = h * (0.48f + 0.18f * sin(driftPhase * 1.25f + 1.4f))
                    )
                    drawCircle(
                        brush = Brush.radialGradient(listOf(auraC, Color.Transparent), center = c3, radius = w * 0.45f),
                        radius = w * 0.45f,
                        center = c3
                    )

                    // 2. Architectural composition grid
                    val step = 28.dp.toPx()
                    var gx = step
                    while (gx < w) {
                        drawLine(gridColor, Offset(gx, 0f), Offset(gx, h), strokeWidth = 1f)
                        gx += step
                    }
                    var gy = step
                    while (gy < h) {
                        drawLine(gridColor, Offset(0f, gy), Offset(w, gy), strokeWidth = 1f)
                        gy += step
                    }

                    // 3. Sweeping optical developing light band
                    val bandTop = h * scanY
                    val bandHeight = h * 0.34f
                    drawRect(
                        brush = Brush.verticalGradient(
                            colors = listOf(scanTrailColor, Color.Transparent),
                            startY = bandTop,
                            endY = bandTop + bandHeight
                        ),
                        topLeft = Offset(0f, bandTop),
                        size = Size(w, bandHeight)
                    )
                    drawLine(
                        brush = Brush.horizontalGradient(
                            listOf(Color.Transparent, scanLineColor, Color.Transparent)
                        ),
                        start = Offset(0f, bandTop),
                        end = Offset(w, bandTop),
                        strokeWidth = 1.5.dp.toPx()
                    )

                    // 4. Optical viewfinder corner registration brackets
                    val pad = 14.dp.toPx()
                    val bLen = 14.dp.toPx()
                    val bStroke = 1.5.dp.toPx()
                    val bottomPad = 48.dp.toPx()
                    // Top-left
                    drawLine(bracketColor, Offset(pad, pad), Offset(pad + bLen, pad), bStroke, StrokeCap.Round)
                    drawLine(bracketColor, Offset(pad, pad), Offset(pad, pad + bLen), bStroke, StrokeCap.Round)
                    // Top-right
                    drawLine(bracketColor, Offset(w - pad, pad), Offset(w - pad - bLen, pad), bStroke, StrokeCap.Round)
                    drawLine(bracketColor, Offset(w - pad, pad), Offset(w - pad, pad + bLen), bStroke, StrokeCap.Round)
                    // Bottom-left
                    drawLine(bracketColor, Offset(pad, h - bottomPad), Offset(pad + bLen, h - bottomPad), bStroke, StrokeCap.Round)
                    drawLine(bracketColor, Offset(pad, h - bottomPad), Offset(pad, h - bottomPad - bLen), bStroke, StrokeCap.Round)
                    // Bottom-right
                    drawLine(bracketColor, Offset(w - pad, h - bottomPad), Offset(w - pad - bLen, h - bottomPad), bStroke, StrokeCap.Round)
                    drawLine(bracketColor, Offset(w - pad, h - bottomPad), Offset(w - pad, h - bottomPad - bLen), bStroke, StrokeCap.Round)

                    // 5. Central rotating aperture focus rings
                    val center = Offset(w / 2f, h * 0.44f)
                    val outerR = 35.dp.toPx()
                    val innerR = 27.dp.toPx()
                    drawCircle(
                        color = ringOuterColor,
                        radius = outerR,
                        center = center,
                        style = Stroke(
                            width = 1.25.dp.toPx(),
                            cap = StrokeCap.Round,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(18f, 12f), apertureAngle * 0.6f)
                        )
                    )
                    drawArc(
                        color = brandAccent.copy(alpha = 0.65f),
                        startAngle = -apertureAngle,
                        sweepAngle = 72f,
                        useCenter = false,
                        topLeft = Offset(center.x - innerR, center.y - innerR),
                        size = Size(innerR * 2f, innerR * 2f),
                        style = Stroke(width = 1.75.dp.toPx(), cap = StrokeCap.Round)
                    )
                    drawArc(
                        color = brandAccent.copy(alpha = 0.35f),
                        startAngle = -apertureAngle + 180f,
                        sweepAngle = 54f,
                        useCenter = false,
                        topLeft = Offset(center.x - innerR, center.y - innerR),
                        size = Size(innerR * 2f, innerR * 2f),
                        style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round)
                    )
                }

                // Center breathing optical lens housing
                Surface(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(bottom = 32.dp)
                        .size(44.dp)
                        .graphicsLayer {
                            scaleX = breatheScale
                            scaleY = breatheScale
                        },
                    shape = RoundedCornerShape(14.dp),
                    color = if (isDark) Color(0xFF18181E).copy(alpha = 0.90f) else Color.White.copy(alpha = 0.92f),
                    border = BorderStroke(1.dp, palette.glassBorder)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = LucideIcons.Image,
                            contentDescription = null,
                            tint = palette.brand,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                // Bottom developing stage caption + prompt preview
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    Color.Transparent,
                                    canvasBg.copy(alpha = 0.84f),
                                    canvasBg.copy(alpha = 0.96f)
                                )
                            )
                        )
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                ) {
                    AnimatedContent(
                        targetState = stageLabel,
                        label = "stageLabelTransition"
                    ) { currentLabel ->
                        Text(
                            text = "$currentLabel…",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Medium,
                            color = palette.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    val trimmedPrompt = prompt.trim()
                    if (trimmedPrompt.isNotBlank() && !trimmedPrompt.equals(title.trim(), ignoreCase = true)) {
                        Text(
                            text = trimmedPrompt,
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                // Bottom hairline asymptotic progress ribbon
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(2.5.dp)
                        .background(if (isDark) Color.White.copy(alpha = 0.08f) else Color(0xFF18181B).copy(alpha = 0.08f))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress)
                            .height(2.5.dp)
                            .background(palette.brand)
                    )
                }
            }
        }
    }
}

private fun decodeDataUrlBitmap(dataUrl: String): android.graphics.Bitmap? {
    return runCatching {
        val b64 = dataUrl.substringAfter("base64,", "")
        if (b64.isBlank()) return null
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()
}

private fun formatWorkspaceDateTime(iso: String, isEn: Boolean): String {
    if (iso.isBlank()) return ""
    return runCatching {
        val zdt = Instant.parse(iso).atZone(ZoneId.systemDefault())
        val locale = if (isEn) Locale.US else Locale("ru", "RU")
        DateTimeFormatter.ofPattern("d MMM · HH:mm", locale).format(zdt)
    }.getOrDefault(iso.take(16))
}

private fun formatWorkspaceTime(iso: String): String {
    if (iso.isBlank()) return ""
    return runCatching {
        val zdt = Instant.parse(iso).atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm").format(zdt)
    }.getOrDefault("")
}

private fun toGoogleCalendarStamp(iso: String): String {
    if (iso.isBlank()) return ""
    return runCatching {
        val inst = Instant.parse(iso)
        DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneId.of("UTC"))
            .format(inst)
    }.getOrDefault("")
}

private fun openNativeCalendarInsert(context: Context, event: CalendarEventItem) {
    val startMs = runCatching { Instant.parse(event.startTime).toEpochMilli() }.getOrNull()
    val endMs = runCatching { Instant.parse(event.endTime).toEpochMilli() }.getOrNull()
        ?: startMs?.plus(3_600_000L)

    val nativeIntent = Intent(Intent.ACTION_INSERT).apply {
        data = CalendarContract.Events.CONTENT_URI
        putExtra(CalendarContract.Events.TITLE, event.summary)
        if (event.description.isNotBlank()) putExtra(CalendarContract.Events.DESCRIPTION, event.description)
        if (event.location.isNotBlank()) putExtra(CalendarContract.Events.EVENT_LOCATION, event.location)
        if (startMs != null) putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, startMs)
        if (endMs != null) putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMs)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val launchedNative = runCatching {
        context.startActivity(nativeIntent)
    }.isSuccess

    if (!launchedNative) {
        val enc = { s: String -> URLEncoder.encode(s, StandardCharsets.UTF_8.name()) }
        val startStamp = toGoogleCalendarStamp(event.startTime)
        val endStamp = toGoogleCalendarStamp(event.endTime)
        val datesParam = if (startStamp.isNotBlank() && endStamp.isNotBlank()) "&dates=$startStamp/$endStamp" else ""
        val url = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(event.summary)}$datesParam&details=${enc(event.description)}&location=${enc(event.location)}"
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

private fun openNativeGoogleTasks(context: Context) {
    val appIntent = context.packageManager.getLaunchIntentForPackage("com.google.android.apps.tasks")
    if (appIntent != null) {
        appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (runCatching { context.startActivity(appIntent) }.isSuccess) return
    }
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://tasks.google.com")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}

private fun openNativeGmailCompose(context: Context, email: GmailEventItem) {
    val mailtoUri = Uri.parse("mailto:${Uri.encode(email.to)}")
    val gmailIntent = Intent(Intent.ACTION_SENDTO, mailtoUri).apply {
        setPackage("com.google.android.gm")
        if (email.subject.isNotBlank()) putExtra(Intent.EXTRA_SUBJECT, email.subject)
        if (email.body.isNotBlank()) putExtra(Intent.EXTRA_TEXT, email.body)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (runCatching { context.startActivity(gmailIntent) }.isSuccess) return

    val fallbackIntent = Intent(Intent.ACTION_SENDTO, mailtoUri).apply {
        if (email.subject.isNotBlank()) putExtra(Intent.EXTRA_SUBJECT, email.subject)
        if (email.body.isNotBlank()) putExtra(Intent.EXTRA_TEXT, email.body)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (runCatching { context.startActivity(Intent.createChooser(fallbackIntent, "Send Email").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.isSuccess) return

    val enc = { s: String -> URLEncoder.encode(s, StandardCharsets.UTF_8.name()) }
    val webUrl = "https://mail.google.com/mail/?view=cm&fs=1&to=${enc(email.to)}&su=${enc(email.subject)}&body=${enc(email.body)}"
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(webUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

@Composable
private fun MobileCalendarEventCard(
    event: CalendarEventItem,
    isEn: Boolean,
    onConfirm: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val startLabel = formatWorkspaceDateTime(event.startTime, isEn)
    val endLabel = formatWorkspaceTime(event.endTime)
    val timeRange = listOfNotNull(
        startLabel.takeIf { it.isNotBlank() },
        endLabel.takeIf { it.isNotBlank() }
    ).joinToString(" – ")

    IGseekGlassCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        contentPadding = 14.dp
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(palette.brandSoft),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(LucideIcons.Calendar, contentDescription = null, tint = palette.brand, modifier = Modifier.size(18.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = event.summary,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (timeRange.isNotBlank()) {
                        Text(
                            text = timeRange,
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textSecondary
                        )
                    }
                    Text(
                        text = if (event.confirmed) {
                            if (isEn) "Confirmed · Added to Calendar" else "Подтверждено · Добавлено в календарь"
                        } else {
                            if (isEn) "Google Calendar · Awaiting confirmation" else "Google Календарь · Ждёт подтверждения"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = if (event.confirmed) palette.brand else palette.textMuted
                    )
                }
            }

            if (event.location.isNotBlank()) {
                Text(
                    text = event.location,
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.textSecondary
                )
            }
            if (event.description.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = palette.chipBg,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = event.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textSecondary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
                    )
                }
            }

            Button(
                onClick = onConfirm,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (event.confirmed) palette.chipBg else palette.brand,
                    contentColor = if (event.confirmed) palette.textPrimary else palette.brandOn
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = if (event.confirmed) LucideIcons.ExternalLink else LucideIcons.Check,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (event.confirmed) {
                        if (isEn) "Open in Calendar Again" else "Открыть в Календаре ещё раз"
                    } else {
                        if (isEn) "Confirm & Add to Calendar" else "Подтвердить и добавить в Календарь"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun MobileTaskEventCard(
    task: TaskEventItem,
    isEn: Boolean,
    onConfirm: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val dueLabel = formatWorkspaceDateTime(task.due, isEn)

    IGseekGlassCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        contentPadding = 14.dp
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(palette.brandSoft),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(LucideIcons.CheckCircle, contentDescription = null, tint = palette.brand, modifier = Modifier.size(18.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (dueLabel.isNotBlank()) {
                        Text(
                            text = if (isEn) "Due: $dueLabel" else "Срок: $dueLabel",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textSecondary
                        )
                    }
                    Text(
                        text = if (task.confirmed) {
                            if (isEn) "Confirmed · Reminder scheduled" else "Подтверждено · Напоминание создано"
                        } else {
                            if (isEn) "Google Tasks · Awaiting confirmation" else "Google Tasks · Ждёт подтверждения"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = if (task.confirmed) palette.brand else palette.textMuted
                    )
                }
            }

            if (task.notes.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = palette.chipBg,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = task.notes,
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textSecondary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
                    )
                }
            }

            Button(
                onClick = onConfirm,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (task.confirmed) palette.chipBg else palette.brand,
                    contentColor = if (task.confirmed) palette.textPrimary else palette.brandOn
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = if (task.confirmed) LucideIcons.ExternalLink else LucideIcons.Check,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (task.confirmed) {
                        if (isEn) "Open Google Tasks" else "Открыть Google Tasks"
                    } else {
                        if (isEn) "Confirm & Add Task" else "Подтвердить и открыть Tasks"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun MobileGmailEventCard(
    email: GmailEventItem,
    isEn: Boolean,
    onConfirm: () -> Unit
) {
    val palette = LocalIGseekPalette.current

    IGseekGlassCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        contentPadding = 14.dp
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(Color(0xFFEF4444).copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(LucideIcons.Mail, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = email.subject.ifBlank { if (isEn) "Gmail Message" else "Письмо Gmail" },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (email.to.isNotBlank()) {
                        Text(
                            text = "${if (isEn) "To" else "Кому"}: ${email.to}",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Text(
                        text = if (email.confirmed) {
                            if (isEn) "Opened in Gmail" else "Открыто в Gmail"
                        } else {
                            if (isEn) "Gmail · Awaiting confirmation" else "Gmail · Ждёт подтверждения"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = if (email.confirmed) palette.brand else palette.textMuted
                    )
                }
            }

            if (email.body.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = palette.chipBg,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = email.body.take(400),
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textSecondary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
                    )
                }
            }

            Button(
                onClick = onConfirm,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (email.confirmed) palette.chipBg else Color(0xFFDC2626),
                    contentColor = if (email.confirmed) palette.textPrimary else Color.White
                ),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = if (email.confirmed) LucideIcons.ExternalLink else LucideIcons.Mail,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = if (email.confirmed) {
                        if (isEn) "Open in Gmail Again" else "Открыть в Gmail ещё раз"
                    } else {
                        if (isEn) "Confirm & Open in Gmail" else "Подтвердить и отправить в Gmail"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}
