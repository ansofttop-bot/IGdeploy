package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.ui.components.IGseekEmptyState
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekSearchField
import app.igseek.mobile.ui.components.IGseekSectionHeader
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

private data class MemoryKindMeta(
    val id: String,
    val labelRu: String,
    val labelEn: String,
    val icon: ImageVector,
    val tint: Color
) {
    fun label(isEn: Boolean): String = if (isEn) labelEn else labelRu
}

private val MEMORY_KINDS = listOf(
    MemoryKindMeta("profile", "О себе", "Profile", LucideIcons.User, Color(0xFF3B82F6)),
    MemoryKindMeta("preference", "Стиль и вкус", "Preferences", LucideIcons.SlidersHorizontal, Color(0xFFEC4899)),
    MemoryKindMeta("work", "Работа", "Work", LucideIcons.Terminal, Color(0xFF10B981)),
    MemoryKindMeta("project", "Проекты", "Projects", LucideIcons.Folder, Color(0xFF8B5CF6)),
    MemoryKindMeta("other", "Заметки", "Notes", LucideIcons.Sparkles, Color(0xFFF59E0B))
)

private fun memoryKindMeta(kind: String): MemoryKindMeta =
    MEMORY_KINDS.firstOrNull { it.id == kind } ?: MEMORY_KINDS.last()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemoryScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val clipboard = LocalClipboardManager.current
    val isEn = state.layoutPrefs.language == "en"

    var search by remember { mutableStateOf("") }
    var filterKind by remember { mutableStateOf("all") }
    var showAddSheet by remember { mutableStateOf(false) }
    var draftText by remember { mutableStateOf("") }
    var draftKind by remember { mutableStateOf("preference") }

    val filteredMemories = remember(state.memories, search, filterKind) {
        state.memories.filter { mem ->
            val matchKind = filterKind == "all" || mem.kind == filterKind
            val matchQuery = search.isBlank() || mem.content.contains(search, ignoreCase = true)
            matchKind && matchQuery
        }
    }

    val quickExamples = remember(isEn) {
        if (isEn) {
            listOf(
                "preference" to "Answer concisely with clear structure and code examples",
                "work" to "My primary stack is Kotlin, Jetpack Compose, and TypeScript",
                "profile" to "Prefer practical step-by-step solutions without filler"
            )
        } else {
            listOf(
                "preference" to "Отвечай кратко, по делу и со структурными примерами",
                "work" to "Мой основной стек: Kotlin, Jetpack Compose и TypeScript",
                "profile" to "Предпочитаю практические пошаговые решения без воды"
            )
        }
    }

    val countSubtitle = if (isEn) {
        "${state.memories.size} facts · Active in every chat"
    } else {
        "${state.memories.size} фактов · Учитывается в каждом чате"
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = if (isEn) "Memory" else "Память",
            subtitle = countSubtitle,
            onOpenDrawer = onOpenDrawer,
            actions = {
                IconButton(
                    onClick = { viewModel.refreshMemories() },
                    modifier = Modifier.size(44.dp)
                ) {
                    if (state.isMemoriesLoading) {
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
                    onClick = { showAddSheet = true },
                    modifier = Modifier.size(44.dp)
                ) {
                    Icon(
                        imageVector = LucideIcons.Plus,
                        contentDescription = "Add fact",
                        tint = palette.brand,
                        modifier = Modifier.size(21.dp)
                    )
                }
            }
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            IGseekSearchField(
                query = search,
                onQueryChange = { search = it },
                placeholder = if (isEn) "Search memory facts…" else "Поиск по памяти…"
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                IGseekGlassChip(
                    label = if (isEn) "All (${state.memories.size})" else "Все (${state.memories.size})",
                    selected = filterKind == "all",
                    onClick = { filterKind = "all" }
                )
                MEMORY_KINDS.forEach { kind ->
                    val count = state.memories.count { it.kind == kind.id }
                    val label = if (count > 0) "${kind.label(isEn)} ($count)" else kind.label(isEn)
                    IGseekGlassChip(
                        label = label,
                        selected = filterKind == kind.id,
                        onClick = { filterKind = kind.id }
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (filteredMemories.isEmpty()) {
                item(key = "memory_empty") {
                    IGseekEmptyState(
                        icon = LucideIcons.Brain,
                        title = if (search.isNotBlank()) {
                            if (isEn) "No matching memories" else "Факты не найдены"
                        } else {
                            if (isEn) "Teach IGseek about you" else "Расскажите IGseek о себе"
                        },
                        description = if (isEn) {
                            "Save your role, favorite stack, tone preferences, or ongoing projects — IGseek automatically uses them in answers."
                        } else {
                            "Сохраните стек, стиль ответов или текущие проекты — IGseek будет автоматически учитывать это в диалогах."
                        },
                        actionLabel = if (isEn) "Add first fact" else "Добавить первый факт",
                        onAction = { showAddSheet = true }
                    )
                }

                if (state.memories.isEmpty()) {
                    item(key = "memory_examples_header") {
                        Spacer(Modifier.height(4.dp))
                        IGseekSectionHeader(
                            title = if (isEn) "Quick starters" else "Быстрые примеры",
                            trailing = if (isEn) "Tap to add" else "Нажмите, чтобы добавить"
                        )
                    }
                    items(quickExamples, key = { it.second }) { (kind, text) ->
                        val meta = memoryKindMeta(kind)
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .clickable { viewModel.addMemory(text, kind) },
                            shape = RoundedCornerShape(16.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 13.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(11.dp)
                            ) {
                                Icon(
                                    imageVector = LucideIcons.Plus,
                                    contentDescription = null,
                                    tint = palette.brand,
                                    modifier = Modifier.size(16.dp)
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = text,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = palette.textPrimary
                                    )
                                    Text(
                                        text = meta.label(isEn),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textMuted
                                    )
                                }
                            }
                        }
                    }
                }
            } else {
                items(filteredMemories, key = { it.id }) { mem ->
                    MemoryFactCard(
                        item = mem,
                        isEn = isEn,
                        onCopy = {
                            clipboard.setText(AnnotatedString(mem.content))
                            viewModel.showToast(if (isEn) "Copied" else "Скопировано")
                        },
                        onUseInChat = {
                            val prompt = if (isEn) "Keeping in mind: ${mem.content}\n\n" else "Учитывая: ${mem.content}\n\n"
                            viewModel.updateDraft(prompt)
                            viewModel.selectTab(IGseekTab.CHAT)
                        },
                        onDelete = { viewModel.deleteMemory(mem.id) }
                    )
                }
            }
        }
    }

    if (showAddSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAddSheet = false },
            containerColor = palette.sidebarBg,
            contentColor = palette.textPrimary
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
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
                        Icon(LucideIcons.Brain, contentDescription = null, tint = palette.brand, modifier = Modifier.size(18.dp))
                    }
                    Column {
                        Text(
                            text = if (isEn) "New memory fact" else "Новый факт в память",
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.textPrimary
                        )
                        Text(
                            text = if (isEn) "Synced automatically with your account" else "Синхронизируется с вашим аккаунтом",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    MEMORY_KINDS.forEach { kind ->
                        IGseekGlassChip(
                            label = kind.label(isEn),
                            selected = draftKind == kind.id,
                            onClick = { draftKind = kind.id }
                        )
                    }
                }

                OutlinedTextField(
                    value = draftText,
                    onValueChange = { draftText = it },
                    placeholder = {
                        Text(
                            text = if (isEn) "E.g.: I build Android apps in Kotlin and prefer concise answers…"
                            else "Например: я разрабатываю на Kotlin и люблю лаконичные ответы…",
                            color = palette.textMuted
                        )
                    },
                    minLines = 3,
                    maxLines = 5,
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = palette.brand,
                        unfocusedBorderColor = palette.glassBorder,
                        focusedTextColor = palette.textPrimary,
                        unfocusedTextColor = palette.textPrimary,
                        cursorColor = palette.brand
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = {
                        viewModel.addMemory(draftText, draftKind)
                        draftText = ""
                        showAddSheet = false
                    },
                    enabled = draftText.isNotBlank(),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.brand,
                        contentColor = palette.brandOn
                    ),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Icon(LucideIcons.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(7.dp))
                    Text(if (isEn) "Save to Memory" else "Сохранить в память", fontWeight = FontWeight.SemiBold)
                }

                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun MemoryFactCard(
    item: MemoryEntryItem,
    isEn: Boolean,
    onCopy: () -> Unit,
    onUseInChat: () -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val meta = memoryKindMeta(item.kind)
    val iconColor = if (palette.isDark) meta.tint else palette.brand
    val iconBg = if (palette.isDark) meta.tint.copy(alpha = 0.14f) else palette.chipBg
    val dateShort = item.createdAt.take(10)

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(iconBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = meta.icon,
                        contentDescription = null,
                        tint = iconColor,
                        modifier = Modifier.size(16.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val subtitle = listOf(meta.label(isEn), dateShort)
                        .filter { it.isNotBlank() }
                        .joinToString(" · ")
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                    Text(
                        text = item.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.textPrimary
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClick = onUseInChat)
                            .padding(horizontal = 4.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(LucideIcons.MessageSquare, contentDescription = null, tint = palette.brand, modifier = Modifier.size(13.dp))
                        Text(
                            text = if (isEn) "Use in chat" else "В чат",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textSecondary
                        )
                    }
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(onClick = onCopy)
                            .padding(horizontal = 4.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(LucideIcons.Copy, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(13.dp))
                        Text(
                            text = if (isEn) "Copy" else "Копировать",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textSecondary
                        )
                    }
                }

                Icon(
                    imageVector = LucideIcons.Trash2,
                    contentDescription = "Delete",
                    tint = palette.textMuted,
                    modifier = Modifier
                        .size(16.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(onClick = onDelete)
                )
            }
        }
    }
}
