package app.igseek.mobile.ui.screens

import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import java.util.Locale

@Composable
fun LibraryScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val isEn = state.layoutPrefs.language == "en"

    var searchQuery by remember { mutableStateOf("") }
    var filterCategory by remember { mutableStateOf("all") }
    var previewItem by remember { mutableStateOf<LibraryFileItem?>(null) }

    val uploadPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
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
                viewModel.uploadToLibrary(ChatAttachment(name, mime, "data:$mime;base64,$b64", bytes.size.toLong()))
            }
        }
    }

    val filtered = remember(state.libraryFiles, searchQuery, filterCategory) {
        state.libraryFiles.filter { item ->
            val matchQuery = searchQuery.isBlank() ||
                item.name.contains(searchQuery, ignoreCase = true) ||
                item.chatTitle.contains(searchQuery, ignoreCase = true)
            val matchCat = when (filterCategory) {
                "images" -> item.type == "image" || item.mimeType.startsWith("image/")
                "docs" -> item.type == "doc" || item.type == "markdown"
                "code" -> item.type == "code" || item.source == "engine"
                else -> true
            }
            matchQuery && matchCat
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onOpenDrawer) {
                    Icon(
                        imageVector = LucideIcons.Menu,
                        contentDescription = "Menu",
                        tint = palette.textPrimary,
                        modifier = Modifier.size(21.dp)
                    )
                }
                IGseekFoxLogo(size = 20.dp)
                Spacer(Modifier.width(8.dp))
                Column {
                    Text("Library", style = MaterialTheme.typography.titleMedium, color = palette.textPrimary)
                    Text(
                        text = if (isEn) {
                            "${state.libraryFiles.size} files · Cloud + local"
                        } else {
                            "${state.libraryFiles.size} файлов · Облако + локально"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                }
            }
            Row {
                IconButton(onClick = { viewModel.refreshLibrary() }) {
                    Icon(
                        imageVector = LucideIcons.RefreshCw,
                        contentDescription = "Refresh",
                        tint = palette.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }
                IconButton(onClick = { uploadPicker.launch("*/*") }) {
                    Icon(
                        imageVector = LucideIcons.Plus,
                        contentDescription = "Upload",
                        tint = palette.brand,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text(if (isEn) "Search files…" else "Поиск в Library…", color = palette.textMuted) },
                leadingIcon = {
                    Icon(
                        imageVector = LucideIcons.Search,
                        contentDescription = null,
                        tint = palette.textMuted,
                        modifier = Modifier.size(17.dp)
                    )
                },
                singleLine = true,
                shape = RoundedCornerShape(50),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.brand,
                    unfocusedBorderColor = palette.glassBorder,
                    focusedTextColor = palette.textPrimary,
                    unfocusedTextColor = palette.textPrimary
                ),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    "all" to if (isEn) "All" else "Все",
                    "images" to if (isEn) "Images" else "Фото",
                    "docs" to if (isEn) "Docs" else "Документы",
                    "code" to if (isEn) "Code" else "Код"
                ).forEach { (key, label) ->
                    IGseekGlassChip(
                        label = label,
                        selected = filterCategory == key,
                        onClick = { filterCategory = key }
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        if (state.isLibraryLoading && state.libraryFiles.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.brand)
            }
        } else if (filtered.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IGseekFoxLogo(size = 44.dp, showGlow = palette.isDark)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = if (isEn) "Library is empty" else "В Library пока нет файлов",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (isEn) {
                            "Upload files, save Flow reports, Engine code or generated images."
                        } else {
                            "Загружайте файлы кнопкой «+», сохраняйте отчёты Flow, код Engine и сгенерированные фото."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textMuted,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(filtered, key = { it.id }) { item ->
                    IGseekGlassCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { previewItem = item },
                        shape = RoundedCornerShape(18.dp),
                        contentPadding = 14.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = "${item.source.uppercase(Locale.US)} · ${formatFileSize(item.sizeBytes)} · ${item.chatTitle}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            IGseekGlassChip(
                                label = if (isEn) "Attach" else "В чат",
                                selected = false,
                                onClick = { viewModel.attachLibraryFileToChat(item) }
                            )
                            Spacer(Modifier.width(4.dp))
                            IconButton(
                                onClick = { viewModel.deleteLibraryFile(item.id) },
                                modifier = Modifier.size(34.dp)
                            ) {
                                Icon(
                                    imageVector = LucideIcons.Trash2,
                                    contentDescription = "Delete",
                                    tint = palette.textMuted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    val activePreview = previewItem
    if (activePreview != null) {
        val dataUrl = activePreview.dataUrl
        val contentText = activePreview.content
        val bmp = remember(dataUrl) {
            if (!dataUrl.isNullOrBlank()) {
                runCatching {
                    val b64 = dataUrl.substringAfter("base64,", "")
                    val bytes = Base64.decode(b64, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }.getOrNull()
            } else null
        }

        AlertDialog(
            onDismissRequest = { previewItem = null },
            containerColor = palette.surfaceElevated,
            title = {
                Text(
                    text = activePreview.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    if (bmp != null) {
                        Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = activePreview.name,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(260.dp)
                                .clip(RoundedCornerShape(12.dp))
                        )
                    } else if (!contentText.isNullOrBlank()) {
                        IGseekMarkdownText(markdown = contentText.take(6000))
                    } else {
                        Text(
                            text = "Предпросмотр недоступен (${activePreview.mimeType})",
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.textMuted
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.attachLibraryFileToChat(activePreview)
                        previewItem = null
                    }
                ) {
                    Text(if (isEn) "Attach to chat" else "Прикрепить в чат", color = palette.brand)
                }
            },
            dismissButton = {
                Row {
                    if (!contentText.isNullOrBlank()) {
                        TextButton(
                            onClick = {
                                clipboard.setText(AnnotatedString(contentText))
                                viewModel.showToast("Скопировано")
                            }
                        ) {
                            Text(if (isEn) "Copy" else "Копировать", color = palette.textSecondary)
                        }
                    }
                    TextButton(onClick = { previewItem = null }) {
                        Text(if (isEn) "Close" else "Закрыть", color = palette.textMuted)
                    }
                }
            }
        )
    }
}

private fun formatFileSize(bytes: Long): String = when {
    bytes <= 0L -> "—"
    bytes < 1024L -> "$bytes B"
    bytes < 1024L * 1024L -> String.format(Locale.US, "%.1f KB", bytes / 1024.0)
    else -> String.format(Locale.US, "%.2f MB", bytes / (1024.0 * 1024.0))
}
