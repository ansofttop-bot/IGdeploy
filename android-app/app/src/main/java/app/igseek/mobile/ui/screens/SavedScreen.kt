package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.ui.components.IGseekEmptyState
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.IGseekSearchField
import app.igseek.mobile.ui.components.IGseekSectionHeader
import app.igseek.mobile.ui.components.IGseekSegmentedControl
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.components.formatRelativeTime
import app.igseek.mobile.ui.components.sharePlainText
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

@Composable
fun SavedScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val isEn = state.layoutPrefs.language == "en"

    var filterIndex by remember { mutableIntStateOf(0) } // 0 = All, 1 = Chats, 2 = Answers
    var search by remember { mutableStateOf("") }
    val expandedAnswers = remember { mutableStateMapOf<String, Boolean>() }

    val savedChats = remember(state.chats, search) {
        state.chats.filter { chat ->
            chat.isSaved && (search.isBlank() || chat.title.contains(search, ignoreCase = true))
        }
    }
    val savedAnswers = remember(state.bookmarkedMessages, search) {
        state.bookmarkedMessages.filter { msg ->
            search.isBlank() || msg.content.contains(search, ignoreCase = true)
        }
    }

    val totalCount = state.chats.count { it.isSaved } + state.bookmarkedMessages.size
    val subtitle = if (isEn) {
        "$totalCount bookmarked items"
    } else {
        "$totalCount в избранном"
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = if (isEn) "Saved" else "Сохранённое",
            subtitle = subtitle,
            onOpenDrawer = onOpenDrawer,
            actions = {
                IconButton(
                    onClick = { viewModel.selectTab(IGseekTab.LIBRARY) },
                    modifier = Modifier.size(44.dp)
                ) {
                    Icon(
                        imageVector = LucideIcons.Library,
                        contentDescription = "Library",
                        tint = palette.textSecondary,
                        modifier = Modifier.size(19.dp)
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
            IGseekSegmentedControl(
                options = if (isEn) {
                    listOf("All", "Chats (${savedChats.size})", "Answers (${savedAnswers.size})")
                } else {
                    listOf("Все", "Чаты (${savedChats.size})", "Ответы (${savedAnswers.size})")
                },
                selectedIndex = filterIndex,
                onSelect = { filterIndex = it }
            )

            IGseekSearchField(
                query = search,
                onQueryChange = { search = it },
                placeholder = if (isEn) "Search bookmarks…" else "Поиск по сохранённому…"
            )
        }

        Spacer(Modifier.height(10.dp))

        val showChats = filterIndex == 0 || filterIndex == 1
        val showAnswers = filterIndex == 0 || filterIndex == 2
        val nothingVisible = (!showChats || savedChats.isEmpty()) && (!showAnswers || savedAnswers.isEmpty())

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (nothingVisible) {
                item(key = "saved_empty") {
                    IGseekEmptyState(
                        icon = LucideIcons.Bookmark,
                        title = if (search.isNotBlank()) {
                            if (isEn) "No bookmarks match" else "Ничего не найдено"
                        } else {
                            if (isEn) "Nothing saved yet" else "Пока ничего не сохранено"
                        },
                        description = if (isEn) {
                            "Bookmark important chats from the top bar or tap Save under any AI response to keep it one tap away."
                        } else {
                            "Нажмите на закладку в шапке чата или кнопку «Сохранить» под важным ответом ИИ, чтобы быстро возвращаться к нему."
                        },
                        actionLabel = if (isEn) "Go to Chat" else "Перейти в чат",
                        onAction = { viewModel.selectTab(IGseekTab.CHAT) }
                    )
                }
            }

            if (showChats && savedChats.isNotEmpty()) {
                item(key = "saved_chats_hdr") {
                    IGseekSectionHeader(
                        title = if (isEn) "Saved chats" else "Сохранённые чаты",
                        trailing = "${savedChats.size}"
                    )
                }
                items(savedChats, key = { "chat_${it.id}" }) { chat ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(17.dp))
                            .clickable { viewModel.selectChat(chat.id) },
                        shape = RoundedCornerShape(17.dp),
                        color = palette.glassBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(11.dp))
                                    .background(palette.brandSoft),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = LucideIcons.BookmarkFilled,
                                    contentDescription = null,
                                    tint = palette.brand,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = chat.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = formatRelativeTime(chat.updatedAtMs, isEn),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted
                                )
                            }
                            IconButton(
                                onClick = { viewModel.toggleSaveChat(chat.id) },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    imageVector = LucideIcons.X,
                                    contentDescription = "Unsave",
                                    tint = palette.textMuted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }

            if (showAnswers && savedAnswers.isNotEmpty()) {
                item(key = "saved_ans_hdr") {
                    if (showChats && savedChats.isNotEmpty()) Spacer(Modifier.height(4.dp))
                    IGseekSectionHeader(
                        title = if (isEn) "Saved answers" else "Сохранённые ответы",
                        trailing = "${savedAnswers.size}"
                    )
                }
                items(savedAnswers, key = { "ans_${it.id}" }) { msg ->
                    val chatTitle = state.chats.firstOrNull { it.id == msg.chatId }?.title
                        ?: if (isEn) "Chat" else "Чат"
                    val isExpanded = expandedAnswers[msg.id] == true
                    val isLong = msg.content.length > 340

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(18.dp))
                            .clickable(enabled = isLong) { expandedAnswers[msg.id] = !isExpanded },
                        shape = RoundedCornerShape(18.dp),
                        color = palette.glassBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "$chatTitle · ${formatRelativeTime(msg.createdAtMs, isEn)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                if (isLong) {
                                    Text(
                                        text = if (isExpanded) {
                                            if (isEn) "Less" else "Свернуть"
                                        } else {
                                            if (isEn) "Read all" else "Полностью"
                                        },
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Medium,
                                        color = palette.brand
                                    )
                                }
                            }

                            Spacer(Modifier.height(8.dp))

                            IGseekMarkdownText(
                                markdown = if (isExpanded || !isLong) msg.content else "${msg.content.take(340)}…"
                            )

                            Spacer(Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { viewModel.selectChat(msg.chatId) }
                                            .padding(horizontal = 4.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(LucideIcons.ArrowUpRight, contentDescription = null, tint = palette.brand, modifier = Modifier.size(14.dp))
                                        Text(
                                            text = if (isEn) "Open" else "Открыть",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = palette.textSecondary
                                        )
                                    }
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable {
                                                clipboard.setText(AnnotatedString(msg.content))
                                                viewModel.showToast(if (isEn) "Copied" else "Скопировано")
                                            }
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
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable { sharePlainText(context, chatTitle, msg.content) }
                                            .padding(horizontal = 4.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(LucideIcons.Share2, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(13.dp))
                                        Text(
                                            text = if (isEn) "Share" else "Поделиться",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = palette.textSecondary
                                        )
                                    }
                                }

                                Icon(
                                    imageVector = LucideIcons.Trash2,
                                    contentDescription = "Remove bookmark",
                                    tint = palette.textMuted,
                                    modifier = Modifier
                                        .size(16.dp)
                                        .clickable { viewModel.toggleBookmarkMessage(msg.id) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
