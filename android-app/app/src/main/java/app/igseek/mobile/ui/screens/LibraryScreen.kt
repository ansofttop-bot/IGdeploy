package app.igseek.mobile.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.ui.components.IGseekEmptyState
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekSearchField
import app.igseek.mobile.ui.components.IGseekSegmentedControl
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.components.formatRelativeTime
import app.igseek.mobile.ui.components.sharePlainText
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

private fun decodeLibraryBitmap(dataUrl: String?): Bitmap? {
    if (dataUrl.isNullOrBlank()) return null
    return runCatching {
        val b64 = dataUrl.substringAfter("base64,", "")
        if (b64.isBlank()) return@runCatching null
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }.getOrNull()
}

private fun formatFileSize(bytes: Long): String {
    if (bytes <= 0L) return ""
    return when {
        bytes < 1024L -> "${bytes} B"
        bytes < 1024L * 1024L -> "${bytes / 1024L} KB"
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }
}

private fun fileCategoryLabel(item: LibraryFileItem, isEn: Boolean): String = when {
    item.type == "image" -> if (isEn) "Image" else "Фото"
    item.source == "flow" -> "Flow"
    item.source == "engine" || item.type == "code" -> if (isEn) "Code" else "Код"
    item.type == "markdown" -> "Markdown"
    else -> if (isEn) "Document" else "Документ"
}

