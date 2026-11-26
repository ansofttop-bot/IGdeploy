package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

@Composable
fun EngineScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val clipboard = LocalClipboardManager.current
    val isEn = state.layoutPrefs.language == "en"
    var prompt by remember { mutableStateOf("") }
    val engineErr = state.engineError

    val activeProject = state.engineProjects.firstOrNull { it.id == state.activeEngineProjectId }
        ?: state.engineProjects.firstOrNull()
    val activeFile = activeProject?.files?.firstOrNull { it.path == activeProject.activeFile }
        ?: activeProject?.files?.firstOrNull()

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
                Column {
                    Text("IGseek Engine", style = MaterialTheme.typography.titleMedium, color = palette.textPrimary)
                    Text(
                        text = if (isEn) "AI Code & Project Studio" else "Генератор кода и проектов",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                }
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    contentPadding = 16.dp
                ) {
                    Text(
                        text = if (isEn) "What should Engine build?" else "Что собрать в Engine?",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        placeholder = {
                            Text(
                                text = if (isEn) "E.g. Modern dark Pomodoro timer web app with stats" else "Например: Сделай минималистичный трекер привычек на HTML/CSS/JS в тёмной теме",
                                color = palette.textMuted
                            )
                        },
                        minLines = 2,
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.brand,
                            unfocusedBorderColor = palette.glassBorder,
                            focusedTextColor = palette.textPrimary,
                            unfocusedTextColor = palette.textPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            viewModel.generateEngineProject(prompt)
                            prompt = ""
                        },
                        enabled = prompt.isNotBlank() && !state.isEngineGenerating,
                        shape = RoundedCornerShape(50),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.brand,
                            contentColor = palette.brandOn
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp)
                    ) {
                        if (state.isEngineGenerating) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = palette.brandOn
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(if (isEn) "Generating files…" else "Генерация файлов…")
                        } else {
                            Icon(
                                imageVector = LucideIcons.Code2,
                                contentDescription = null,
                                modifier = Modifier.size(17.dp)
                            )
                            Spacer(Modifier.width(7.dp))
                            Text(
                                text = if (isEn) "Generate Project" else "Сгенерировать проект",
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            if (!engineErr.isNullOrBlank()) {
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f)
                    ) {
                        Text(
                            text = engineErr,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }

            // Saved Engine Projects Horizontal Selector
            if (state.engineProjects.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        state.engineProjects.forEach { proj ->
                            IGseekGlassChip(
                                label = proj.title.take(22),
                                selected = activeProject?.id == proj.id,
                                onClick = { viewModel.selectEngineProject(proj.id) }
                            )
                        }
                    }
                }
            }

            if (activeProject != null) {
                item {
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        contentPadding = 14.dp
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(activeProject.title, style = MaterialTheme.typography.titleMedium, color = palette.textPrimary)
                                Text(
                                    text = if (isEn) {
                                        "${activeProject.files.size} files · Synced"
                                    } else {
                                        "${activeProject.files.size} файлов · Синхронизировано"
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                OutlinedButton(
                                    onClick = { viewModel.saveEngineProjectToLibrary(activeProject) },
                                    shape = RoundedCornerShape(50),
                                    border = BorderStroke(1.dp, palette.glassBorder),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                                ) {
                                    Text("В Library", style = MaterialTheme.typography.labelSmall, color = palette.textPrimary)
                                }
                                IconButton(
                                    onClick = { viewModel.deleteEngineProject(activeProject.id) },
                                    modifier = Modifier.size(34.dp)
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.Trash2,
                                        contentDescription = "Delete",
                                        tint = palette.textMuted,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(10.dp))

                        // File Tabs
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            activeProject.files.forEach { file ->
                                IGseekGlassChip(
                                    label = file.path,
                                    selected = activeFile?.path == file.path,
                                    onClick = { viewModel.selectEngineFile(file.path) }
                                )
                            }
                        }

                        if (activeFile != null) {
                            Spacer(Modifier.height(10.dp))
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                color = palette.codeBg,
                                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
                            ) {
                                Column {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(Color.White.copy(alpha = 0.04f))
                                            .padding(horizontal = 12.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(activeFile.path, style = MaterialTheme.typography.labelSmall, color = Color(0xFFA1A1AA))
                                        Row(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(8.dp))
                                                .clickable {
                                                    clipboard.setText(AnnotatedString(activeFile.content))
                                                    viewModel.showToast("Код ${activeFile.path} скопирован")
                                                }
                                                .padding(horizontal = 6.dp, vertical = 2.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                imageVector = LucideIcons.Copy,
                                                contentDescription = null,
                                                tint = Color(0xFFD4D4D8),
                                                modifier = Modifier.size(13.dp)
                                            )
                                            Text(
                                                text = if (isEn) "Copy" else "Копировать",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = Color(0xFFD4D4D8)
                                            )
                                        }
                                    }
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .horizontalScroll(rememberScrollState())
                                            .padding(12.dp)
                                    ) {
                                        Text(
                                            text = activeFile.content,
                                            style = TextStyle(
                                                fontFamily = FontFamily.Monospace,
                                                fontWeight = FontWeight.Normal,
                                                fontSize = 12.sp,
                                                lineHeight = 18.sp,
                                                color = Color(0xFFE4E4E7)
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // Starter templates for Engine
                val starters = if (isEn) {
                    listOf(
                        "Portfolio landing page with sleek dark glass (HTML + CSS + JS)",
                        "Interactive Pomodoro timer with session history",
                        "Compound interest & investment calculator"
                    )
                } else {
                    listOf(
                        "Лендинг портфолио с тёмным стеклом (HTML + CSS + JS)",
                        "Интерактивный Pomodoro-таймер с историей сессий",
                        "Калькулятор сложного процента и инвестиций"
                    )
                }
                item {
                    Text(
                        text = if (isEn) "STARTER TEMPLATES" else "БЫСТРЫЙ СТАРТ",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted
                    )
                }
                items(starters.size) { idx ->
                    val tpl = starters[idx]
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .clickable { viewModel.generateEngineProject(tpl) },
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
                                text = tpl,
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
            }
        }
    }
}
