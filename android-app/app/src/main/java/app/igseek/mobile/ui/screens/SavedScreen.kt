package app.igseek.mobile.ui.screens

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.LucideIcons
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
    val isEn = state.layoutPrefs.language == "en"

    val savedChats = state.chats.filter { it.isSaved }
    val savedMessages = state.bookmarkedMessages

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
            verticalAlignment = Alignment.CenterVertically
        ) {
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
                Text(
                    text = if (isEn) "Saved" else "Сохранённое",
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary
                )
                Text(
                    text = if (isEn) {
                        "${savedChats.size} chats · ${savedMessages.size} answers"
                    } else {
                        "${savedChats.size} чатов · ${savedMessages.size} ответов"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted
                )
            }
        }

        if (savedChats.isEmpty() && savedMessages.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IGseekFoxLogo(size = 44.dp, showGlow = palette.isDark)
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = if (isEn) "Nothing saved yet" else "Пока нет сохранённых материалов",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (isEn) {
                            "Tap the bookmark icon on any chat or assistant answer to keep it here."
                        } else {
                            "Нажимайте на значок закладки у чатов или ответов IGseek, чтобы быстро возвращаться к ним."
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
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (savedChats.isNotEmpty()) {
                    item {
                        Text(
                            text = if (isEn) "SAVED CHATS" else "ИЗБРАННЫЕ ЧАТЫ",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted
                        )
                    }
                    items(savedChats, key = { "schat_${it.id}" }) { chat ->
                        IGseekGlassCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { viewModel.selectChat(chat.id) },
                            shape = RoundedCornerShape(18.dp),
                            contentPadding = 14.dp
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = chat.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                IconButton(
                                    onClick = { viewModel.toggleSaveChat(chat.id) },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.BookmarkFilled,
                                        contentDescription = "Unsave",
                                        tint = palette.brand,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                if (savedMessages.isNotEmpty()) {
                    item {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = if (isEn) "BOOKMARKED ANSWERS" else "СОХРАНЁННЫЕ ОТВЕТЫ",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted
                        )
                    }
                    items(savedMessages, key = { "smsg_${it.id}" }) { msg ->
                        IGseekGlassCard(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(18.dp),
                            contentPadding = 14.dp
                        ) {
                            IGseekMarkdownText(markdown = msg.content.take(1800))
                            Spacer(Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                IGseekGlassChip(
                                    label = if (isEn) "Open chat" else "Открыть чат",
                                    selected = false,
                                    onClick = { viewModel.selectChat(msg.chatId) }
                                )
                                IGseekGlassChip(
                                    label = if (isEn) "Copy" else "Копировать",
                                    selected = false,
                                    onClick = {
                                        clipboard.setText(AnnotatedString(msg.content))
                                        viewModel.showToast("Скопировано")
                                    }
                                )
                                IGseekGlassChip(
                                    label = if (isEn) "Remove" else "Убрать",
                                    selected = false,
                                    onClick = { viewModel.toggleBookmarkMessage(msg.id) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
