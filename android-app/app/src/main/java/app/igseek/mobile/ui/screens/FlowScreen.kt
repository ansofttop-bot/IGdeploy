package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekMarkdownText
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

@Composable
fun FlowScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val task = state.flowTask
    val taskError = task.error
    val isEn = state.layoutPrefs.language == "en"
    var goalInput by remember { mutableStateOf(task.goal) }

    val quickScenarios = if (isEn) {
        listOf(
            "Launch plan for an indie SaaS with pricing & positioning",
            "Competitive analysis report for a mobile AI productivity app",
            "Structured 30-day learning roadmap for Rust & backend systems"
        )
    } else {
        listOf(
            "План запуска стартапа с позиционированием и монетизацией",
            "Аналитический отчёт по трендам рынка мобильных ИИ-приложений",
            "Пошаговая программа изучения системной архитектуры на 30 дней"
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
    ) {
        // Slim Header
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
                Column {
                    Text("IGseek Flow", style = MaterialTheme.typography.titleMedium, color = palette.textPrimary)
                    Text(
                        text = if (isEn) "Autonomous multi-step agent" else "Автономное выполнение задач",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                }
            }

            if (task.steps.isNotEmpty()) {
                IconButton(onClick = {
                    goalInput = ""
                    viewModel.resetFlow()
                }) {
                    Icon(
                        imageVector = LucideIcons.RefreshCw,
                        contentDescription = "Reset",
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
            // Goal Composer Card
            item {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
                ) {
                    Text(
                        text = if (isEn) "Describe your goal" else "Опишите цель задачи",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = goalInput,
                        onValueChange = { goalInput = it },
                        placeholder = {
                            Text(
                                text = if (isEn) "Example: Research competitors and draft a GTM strategy" else "Например: Проанализируй конкурентов и составь план запуска продукта",
                                color = palette.textMuted
                            )
                        },
                        minLines = 3,
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
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { viewModel.planFlow(goalInput) },
                            enabled = goalInput.isNotBlank() && !task.isPlanning && !task.isRunning,
                            shape = RoundedCornerShape(50),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = palette.brand,
                                contentColor = palette.brandOn
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp)
                        ) {
                            if (task.isPlanning) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = palette.brandOn
                                )
                            } else {
                                Icon(
                                    imageVector = LucideIcons.Sparkles,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = if (isEn) "Build Plan" else "Составить план",
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        if (task.steps.isNotEmpty()) {
                            OutlinedButton(
                                onClick = { viewModel.runFlow() },
                                enabled = !task.isRunning && !task.isPlanning,
                                shape = RoundedCornerShape(50),
                                border = BorderStroke(1.dp, palette.brandBorder),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.brand),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(46.dp)
                            ) {
                                Icon(
                                    imageVector = LucideIcons.Play,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = if (task.isRunning) {
                                        if (isEn) "Running…" else "Выполняется…"
                                    } else {
                                        if (isEn) "Run" else "Запустить"
                                    }
                                )
                            }
                        }
                    }
                }
            }

            if (!taskError.isNullOrBlank()) {
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.35f))
                    ) {
                        Text(
                            text = taskError,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            // Quick Flow Scenarios when empty
            if (task.steps.isEmpty()) {
                item {
                    Text(
                        text = if (isEn) "QUICK SCENARIOS" else "БЫСТРЫЕ СЦЕНАРИИ",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted,
                        modifier = Modifier.padding(top = 4.dp, start = 4.dp)
                    )
                }
                itemsIndexed(quickScenarios) { _, scenario ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .clickable {
                                goalInput = scenario
                                viewModel.planFlow(scenario)
                            },
                        shape = RoundedCornerShape(16.dp),
                        color = palette.glassBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = scenario,
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.textSecondary,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(Modifier.width(10.dp))
                            Icon(
                                imageVector = LucideIcons.Play,
                                contentDescription = null,
                                tint = palette.brand,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            } else {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = task.title.ifBlank { if (isEn) "Execution Plan" else "План выполнения" },
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.textPrimary,
                            modifier = Modifier.weight(1f)
                        )
                        if (task.steps.any { it.status == "done" }) {
                            OutlinedButton(
                                onClick = { viewModel.saveFlowResultToLibrary() },
                                shape = RoundedCornerShape(50),
                                border = BorderStroke(1.dp, palette.glassBorder),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text("В Library", style = MaterialTheme.typography.labelSmall, color = palette.textPrimary)
                            }
                        }
                    }
                }

                itemsIndexed(task.steps, key = { _, s -> s.id }) { idx, step ->
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(18.dp),
                        highlighted = step.status == "running",
                        contentPadding = 14.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "${idx + 1}. ${step.title}",
                                style = MaterialTheme.typography.titleMedium,
                                color = palette.textPrimary,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(Modifier.width(8.dp))
                            when (step.status) {
                                "done" -> Icon(
                                    imageVector = LucideIcons.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF10B981),
                                    modifier = Modifier.size(19.dp)
                                )
                                "running" -> CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = palette.brand
                                )
                                "error" -> Icon(
                                    imageVector = LucideIcons.AlertCircle,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.size(19.dp)
                                )
                                else -> Surface(
                                    shape = RoundedCornerShape(50),
                                    color = palette.chipBg,
                                    border = BorderStroke(1.dp, palette.glassBorder)
                                ) {
                                    Text(
                                        text = step.tool,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textMuted,
                                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp)
                                    )
                                }
                            }
                        }
                        if (step.description.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = step.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted
                            )
                        }
                        if (step.output.isNotBlank()) {
                            Spacer(Modifier.height(10.dp))
                            IGseekMarkdownText(markdown = step.output)
                        }
                    }
                }
            }
        }
    }
}
