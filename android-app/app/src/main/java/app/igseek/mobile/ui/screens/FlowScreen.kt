package app.igseek.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.FlowStepItem
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.IGseekSectionHeader
import app.igseek.mobile.ui.components.IGseekSegmentedControl
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.components.sharePlainText
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

private data class FlowScenarioTemplate(
    val title: String,
    val subtitle: String,
    val category: String,
    val goal: String,
    val icon: ImageVector,
    val tint: Color
)

@Composable
fun FlowScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val isEn = state.layoutPrefs.language == "en"
    var goalInput by remember { mutableStateOf(state.flowTask.goal) }
    var autonomyIndex by remember { mutableIntStateOf(1) } // 0 = Assist, 1 = Semi-Auto, 2 = Autopilot
    val expandedSteps = remember { mutableStateMapOf<String, Boolean>() }

    val task = state.flowTask
    val doneCount = task.steps.count { it.status == "done" }
    val totalCount = task.steps.size
    val progress by animateFloatAsState(
        targetValue = if (totalCount > 0) doneCount.toFloat() / totalCount.toFloat() else 0f,
        label = "flow_progress"
    )

    val autonomyModes = remember(isEn) {
        if (isEn) listOf("Assist", "Semi-Auto", "Autopilot")
        else listOf("Ассистент", "Полуавто", "Автопилот")
    }
    val autonomyHint = remember(autonomyIndex, isEn) {
        when (autonomyIndex) {
            0 -> if (isEn) "Step-by-step transparent plan with detailed breakdown"
            else "Подробный пошаговый план с прозрачным контролем"
            2 -> if (isEn) "Maximum autonomy: builds and executes end-to-end"
            else "Максимум автономности: собирает и выполняет задачу целиком"
            else -> if (isEn) "Balanced workflow: builds plan, runs all steps on launch"
            else "Оптимальный баланс: строит план и запускает шаги по команде"
        }
    }

    val scenarios = remember(isEn) {
        if (isEn) {
            listOf(
                FlowScenarioTemplate(
                    title = "5 Competitors Audit",
                    subtitle = "Compare strengths, pricing & UX",
                    category = "Analytics",
                    goal = "Find top 5 competitors in our niche, compare features, positioning, and create a structured report.",
                    icon = LucideIcons.Search,
                    tint = Color(0xFF6366F1)
                ),
                FlowScenarioTemplate(
                    title = "AI & LLM Digest",
                    subtitle = "Key model releases & insights",
                    category = "Research",
                    goal = "Summarize the biggest AI & open-weight model breakthroughs and prepare an executive brief.",
                    icon = LucideIcons.TrendingUp,
                    tint = Color(0xFFF43F5E)
                ),
                FlowScenarioTemplate(
                    title = "Product Launch Plan",
                    subtitle = "Sprints, QA, deploy & growth",
                    category = "Strategy",
                    goal = "Break down a mobile app product launch into sprints: engineering, QA, store release, and marketing.",
                    icon = LucideIcons.Zap,
                    tint = Color(0xFFF59E0B)
                ),
                FlowScenarioTemplate(
                    title = "Security Checklist",
                    subtitle = "API auth, rules & hardening",
                    category = "Security",
                    goal = "Create a practical security audit checklist for a modern web & Android app with Firebase and REST APIs.",
                    icon = LucideIcons.Shield,
                    tint = Color(0xFF10B981)
                ),
                FlowScenarioTemplate(
                    title = "API Cheatsheet",
                    subtitle = "Endpoints, auth & curl examples",
                    category = "Docs",
                    goal = "Design a clean developer API reference cheatsheet with auth flow, error codes, and usage examples.",
                    icon = LucideIcons.FileCode,
                    tint = Color(0xFF3B82F6)
                ),
                FlowScenarioTemplate(
                    title = "14-Day Study Track",
                    subtitle = "Daily lessons & mini-projects",
                    category = "Learning",
                    goal = "Build a 14-day practical roadmap to master Kotlin Jetpack Compose with daily practice exercises.",
                    icon = LucideIcons.Compass,
                    tint = Color(0xFF8B5CF6)
                )
            )
        } else {
            listOf(
                FlowScenarioTemplate(
                    title = "Разбор 5 конкурентов",
                    subtitle = "Сильные стороны, цены и фичи",
                    category = "Аналитика",
                    goal = "Проанализируй 5 главных конкурентов в нише, сравни сильные стороны, монетизацию и подготовь структурированный отчёт.",
                    icon = LucideIcons.Search,
                    tint = Color(0xFF6366F1)
                ),
                FlowScenarioTemplate(
                    title = "Дайджест ИИ-трендов",
                    subtitle = "Главные релизы и модели недели",
                    category = "Исследование",
                    goal = "Собери ключевые ИИ-тренды и релизы open-weight моделей, выдели практическую пользу и сделай краткий дайджест.",
                    icon = LucideIcons.TrendingUp,
                    tint = Color(0xFFF43F5E)
                ),
                FlowScenarioTemplate(
                    title = "План запуска релиза",
                    subtitle = "Спринты, тесты, деплой и рост",
                    category = "Стратегия",
                    goal = "Разбей запуск мобильного продукта на этапы: разработка, тестирование, публикация и привлечение первых пользователей.",
                    icon = LucideIcons.Zap,
                    tint = Color(0xFFF59E0B)
                ),
                FlowScenarioTemplate(
                    title = "Чек-лист безопасности",
                    subtitle = "Аудит API, правил и защиты",
                    category = "Безопасность",
                    goal = "Составь практический чек-лист аудита безопасности для веб-сервиса и Android-приложения с Firebase и API.",
                    icon = LucideIcons.Shield,
                    tint = Color(0xFF10B981)
                ),
                FlowScenarioTemplate(
                    title = "Шпаргалка по API",
                    subtitle = "Эндпоинты, коды и примеры",
                    category = "Документация",
                    goal = "Подготовь понятную Markdown-шпаргалку по проектированию REST API с примерами запросов и обработкой ошибок.",
                    icon = LucideIcons.FileCode,
                    tint = Color(0xFF3B82F6)
                ),
                FlowScenarioTemplate(
                    title = "План обучения на 14 дней",
                    subtitle = "Ежедневная практика и задания",
                    category = "Обучение",
                    goal = "Составь практический 14-дневный план изучения Kotlin и Jetpack Compose с мини-задачами на каждый день.",
                    icon = LucideIcons.Compass,
                    tint = Color(0xFF8B5CF6)
                )
            )
        }
    }

    val topSubtitle = when {
        task.isPlanning -> if (isEn) "Building execution plan…" else "Составляем план…"
        task.isRunning -> if (isEn) "Running · $doneCount of $totalCount done" else "Выполняется · $doneCount из $totalCount"
        totalCount > 0 -> if (isEn) "$doneCount of $totalCount steps completed" else "Выполнено $doneCount из $totalCount шагов"
        else -> if (isEn) "Multi-step autonomous agent" else "Многошаговый автономный агент"
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = "IGseek Flow",
            subtitle = topSubtitle,
            onOpenDrawer = onOpenDrawer,
            actions = {
                if (task.steps.isNotEmpty() && !task.isRunning) {
                    IconButton(
                        onClick = {
                            goalInput = ""
                            viewModel.resetFlow()
                        },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.RotateCcw,
                            contentDescription = if (isEn) "Reset" else "Сбросить",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(19.dp)
                        )
                    }
                }
            }
        )

        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Autonomy selector + sleek floating Flow capsule composer
            item(key = "flow_composer") {
                var isComposerFocused by remember { mutableStateOf(false) }
                val canLaunch = goalInput.isNotBlank() && !task.isPlanning && !task.isRunning

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    IGseekSegmentedControl(
                        options = autonomyModes,
                        selectedIndex = autonomyIndex,
                        onSelect = { autonomyIndex = it }
                    )
                    Text(
                        text = autonomyHint,
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted,
                        modifier = Modifier.padding(horizontal = 4.dp)
                    )

                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(26.dp),
                        color = palette.composerBg,
                        shadowElevation = if (palette.isDark) 0.dp else 4.dp,
                        border = BorderStroke(
                            width = if (isComposerFocused) 1.5.dp else 1.dp,
                            color = if (isComposerFocused || goalInput.isNotBlank()) palette.brandBorder else palette.composerBorder
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(start = 18.dp, end = 12.dp, top = 16.dp, bottom = 11.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(end = 6.dp, bottom = 14.dp)
                            ) {
                                if (goalInput.isEmpty()) {
                                    Text(
                                        text = if (isEn) "Delegate a multi-step goal to Flow…"
                                        else "Опишите цель для автономного Flow…",
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = palette.textMuted
                                    )
                                }
                                BasicTextField(
                                    value = goalInput,
                                    onValueChange = { goalInput = it },
                                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.textPrimary),
                                    cursorBrush = SolidColor(palette.brand),
                                    minLines = 2,
                                    maxLines = 6,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .onFocusChanged { isComposerFocused = it.isFocused }
                                )
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(50),
                                        color = palette.brandSoft,
                                        border = BorderStroke(1.dp, palette.brandBorder)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                                        ) {
                                            Icon(
                                                imageVector = LucideIcons.Workflow,
                                                contentDescription = null,
                                                tint = palette.brand,
                                                modifier = Modifier.size(13.dp)
                                            )
                                            Text(
                                                text = autonomyModes[autonomyIndex],
                                                style = MaterialTheme.typography.labelSmall,
                                                fontWeight = FontWeight.SemiBold,
                                                color = palette.brand
                                            )
                                        }
                                    }

                                    if (goalInput.isNotBlank() && !task.isPlanning && !task.isRunning) {
                                        Surface(
                                            modifier = Modifier
                                                .size(32.dp)
                                                .clip(CircleShape)
                                                .clickable { goalInput = "" },
                                            shape = CircleShape,
                                            color = palette.chipBg,
                                            border = BorderStroke(1.dp, palette.chipBorder)
                                        ) {
                                            Box(contentAlignment = Alignment.Center) {
                                                Icon(
                                                    imageVector = LucideIcons.X,
                                                    contentDescription = if (isEn) "Clear" else "Очистить",
                                                    tint = palette.textMuted,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                    }
                                }

                                Surface(
                                    modifier = Modifier
                                        .height(38.dp)
                                        .clip(RoundedCornerShape(50))
                                        .clickable(enabled = canLaunch) {
                                            val enriched = when (autonomyIndex) {
                                                0 -> goalInput.trim()
                                                2 -> "${goalInput.trim()} (autonomous mode, detailed final deliverable)"
                                                else -> goalInput.trim()
                                            }
                                            viewModel.planFlow(enriched)
                                        },
                                    shape = RoundedCornerShape(50),
                                    color = if (canLaunch || task.isPlanning) palette.brand else palette.chipBg
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        if (task.isPlanning) {
                                            CircularProgressIndicator(
                                                modifier = Modifier.size(14.dp),
                                                strokeWidth = 2.dp,
                                                color = palette.brandOn
                                            )
                                            Text(
                                                text = if (isEn) "Planning…" else "План…",
                                                style = MaterialTheme.typography.labelMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = palette.brandOn
                                            )
                                        } else {
                                            Text(
                                                text = if (task.steps.isEmpty()) {
                                                    if (isEn) "Plan" else "План"
                                                } else {
                                                    if (isEn) "Rebuild" else "Обновить"
                                                },
                                                style = MaterialTheme.typography.labelMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (canLaunch) palette.brandOn else palette.textMuted
                                            )
                                            Icon(
                                                imageVector = LucideIcons.ArrowUp,
                                                contentDescription = null,
                                                tint = if (canLaunch) palette.brandOn else palette.textMuted,
                                                modifier = Modifier.size(15.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            if (!task.error.isNullOrBlank()) {
                                Spacer(Modifier.height(10.dp))
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.AlertCircle,
                                        contentDescription = null,
                                        tint = palette.danger,
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Text(
                                        text = task.error,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = palette.danger
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Active Flow Plan Header + Progress + Timeline
            if (task.steps.isNotEmpty()) {
                item(key = "flow_plan_summary") {
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(22.dp),
                        highlighted = doneCount == totalCount && totalCount > 0,
                        contentPadding = 16.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = task.title.ifBlank { if (isEn) "Execution Plan" else "План выполнения" },
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = if (isEn) "$doneCount / $totalCount steps · ${autonomyModes[autonomyIndex]}"
                                    else "$doneCount из $totalCount шагов · ${autonomyModes[autonomyIndex]}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted
                                )
                            }
                            if (doneCount == totalCount && totalCount > 0) {
                                Icon(
                                    imageVector = LucideIcons.CheckCircle,
                                    contentDescription = null,
                                    tint = palette.success,
                                    modifier = Modifier.size(22.dp)
                                )
                            }
                        }

                        Spacer(Modifier.height(12.dp))

                        LinearProgressIndicator(
                            progress = { progress },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(50)),
                            color = if (doneCount == totalCount) palette.success else palette.brand,
                            trackColor = palette.chipBg
                        )

                        Spacer(Modifier.height(14.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = { viewModel.runFlow() },
                                enabled = !task.isRunning,
                                shape = RoundedCornerShape(13.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = palette.brand,
                                    contentColor = palette.brandOn
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp)
                            ) {
                                if (task.isRunning) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = palette.brandOn
                                    )
                                    Spacer(Modifier.width(7.dp))
                                    Text(if (isEn) "Running…" else "В работе…", fontWeight = FontWeight.SemiBold)
                                } else {
                                    Icon(LucideIcons.Play, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = if (doneCount == totalCount && totalCount > 0) {
                                            if (isEn) "Run again" else "Повторить"
                                        } else {
                                            if (isEn) "Run Flow" else "Запустить"
                                        },
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = { viewModel.saveFlowResultToLibrary() },
                                shape = RoundedCornerShape(13.dp),
                                border = BorderStroke(1.dp, palette.glassBorder),
                                contentPadding = PaddingValues(horizontal = 12.dp),
                                modifier = Modifier.height(44.dp)
                            ) {
                                Icon(
                                    imageVector = LucideIcons.Library,
                                    contentDescription = null,
                                    tint = palette.textPrimary,
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = if (isEn) "Save" else "В Library",
                                    color = palette.textPrimary,
                                    style = MaterialTheme.typography.labelMedium
                                )
                            }

                            if (doneCount > 0) {
                                Surface(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(RoundedCornerShape(13.dp))
                                        .clickable {
                                            val report = buildString {
                                                appendLine(task.title.ifBlank { "IGseek Flow" })
                                                appendLine()
                                                task.steps.forEachIndexed { i, s ->
                                                    appendLine("${i + 1}. ${s.title}")
                                                    if (s.output.isNotBlank()) appendLine(s.output)
                                                    appendLine()
                                                }
                                            }
                                            sharePlainText(context, task.title.ifBlank { "IGseek Flow" }, report)
                                        },
                                    shape = RoundedCornerShape(13.dp),
                                    color = palette.chipBg,
                                    border = BorderStroke(1.dp, palette.glassBorder)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = LucideIcons.Share2,
                                            contentDescription = "Share",
                                            tint = palette.textSecondary,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                itemsIndexed(task.steps, key = { idx, s -> "${s.id}_$idx" }) { index, step ->
                    val hasOutput = step.output.isNotBlank()
                    val isExpanded = expandedSteps[step.id] ?: (step.status == "done" || step.status == "error")
                    FlowTimelineStepRow(
                        index = index,
                        isLast = index == task.steps.lastIndex,
                        step = step,
                        expanded = isExpanded && hasOutput,
                        isEn = isEn,
                        onToggleExpand = {
                            if (hasOutput) expandedSteps[step.id] = !isExpanded
                        },
                        onCopyOutput = {
                            clipboard.setText(AnnotatedString(step.output))
                            viewModel.showToast(if (isEn) "Step output copied" else "Результат шага скопирован")
                        }
                    )
                }
            } else {
                // Scenario Library Grid (when idle)
                item(key = "flow_scenarios_header") {
                    IGseekSectionHeader(
                        title = if (isEn) "Ready scenarios" else "Готовые сценарии",
                        trailing = if (isEn) "Tap to launch" else "Нажмите для запуска"
                    )
                }

                itemsIndexed(scenarios.chunked(2), key = { idx, _ -> "sc_row_$idx" }) { _, pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        pair.forEach { sc ->
                            FlowScenarioCard(
                                scenario = sc,
                                onClick = {
                                    goalInput = sc.goal
                                    viewModel.planFlow(sc.goal)
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (pair.size == 1) {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FlowScenarioCard(
    scenario: FlowScenarioTemplate,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    val iconColor = if (palette.isDark) scenario.tint else palette.brand
    val iconBg = if (palette.isDark) scenario.tint.copy(alpha = 0.14f) else palette.chipBg

    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(iconBg),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = scenario.icon,
                        contentDescription = null,
                        tint = iconColor,
                        modifier = Modifier.size(17.dp)
                    )
                }
                Text(
                    text = scenario.category,
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    maxLines = 1
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = scenario.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = scenario.subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = palette.textMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun FlowTimelineStepRow(
    index: Int,
    isLast: Boolean,
    step: FlowStepItem,
    expanded: Boolean,
    isEn: Boolean,
    onToggleExpand: () -> Unit,
    onCopyOutput: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val statusColor = when (step.status) {
        "done" -> palette.success
        "running" -> palette.brand
        "error" -> palette.danger
        else -> palette.textMuted
    }
    val statusLabel = when (step.status) {
        "done" -> if (isEn) "Done" else "Готово"
        "running" -> if (isEn) "Running" else "Выполняется"
        "error" -> if (isEn) "Error" else "Ошибка"
        else -> if (isEn) "Pending" else "Ожидает"
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        // Left timeline indicator rail
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(34.dp).padding(top = 12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(
                        when (step.status) {
                            "done" -> palette.success.copy(alpha = 0.16f)
                            "running" -> palette.brandSoft
                            "error" -> palette.danger.copy(alpha = 0.16f)
                            else -> palette.chipBg
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                when (step.status) {
                    "running" -> CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        strokeWidth = 2.dp,
                        color = palette.brand
                    )
                    "done" -> Icon(
                        imageVector = LucideIcons.Check,
                        contentDescription = null,
                        tint = palette.success,
                        modifier = Modifier.size(14.dp)
                    )
                    "error" -> Icon(
                        imageVector = LucideIcons.AlertCircle,
                        contentDescription = null,
                        tint = palette.danger,
                        modifier = Modifier.size(14.dp)
                    )
                    else -> Text(
                        text = "${index + 1}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textSecondary
                    )
                }
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .padding(top = 6.dp)
                        .width(2.dp)
                        .height(34.dp)
                        .background(
                            if (step.status == "done") palette.success.copy(alpha = 0.35f)
                            else palette.divider
                        )
                )
            }
        }

        Spacer(Modifier.width(8.dp))

        // Right step content card
        Surface(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(18.dp))
                .clickable(enabled = step.output.isNotBlank(), onClick = onToggleExpand),
            shape = RoundedCornerShape(18.dp),
            color = if (step.status == "running") palette.brandSoft else palette.glassBg,
            border = BorderStroke(
                1.dp,
                when (step.status) {
                    "running" -> palette.brandBorder
                    "error" -> palette.danger.copy(alpha = 0.45f)
                    else -> palette.glassBorder
                }
            )
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${step.tool} · $statusLabel",
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor
                    )
                    if (step.output.isNotBlank()) {
                        Icon(
                            imageVector = if (expanded) LucideIcons.ChevronUp else LucideIcons.ChevronDown,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                Spacer(Modifier.height(4.dp))

                Text(
                    text = step.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary
                )

                if (step.description.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = step.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.textMuted
                    )
                }

                AnimatedVisibility(visible = expanded && step.output.isNotBlank()) {
                    Column(modifier = Modifier.padding(top = 10.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(palette.bg.copy(alpha = 0.55f))
                                .padding(12.dp)
                        ) {
                            IGseekMarkdownText(markdown = step.output)
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable(onClick = onCopyOutput)
                                .padding(horizontal = 6.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Icon(
                                imageVector = LucideIcons.Copy,
                                contentDescription = "Copy",
                                tint = palette.textMuted,
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = if (isEn) "Copy result" else "Копировать результат",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.textSecondary
                            )
                        }
                    }
                }
            }
        }
    }
}
