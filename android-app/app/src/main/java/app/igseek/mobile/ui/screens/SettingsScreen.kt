package app.igseek.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.BuildConfig
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.CloudSyncStatus
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekSectionHeader
import app.igseek.mobile.ui.components.IGseekSegmentedControl
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import app.igseek.mobile.ui.theme.accentSwatchColor

@Composable
fun SettingsScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val layout = state.layoutPrefs
    val isEn = layout.language == "en"
    val sub = state.subscription
    val session = state.session

    var gatewayDraft by remember(state.serverBaseUrl) { mutableStateOf(state.serverBaseUrl) }
    var showAdvancedGateway by remember { mutableStateOf(false) }

    val syncLabel = when (state.cloudSyncStatus) {
        CloudSyncStatus.SYNCING -> if (isEn) "Syncing cloud…" else "Синхронизация…"
        CloudSyncStatus.SYNCED -> if (isEn) "Cloud synced" else "Облако синхронизировано"
        CloudSyncStatus.OFFLINE -> if (isEn) "Offline mode" else "Нет сети"
        CloudSyncStatus.LOCAL_ONLY -> if (isEn) "Local only (Guest)" else "Только локально"
        CloudSyncStatus.ERROR -> if (isEn) "Sync paused" else "Ошибка синхронизации"
        CloudSyncStatus.IDLE -> if (session?.isCloudSynced == true) {
            if (isEn) "Cloud connected" else "Облако подключено"
        } else {
            if (isEn) "Local device" else "На устройстве"
        }
    }

    val displayName = session?.displayName?.ifBlank { "IGseek User" } ?: "IGseek"
    val initial = displayName.firstOrNull()?.uppercaseChar()?.toString() ?: "I"

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = if (isEn) "Settings" else "Настройки",
            subtitle = if (sub.isPro) "IGseek Pro · v${BuildConfig.VERSION_NAME}" else "IGseek Free · v${BuildConfig.VERSION_NAME}",
            onOpenDrawer = onOpenDrawer
        )

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // 1. Account & Cloud Sync Hero Card
            item(key = "settings_account") {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    contentPadding = 16.dp
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(13.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(palette.brandSoft)
                                .border(1.dp, palette.brandBorder, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = initial,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = palette.brand
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = displayName,
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = session?.email?.ifBlank { if (isEn) "Guest mode" else "Гостевой режим" } ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.height(2.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                            ) {
                                Icon(
                                    imageVector = LucideIcons.Cloud,
                                    contentDescription = null,
                                    tint = when (state.cloudSyncStatus) {
                                        CloudSyncStatus.SYNCED -> palette.success
                                        CloudSyncStatus.ERROR -> palette.danger
                                        else -> palette.textMuted
                                    },
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = syncLabel,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = when (state.cloudSyncStatus) {
                                        CloudSyncStatus.SYNCED -> palette.success
                                        CloudSyncStatus.ERROR -> palette.danger
                                        else -> palette.textMuted
                                    }
                                )
                            }
                            if (!state.cloudSyncError.isNullOrBlank()) {
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = state.cloudSyncError,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.danger,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        if (session?.isCloudSynced == true) {
                            IconButton(
                                onClick = { viewModel.syncAllFromCloud() },
                                modifier = Modifier.size(40.dp)
                            ) {
                                if (state.cloudSyncStatus == CloudSyncStatus.SYNCING) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = palette.brand
                                    )
                                } else {
                                    Icon(
                                        imageVector = LucideIcons.RefreshCw,
                                        contentDescription = "Sync",
                                        tint = palette.textSecondary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    HorizontalDivider(color = palette.divider)
                    Spacer(Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedButton(
                            onClick = { viewModel.signOut() },
                            shape = RoundedCornerShape(13.dp),
                            border = BorderStroke(1.dp, palette.glassBorder),
                            modifier = Modifier.weight(1f).height(42.dp)
                        ) {
                            Icon(LucideIcons.LogOut, contentDescription = null, tint = palette.textSecondary, modifier = Modifier.size(15.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = if (isEn) "Sign out" else "Выйти",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.textPrimary
                            )
                        }
                        Button(
                            onClick = { viewModel.openProSheet() },
                            shape = RoundedCornerShape(13.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (sub.isPro) palette.surfaceElevated else palette.brand,
                                contentColor = if (sub.isPro) palette.textPrimary else palette.brandOn
                            ),
                            modifier = Modifier.weight(1f).height(42.dp)
                        ) {
                            Icon(
                                imageVector = LucideIcons.Crown,
                                contentDescription = null,
                                tint = if (sub.isPro) palette.brand else palette.brandOn,
                                modifier = Modifier.size(15.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = if (sub.isPro) {
                                    if (sub.daysLeft > 3650) "Pro ∞"
                                    else if (isEn) "Pro · ${sub.daysLeft}d" else "Pro · ${sub.daysLeft}д"
                                } else {
                                    if (isEn) "IGseek Pro" else "Активировать Pro"
                                },
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            // 2. Visual Appearance Studio
            item(key = "settings_appearance_hdr") {
                IGseekSectionHeader(
                    title = if (isEn) "Appearance" else "Оформление",
                    trailing = if (layout.darkTheme) {
                        if (isEn) "Dark · ${layout.accent.title}" else "Тёмная · ${layout.accent.title}"
                    } else {
                        if (isEn) "Light · Monochrome" else "Светлая · Монохром"
                    }
                )
            }

            item(key = "settings_appearance_card") {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    contentPadding = 16.dp
                ) {
                    // Visual Theme Mini Preview Cards
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        ThemePreviewTile(
                            title = if (isEn) "Dark" else "Тёмная",
                            isDarkPreview = true,
                            accentDot = accentSwatchColor(layout.accent, darkTheme = true),
                            selected = layout.darkTheme,
                            onClick = { viewModel.updateLayoutPrefs { it.copy(darkTheme = true) } },
                            modifier = Modifier.weight(1f)
                        )
                        ThemePreviewTile(
                            title = if (isEn) "Light" else "Светлая",
                            isDarkPreview = false,
                            accentDot = Color.Black,
                            selected = !layout.darkTheme,
                            onClick = { viewModel.updateLayoutPrefs { it.copy(darkTheme = false) } },
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    // Accent Swatches (Dark mode) or Monochrome explanation (Light mode)
                    if (layout.darkTheme) {
                        Text(
                            text = if (isEn) "Accent color" else "Цвет акцента",
                            style = MaterialTheme.typography.labelMedium,
                            color = palette.textSecondary
                        )
                        Spacer(Modifier.height(10.dp))
                        val presets = AccentPresetId.entries.filter { it != AccentPresetId.DEFAULT }
                        val rows = presets.chunked(4)
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            rows.forEach { rowItems ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    rowItems.forEach { preset ->
                                        val swatch = accentSwatchColor(preset, darkTheme = true)
                                        val isSelected = layout.accent == preset ||
                                            (layout.accent == AccentPresetId.DEFAULT && preset == AccentPresetId.RED)
                                        Surface(
                                            modifier = Modifier
                                                .weight(1f)
                                                .clip(RoundedCornerShape(14.dp))
                                                .clickable {
                                                    viewModel.updateLayoutPrefs { it.copy(accent = preset) }
                                                },
                                            shape = RoundedCornerShape(14.dp),
                                            color = if (isSelected) palette.brandSoft else palette.chipBg,
                                            border = BorderStroke(
                                                width = if (isSelected) 1.5.dp else 1.dp,
                                                color = if (isSelected) swatch else palette.glassBorder
                                            )
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(vertical = 10.dp),
                                                horizontalAlignment = Alignment.CenterHorizontally,
                                                verticalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(22.dp)
                                                        .clip(CircleShape)
                                                        .background(swatch),
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    if (isSelected) {
                                                        Icon(
                                                            imageVector = LucideIcons.Check,
                                                            contentDescription = null,
                                                            tint = if (preset == AccentPresetId.BLACK) Color.Black else Color.White,
                                                            modifier = Modifier.size(13.dp)
                                                        )
                                                    }
                                                }
                                                Text(
                                                    text = preset.title,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = if (isSelected) palette.textPrimary else palette.textMuted,
                                                    maxLines = 1
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(palette.chipBg)
                                .padding(horizontal = 12.dp, vertical = 10.dp),
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
                                    "Light theme uses pure monochrome black. Your dark accent (${layout.accent.title}) is saved."
                                } else {
                                    "Светлая тема использует чистый чёрный акцент. Ваш тёмный акцент (${layout.accent.title}) сохранён."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textSecondary
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    HorizontalDivider(color = palette.divider)
                    Spacer(Modifier.height(14.dp))

                    Text(
                        text = if (isEn) "Interface language" else "Язык интерфейса",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.textSecondary
                    )
                    Spacer(Modifier.height(8.dp))
                    IGseekSegmentedControl(
                        options = listOf("Русский", "English"),
                        selectedIndex = if (isEn) 1 else 0,
                        onSelect = { idx ->
                            viewModel.updateLayoutPrefs { it.copy(language = if (idx == 1) "en" else "ru") }
                        }
                    )
                }
            }

            // 3. Mobile Navigation & Experience Controls
            item(key = "settings_mobile_hdr") {
                IGseekSectionHeader(
                    title = if (isEn) "Mobile experience" else "Удобство и защита"
                )
            }

            item(key = "settings_mobile_card") {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(22.dp),
                    contentPadding = 16.dp
                ) {
                    SettingsToggleRow(
                        title = if (isEn) "Floating bottom dock" else "Нижняя панель вкладок",
                        subtitle = if (isEn) "Quick 1-handed switcher between Chat, Flow, Library & Engine"
                        else "Быстрое переключение вкладок одной рукой внизу экрана",
                        checked = layout.showBottomBar,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(showBottomBar = checked) }
                        }
                    )
                    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 4.dp))
                    SettingsToggleRow(
                        title = if (isEn) "Compact message density" else "Компактные отступы в чате",
                        subtitle = if (isEn) "Show more message lines on screen" else "Больше текста на экране одновременно",
                        checked = layout.compactDensity,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(compactDensity = checked) }
                        }
                    )
                    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 4.dp))
                    SettingsToggleRow(
                        title = if (isEn) "Welcome suggestion cards" else "Карточки подсказок на старте",
                        subtitle = if (isEn) "Show quick starter prompts in empty chat" else "Показывать быстрые идеи в пустом чате",
                        checked = layout.showQuickPrompts,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(showQuickPrompts = checked) }
                        }
                    )
                    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 4.dp))
                    SettingsToggleRow(
                        title = if (isEn) "Haptic feedback" else "Тактильный отклик",
                        subtitle = if (isEn) "Subtle vibration on key actions" else "Мягкая вибрация при нажатиях",
                        checked = layout.hapticsEnabled,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(hapticsEnabled = checked) }
                        }
                    )
                    HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 4.dp))
                    SettingsToggleRow(
                        title = if (isEn) "Biometric app lock" else "Защита биометрией",
                        subtitle = if (isEn) "Fingerprint, Face or PIN at launch" else "Отпечаток, лицо или PIN при запуске",
                        checked = layout.biometricLockEnabled,
                        onCheckedChange = { checked ->
                            viewModel.updateLayoutPrefs { it.copy(biometricLockEnabled = checked) }
                        }
                    )
                }
            }

            // 4. Collapsible Server Connection
            item(key = "settings_connection") {
                IGseekGlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(20.dp))
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
                                text = if (isEn) "Server connection" else "Подключение сервера",
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary
                            )
                            Text(
                                text = if (isEn) "Automatic · IGseek Cloud" else "Автоматическое · IGseek Cloud",
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

                    AnimatedVisibility(visible = showAdvancedGateway) {
                        Column(modifier = Modifier.padding(top = 12.dp)) {
                            Text(
                                text = if (isEn) {
                                    "Configured automatically. Only edit if migrating to a custom backend domain."
                                } else {
                                    "Работает автоматически из коробки. Меняйте адрес только при переезде на другой домен."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted
                            )
                            Spacer(Modifier.height(10.dp))
                            OutlinedTextField(
                                value = gatewayDraft,
                                onValueChange = { gatewayDraft = it },
                                placeholder = {
                                    Text("https://i-gdeploy-luan.vercel.app", color = palette.textMuted)
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
                                    shape = RoundedCornerShape(13.dp),
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
                                        shape = RoundedCornerShape(13.dp),
                                        border = BorderStroke(1.dp, palette.glassBorder),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text(if (isEn) "Reset" else "Сбросить", color = palette.textPrimary)
                                    }
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
private fun ThemePreviewTile(
    title: String,
    isDarkPreview: Boolean,
    accentDot: Color,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    val previewBg = if (isDarkPreview) Color(0xFF0C0C0F) else Color(0xFFF6F6F9)
    val previewCard = if (isDarkPreview) Color(0xFF1A1A22) else Color.White
    val previewLine = if (isDarkPreview) Color(0xFF3F3F4A) else Color(0xFFD4D4DC)

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = if (selected) palette.brandSoft else palette.chipBg,
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) palette.brand else palette.glassBorder
        )
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Miniature UI skeleton preview
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(62.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(previewBg)
                    .border(1.dp, previewLine.copy(alpha = 0.5f), RoundedCornerShape(11.dp))
                    .padding(8.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .width(34.dp)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(previewLine)
                        )
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(accentDot)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.72f)
                            .height(14.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(previewCard)
                    )
                    Box(
                        modifier = Modifier
                            .align(Alignment.End)
                            .fillMaxWidth(0.46f)
                            .height(12.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(accentDot.copy(alpha = if (isDarkPreview) 0.35f else 0.85f))
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = if (isDarkPreview) LucideIcons.Moon else LucideIcons.Sun,
                        contentDescription = null,
                        tint = if (selected) palette.brand else palette.textMuted,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = title,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (selected) palette.textPrimary else palette.textSecondary
                    )
                }
                if (selected) {
                    Icon(
                        imageVector = LucideIcons.Check,
                        contentDescription = null,
                        tint = palette.brand,
                        modifier = Modifier.size(14.dp)
                    )
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
