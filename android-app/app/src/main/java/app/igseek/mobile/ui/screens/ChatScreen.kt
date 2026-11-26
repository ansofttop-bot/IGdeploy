package app.igseek.mobile.ui.screens

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.speech.RecognizerIntent
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import java.util.Locale

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
                    IGseekFoxLogo(size = 17.dp, showGlow = false)
                    Text(
                        text = state.selectedModel.label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        maxLines = 1
                    )
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
                            runCatching { context.startActivity(Intent.createChooser(sendIntent, "Поделиться")) }
                        },
                        onSaveImage = { img -> viewModel.saveGeneratedImageToLibrary(img) },
                        onOpenUrl = { url ->
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
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
            onSend = { viewModel.sendMessage() }
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
                                    Text(
                                        text = model.label,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.textPrimary
                                    )
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
            text = "${state.selectedModel.label} · ${state.selectedAgent.label(state.layoutPrefs.language)}",
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
    onCopy: () -> Unit,
    onBookmark: () -> Unit,
    onRegenerate: () -> Unit,
    onShare: () -> Unit,
    onSaveImage: (GeneratedImageItem) -> Unit,
    onOpenUrl: (String) -> Unit
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
            } else {
                Text(
                    text = "Думаю…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.textMuted
                )
            }

            msg.images.forEach { img ->
                val bmp = remember(img.dataUrl) { decodeDataUrlBitmap(img.dataUrl) }
                if (bmp != null) {
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        contentPadding = 8.dp
                    ) {
                        Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = img.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(260.dp)
                                .clip(RoundedCornerShape(13.dp))
                        )
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
                                label = "В Library",
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
    onSend: () -> Unit
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

private fun decodeDataUrlBitmap(dataUrl: String): android.graphics.Bitmap? {
    return runCatching {
        val b64 = dataUrl.substringAfter("base64,", "")
        if (b64.isBlank()) return null
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()
}
