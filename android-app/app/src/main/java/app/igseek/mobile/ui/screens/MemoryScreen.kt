package app.igseek.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.igseek.mobile.ui.state.IGseekUiState

private val MEMORY_KINDS = listOf(
    "preference" to "Предпочтение",
    "project" to "Проект",
    "fact" to "Факт",
    "other" to "Другое"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemoryScreen(
    state: IGseekUiState,
    onRefresh: () -> Unit,
    onAddMemory: (String, String) -> Unit,
    onDeleteMemory: (String) -> Unit
) {
    var draft by remember { mutableStateOf("") }
    var selectedKind by remember { mutableStateOf("preference") }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.Favorite, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Облачная память", style = MaterialTheme.typography.titleMedium)
                }
            },
            actions = {
                IconButton(onClick = onRefresh) { Icon(Icons.Rounded.Refresh, contentDescription = "Обновить") }
            }
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Что IGseek должен помнить о вас", style = MaterialTheme.typography.titleMedium)
                        Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MEMORY_KINDS.forEach { (key, label) ->
                                FilterChip(selected = selectedKind == key, onClick = { selectedKind = key }, label = { Text(label) })
                            }
                        }
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            placeholder = { Text("Например: Предпочитаю краткие ответы и TypeScript") },
                            minLines = 2,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp)
                        )
                        Button(
                            onClick = {
                                val text = draft.trim()
                                if (text.isNotEmpty()) {
                                    onAddMemory(text, selectedKind)
                                    draft = ""
                                }
                            },
                            enabled = draft.isNotBlank(),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Rounded.Add, contentDescription = null)
                            Text("Сохранить в память")
                        }
                    }
                }
            }

            if (state.memoryLoading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            } else if (!state.memoryError.isNullOrBlank()) {
                item { Text(state.memoryError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            } else if (state.memories.isEmpty()) {
                item {
                    Text(
                        text = if (state.session?.isGuest == true) "Войдите в аккаунт для синхронизации памяти между вебом и Android." else "Список памяти пуст. Добавьте важные факты или предпочтения выше.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                items(state.memories, key = { it.id }) { entry ->
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = MEMORY_KINDS.firstOrNull { it.first == entry.kind }?.second ?: entry.kind,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(entry.content, style = MaterialTheme.typography.bodyMedium)
                            }
                            IconButton(onClick = { onDeleteMemory(entry.id) }) {
                                Icon(Icons.Rounded.Delete, contentDescription = "Удалить", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
