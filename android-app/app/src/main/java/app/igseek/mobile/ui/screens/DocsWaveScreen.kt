package app.igseek.mobile.ui.screens

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekSectionHeader
import app.igseek.mobile.ui.components.IGseekSegmentedControl
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import java.util.Locale
import kotlin.math.PI
import kotlin.math.sin

private data class GuideItem(
    val id: String,
    val title: String,
    val summary: String,
    val details: String,
    val icon: ImageVector,
    val tint: Color,
    val targetTab: IGseekTab? = null,
    val actionLabel: String? = null
)

private data class PowerPromptItem(
    val title: String,
    val category: String,
    val prompt: String
)

private data class LegalDocItem(
    val title: String,
    val desc: String,
    val url: String
)

private data class WaveCapability(
    val icon: ImageVector,
    val title: String,
    val desc: String,
    val tint: Color
)

@Composable
fun DocsScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val context = LocalContext.current
    val isEn = state.layoutPrefs.language == "en"

    var sectionIndex by remember { mutableIntStateOf(0) } // 0 = Guide, 1 = Prompts, 2 = Legal
    val expandedGuides = remember { mutableStateMapOf<String, Boolean>("guide_models" to true) }

    val guides = remember(isEn) {
        if (isEn) {
            listOf(
                GuideItem(
                    id = "guide_models",
                    title = "Models & Reasoning",
                    summary = "Instinct, Chat & Flash modes",
                    details = "Switch between IGseek Instinct (fast default), IGseek Chat (conversational), and IGseek Flash (step-by-step reasoning). Enable Web Search or Image Mode directly from the chat composer.",
                    icon = LucideIcons.Sparkles,
                    tint = Color(0xFFEF4444),
                    targetTab = IGseekTab.CHAT,
                    actionLabel = "Open Chat"
                ),
                GuideItem(
                    id = "guide_flow",
                    title = "IGseek Flow Agent",
                    summary = "Automated multi-step plans",
                    details = "Describe any multi-step mission in Flow. IGseek builds an editable route, runs each step sequentially, and exports the full report straight to Library.",
                    icon = LucideIcons.Workflow,
                    tint = Color(0xFF8B5CF6),
                    targetTab = IGseekTab.FLOW,
                    actionLabel = "Open Flow"
                ),
                GuideItem(
                    id = "guide_engine",
                    title = "Engine Live Studio",
                    summary = "Generate apps with instant mobile preview",
                    details = "Create HTML, CSS, and JS apps right on your phone, inspect line-numbered code, test them live in the built-in preview viewport, and iterate with follow-up prompts.",
                    icon = LucideIcons.Code2,
                    tint = Color(0xFF3B82F6),
                    targetTab = IGseekTab.ENGINE,
                    actionLabel = "Open Engine"
                ),
                GuideItem(
                    id = "guide_memory",
                    title = "Memory & Cloud Sync",
                    summary = "Shared context across web & Android",
                    details = "Save facts about your stack, style, and goals in Memory. With your IGseek account signed in, chats, folders, files, and memories sync automatically across all devices.",
                    icon = LucideIcons.Brain,
                    tint = Color(0xFF10B981),
                    targetTab = IGseekTab.MEMORY,
                    actionLabel = "Open Memory"
                ),
                GuideItem(
                    id = "guide_android",
                    title = "Android Power Features",
                    summary = "Share Sheet, Voice & Floating Dock",
                    details = "Share any text or photo from other Android apps directly into IGseek Chat. Use Voice Dictation in Chat or Wave, and toggle the thumb-zone dock anytime in Settings.",
                    icon = LucideIcons.Smartphone,
                    tint = Color(0xFFF59E0B),
                    targetTab = IGseekTab.SETTINGS,
                    actionLabel = "Open Settings"
                )
            )
        } else {
            listOf(
                GuideItem(
                    id = "guide_models",
                    title = "Модели и рассуждение",
                    summary = "Instinct, Chat и Flash",
                    details = "Переключайтесь между IGseek Instinct (быстрый универсал), IGseek Chat (живой диалог) и IGseek Flash (глубокий анализ). Веб-поиск и генерация изображений включаются прямо в поле ввода чата.",
                    icon = LucideIcons.Sparkles,
                    tint = Color(0xFFEF4444),
                    targetTab = IGseekTab.CHAT,
                    actionLabel = "Открыть чат"
                ),
                GuideItem(
                    id = "guide_flow",
                    title = "Автономный агент Flow",
                    summary = "Пошаговое выполнение сложных целей",
                    details = "Опишите большую задачу во вкладке Flow — агент разобьёт её на шаги, выполнит каждый этап по очереди и позволит сохранить итоговый отчёт в Library.",
                    icon = LucideIcons.Workflow,
                    tint = Color(0xFF8B5CF6),
                    targetTab = IGseekTab.FLOW,
                    actionLabel = "Открыть Flow"
                ),
                GuideItem(
                    id = "guide_engine",
                    title = "Студия кода Engine",
                    summary = "Сайты и приложения с живым превью",
                    details = "Создавайте HTML/CSS/JS проекты прямо с телефона: переключайтесь между интерактивным живым превью и редактором кода с нумерацией строк, а затем дорабатывайте проект командами.",
                    icon = LucideIcons.Code2,
                    tint = Color(0xFF3B82F6),
                    targetTab = IGseekTab.ENGINE,
                    actionLabel = "Открыть Engine"
                ),
                GuideItem(
                    id = "guide_memory",
                    title = "Память и облачная синхронизация",
                    summary = "Единый контекст на телефоне и сайте",
                    details = "Добавьте важные факты о себе, стеке и предпочтениях в Память. При входе в аккаунт чаты, папки, файлы и память синхронизируются между Android и веб-версией автоматически.",
                    icon = LucideIcons.Brain,
                    tint = Color(0xFF10B981),
                    targetTab = IGseekTab.MEMORY,
                    actionLabel = "Открыть Память"
                ),
                GuideItem(
                    id = "guide_android",
                    title = "Фишки Android-приложения",
                    summary = "Share Sheet, голос и нижний док",
                    details = "Отправляйте текст и фото в IGseek из любого приложения через системную кнопку «Поделиться». Настраивайте нижнюю панель вкладок, плотность чата и биометрию в Настройках.",
                    icon = LucideIcons.Smartphone,
                    tint = Color(0xFFF59E0B),
                    targetTab = IGseekTab.SETTINGS,
                    actionLabel = "Настройки"
                )
            )
        }
    }

    val prompts = remember(isEn) {
        if (isEn) {
            listOf(
                PowerPromptItem("Code architecture review", "Engineering", "Review my architecture and list 5 high-impact performance and security improvements with concrete code examples:"),
                PowerPromptItem("Executive summary", "Productivity", "Condense the following text into a 5-bullet executive brief with key risks and next steps:"),
                PowerPromptItem("Concept explainer", "Learning", "Explain this complex concept using a vivid real-world analogy, then give me a 3-question mini quiz:"),
                PowerPromptItem("UI/UX critique", "Design", "Critique this product flow from a mobile-first perspective and propose 4 actionable UX improvements:")
            )
        } else {
            listOf(
                PowerPromptItem("Аудит архитектуры кода", "Разработка", "Проведи ревью моей архитектуры и назови 5 главных улучшений по скорости и безопасности с конкретными примерами кода:"),
                PowerPromptItem("Выжимка и план действий", "Продуктивность", "Сократи этот текст до 5 чётких тезисов, выдели скрытые риски и распиши следующие шаги:"),
                PowerPromptItem("Объяснить простыми словами", "Обучение", "Объясни сложную тему через понятную аналогию из жизни, а в конце дай 3 вопроса для самопроверки:"),
                PowerPromptItem("Разбор мобильного UX", "Дизайн", "Оцени этот пользовательский сценарий с точки зрения мобильного UX и предложи 4 конкретных улучшения:")
            )
        }
    }

    val legalDocs = remember(isEn) {
        if (isEn) {
            listOf(
                LegalDocItem("User Agreement", "General terms of use for IGseek", "https://telegra.ph/Polzovatelskoe-soglashenie-06-24-3"),
                LegalDocItem("Privacy Policy", "How we protect and sync your data", "https://telegra.ph/Politika-konfidencialnosti-06-24-3"),
                LegalDocItem("Project & AI Agreement", "Guidelines covering the project and AI usage", "https://telegra.ph/Polzovatelskoe-soglashenie-proekta-i-nejroseti-06-24")
            )
        } else {
            listOf(
                LegalDocItem("Пользовательское соглашение", "Общие условия использования IGseek", "https://telegra.ph/Polzovatelskoe-soglashenie-06-24-3"),
                LegalDocItem("Политика конфиденциальности", "Как мы храним и синхронизируем ваши данные", "https://telegra.ph/Politika-konfidencialnosti-06-24-3"),
                LegalDocItem("Соглашение проекта и ИИ", "Правила использования платформы и нейросетей", "https://telegra.ph/Polzovatelskoe-soglashenie-proekta-i-nejroseti-06-24")
            )
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = if (isEn) "Docs" else "Документация",
            subtitle = if (isEn) "Guides, prompt library & legal" else "Гид, промпты и правовая информация",
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

        Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
            IGseekSegmentedControl(
                options = if (isEn) listOf("Guide", "Prompts", "Legal") else listOf("Гид", "Промпты", "Документы"),
                selectedIndex = sectionIndex,
                onSelect = { sectionIndex = it }
            )
        }

        Spacer(Modifier.height(6.dp))

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            when (sectionIndex) {
                0 -> {
                    items(guides, key = { it.id }) { guide ->
                        val expanded = expandedGuides[guide.id] == true
                        val iconColor = if (palette.isDark) guide.tint else palette.brand
                        val iconBg = if (palette.isDark) guide.tint.copy(alpha = 0.14f) else palette.chipBg

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .clickable { expandedGuides[guide.id] = !expanded },
                            shape = RoundedCornerShape(18.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(38.dp)
                                            .clip(RoundedCornerShape(11.dp))
                                            .background(iconBg),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = guide.icon,
                                            contentDescription = null,
                                            tint = iconColor,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = guide.title,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = palette.textPrimary
                                        )
                                        Text(
                                            text = guide.summary,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = palette.textMuted
                                        )
                                    }
                                    Icon(
                                        imageVector = if (expanded) LucideIcons.ChevronUp else LucideIcons.ChevronDown,
                                        contentDescription = null,
                                        tint = palette.textMuted,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }

                                AnimatedVisibility(visible = expanded) {
                                    Column(modifier = Modifier.padding(top = 12.dp)) {
                                        Text(
                                            text = guide.details,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = palette.textSecondary
                                        )
                                        if (guide.targetTab != null && !guide.actionLabel.isNullOrBlank()) {
                                            Spacer(Modifier.height(10.dp))
                                            Row(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(palette.brandSoft)
                                                    .clickable { viewModel.selectTab(guide.targetTab) }
                                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(5.dp)
                                            ) {
                                                Text(
                                                    text = guide.actionLabel,
                                                    style = MaterialTheme.typography.labelMedium,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = palette.brand
                                                )
                                                Icon(
                                                    imageVector = LucideIcons.ArrowUpRight,
                                                    contentDescription = null,
                                                    tint = palette.brand,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                1 -> {
                    item(key = "prompts_hdr") {
                        IGseekSectionHeader(
                            title = if (isEn) "Ready prompts" else "Готовые промпты",
                            trailing = if (isEn) "Tap to insert" else "Вставить в чат"
                        )
                    }
                    items(prompts, key = { it.title }) { item ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .clickable {
                                    viewModel.updateDraft(item.prompt + " ")
                                    viewModel.selectTab(IGseekTab.CHAT)
                                },
                            shape = RoundedCornerShape(18.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = item.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.textPrimary
                                    )
                                    Text(
                                        text = item.category,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textMuted
                                    )
                                }
                                Text(
                                    text = item.prompt,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = palette.textSecondary,
                                    maxLines = 3,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                else -> {
                    item(key = "legal_hdr") {
                        IGseekSectionHeader(
                            title = if (isEn) "Official documents" else "Правовые документы",
                            trailing = "IGseek"
                        )
                    }
                    items(legalDocs, key = { it.url }) { doc ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(18.dp))
                                .clickable {
                                    runCatching {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(doc.url)))
                                    }
                                },
                            shape = RoundedCornerShape(18.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(38.dp)
                                        .clip(RoundedCornerShape(11.dp))
                                        .background(palette.brandSoft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.FileText,
                                        contentDescription = null,
                                        tint = palette.brand,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = doc.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.textPrimary
                                    )
                                    Text(
                                        text = doc.desc,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.textMuted
                                    )
                                }
                                Icon(
                                    imageVector = LucideIcons.ExternalLink,
                                    contentDescription = "Open",
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

@Composable
fun WaveScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit,
    onBackToChat: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"

    val voiceLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?.trim()
            if (!spoken.isNullOrBlank()) {
                viewModel.appendVoiceTranscript(spoken)
                viewModel.selectTab(IGseekTab.CHAT)
                viewModel.showToast(if (isEn) "Voice message added to Chat" else "Голосовой запрос добавлен в чат")
            }
        }
    }

    fun startVoiceDictation() {
        runCatching {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE,
                    if (isEn) Locale.US.toLanguageTag() else "ru-RU"
                )
                putExtra(
                    RecognizerIntent.EXTRA_PROMPT,
                    if (isEn) "Speak to IGseek…" else "Говорите с IGseek…"
                )
            }
            voiceLauncher.launch(intent)
        }.onFailure {
            viewModel.showToast(
                if (isEn) "Voice recognition is unavailable on this device"
                else "Голосовой ввод недоступен на этом устройстве"
            )
        }
    }

    val capabilities = remember(isEn) {
        if (isEn) {
            listOf(
                WaveCapability(LucideIcons.Mic, "Hands-free voice", "Speak naturally without typing a single word.", Color(0xFFEF4444)),
                WaveCapability(LucideIcons.Volume2, "Spoken AI replies", "Live audio answers crafted for listening on the go.", Color(0xFF3B82F6)),
                WaveCapability(LucideIcons.Radio, "Real-time duplex", "Full two-way conversation with low latency.", Color(0xFF10B981)),
                WaveCapability(LucideIcons.AudioLines, "Natural interrupts", "Jump in mid-sentence and steer the dialogue.", Color(0xFF8B5CF6))
            )
        } else {
            listOf(
                WaveCapability(LucideIcons.Mic, "Голос без печати", "Общайтесь свободно, не набирая текст руками.", Color(0xFFEF4444)),
                WaveCapability(LucideIcons.Volume2, "Живые ответы ИИ", "Озвучка ответов в реальном времени на ходу.", Color(0xFF3B82F6)),
                WaveCapability(LucideIcons.Radio, "Диалог как звонок", "Двусторонняя голосовая сессия с минимальной задержкой.", Color(0xFF10B981)),
                WaveCapability(LucideIcons.AudioLines, "Естественный ритм", "Перебивайте и уточняйте мысли на лету.", Color(0xFF8B5CF6))
            )
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = "IGseek Wave",
            subtitle = if (isEn) "Voice Studio · Live calls coming soon" else "Голосовая студия · Режим звонка скоро",
            onOpenDrawer = onOpenDrawer
        )

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Interactive Voice Studio Hero with Live Animated Waveform + Real Android Mic
            item(key = "wave_studio_hero") {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(24.dp),
                    contentPadding = 20.dp
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text(
                            text = if (isEn) "Live voice studio" else "Живой голос с IGseek",
                            style = MaterialTheme.typography.headlineMedium,
                            color = palette.textPrimary,
                            textAlign = TextAlign.Center
                        )
                        Text(
                            text = if (isEn) {
                                "Full real-time AI calls are arriving soon. Right now you can tap the microphone below for instant Android voice-to-chat."
                            } else {
                                "Полноценные голосовые звонки с ИИ появятся в ближайших обновлениях. Уже сейчас вы можете надиктовать запрос в одно касание."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.textMuted,
                            textAlign = TextAlign.Center
                        )

                        AnimatedWaveEqualizer(
                            barColor = palette.brand,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(68.dp)
                                .padding(horizontal = 8.dp)
                        )

                        // Tactile Push-to-Talk Mic Button
                        Surface(
                            modifier = Modifier
                                .size(68.dp)
                                .clip(CircleShape)
                                .clickable { startVoiceDictation() },
                            shape = CircleShape,
                            color = palette.brand,
                            shadowElevation = 6.dp
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = LucideIcons.Mic,
                                    contentDescription = if (isEn) "Speak now" else "Говорить",
                                    tint = palette.brandOn,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }

                        Text(
                            text = if (isEn) "Tap microphone to dictate into Chat" else "Нажмите микрофон, чтобы надиктовать в чат",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Medium,
                            color = palette.textSecondary
                        )
                    }
                }
            }

            item(key = "wave_roadmap_hdr") {
                IGseekSectionHeader(
                    title = if (isEn) "Coming in Wave Live" else "Что появится в Wave Live",
                    trailing = if (isEn) "In progress" else "В разработке"
                )
            }

            itemsIndexed(capabilities.chunked(2), key = { idx, _ -> "wave_cap_$idx" }) { _, pair ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    pair.forEach { cap ->
                        val iconColor = if (palette.isDark) cap.tint else palette.brand
                        val iconBg = if (palette.isDark) cap.tint.copy(alpha = 0.14f) else palette.chipBg
                        Surface(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(18.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(iconBg),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = cap.icon,
                                        contentDescription = null,
                                        tint = iconColor,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                                Text(
                                    text = cap.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary,
                                    maxLines = 2
                                )
                                Text(
                                    text = cap.desc,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = palette.textMuted
                                )
                            }
                        }
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }

            item(key = "wave_actions") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = { viewModel.selectTab(IGseekTab.LIBRARY) },
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, palette.glassBorder),
                        modifier = Modifier.weight(1f).height(46.dp)
                    ) {
                        Icon(LucideIcons.Library, contentDescription = null, tint = palette.textPrimary, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(7.dp))
                        Text("Library", color = palette.textPrimary)
                    }
                    Button(
                        onClick = onBackToChat,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.brand,
                            contentColor = palette.brandOn
                        ),
                        modifier = Modifier.weight(1f).height(46.dp)
                    ) {
                        Icon(LucideIcons.MessageSquare, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(7.dp))
                        Text(if (isEn) "Open Chat" else "В чат", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun AnimatedWaveEqualizer(
    barColor: Color,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "wave_eq")
    val phase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2.0 * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "wave_phase"
    )

    Canvas(modifier = modifier) {
        val barCount = 21
        val gap = size.width / (barCount * 2.1f)
        val barWidth = (size.width - gap * (barCount - 1)) / barCount
        val centerIdx = (barCount - 1) / 2f

        for (i in 0 until barCount) {
            val distFromCenter = kotlin.math.abs(i - centerIdx) / centerIdx
            val envelope = (1f - distFromCenter * 0.65f).coerceIn(0.25f, 1f)
            val wave1 = sin(phase + i * 0.55f)
            val wave2 = sin(phase * 1.6f - i * 0.35f)
            val norm = ((wave1 * 0.6f + wave2 * 0.4f) + 1f) * 0.5f
            val h = (size.height * (0.20f + 0.78f * norm * envelope)).coerceAtLeast(8f)
            val x = i * (barWidth + gap)
            val y = (size.height - h) / 2f
            val alpha = (0.35f + 0.65f * envelope).coerceIn(0.3f, 1f)

            drawRoundRect(
                color = barColor.copy(alpha = alpha),
                topLeft = Offset(x, y),
                size = Size(barWidth, h),
                cornerRadius = CornerRadius(barWidth / 2f, barWidth / 2f)
            )
        }
    }
}
