package app.igseek.mobile.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import kotlinx.coroutines.launch
import java.io.File

private val QUICK_PROMPTS = listOf(
    "Объясни простыми словами",
    "Напиши чистый код",
    "Сгенерируй концепт-арт",
    "Собери краткую выжимку"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val listState = rememberLazyListState()

    var inputText by remember { mutableStateOf("") }
    var showToolsSheet by remember { mutableStateOf(false) }
    var isRecordingVoice by remember { mutableStateOf(false) }
    var mediaRecorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var audioFile by remember { mutableStateOf<File?>(null) }

    val compact = state.layoutPrefs.compactDensity

    DisposableEffect(Unit) {
        onDispose {
            runCatching {
                mediaRecorder?.stop()
                mediaRecorder?.release()
            }
            mediaRecorder = null
        }
    }

    LaunchedEffect(state.messages.size, state.messages.lastOrNull()?.content?.length) {
        if (state.messages.isNotEmpty()) listState.animateScrollToItem(state.messages.lastIndex)
    }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                var name = "attachment_${System.currentTimeMillis()}"
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0 && cursor.moveToFirst()) name = cursor.getString(idx) ?: name
                }
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching
                if (bytes.size <= 6 * 1024 * 1024) {
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    viewModel.addAttachment(ChatAttachment(name, mime, "data:$mime;base64,$b64", bytes.size.toLong()))
                }
            }
        }
    }

    fun startVoiceCapture() {
        runCatching {
            val out = File(context.cacheDir, "igseek_voice_${System.currentTimeMillis()}.m4a")
            val rec = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context)
            else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            rec.setAudioSource(MediaRecorder.AudioSource.MIC)
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            rec.setAudioSamplingRate(16000)
            rec.setOutputFile(out.absolutePath)
            rec.prepare()
            rec.start()
            mediaRecorder = rec
            audioFile = out
            isRecordingVoice = true
        }
    }

    fun stopVoiceCaptureAndTranscribe() {
        isRecordingVoice = false
        val file = audioFile
        runCatching {
            mediaRecorder?.stop()
            mediaRecorder?.release()
        }
        mediaRecorder = null
        if (file != null && file.exists()) {
            val bytes = runCatching { file.readBytes() }.getOrNull()
            file.delete()
            if (bytes != null && bytes.isNotEmpty()) {
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                viewModel.transcribeVoiceBase64(b64) { text ->
                    inputText = if (inputText.isBlank()) text else "$inputText $text"
                }
            }
        }
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startVoiceCapture()
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = MaterialTheme.colorScheme.surface,
                modifier = Modifier.widthIn(max = 300.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Чаты IGseek", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = {
                        viewModel.createNewChat()
                        scope.launch { drawerState.close() }
                    }) {
                        Icon(Icons.Rounded.Add, contentDescription = "Новый чат")
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(vertical = 8.dp, horizontal = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(state.chats, key = { it.id }) { thread ->
                        NavigationDrawerItem(
                            label = { Text(thread.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            selected = thread.id == state.activeChatId,
                            onClick = {
                                viewModel.openChat(thread.id)
                                scope.launch { drawerState.close() }
                            },
                            badge = {
                                if (state.chats.size > 1) {
                                    IconButton(onClick = { viewModel.deleteChat(thread.id) }, modifier = Modifier.size(28.dp)) {
                                        Icon(Icons.Rounded.Delete, contentDescription = "Удалить чат", modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                }
            }
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .imePadding()
        ) {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
                navigationIcon = {
                    IconButton(onClick = { scope.launch { drawerState.open() } }) {
                        Icon(Icons.Rounded.Menu, contentDescription = "История чатов")
                    }
                },
                title = {
                    Column(modifier = Modifier.clickable { showToolsSheet = true }) {
                        Text(state.selectedModel.label, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            text = buildString {
                                append(state.selectedAgent.label)
                                if (state.webSearchEnabled) append(" • Веб")
                                if (state.reasoningEnabled) append(" • Анализ")
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showToolsSheet = true }) { Icon(Icons.Rounded.Settings, contentDescription = "Режимы") }
                    IconButton(onClick = { viewModel.createNewChat() }) { Icon(Icons.Rounded.Add, contentDescription = "Новый чат") }
                }
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)

            if (state.messages.isEmpty()) {
                EmptyChatHero(
                    showQuickPrompts = state.layoutPrefs.showQuickPrompts,
                    onPickPrompt = { prompt ->
                        if (state.layoutPrefs.hapticsEnabled) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        viewModel.sendMessage(prompt)
                    },
                    modifier = Modifier.weight(1f)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = if (compact) 10.dp else 14.dp, vertical = if (compact) 10.dp else 14.dp),
                    verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)
                ) {
                    items(state.messages, key = { it.id }) { msg ->
                        ChatMessageBubble(
                            message = msg,
                            compact = compact,
                            onCopy = { clipboard.setText(AnnotatedString(msg.content)) },
                            onShareText = {
                                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, msg.content)
                                }
                                context.startActivity(Intent.createChooser(sendIntent, "Поделиться ответом IGseek"))
                            }
                        )
                    }
                }
            }

            if (!state.streamStatus.isNullOrBlank()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Rounded.Star, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    Text(state.streamStatus, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (state.pendingAttachments.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    state.pendingAttachments.forEachIndexed { idx, att ->
                        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(att.name, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
                                Icon(Icons.Rounded.Close, contentDescription = "Убрать", modifier = Modifier.size(16.dp).clickable { viewModel.removeAttachment(idx) })
                            }
                        }
                    }
                }
            }

            Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    IconButton(onClick = { filePicker.launch("*/*") }) {
                        Icon(Icons.Rounded.Add, contentDescription = "Прикрепить файл", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        placeholder = { Text("Сообщение IGseek...") },
                        modifier = Modifier.weight(1f).heightIn(min = 48.dp, max = 140.dp),
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MaterialTheme.colorScheme.primary,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline
                        )
                    )

                    IconButton(
                        onClick = {
                            if (isRecordingVoice) stopVoiceCaptureAndTranscribe()
                            else {
                                val hasPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                                if (hasPerm) startVoiceCapture() else micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Phone,
                            contentDescription = "Голосовой ввод",
                            tint = if (isRecordingVoice) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    if (state.isStreaming) {
                        Surface(
                            onClick = { viewModel.stopStreaming() },
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(44.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.Close, contentDescription = "Остановить", tint = MaterialTheme.colorScheme.onPrimary)
                            }
                        }
                    } else {
                        val canSend = inputText.isNotBlank() || state.pendingAttachments.isNotEmpty()
                        Surface(
                            onClick = {
                                if (canSend) {
                                    if (state.layoutPrefs.hapticsEnabled) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    val draft = inputText
                                    inputText = ""
                                    viewModel.sendMessage(draft)
                                }
                            },
                            shape = CircleShape,
                            color = if (canSend) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.size(44.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.Send,
                                    contentDescription = "Отправить",
                                    tint = if (canSend) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showToolsSheet) {
        ModalBottomSheet(onDismissRequest = { showToolsSheet = false }, containerColor = MaterialTheme.colorScheme.surface) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text("Параметры чата", style = MaterialTheme.typography.titleMedium)

                Text("Модель", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AiModelId.entries.forEach { m ->
                        FilterChip(selected = state.selectedModel == m, onClick = { viewModel.setModel(m) }, label = { Text(m.label) })
                    }
                }

                Text("Роль ассистента", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AgentRoleId.entries.forEach { agent ->
                        FilterChip(selected = state.selectedAgent == agent, onClick = { viewModel.setAgent(agent) }, label = { Text(agent.label) })
                    }
                }

                Text("Инструменты", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FilterChip(
                        selected = state.webSearchEnabled,
                        onClick = { viewModel.toggleWebSearch() },
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(16.dp)) },
                        label = { Text("Поиск в сети") }
                    )
                    FilterChip(
                        selected = state.reasoningEnabled,
                        onClick = { viewModel.toggleReasoning() },
                        leadingIcon = { Icon(Icons.Rounded.Build, contentDescription = null, modifier = Modifier.size(16.dp)) },
                        label = { Text("Глубокий анализ") }
                    )
                }

                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun EmptyChatHero(
    showQuickPrompts: Boolean,
    onPickPrompt: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.Star, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text("Чем помочь сегодня?", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Нативный клиент IGseek с потоковыми ответами, генерацией изображений и офлайн-очередью.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (showQuickPrompts) {
            Spacer(Modifier.height(20.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                QUICK_PROMPTS.forEach { prompt ->
                    Surface(
                        onClick = { onPickPrompt(prompt) },
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(prompt, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatMessageBubble(
    message: ChatMessageItem,
    compact: Boolean,
    onCopy: () -> Unit,
    onShareText: () -> Unit
) {
    val isUser = message.role == "user"
    var showReasoning by remember(message.id) { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = if (isUser) 18.dp else 6.dp,
                bottomEnd = if (isUser) 6.dp else 18.dp
            ),
            color = when {
                message.isError -> MaterialTheme.colorScheme.error.copy(alpha = 0.14f)
                isUser -> MaterialTheme.colorScheme.primaryContainer
                else -> MaterialTheme.colorScheme.surface
            },
            modifier = Modifier.widthIn(max = 330.dp)
        ) {
            Column(
                modifier = Modifier.padding(horizontal = if (compact) 12.dp else 14.dp, vertical = if (compact) 8.dp else 11.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (message.attachmentNames.isNotEmpty()) {
                    Text("Файлы: ${message.attachmentNames.joinToString(", ")}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                }

                if (message.reasoning.isNotBlank()) {
                    Surface(onClick = { showReasoning = !showReasoning }, shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Ход рассуждений", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Icon(if (showReasoning) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                            AnimatedVisibility(visible = showReasoning) {
                                Text(message.reasoning, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                            }
                        }
                    }
                }

                if (message.content.isNotBlank()) {
                    Text(
                        text = message.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (message.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                    )
                }

                message.images.forEach { img -> GeneratedImagePreview(img) }

                if (message.isQueuedOffline) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Rounded.Info, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("В очереди (ожидает сеть)", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        if (!isUser && message.content.isNotBlank()) {
            Row(modifier = Modifier.padding(top = 2.dp)) {
                TextButton(onClick = onCopy, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
                    Text("Копировать", style = MaterialTheme.typography.labelMedium)
                }
                TextButton(onClick = onShareText, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
                    Icon(Icons.Rounded.Share, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Поделиться", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
private fun GeneratedImagePreview(image: GeneratedImageItem) {
    val bitmap = remember(image.dataUrl) {
        runCatching {
            val b64 = image.dataUrl.substringAfter("base64,", "")
            if (b64.isBlank()) return@runCatching null
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        }.getOrNull()
    }
    if (bitmap != null) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Image(
                bitmap = bitmap,
                contentDescription = image.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp, max = 280.dp).clip(RoundedCornerShape(12.dp))
            )
            if (image.title.isNotBlank()) {
                Text(image.title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
