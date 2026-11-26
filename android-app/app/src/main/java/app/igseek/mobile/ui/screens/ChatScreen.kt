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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Create
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
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
            .imePadding()
            .let { if (!state.layoutPrefs.showBottomBar) it.navigationBarsPadding() else it }
    ) {
        // Slim IGseek Website Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = onOpenDrawer) {
                Icon(Icons.Rounded.Menu, contentDescription = "Menu", tint = palette.textPrimary)
            }

            // Centered IGseek Fox + Model Pill
            Surface(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .clickable { showModelSheet = true },
                shape = RoundedCornerShape(14.dp),
                color = palette.glassBg,
                border = BorderStroke(1.dp, palette.glassBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    IGseekFoxLogo(size = 18.dp, showGlow = false)
                    Text(
                        text = state.selectedModel.label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary,
                        maxLines = 1
                    )
                    Icon(
                        Icons.Rounded.KeyboardArrowDown,
                        contentDescription = null,
                        tint = palette.textMuted,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(
                    onClick = { viewModel.toggleSaveChat(state.activeChatId) },
                    modifier = Modifier.size(38.dp)
                ) {
                    Icon(
                        imageVector = if (isChatSaved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = "Save Chat",
                        tint = if (isChatSaved) palette.brand else palette.textMuted,
                        modifier = Modifier.size(19.dp)
                    )
                }
                IconButton(
                    onClick = { viewModel.createNewChat() },
                    modifier = Modifier.size(38.dp)
                ) {
                    Icon(
                        Icons.Rounded.Add,
                        contentDescription = "New Chat",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(21.dp)
                    )
                }
            }
        }

        // Offline Outbox Pill (only shown when offline or queued)
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

        // Main Chat Content or IGseek Welcome Hero
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

        // Website-Authentic `.glass-composer` Dock
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
                    IGseekFoxLogo(size = 22.dp)
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
                                .clip(RoundedCornerShape(14.dp))
                                .clickable {
                                    viewModel.setModel(model)
                                    showModelSheet = false
                                },
                            shape = RoundedCornerShape(14.dp),
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
                                    Icon(Icons.Rounded.Check, contentDescription = null, tint = palette.brand)
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
            "Explain simply" to "Explain quantum computing in simple words with an everyday analogy",
            "Write clean code" to "Write a modern TypeScript utility with unit tests and edge-case handling",
            "Build a plan" to "Create a 14-day focused roadmap to launch a side project from scratch",
            "Brainstorm ideas" to "Give me 5 original product ideas combining AI and daily productivity"
        )
    } else {
        listOf(
            "Объясни просто" to "Объясни простыми словами, как работают нейросети и трансформеры",
            "Напиши код" to "Напиши чистый и современный скрипт с разбором архитектуры и крайних случаев",
            "Составь план" to "Составь пошаговый план запуска IT-проекта на 14 дней с приоритетами",
            "Придумай идеи" to "Предложи 5 свежих идей для продукта, которые реально решают повседневные задачи"
        )
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        IGseekFoxLogo(size = 66.dp, showGlow = true)
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
                        pair.forEach { (title, fullPrompt) ->
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(16.dp))
                                    .clickable { onPromptClick(fullPrompt) },
                                shape = RoundedCornerShape(16.dp),
                                color = palette.glassBg,
                                border = BorderStroke(1.dp, palette.glassBorder)
                            ) {
                                Column(modifier = Modifier.padding(13.dp)) {
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = palette.textPrimary
                                    )
                                    Spacer(Modifier.height(3.dp))
                                    Text(
                                        text = fullPrompt,
                                        style = MaterialTheme.typography.bodySmall,
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
                modifier = Modifier.widthIn(max = 310.dp),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 6.dp, bottomStart = 20.dp, bottomEnd = 20.dp),
                color = palette.userBubbleBg,
                border = BorderStroke(1.dp, palette.userBubbleBorder)
            ) {
                Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    if (msg.attachmentNames.isNotEmpty()) {
                        Text(
                            text = msg.attachmentNames.joinToString(" · "),
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.brand,
                            modifier = Modifier.padding(bottom = 4.dp)
                        )
                    }
                    Text(
                        text = msg.content,
                        style = MaterialTheme.typography.bodyLarge,
                        color = palette.textPrimary
                    )
                    if (msg.isQueuedOffline) {
                        Text(
                            text = "В очереди (оффлайн)",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.brand,
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
            // IGseek Fox Assistant Header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(26.dp)
                        .clip(CircleShape)
                        .background(palette.brandSoft),
                    contentAlignment = Alignment.Center
                ) {
                    IGseekFoxLogo(size = 18.dp, showGlow = false)
                }
                Text(
                    text = "IGseek",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = palette.textPrimary
                )
            }

            // Reasoning / Thinking Accordion
            if (msg.reasoning.isNotBlank()) {
                IGseekGlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showReasoning = !showReasoning },
                    shape = RoundedCornerShape(14.dp),
                    contentPadding = 11.dp
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
                            Icon(Icons.Rounded.Star, contentDescription = null, tint = palette.brand, modifier = Modifier.size(15.dp))
                            Text(
                                text = "Ход рассуждений",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.textSecondary
                            )
                        }
                        Icon(
                            imageVector = if (showReasoning) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(18.dp)
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

            // Main Markdown Prose
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

            // Inline Generated Images
            msg.images.forEach { img ->
                val bmp = remember(img.dataUrl) { decodeDataUrlBitmap(img.dataUrl) }
                if (bmp != null) {
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        contentPadding = 8.dp
                    ) {
                        Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = img.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(260.dp)
                                .clip(RoundedCornerShape(12.dp))
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

            // Clickable Web Search Sources
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
                                .clip(RoundedCornerShape(10.dp))
                                .clickable { onOpenUrl(src.url) },
                            shape = RoundedCornerShape(10.dp),
                            color = palette.chipBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                Icon(Icons.Rounded.Search, contentDescription = null, tint = palette.brand, modifier = Modifier.size(12.dp))
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

            // Subtle Assistant Action Row
            if (msg.content.isNotBlank()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        text = "Копировать",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted,
                        modifier = Modifier.clickable(onClick = onCopy)
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier.clickable(onClick = onBookmark)
                    ) {
                        Icon(
                            imageVector = if (msg.isBookmarked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
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
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            modifier = Modifier.clickable(onClick = onRegenerate)
                        ) {
                            Icon(Icons.Rounded.Refresh, contentDescription = "Retry", tint = palette.textMuted, modifier = Modifier.size(13.dp))
                            Text(
                                text = "Ещё раз",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.textMuted
                            )
                        }
                    }
                    Icon(
                        Icons.Rounded.Share,
                        contentDescription = "Share",
                        tint = palette.textMuted,
                        modifier = Modifier.size(14.dp).clickable(onClick = onShare)
                    )
                }
            }
        }
    }
}

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

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        if (state.pendingAttachments.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                state.pendingAttachments.forEach { att ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = palette.brandSoft,
                        border = BorderStroke(1.dp, palette.brandBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                text = att.name.take(24),
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.textPrimary
                            )
                            Icon(
                                Icons.Rounded.Close,
                                contentDescription = "Remove",
                                tint = palette.textMuted,
                                modifier = Modifier
                                    .size(14.dp)
                                    .clickable { onRemoveAttachment(att.name) }
                            )
                        }
                    }
                }
            }
        }

        // Website `.glass-composer` Card
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = palette.composerBg,
            border = BorderStroke(
                width = 1.dp,
                color = if (state.imageModeEnabled) palette.brandBorder else palette.composerBorder
            )
        ) {
            Column(
                modifier = Modifier.padding(start = 14.dp, end = 10.dp, top = 12.dp, bottom = 9.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(end = 4.dp, bottom = 8.dp)
                ) {
                    if (state.draftInput.isEmpty()) {
                        Text(
                            text = when {
                                state.imageModeEnabled -> if (isEn) "Describe the image to create…" else "Опишите изображение, которое нужно создать…"
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

                // Bottom Composer Toolbar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .horizontalScroll(rememberScrollState()),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Attach button
                        Surface(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .clickable(onClick = onAttachClick),
                            shape = CircleShape,
                            color = palette.chipBg,
                            border = BorderStroke(1.dp, palette.chipBorder)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Rounded.Add,
                                    contentDescription = "Attach",
                                    tint = palette.textSecondary,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        IGseekGlassChip(
                            label = if (isEn) "Search" else "Поиск",
                            selected = state.webSearchEnabled,
                            onClick = onToggleWeb,
                            leading = {
                                Icon(
                                    Icons.Rounded.Search,
                                    contentDescription = null,
                                    tint = if (state.webSearchEnabled) palette.brand else palette.textMuted,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        )
                        IGseekGlassChip(
                            label = if (isEn) "Think" else "Мысли",
                            selected = state.reasoningEnabled,
                            onClick = onToggleReasoning,
                            leading = {
                                Icon(
                                    Icons.Rounded.Star,
                                    contentDescription = null,
                                    tint = if (state.reasoningEnabled) palette.brand else palette.textMuted,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        )
                        IGseekGlassChip(
                            label = if (isEn) "Image" else "Фото",
                            selected = state.imageModeEnabled,
                            onClick = onToggleImage,
                            leading = {
                                Icon(
                                    Icons.Rounded.Create,
                                    contentDescription = null,
                                    tint = if (state.imageModeEnabled) palette.brand else palette.textMuted,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        )
                    }

                    Spacer(Modifier.width(6.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Native Android Voice Input Button (crisp custom Canvas mic)
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
                                MicrophoneGlyph(color = palette.textSecondary, modifier = Modifier.size(16.dp))
                            }
                        }

                        // Brand Send Button
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
                                    Icons.AutoMirrored.Rounded.Send,
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
private fun MicrophoneGlyph(
    color: Color,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = w * 0.11f)
        // Mic capsule
        drawRoundRect(
            color = color,
            topLeft = Offset(w * 0.34f, h * 0.10f),
            size = Size(w * 0.32f, h * 0.48f),
            cornerRadius = CornerRadius(w * 0.16f, w * 0.16f)
        )
        // Cradle arc
        drawArc(
            color = color,
            startAngle = 0f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(w * 0.18f, h * 0.30f),
            size = Size(w * 0.64f, h * 0.44f),
            style = stroke
        )
        // Stem + base
        drawLine(color = color, start = Offset(w * 0.50f, h * 0.74f), end = Offset(w * 0.50f, h * 0.90f), strokeWidth = w * 0.11f)
        drawLine(color = color, start = Offset(w * 0.32f, h * 0.90f), end = Offset(w * 0.68f, h * 0.90f), strokeWidth = w * 0.11f)
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
