package app.igseek.mobile.ui.screens

import android.annotation.SuppressLint
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.igseek.mobile.data.models.EngineFileItem
import app.igseek.mobile.data.models.EngineProjectItem
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekSectionHeader
import app.igseek.mobile.ui.components.IGseekSegmentedControl
import app.igseek.mobile.ui.components.IGseekTopBar
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.components.formatRelativeTime
import app.igseek.mobile.ui.components.sharePlainText
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

private data class EngineStarterCard(
    val title: String,
    val subtitle: String,
    val prompt: String,
    val icon: ImageVector,
    val tint: Color
)

/**
 * Combines project HTML, CSS, and JS files into a self-contained HTML document
 * for live native Android WebView preview.
 */
private fun buildEnginePreviewHtml(project: EngineProjectItem): String {
    val htmlFile = project.files.firstOrNull {
        it.path.endsWith(".html", ignoreCase = true) || it.path.endsWith(".htm", ignoreCase = true)
    }
    val cssFiles = project.files.filter { it.path.endsWith(".css", ignoreCase = true) }
    val jsFiles = project.files.filter {
        it.path.endsWith(".js", ignoreCase = true) && !it.path.endsWith(".json", ignoreCase = true)
    }
    val combinedCss = cssFiles.joinToString("\n") { it.content }
    val combinedJs = jsFiles.joinToString("\n") { it.content }

    if (htmlFile != null) {
        var doc = htmlFile.content
        if (combinedCss.isNotBlank() && !doc.contains(combinedCss.take(40))) {
            val styleTag = "<style>\n$combinedCss\n</style>"
            doc = if (doc.contains("</head>", ignoreCase = true)) {
                doc.replaceFirst("</head>", "$styleTag\n</head>", ignoreCase = true)
            } else {
                "$styleTag\n$doc"
            }
        }
        if (combinedJs.isNotBlank() && !doc.contains(combinedJs.take(40))) {
            val scriptTag = "<script>\n$combinedJs\n</script>"
            doc = if (doc.contains("</body>", ignoreCase = true)) {
                doc.replaceFirst("</body>", "$scriptTag\n</body>", ignoreCase = true)
            } else {
                "$doc\n$scriptTag"
            }
        }
        return doc
    }

    // Fallback: render a clean styled code summary preview if project has no HTML entry
    val filesSummary = project.files.joinToString("") { f ->
        "<div class='file'><b>${f.path.replace("<", "&lt;")}</b><span>${f.content.lines().size} lines</span></div>"
    }
    return """
        <!doctype html>
        <html>
        <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>
          body { margin:0; padding:20px; font-family: -apple-system, sans-serif; background:#0b0b0e; color:#f4f4f6; }
          h2 { margin:0 0 6px 0; font-size:18px; }
          p { margin:0 0 16px 0; font-size:13px; color:#9ca3af; }
          .file { display:flex; justify-content:space-between; padding:12px 14px; margin-bottom:8px; border-radius:12px; background:#15151b; border:1px solid rgba(255,255,255,0.08); font-size:13px; }
          .file span { color:#9ca3af; font-family:monospace; }
        </style>
        </head>
        <body>
          <h2>${project.title.replace("<", "&lt;")}</h2>
          <p>Switch to Code tab to inspect full source files.</p>
          $filesSummary
        </body>
        </html>
    """.trimIndent()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EngineScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val isEn = state.layoutPrefs.language == "en"

    var prompt by remember { mutableStateOf("") }
    var refinePrompt by remember { mutableStateOf("") }
    var studioMode by remember { mutableIntStateOf(0) } // 0 = Preview, 1 = Code
    var showCreateMode by remember { mutableStateOf(false) }
    var showProjectsSheet by remember { mutableStateOf(false) }
    var previewReloadKey by remember { mutableIntStateOf(0) }

    val activeProject = state.engineProjects.firstOrNull { it.id == state.activeEngineProjectId }
    val showWorkspace = activeProject != null && !showCreateMode

    val starters = remember(isEn) {
        if (isEn) {
            listOf(
                EngineStarterCard(
                    title = "SaaS Landing",
                    subtitle = "Hero, features & pricing",
                    prompt = "Build a sleek responsive single-page HTML/CSS/JS SaaS landing page with dark theme, pricing toggle, and smooth animations.",
                    icon = LucideIcons.Sparkles,
                    tint = Color(0xFFEF4444)
                ),
                EngineStarterCard(
                    title = "Task Tracker",
                    subtitle = "Kanban & local storage",
                    prompt = "Create an interactive HTML/CSS/JS task tracker with priority tags, completion stats, filter tabs, and localStorage persistence.",
                    icon = LucideIcons.CheckCircle,
                    tint = Color(0xFF10B981)
                ),
                EngineStarterCard(
                    title = "Finance Calculator",
                    subtitle = "Interactive sliders & chart",
                    prompt = "Create a clean HTML/CSS/JS compound interest & loan calculator with real-time range sliders and visual breakdown.",
                    icon = LucideIcons.TrendingUp,
                    tint = Color(0xFF3B82F6)
                ),
                EngineStarterCard(
                    title = "Arcade Mini-Game",
                    subtitle = "Canvas touch controls",
                    prompt = "Build a mobile-friendly HTML5 Canvas arcade game with touch controls, high score tracking, and clean neon visuals.",
                    icon = LucideIcons.Zap,
                    tint = Color(0xFFF59E0B)
                )
            )
        } else {
            listOf(
                EngineStarterCard(
                    title = "SaaS-лендинг",
                    subtitle = "Hero, фичи и тарифы",
                    prompt = "Сделай современный адаптивный лендинг на HTML/CSS/JS в тёмном стиле с переключателем тарифов и плавными анимациями.",
                    icon = LucideIcons.Sparkles,
                    tint = Color(0xFFEF4444)
                ),
                EngineStarterCard(
                    title = "Трекер задач",
                    subtitle = "Фильтры и localStorage",
                    prompt = "Создай интерактивный трекер задач на HTML/CSS/JS с приоритетами, счётчиком прогресса и сохранением в localStorage.",
                    icon = LucideIcons.CheckCircle,
                    tint = Color(0xFF10B981)
                ),
                EngineStarterCard(
                    title = "Калькулятор финансов",
                    subtitle = "Слайдеры и расчёт в реальном времени",
                    prompt = "Сделай удобный калькулятор вкладов и ипотеки на HTML/CSS/JS с ползунками и наглядным графиком выплат.",
                    icon = LucideIcons.TrendingUp,
                    tint = Color(0xFF3B82F6)
                ),
                EngineStarterCard(
                    title = "Мини-игра аркада",
                    subtitle = "Canvas и управление касанием",
                    prompt = "Сделай мобильную мини-игру на HTML5 Canvas с управлением касанием, рекордами и аккуратной неоновой графикой.",
                    icon = LucideIcons.Zap,
                    tint = Color(0xFFF59E0B)
                )
            )
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        IGseekTopBar(
            title = if (showWorkspace && activeProject != null) activeProject.title else "IGseek Engine",
            subtitle = when {
                state.isEngineGenerating -> if (isEn) "Generating project files…" else "Собираем код проекта…"
                showWorkspace && activeProject != null -> {
                    val count = activeProject.files.size
                    if (isEn) "$count files · Live Studio" else "$count файлов · Live Studio"
                }
                else -> if (isEn) "Mobile web app & code studio" else "Студия сайтов и кода с живым превью"
            },
            onOpenDrawer = onOpenDrawer,
            actions = {
                if (state.engineProjects.isNotEmpty()) {
                    IconButton(
                        onClick = { showProjectsSheet = true },
                        modifier = Modifier.size(44.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.Folder,
                            contentDescription = if (isEn) "Projects" else "Проекты",
                            tint = palette.textSecondary,
                            modifier = Modifier.size(19.dp)
                        )
                    }
                }
                IconButton(
                    onClick = {
                        showCreateMode = !showCreateMode
                        if (showCreateMode) prompt = ""
                    },
                    modifier = Modifier.size(44.dp)
                ) {
                    Icon(
                        imageVector = if (showCreateMode && activeProject != null) LucideIcons.X else LucideIcons.Plus,
                        contentDescription = if (isEn) "New project" else "Новый проект",
                        tint = palette.brand,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        )

        if (showWorkspace && activeProject != null) {
            // Active Project Studio (Live Preview + Line-numbered Code Editor + Quick Refine)
            val activeFile: EngineFileItem? = activeProject.files.firstOrNull { it.path == activeProject.activeFile }
                ?: activeProject.files.firstOrNull()

            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    IGseekSegmentedControl(
                        options = if (isEn) listOf("Live Preview", "Code") else listOf("Превью", "Код"),
                        selectedIndex = studioMode,
                        onSelect = { studioMode = it },
                        modifier = Modifier.weight(1f)
                    )
                    Surface(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable { viewModel.saveEngineProjectToLibrary(activeProject) },
                        shape = RoundedCornerShape(12.dp),
                        color = palette.glassBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = LucideIcons.Library,
                                contentDescription = "Save to Library",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(17.dp)
                            )
                        }
                    }
                    Surface(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                val text = activeFile?.content ?: activeProject.files.joinToString("\n\n") { "// ${it.path}\n${it.content}" }
                                sharePlainText(context, activeProject.title, text)
                            },
                        shape = RoundedCornerShape(12.dp),
                        color = palette.glassBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = LucideIcons.Share2,
                                contentDescription = "Share",
                                tint = palette.textSecondary,
                                modifier = Modifier.size(17.dp)
                            )
                        }
                    }
                }

                if (studioMode == 0) {
                    // Live Interactive WebView Preview Frame
                    val previewHtml = remember(activeProject.id, activeProject.files, previewReloadKey) {
                        buildEnginePreviewHtml(activeProject)
                    }
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        shape = RoundedCornerShape(20.dp),
                        color = palette.codeBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Column(modifier = Modifier.fillMaxSize()) {
                            // Mini Studio Viewport Bar
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(palette.surfaceElevated)
                                    .padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.Globe,
                                        contentDescription = null,
                                        tint = palette.brand,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = activeProject.files.firstOrNull { it.path.endsWith(".html", true) }?.path
                                            ?: activeProject.title,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textSecondary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.RefreshCw,
                                        contentDescription = "Reload",
                                        tint = palette.textMuted,
                                        modifier = Modifier
                                            .size(15.dp)
                                            .clickable { previewReloadKey += 1 }
                                    )
                                    Icon(
                                        imageVector = LucideIcons.Code2,
                                        contentDescription = "Code",
                                        tint = palette.textMuted,
                                        modifier = Modifier
                                            .size(15.dp)
                                            .clickable { studioMode = 1 }
                                    )
                                }
                            }

                            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                EngineLiveWebView(
                                    htmlContent = previewHtml,
                                    reloadKey = previewReloadKey,
                                    modifier = Modifier.fillMaxSize()
                                )
                                if (state.isEngineGenerating) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .background(Color.Black.copy(alpha = 0.58f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Column(
                                            horizontalAlignment = Alignment.CenterHorizontally,
                                            verticalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            CircularProgressIndicator(color = palette.brand)
                                            Text(
                                                text = if (isEn) "Updating project…" else "Обновляем проект…",
                                                style = MaterialTheme.typography.labelMedium,
                                                color = Color.White
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Line-Numbered Code Explorer
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        activeProject.files.forEach { file ->
                            IGseekGlassChip(
                                label = file.path,
                                selected = file.path == activeFile?.path,
                                onClick = { viewModel.selectEngineFile(file.path) }
                            )
                        }
                    }

                    if (activeFile != null) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            shape = RoundedCornerShape(18.dp),
                            color = palette.codeBg,
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.09f))
                        ) {
                            Column(modifier = Modifier.fillMaxSize()) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color.White.copy(alpha = 0.04f))
                                        .padding(horizontal = 12.dp, vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    val lineCount = remember(activeFile.content) { activeFile.content.lines().size }
                                    Text(
                                        text = "${activeFile.path} · $lineCount ${if (isEn) "lines" else "стр."}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color(0xFFA1A1AA),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f)
                                    )
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable {
                                                clipboard.setText(AnnotatedString(activeFile.content))
                                                viewModel.showToast(if (isEn) "Code copied" else "Код скопирован")
                                            }
                                            .padding(horizontal = 7.dp, vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = LucideIcons.Copy,
                                            contentDescription = "Copy",
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

                                val lines = remember(activeFile.content) { activeFile.content.lines() }
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                        .verticalScroll(rememberScrollState())
                                        .horizontalScroll(rememberScrollState())
                                        .padding(12.dp)
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        // Line number gutter
                                        Column(horizontalAlignment = Alignment.End) {
                                            lines.indices.forEach { idx ->
                                                Text(
                                                    text = "${idx + 1}",
                                                    style = TextStyle(
                                                        fontFamily = FontFamily.Monospace,
                                                        fontSize = 11.5.sp,
                                                        lineHeight = 18.sp,
                                                        color = Color(0xFF52525B)
                                                    )
                                                )
                                            }
                                        }
                                        // Code body
                                        Column {
                                            lines.forEach { line ->
                                                Text(
                                                    text = line.ifEmpty { " " },
                                                    style = TextStyle(
                                                        fontFamily = FontFamily.Monospace,
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
                    }
                }

                // Quick Follow-Up Refinement Bar
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = palette.composerBg,
                    border = BorderStroke(1.dp, palette.composerBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(modifier = Modifier.weight(1f).padding(vertical = 6.dp)) {
                            if (refinePrompt.isEmpty()) {
                                Text(
                                    text = if (isEn) "Refine this project…" else "Доработать проект…",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = palette.textMuted
                                )
                            }
                            BasicTextField(
                                value = refinePrompt,
                                onValueChange = { refinePrompt = it },
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodySmall.copy(color = palette.textPrimary),
                                cursorBrush = SolidColor(palette.brand),
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                        Surface(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(11.dp))
                                .clickable(enabled = refinePrompt.isNotBlank() && !state.isEngineGenerating) {
                                    val combined = "Доработай проект «${activeProject.title}» (${activeProject.prompt}): ${refinePrompt.trim()}"
                                    refinePrompt = ""
                                    viewModel.generateEngineProject(combined)
                                },
                            shape = RoundedCornerShape(11.dp),
                            color = if (refinePrompt.isNotBlank()) palette.brand else palette.chipBg
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                if (state.isEngineGenerating) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(14.dp),
                                        strokeWidth = 2.dp,
                                        color = palette.brandOn
                                    )
                                } else {
                                    Icon(
                                        imageVector = LucideIcons.ArrowUp,
                                        contentDescription = "Refine",
                                        tint = if (refinePrompt.isNotBlank()) palette.brandOn else palette.textMuted,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // New Project Creation Studio + Starter Grid + Recent Projects
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item(key = "engine_composer") {
                    IGseekGlassCard(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(22.dp),
                        contentPadding = 16.dp
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(9.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(palette.brandSoft),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = LucideIcons.Code2,
                                    contentDescription = null,
                                    tint = palette.brand,
                                    modifier = Modifier.size(17.dp)
                                )
                            }
                            Column {
                                Text(
                                    text = if (isEn) "Build a mini-app" else "Создать веб-проект",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary
                                )
                                Text(
                                    text = if (isEn) "Generates HTML, CSS & JS with live preview"
                                    else "Собирает HTML, CSS и JS с мгновенным превью",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted
                                )
                            }
                        }

                        Spacer(Modifier.height(12.dp))

                        OutlinedTextField(
                            value = prompt,
                            onValueChange = { prompt = it },
                            placeholder = {
                                Text(
                                    text = if (isEn) "Describe the site, tool, dashboard, or game…"
                                    else "Опишите сайт, калькулятор, дашборд или мини-игру…",
                                    color = palette.textMuted,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            },
                            minLines = 3,
                            maxLines = 6,
                            shape = RoundedCornerShape(16.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = palette.brand,
                                unfocusedBorderColor = palette.glassBorder,
                                focusedContainerColor = palette.bg.copy(alpha = 0.45f),
                                unfocusedContainerColor = palette.bg.copy(alpha = 0.35f),
                                focusedTextColor = palette.textPrimary,
                                unfocusedTextColor = palette.textPrimary,
                                cursorColor = palette.brand
                            ),
                            modifier = Modifier.fillMaxWidth()
                        )

                        Spacer(Modifier.height(12.dp))

                        Button(
                            onClick = {
                                showCreateMode = false
                                studioMode = 0
                                viewModel.generateEngineProject(prompt)
                            },
                            enabled = prompt.isNotBlank() && !state.isEngineGenerating,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = palette.brand,
                                contentColor = palette.brandOn
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                        ) {
                            if (state.isEngineGenerating) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(17.dp),
                                    strokeWidth = 2.dp,
                                    color = palette.brandOn
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(if (isEn) "Building project…" else "Собираем проект…", fontWeight = FontWeight.SemiBold)
                            } else {
                                Icon(LucideIcons.Sparkles, contentDescription = null, modifier = Modifier.size(17.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(if (isEn) "Generate & Preview" else "Собрать и открыть превью", fontWeight = FontWeight.SemiBold)
                            }
                        }

                        if (!state.engineError.isNullOrBlank()) {
                            Spacer(Modifier.height(10.dp))
                            Text(
                                text = state.engineError,
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.danger
                            )
                        }
                    }
                }

                item(key = "engine_starters_header") {
                    IGseekSectionHeader(
                        title = if (isEn) "Starter templates" else "Стартовые шаблоны",
                        trailing = if (isEn) "Live HTML/JS" else "Живое превью"
                    )
                }

                itemsIndexed(starters.chunked(2), key = { idx, _ -> "eng_st_$idx" }) { _, pair ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        pair.forEach { card ->
                            val iconColor = if (palette.isDark) card.tint else palette.brand
                            val iconBg = if (palette.isDark) card.tint.copy(alpha = 0.14f) else palette.chipBg
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(18.dp))
                                    .clickable {
                                        prompt = card.prompt
                                        showCreateMode = false
                                        studioMode = 0
                                        viewModel.generateEngineProject(card.prompt)
                                    },
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
                                            imageVector = card.icon,
                                            contentDescription = null,
                                            tint = iconColor,
                                            modifier = Modifier.size(17.dp)
                                        )
                                    }
                                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                        Text(
                                            text = card.title,
                                            style = MaterialTheme.typography.titleMedium,
                                            color = palette.textPrimary,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = card.subtitle,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = palette.textMuted,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }

                if (state.engineProjects.isNotEmpty()) {
                    item(key = "engine_recent_header") {
                        IGseekSectionHeader(
                            title = if (isEn) "Your projects" else "Ваши проекты",
                            trailing = "${state.engineProjects.size}"
                        )
                    }
                    items(state.engineProjects, key = { "eng_proj_${it.id}" }) { proj ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .clickable {
                                    viewModel.selectEngineProject(proj.id)
                                    showCreateMode = false
                                },
                            shape = RoundedCornerShape(16.dp),
                            color = palette.glassBg,
                            border = BorderStroke(1.dp, palette.glassBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(36.dp)
                                        .clip(RoundedCornerShape(11.dp))
                                        .background(palette.brandSoft),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = LucideIcons.Terminal,
                                        contentDescription = null,
                                        tint = palette.brand,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = proj.title,
                                        style = MaterialTheme.typography.titleMedium,
                                        color = palette.textPrimary,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    val timeStr = formatRelativeTime(proj.updatedAtMs, isEn)
                                    val filesWord = if (isEn) "${proj.files.size} files" else "${proj.files.size} ф."
                                    Text(
                                        text = listOf(filesWord, timeStr).filter { it.isNotBlank() }.joinToString(" · "),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = palette.textMuted
                                    )
                                }
                                Icon(
                                    imageVector = LucideIcons.ChevronRight,
                                    contentDescription = null,
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

    if (showProjectsSheet) {
        ModalBottomSheet(
            onDismissRequest = { showProjectsSheet = false },
            containerColor = palette.sidebarBg,
            contentColor = palette.textPrimary
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = if (isEn) "Engine Projects" else "Проекты Engine",
                        style = MaterialTheme.typography.titleLarge,
                        color = palette.textPrimary
                    )
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .clickable {
                                showProjectsSheet = false
                                showCreateMode = true
                                prompt = ""
                            },
                        shape = RoundedCornerShape(50),
                        color = palette.brandSoft,
                        border = BorderStroke(1.dp, palette.brandBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(LucideIcons.Plus, contentDescription = null, tint = palette.brand, modifier = Modifier.size(14.dp))
                            Text(
                                text = if (isEn) "New" else "Новый",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.brand
                            )
                        }
                    }
                }

                state.engineProjects.forEach { proj ->
                    val selected = proj.id == state.activeEngineProjectId && !showCreateMode
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(15.dp))
                            .clickable {
                                viewModel.selectEngineProject(proj.id)
                                showCreateMode = false
                                showProjectsSheet = false
                            },
                        shape = RoundedCornerShape(15.dp),
                        color = if (selected) palette.brandSoft else palette.glassBg,
                        border = BorderStroke(1.dp, if (selected) palette.brandBorder else palette.glassBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 13.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = proj.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = palette.textPrimary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "${proj.files.size} ${if (isEn) "files" else "файлов"} · ${formatRelativeTime(proj.updatedAtMs, isEn)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = palette.textMuted
                                )
                            }
                            IconButton(
                                onClick = { viewModel.deleteEngineProject(proj.id) },
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
                }
                Spacer(Modifier.height(10.dp))
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun EngineLiveWebView(
    htmlContent: String,
    reloadKey: Int,
    modifier: Modifier = Modifier
) {
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                webViewClient = WebViewClient()
                loadDataWithBaseURL("https://igseek.local/", htmlContent, "text/html", "UTF-8", null)
            }
        },
        update = { webView ->
            val currentTag = "${htmlContent.hashCode()}_$reloadKey"
            if (webView.tag != currentTag) {
                webView.tag = currentTag
                webView.loadDataWithBaseURL("https://igseek.local/", htmlContent, "text/html", "UTF-8", null)
            }
        }
    )
}
