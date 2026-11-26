package app.igseek.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.accentPaletteFor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel
) {
    var serverDraft by remember(state.serverBaseUrl) { mutableStateOf(state.serverBaseUrl) }
    val prefs = state.layoutPrefs
    val sub = state.subscription

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Настройки и подписка", style = MaterialTheme.typography.titleMedium)
                }
            }
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                SettingsSectionCard(title = "Аккаунт") {
                    val session = state.session
                    Text(session?.displayName?.ifBlank { "Пользователь IGseek" } ?: "Не выполнен вход", style = MaterialTheme.typography.titleMedium)
                    if (!session?.email.isNullOrBlank()) {
                        Text(session?.email.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else if (session?.isGuest == true) {
                        Text("Локальный гостевой режим (без облачной синхронизации)", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(6.dp))
                    OutlinedButton(onClick = { viewModel.signOut() }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Icon(Icons.AutoMirrored.Rounded.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("  Выйти из аккаунта")
                    }
                }
            }

            item {
                SettingsSectionCard(title = "Подписка IGseek") {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (sub.isPro) Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(if (sub.isPro) "IGseek Pro активен" else "Базовый бесплатный уровень", style = MaterialTheme.typography.titleMedium)
                    }
                    Text(
                        text = if (sub.isPro) {
                            "Открыт доступ к продвинутому уровню моделей и приоритетной генерации. Осталось дней: ${sub.daysLeft}."
                        } else {
                            "Базовый уровень работает без ограничений по сообщениям. Перейдите на IGseek Pro (${sub.priceRub} ₽ / ${sub.durationDays} дн.) для более продвинутого уровня моделей и улучшенной генерации изображений."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    if (!sub.isPro && state.session?.isGuest != true) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { viewModel.startProCheckout(2) },
                                enabled = !state.subscriptionLoading,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(Icons.Rounded.ShoppingCart, contentDescription = null, modifier = Modifier.size(16.dp))
                                Text(" СБП")
                            }
                            OutlinedButton(
                                onClick = { viewModel.startProCheckout(11) },
                                enabled = !state.subscriptionLoading,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("Карта")
                            }
                        }

                        OutlinedButton(
                            onClick = { viewModel.verifyPendingSubscription() },
                            enabled = !state.subscriptionLoading,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            if (state.subscriptionLoading) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            else Text("Проверить статус оплаты")
                        }
                    }
                }
            }

            item {
                SettingsSectionCard(title = "Внешний вид IGseek") {
                    ToggleRow("Тёмная тема", "Фирменная тёмная палитра IGseek", prefs.darkTheme) { en ->
                        viewModel.updateLayoutPrefs { it.copy(darkTheme = en) }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("Цветовой акцент", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        AccentPresetId.entries.forEach { preset ->
                            val swatch = accentPaletteFor(preset).swatch
                            val selected = prefs.accent == preset
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(CircleShape)
                                    .background(swatch)
                                    .border(if (selected) 2.5.dp else 1.dp, if (selected) MaterialTheme.colorScheme.onBackground else Color.Transparent, CircleShape)
                                    .clickable { viewModel.setAccent(preset) },
                                contentAlignment = Alignment.Center
                            ) {
                                if (selected) Icon(Icons.Rounded.Check, contentDescription = preset.title, tint = Color.White, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }

            item {
                SettingsSectionCard(title = "Настройка мобильного интерфейса") {
                    ToggleRow("Компактная плотность чата", "Больше сообщений на экране смартфона", prefs.compactDensity) { en ->
                        viewModel.updateLayoutPrefs { it.copy(compactDensity = en) }
                    }
                    ToggleRow("Быстрые подсказки на пустом экране", "Показывать готовые кнопки запуска в новом чате", prefs.showQuickPrompts) { en ->
                        viewModel.updateLayoutPrefs { it.copy(showQuickPrompts = en) }
                    }
                    ToggleRow("Тактильный отклик", "Вибрация при отправке сообщений", prefs.hapticsEnabled) { en ->
                        viewModel.updateLayoutPrefs { it.copy(hapticsEnabled = en) }
                    }
                    ToggleRow(
                        title = "Биометрическая блокировка входа",
                        subtitle = "Отпечаток пальца или Face ID при открытии приложения",
                        checked = prefs.biometricLockEnabled,
                        onCheckedChange = { en -> viewModel.updateLayoutPrefs { it.copy(biometricLockEnabled = en) } },
                        leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )

                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    Text("Порядок вкладок нижней навигации", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    prefs.tabOrder.forEachIndexed { idx, tab ->
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${idx + 1}. ${tab.labelRu}", style = MaterialTheme.typography.bodyMedium)
                            Row {
                                IconButton(onClick = { viewModel.moveTabOrder(idx, idx - 1) }, enabled = idx > 0) {
                                    Icon(Icons.Rounded.KeyboardArrowUp, contentDescription = "Выше", modifier = Modifier.size(20.dp))
                                }
                                IconButton(onClick = { viewModel.moveTabOrder(idx, idx + 1) }, enabled = idx < prefs.tabOrder.lastIndex) {
                                    Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = "Ниже", modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                    }
                }
            }

            item {
                SettingsSectionCard(title = "Подключение к серверу IGseek") {
                    Text(
                        "Можно переключить клиент на собственный домен Vercel или self-hosted сервер без пересборки APK.",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = serverDraft,
                        onValueChange = { serverDraft = it },
                        label = { Text("Базовый URL API") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )
                    Button(onClick = { viewModel.updateServerBaseUrl(serverDraft) }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Text("Применить URL сервера")
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsSectionCard(title: String, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
            content()
        }
    }
}

@Composable
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    leadingIcon: (@Composable () -> Unit)? = null
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (leadingIcon != null) leadingIcon()
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