@OptIn(ExperimentalMaterial3Api::class)
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

    var hubTab by remember { mutableIntStateOf(0) } // 0 = Files, 1 = Folders
    var search by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") } // all, image, flow, doc
    var gridMode by remember { mutableStateOf(true) }
    var previewFile by remember { mutableStateOf<LibraryFileItem?>(null) }
    var showCreateFolderDialog by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }

    val uploadPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                var name = "upload_${System.currentTimeMillis()}"
                context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0 && c.moveToFirst()) name = c.getString(idx) ?: name
                }
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching
                if (bytes.size > 6 * 1024 * 1024) {
                    viewModel.showToast(if (isEn) "File exceeds 6 MB" else "Файл больше 6 МБ")
                    return@runCatching
                }
                val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                viewModel.uploadToLibrary(ChatAttachment(name, mime, "data:$mime;base64,$b64", bytes.size.toLong()))
            }
        }
    }

    val filteredFiles = remember(state.libraryFiles, search, filter) {
        state.libraryFiles.filter { item ->
            val matchFilter = when (filter) {
                "image" -> item.type == "image"
                "flow" -> item.source == "flow"
                "doc" -> item.type != "image" && item.source != "flow"
                else -> true
            }
            val matchQuery = search.isBlank() ||
                item.name.contains(search, ignoreCase = true) ||
                item.chatTitle.contains(search, ignoreCase = true) ||
                (item.content?.contains(search, ignoreCase = true) == true)
            matchFilter && matchQuery
        }
    }

    val subtitle = if (isEn) {
        "${state.libraryFiles.size} files · ${state.projects.size} folders"
    } else {
        "${state.libraryFiles.size} файлов · ${state.projects.size} папок"
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = "Library",
            subtitle = subtitle,
            onOpenDrawer = onOpenDrawer,
            actions = {
                if (hubTab == 0) {
                    IconButton(
                        onClick = { gridMode = !gridMode },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = if (gridMode) LucideIcons.ListIcon else LucideIcons.LayoutGrid,
                            contentDescription = "Switch layout",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(19.dp)
                        )
                    }
                    IconButton(
                        onClick = { viewModel.refreshLibrary() },
                        modifier = Modifier.size(44.dp)
                    ) {
                        if (state.isLibraryLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = palette.brand
                            )
                        } else {
                            Icon(
                                imageVector = LucideIcons.RefreshCw,
                                contentDescription = "Refresh",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = { uploadPicker.launch("*/*") },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Upload,
                            contentDescription = "Upload",
                            tint = palette.brand,
                            modifier = Modifier.size(19.dp)
                        )
                    }
                } else {
                    IconButton(
                        onClick = { showCreateFolderDialog = true },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Plus,
                            contentDescription = "New Folder",
                            tint = palette.brand,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            IGseekSegmentedControl(
                options = if (isEn) {
                    listOf("Files (${state.libraryFiles.size})", "Folders (${state.projects.size})")
                } else {
                    listOf("Файлы (${state.libraryFiles.size})", "Папки (${state.projects.size})")
                },
                selectedIndex = hubTab,
                onSelect = { hubTab = it }
            )

            if (hubTab == 0) {
                IGseekSearchField(
                    query = search,
                    onQueryChange = { search = it },
                    placeholder = if (isEn) "Search files, images, reports…" else "Поиск файлов, фото и отчётов…"
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    val filters = if (isEn) {
                        listOf("all" to "All", "image" to "Images", "flow" to "Flow", "doc" to "Code & Docs")
                    } else {
                        listOf("all" to "Все", "image" to "Фото", "flow" to "Flow", "doc" to "Код и доки")
                    }
                    filters.forEach { (key, label) ->
                        IGseekGlassChip(
                            label = label,
                            selected = filter == key,
                            onClick = { filter = key }
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        if (hubTab == 0) {
            // FILES TAB
            if (filteredFiles.isEmpty()) {
                Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    IGseekEmptyState(
                        icon = LucideIcons.Library,
                        title = if (search.isNotBlank()) {
                            if (isEn) "Nothing matched" else "Ничего не найдено"
                        } else {
                            if (isEn) "Your Library is empty" else "Библиотека пока пуста"
                        },
                        description = if (isEn) {
                            "Upload documents, save generated images from Chat, or export reports from Flow and Engine."
                        } else {
                            "Загружайте файлы с телефона, сохраняйте фото из чата или экспортируйте отчёты из Flow и Engine."
                        },
                        actionLabel = if (isEn) "Upload file" else "Загрузить файл",
                        onAction = { uploadPicker.launch("*/*") }
                    )
                }
            } else if (gridMode) {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    itemsIndexed(filteredFiles.chunked(2), key = { idx, _ -> "lib_grid_$idx" }) { _, pair ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            pair.forEach { item ->
                                LibraryGridCard(
                                    item = item,
                                    isEn = isEn,
                                    onClick = { previewFile = item },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(filteredFiles, key = { it.id }) { item ->
                        LibraryListRow(
                            item = item,
                            isEn = isEn,
                            onClick = { previewFile = item },
                            onAttach = { viewModel.attachLibraryFileToChat(item) }
                        )
                    }
                }
            }
        } else {
            // FOLDERS TAB
            if (state.projects.isEmpty()) {
                Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    IGseekEmptyState(
                        icon = LucideIcons.Folder,
                        title = if (isEn) "No project folders yet" else "Папок пока нет",
                        description = if (isEn) {
                            "Group chats by topic — Work, Study, Startup or Code."
                        } else {
                            "Группируйте чаты по проектам и темам: Работа, Учёба, Стартап."
                        },
                        actionLabel = if (isEn) "Create folder" else "Создать папку",
                        onAction = { showCreateFolderDialog = true }
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    items(state.projects, key = { "folder_${it.id}" }) { proj ->
                        val chatCount = state.chats.count { it.projectId == proj.id }
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .clickable {
                                    viewModel.selectProject(proj.id)
                                    viewModel.selectTab(IGseekTab.CHAT)
                                },
                            shape = RoundedCornerShape(18.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(palette.brandSoft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.Folder,
                                        contentDescription = null,
                                        tint = palette.brand,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = proj.name,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.textPrimary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    val countStr = if (isEn) "$chatCount chats" else "$chatCount чатов"
                                    val timeStr = formatRelativeTime(proj.updatedAtMs, isEn)
                                    Text(
                                        text = listOf(countStr, timeStr).filter { it.isNotBlank() }.joinToString(" · "),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textMuted
                                    )
                                }
                                IconButton(
                                    onClick = { viewModel.deleteProject(proj.id) },
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.Trash2,
                                        contentDescription = "Delete folder",
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
    }

    // Native Bottom Sheet File Inspector
    previewFile?.let { file ->
        ModalBottomSheet(
            onDismissRequest = { previewFile = null },
            containerColor = palette.sidebarBg,
            contentColor = palette.textPrimary
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = file.name,
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.textPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        val meta = listOf(
                            fileCategoryLabel(file, isEn),
                            formatFileSize(file.sizeBytes),
                            file.chatTitle.takeIf { it.isNotBlank() && it != "Library" } ?: ""
                        ).filter { it.isNotBlank() }.joinToString(" · ")
                        Text(
                            text = meta,
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted
                        )
                    }
                    IconButton(
                        onClick = {
                            viewModel.deleteLibraryFile(file.id)
                            previewFile = null
                        },
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Trash2,
                            contentDescription = "Delete",
                            tint = palette.danger,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                // Visual Preview Content
                if (file.type == "image" && !file.dataUrl.isNullOrBlank()) {
                    val bmp = remember(file.id, file.dataUrl) { decodeLibraryBitmap(file.dataUrl) }
                    if (bmp != null) {
                        Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = file.name,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 180.dp, max = 340.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(palette.codeBg)
                        )
                    }
                } else {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 120.dp, max = 300.dp),
                        shape = RoundedCornerShape(16.dp),
                        color = palette.codeBg,
                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .verticalScroll(rememberScrollState())
                                .padding(14.dp)
                        ) {
                            Text(
                                text = file.content?.take(8000)?.ifBlank {
                                    if (isEn) "(Binary or empty file)" else "(Бинарный или пустой файл)"
                                } ?: if (isEn) "Preview unavailable — attach to Chat to inspect with AI." else "Предпросмотр недоступен — прикрепите файл к чату.",
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp,
                                    lineHeight = 18.sp
                                ),
                                color = Color(0xFFE4E4E7)
                            )
                        }
                    }
                }

                // Bottom Action Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            viewModel.attachLibraryFileToChat(file)
                            previewFile = null
                        },
                        shape = RoundedCornerShape(13.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.brand,
                            contentColor = palette.brandOn
                        ),
                        modifier = Modifier.weight(1f).height(44.dp)
                    ) {
                        Icon(LucideIcons.Paperclip, contentDescription = null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (isEn) "Use in Chat" else "В чат", fontWeight = FontWeight.SemiBold)
                    }

                    if (!file.content.isNullOrBlank()) {
                        OutlinedButton(
                            onClick = {
                                clipboard.setText(AnnotatedString(file.content))
                                viewModel.showToast(if (isEn) "Copied" else "Скопировано")
                            },
                            shape = RoundedCornerShape(13.dp),
                            border = BorderStroke(1.dp, palette.glassBorder),
                            contentPadding = PaddingValues(horizontal = 12.dp),
                            modifier = Modifier.height(44.dp)
                        ) {
                            Icon(LucideIcons.Copy, contentDescription = "Copy", tint = palette.textPrimary, modifier = Modifier.size(16.dp))
                        }
                        OutlinedButton(
                            onClick = { sharePlainText(context, file.name, file.content) },
                            shape = RoundedCornerShape(13.dp),
                            border = BorderStroke(1.dp, palette.glassBorder),
                            contentPadding = PaddingValues(horizontal = 12.dp),
                            modifier = Modifier.height(44.dp)
                        ) {
                            Icon(LucideIcons.Share2, contentDescription = "Share", tint = palette.textPrimary, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
            }
        }
    }

    if (showCreateFolderDialog) {
        AlertDialog(
            onDismissRequest = { showCreateFolderDialog = false },
            containerColor = palette.surfaceElevated,
            title = { Text(if (isEn) "New Folder" else "Новая папка", color = palette.textPrimary) },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    placeholder = { Text(if (isEn) "Work, Study, Startup…" else "Работа, Учёба, Стартап…") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.createProject(newFolderName)
                        newFolderName = ""
                        showCreateFolderDialog = false
                    }
                ) {
                    Text(if (isEn) "Create" else "Создать", color = palette.brand)
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolderDialog = false }) {
                    Text(if (isEn) "Cancel" else "Отмена", color = palette.textMuted)
                }
            }
        )
    }
}

@Composable
private fun LibraryGridCard(
    item: LibraryFileItem,
    isEn: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    val bmp = remember(item.id, item.dataUrl) {
        if (item.type == "image") decodeLibraryBitmap(item.dataUrl) else null
    }
    val iconTint = when {
        item.type == "image" -> Color(0xFFEC4899)
        item.source == "flow" -> Color(0xFF8B5CF6)
        item.source == "engine" || item.type == "code" -> Color(0xFF3B82F6)
        else -> palette.brand
    }

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Column {
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = item.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(112.dp)
                        .background(palette.surfaceElevated)
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(112.dp)
                        .background(palette.bg.copy(alpha = 0.55f))
                        .padding(12.dp)
                ) {
                    val snippet = item.content?.trim()?.take(140)
                    if (!snippet.isNullOrBlank()) {
                        Text(
                            text = snippet,
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = if (item.type == "code") FontFamily.Monospace else FontFamily.SansSerif,
                                fontSize = 11.sp,
                                lineHeight = 15.sp
                            ),
                            color = palette.textMuted,
                            maxLines = 5,
                            overflow = TextOverflow.Ellipsis
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .size(38.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (palette.isDark) iconTint.copy(alpha = 0.14f) else palette.chipBg),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = when {
                                    item.type == "image" -> LucideIcons.Image
                                    item.source == "flow" -> LucideIcons.Workflow
                                    item.type == "code" || item.source == "engine" -> LucideIcons.FileCode
                                    else -> LucideIcons.FileText
                                },
                                contentDescription = null,
                                tint = if (palette.isDark) iconTint else palette.brand,
                                modifier = Modifier.size(19.dp)
                            )
                        }
                    }
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 11.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = palette.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val sizeStr = formatFileSize(item.sizeBytes)
                val meta = listOf(fileCategoryLabel(item, isEn), sizeStr)
                    .filter { it.isNotBlank() }
                    .joinToString(" · ")
                Text(
                    text = meta,
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun LibraryListRow(
    item: LibraryFileItem,
    isEn: Boolean,
    onClick: () -> Unit,
    onAttach: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val bmp = remember(item.id, item.dataUrl) {
        if (item.type == "image") decodeLibraryBitmap(item.dataUrl) else null
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = item.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(11.dp))
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(palette.chipBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = when {
                            item.type == "image" -> LucideIcons.Image
                            item.source == "flow" -> LucideIcons.Workflow
                            item.type == "code" -> LucideIcons.FileCode
                            else -> LucideIcons.FileText
                        },
                        contentDescription = null,
                        tint = palette.brand,
                        modifier = Modifier.size(19.dp)
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val meta = listOf(
                    fileCategoryLabel(item, isEn),
                    formatFileSize(item.sizeBytes),
                    item.chatTitle.takeIf { it.isNotBlank() && it != "Library" } ?: ""
                ).filter { it.isNotBlank() }.joinToString(" · ")
                Text(
                    text = meta,
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            IconButton(
                onClick = onAttach,
                modifier = Modifier.size(38.dp)
            ) {
                Icon(
                    imageVector = LucideIcons.Paperclip,
                    contentDescription = "Attach to Chat",
                    tint = palette.textSecondary,
                    modifier = Modifier.size(17.dp)
                )
            }
        }
    }
}
