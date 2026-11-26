package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.CloudSyncStatus
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import app.igseek.mobile.ui.theme.accentSwatchColor

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val layout = state.layoutPrefs
    val sub = state.subscription
    val isEn = layout.language == "en"

    var showAdvancedGateway by remember { mutableStateOf(false) }
    var gatewayDraft by remember(state.serverBaseUrl) { mutableStateOf(state.serverBaseUrl) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
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
                    Icon(Icons.Rounded.Menu, contentDescription = "Menu", tint = palette.textPrimary)
                }
                IGseekFoxLogo(size = 20.dp)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (isEn) "Settings" else "Настройки",
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary
                )
            }
            if (state.session != null && !state.session.isGuest) {
                IconButton(onClick = { viewModel.syncAllFromCloud() }) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Sync", tint = palette.textMuted)
                }
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Account & Direct Sync Card
            item {
                val session = state.session
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        IGseekFoxLogo(size = 38.dp, showGlow = true)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = session?.displayName?.ifBlank { "IGseek User" } ?: "Гость",
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary
                            )
                            Text(
                                text = session?.email ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted
                            )
                            Spacer(Modifier.height(4.dp))
                            val syncLabel = when (state.cloudSyncStatus) {
                                CloudSyncStatus.SYNCED -> "Прямая синхронизация облака активна"
                                CloudSyncStatus.SYNCING -> "Синхронизация…"
                                CloudSyncStatus.OFFLINE -> "Оффлайн · Локальный кэш"
                                CloudSyncStatus.LOCAL_ONLY -> "Локальный гостевой режим"
                                else -> "Прямой режим API"
                            }
                            Text(
                                text = syncLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (state.cloudSyncStatus == CloudSyncStatus.SYNCED) Color(0xFF10B981) else palette.textMuted
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { viewModel.signOut() },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, palette.glassBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.AutoMirrored.Rounded.ExitToApp, contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (isEn) "Sign Out" else "Выйти из аккаунта", color = palette.textPrimary)
                    }
                }
            }

            // IGseek Pro Card (clean copy — NO model/vendor brand names!)
            item {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    highlighted = sub.isPro,
                    contentPadding = 16.dp
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (sub.isPro) "IGseek Pro активна" else "IGseek Pro",
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary
                            )
                            Spacer(Modifier.height(3.dp))
                            Text(
                                text = if (sub.isPro) {
                                    if (sub.daysLeft > 3650) "Бессрочный доступ Pro" else "Осталось дней: ${sub.daysLeft}"
                                } else {
                                    "Продвинутый уровень моделей, улучшенная генерация изображений и приоритетная обработка Flow и Engine · ${sub.priceRub} ₽ / ${sub.durationDays} дней"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textSecondary
                            )
                        }
                    }
                    if (!sub.isPro && state.serverBaseUrl.isNotBlank()) {
                        Spacer(Modifier.height(12.dp))
                        Button(
                            onClick = { viewModel.startProCheckout() },
                            shape = RoundedCornerShape(13.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = palette.brand,
                                contentColor = palette.brandOn
                            ),
                            modifier = Modifier.fillMaxWidth().height(44.dp)
                        ) {
                            Text("Оформить IGseek Pro (${sub.priceRub} ₽)", fontWeight = FontWeight.SemiBold)
                        }
                        val pendingTxn = sub.pendingTxnId
                        if (!pendingTxn.isNullOrBlank()) {
                            Spacer(Modifier.height(6.dp))
                            OutlinedButton(
                                onClick = { viewModel.verifyPendingPayment() },
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Проверить статус оплаты", color = palette.textPrimary)
                            }
                        }
                    }
                }
            }

            // Appearance: Theme, Language & Exact 9 IGseek Website Accents
            item {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
                ) {
                    Text(
                        text = if (isEn) "Appearance & Accent" else "Внешний вид и акцент",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(10.dp))

                    SettingsToggleRow(
                        title = if (isEn) "Dark obsidian theme" else "Тёмная тема IGseek",
                        subtitle = if (isEn) "Deep warm obsidian #0C0B0B" else "Фирменный тёмный обсидиан #0C0B0B",
                        checked = layout.darkTheme,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(darkTheme = checked) }
                        }
                    )

                    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 8.dp))

                    Text(
                        text = if (isEn) "LANGUAGE" else "ЯЗЫК ИНТЕРФЕЙСА",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        IGseekGlassChip(
                            label = "Русский",
                            selected = layout.language != "en",
                            onClick = { viewModel.updateLayoutPrefs { it.copy(language = "ru") } }
                        )
                        IGseekGlassChip(
                            label = "English",
                            selected = layout.language == "en",
                            onClick = { viewModel.updateLayoutPrefs { it.copy(language = "en") } }
                        )
                    }

                    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 10.dp))

                    Text(
                        text = if (isEn) "ACCENT PRESET" else "ЦВЕТ АКЦЕНТА И ЛОГОТИПА",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                    Spacer(Modifier.height(10.dp))

                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        AccentPresetId.entries.forEach { preset ->
                            val swatch = accentSwatchColor(preset, layout.darkTheme)
                            val active = layout.accent == preset
                            Surface(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable {
                                        viewModel.updateLayoutPrefs { it.copy(accent = preset) }
                                    },
                                shape = RoundedCornerShape(12.dp),
                                color = if (active) swatch.copy(alpha = 0.16f) else palette.chipBg,
                                border = BorderStroke(
                                    width = if (active) 1.5.dp else 1.dp,
                                    color = if (active) swatch else palette.glassBorder
                                )
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(14.dp)
                                            .clip(CircleShape)
                                            .background(swatch),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        if (active) {
                                            Icon(
                                                Icons.Rounded.Check,
                                                contentDescription = null,
                                                tint = if (preset == AccentPresetId.BLACK && layout.darkTheme) Color.Black else Color.White,
                                                modifier = Modifier.size(10.dp)
                                            )
                                        }
                                    }
                                    Text(
                                        text = preset.title,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textPrimary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Mobile Ergonomics & Security
            item {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
                ) {
                    Text(
                        text = if (isEn) "Interface & Security" else "Интерфейс и защита",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(10.dp))

                    SettingsToggleRow(
                        title = if (isEn) "Bottom quick bar" else "Нижняя панель вкладок",
                        subtitle = if (isEn) "Turn off for pure full-screen website layout" else "Отключите для чистого полноэкранного вида как на сайте",
                        checked = layout.showBottomBar,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(showBottomBar = checked) }
                        }
                    )
                    SettingsToggleRow(
                        title = if (isEn) "Compact message density" else "Компактные отступы в чате",
                        subtitle = if (isEn) "More text visible on screen" else "Больше текста на экране одновременно",
                        checked = layout.compactDensity,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(compactDensity = checked) }
                        }
                    )
                    SettingsToggleRow(
                        title = if (isEn) "Welcome suggestion cards" else "Карточки подсказок на старте",
                        subtitle = if (isEn) "Show 2x2 starter prompts in empty chat" else "Показывать сетку быстрых идей в пустом чате",
                        checked = layout.showQuickPrompts,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(showQuickPrompts = checked) }
                        }
                    )
                    SettingsToggleRow(
                        title = if (isEn) "Biometric app lock" else "Защита биометрией",
                        subtitle = if (isEn) "Fingerprint / Face / PIN at app launch" else "Отпечаток пальца, лицо или PIN при запуске",
                        checked = layout.biometricLockEnabled,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(biometricLockEnabled = checked) }
                        }
                    )
                }
            }

            // Advanced API Routing (Optional — hidden by default since Direct API works out-of-the-box!)
            item {
                IGseekGlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showAdvancedGateway = !showAdvancedGateway },
                    shape = RoundedCornerShape(18.dp),
                    contentPadding = 15.dp
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (isEn) "API Mode (Direct)" else "Режим API (Прямой)",
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary
                            )
                            Text(
                                text = if (state.serverBaseUrl.isBlank()) {
                                    "Приложение работает напрямую по API без привязки к сайту"
                                } else {
                                    "Шлюз: ${state.serverBaseUrl}"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted
                            )
                        }
                        Icon(
                            imageVector = if (showAdvancedGateway) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                            contentDescription = null,
                            tint = palette.textMuted
                        )
                    }

                    if (showAdvancedGateway) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "Необязательно. Оставьте поле пустым для прямой автономной работы по API. Укажите свой шлюз, только если хотите использовать собственный бэкенд.",
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.textMuted
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = gatewayDraft,
                            onValueChange = { gatewayDraft = it },
                            placeholder = { Text("Пусто = Прямой режим API", color = palette.textMuted) },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = palette.brand,
                                unfocusedBorderColor = palette.glassBorder,
                                focusedTextColor = palette.textPrimary,
                                unfocusedTextColor = palette.textPrimary
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { viewModel.updateServerBaseUrl(gatewayDraft) },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = palette.brand,
                                    contentColor = palette.brandOn
                                ),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text("Сохранить")
                            }
                            if (state.serverBaseUrl.isNotBlank()) {
                                OutlinedButton(
                                    onClick = {
                                        gatewayDraft = ""
                                        viewModel.updateServerBaseUrl("")
                                    },
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, palette.glassBorder),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Прямой API", color = palette.textPrimary)
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
private fun SettingsToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    val palette = LocalIGseekPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, color = palette.textPrimary)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = palette.textMuted)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = palette.brandOn,
                checkedTrackColor = palette.brand,
                uncheckedThumbColor = palette.textMuted,
                uncheckedTrackColor = palette.chipBg
            )
        )
    }
}
