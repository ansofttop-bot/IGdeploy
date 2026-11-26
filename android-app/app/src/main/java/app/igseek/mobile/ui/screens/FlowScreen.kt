package app.igseek.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.FlowStepItem
import app.igseek.mobile.ui.state.IGseekUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlowScreen(
    state: IGseekUiState,
    onPlanGoal: (String) -> Unit,
    onRunAllSteps: () -> Unit
) {
    var goalInput by remember { mutableStateOf(state.flowState.goal) }
    val flow = state.flowState

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.Build, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("IGseek Flow", style = MaterialTheme.typography.titleMedium)
                }
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
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Автономное планирование задачи", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Опишите цель — IGseek разобьёт её на шаги и выполнит их последовательно.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        OutlinedTextField(
                            value = goalInput,
                            onValueChange = { goalInput = it },
                            placeholder = { Text("Например: Собери план запуска Telegram-бота на Node.js") },
                            minLines = 2,
                            maxLines = 4,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp)
                        )
                        Button(
                            onClick = { onPlanGoal(goalInput) },
                            enabled = !flow.isPlanning && !flow.isRunning && goalInput.trim().length >= 3,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            if (flow.isPlanning) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                            } else {
                                Text("Построить план Flow")
                            }
                        }
                    }
                }
            }

            if (!flow.error.isNullOrBlank()) {
                item {
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
                        Text(flow.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(14.dp))
                    }
                }
            }

            if (flow.steps.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(flow.title.ifBlank { "План выполнения" }, style = MaterialTheme.typography.titleMedium)
                            Text("Шагов: ${flow.steps.size}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Button(onClick = onRunAllSteps, enabled = !flow.isRunning, shape = RoundedCornerShape(12.dp)) {
                            if (flow.isRunning) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                            } else {
                                Icon(Icons.Rounded.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text("Запустить")
                            }
                        }
                    }
                }

                itemsIndexed(flow.steps, key = { _, step -> step.id }) { index, step ->
                    FlowStepCard(index = index + 1, step = step)
                }
            }
        }
    }
}

@Composable
private fun FlowStepCard(index: Int, step: FlowStepItem) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                when (step.status) {
                    "done" -> Icon(Icons.Rounded.CheckCircle, contentDescription = "Готово", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                    "running" -> CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    "error" -> Icon(Icons.Rounded.Warning, contentDescription = "Ошибка", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                    else -> Icon(Icons.Rounded.Info, contentDescription = "Ожидает", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                }
                Text("$index. ${step.title}", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.weight(1f))
            }
            if (step.description.isNotBlank()) {
                Text(step.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (step.output.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
                    Text(step.output, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
                }
            }
        }
    }
}
