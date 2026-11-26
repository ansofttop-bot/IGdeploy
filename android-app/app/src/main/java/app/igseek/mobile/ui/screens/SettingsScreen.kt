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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import app.igseek.mobile.ui.components.LucideIcons
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
                Text(
                    text = if (isEn) "Settings" else "Настройки",
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary
                )
            }
            if (state.session != null && !state.session.isGuest) {
                IconButton(onClick = { viewModel.syncAllFromCloud() }) {
                    Icon(
                        imageVector = LucideIcons.RefreshCw,
                        contentDescription = "Sync",
                        tint = palette.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
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
                        IGseekFoxLogo(size = 38.dp, showGlow = palette.isDark)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = session?.displayName?.ifBlank { "IGseek User" } ?: "IGseek",
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
                                CloudSyncStatus.SYNCED -> if (isEn) "Cloud sync active" else "Облачная синхронизация активна"
                                CloudSyncStatus.SYNCING -> if (isEn) "Syncing…" else "Синхронизация…"
                                CloudSyncStatus.OFFLINE -> if (isEn) "Offline · Local cache" else "Оффлайн · Локальный кэш"
                                CloudSyncStatus.LOCAL_ONLY -> if (isEn) "Local mode" else "Локальный режим"
                                else -> if (isEn) "Direct API" else "Прямой режим API"
                            }
                            Text(
                                text = syncLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (state.cloudSyncStatus == CloudSyncStatus.SYNCED) Color(0xFF10B981) else palette.textMuted
                            )
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    OutlinedButton(
                        onClick = { viewModel.signOut() },
                        shape = RoundedCornerShape(50),
                        border = BorderStroke(1.dp, palette.glassBorder),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(42.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.LogOut,
                            contentDescription = null,
                            tint = palette.textSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(7.dp))
                        Text(
                            text = if (isEn) "Sign Out" else "Выйти из аккаунта",
                            color = palette.textPrimary,
                            style = MaterialTheme.typography.labelLarge
                        )
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
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = palette.brandSoft,
                            border = BorderStroke(1.dp, palette.brandBorder),
                            modifier = Modifier.size(34.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = LucideIcons.Crown,
                                    contentDescription = null,
                                    tint = palette.brand,
                                    modifier = Modifier.size(17.dp)
                                )
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (sub.isPro) {
                                    if (isEn) "IGseek Pro Active" else "IGseek Pro активна"
                                } else {
                                    "IGseek Pro"
                                },
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = if (sub.isPro) {
                                    if (sub.daysLeft > 3650) {
                                        if (isEn) "Lifetime Pro access" else "Бессрочный доступ Pro"
                                    } else {
                                        if (isEn) "Days remaining: ${sub.daysLeft}" else "Осталось дней: ${sub.daysLeft}"
                                    }
                                } else {
                                    if (isEn) {
                                        "Expanded model access, priority Flow & Engine, enhanced image generation · ${sub.durationDays} days per key"
                                    } else {
                                        "Расширенный доступ к моделям, приоритетная обработка Flow и Engine, улучшенная генерация изображений · ${sub.durationDays} дней по ключу"
                                    }
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textSecondary
                            )
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = { viewModel.openProSheet() },
                        shape = RoundedCornerShape(50),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.brand,
                            contentColor = palette.brandOn
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Crown,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(7.dp))
                        Text(
                            text = if (sub.isPro) {
                                if (isEn) "Extend Pro with a key" else "Продлить Pro по ключу"
                            } else {
                                if (isEn) "Activate Pro key" else "Активировать ключ Pro"
                            },
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Appearance: Theme, Language & Dark-Theme-Only Accent Selection
            item {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Palette,
                            contentDescription = null,
                            tint = palette.textSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = if (isEn) "Appearance" else "Внешний вид",
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.textPrimary
                        )
                    }
                    Spacer(Modifier.height(10.dp))

                    SettingsToggleRow(
                        title = if (isEn) "Dark theme" else "Тёмная тема",
                        subtitle = if (isEn) "Obsidian dark surface #0C0B0B" else "Фирменный тёмный обсидиан #0C0B0B",
                        checked = layout.darkTheme,
                        onCheckedChange = { checked ->
                            // Always preserves layout.accent when toggling between light and dark
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
                        text = if (isEn) "ACCENT COLOR (DARK THEME)" else "ЦВЕТ АКЦЕНТА (ТЁМНАЯ ТЕМА)",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                    Spacer(Modifier.height(10.dp))

                    if (layout.darkTheme) {
                        FlowRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            AccentPresetId.entries.forEach { preset ->
                                val swatch = accentSwatchColor(preset, darkTheme = true)
                                val active = layout.accent == preset
                                Surface(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(50))
                                        .clickable {
                                            viewModel.updateLayoutPrefs { it.copy(accent = preset) }
                                        },
                                    shape = RoundedCornerShape(50),
                                    color = if (active) swatch.copy(alpha = 0.16f) else palette.chipBg,
                                    border = BorderStroke(
                                        width = if (active) 1.5.dp else 1.dp,
                                        color = if (active) swatch else palette.glassBorder
                                    )
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
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
                                                    imageVector = LucideIcons.Check,
                                                    contentDescription = null,
                                                    tint = if (preset == AccentPresetId.BLACK) Color.Black else Color.White,
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
                    } else {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            color = palette.chipBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(16.dp)
                                        .clip(CircleShape)
                                        .background(Color.Black)
                                )
                                Text(
                                    text = if (isEn) {
                                        "Light theme always uses black accent (#000000). Your dark accent (${layout.accent.title}) is preserved."
                                    } else {
                                        "В светлой теме акцент всегда чёрный (#000000). Сохранённый тёмный акцент (${layout.accent.title}) вернётся при переключении."
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = palette.textSecondary
                                )
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
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Shield,
                            contentDescription = null,
                            tint = palette.textSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = if (isEn) "Interface & Security" else "Интерфейс и защита",
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.textPrimary
                        )
                    }
                    Spacer(Modifier.height(10.dp))

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

            // Advanced API Routing (Optional — hidden by default since Direct API works out-of-the-box)
            item {
                IGseekGlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showAdvancedGateway = !showAdvancedGateway },
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
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
                                    if (isEn) "Direct API mode without website dependency" else "Прямые запросы к API без привязки к сайту"
                                } else {
                                    if (isEn) "Gateway: ${state.serverBaseUrl}" else "Шлюз: ${state.serverBaseUrl}"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted
                            )
                        }
                        Icon(
                            imageVector = if (showAdvancedGateway) LucideIcons.ChevronUp else LucideIcons.ChevronDown,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    if (showAdvancedGateway) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = if (isEn) {
                                "Optional. Leave empty for direct autonomous API mode. Set a custom gateway URL only if using your own backend."
                            } else {
                                "Необязательно. Оставьте поле пустым для прямой автономной работы по API. Укажите свой шлюз, только если используете собственный бэкенд."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.textMuted
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = gatewayDraft,
                            onValueChange = { gatewayDraft = it },
                            placeholder = {
                                Text(
                                    text = if (isEn) "Empty = Direct API" else "Пусто = Прямой режим API",
                                    color = palette.textMuted
                                )
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = palette.brand,
                                unfocusedBorderColor = palette.glassBorder,
                                focusedTextColor = palette.textPrimary,
                                unfocusedTextColor = palette.textPrimary
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { viewModel.updateServerBaseUrl(gatewayDraft) },
                                shape = RoundedCornerShape(50),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = palette.brand,
                                    contentColor = palette.brandOn
                                ),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(if (isEn) "Save" else "Сохранить")
                            }
                            if (state.serverBaseUrl.isNotBlank()) {
                                OutlinedButton(
                                    onClick = {
                                        gatewayDraft = ""
                                        viewModel.updateServerBaseUrl("")
                                    },
                                    shape = RoundedCornerShape(50),
                                    border = BorderStroke(1.dp, palette.glassBorder),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(if (isEn) "Direct API" else "Прямой API", color = palette.textPrimary)
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
