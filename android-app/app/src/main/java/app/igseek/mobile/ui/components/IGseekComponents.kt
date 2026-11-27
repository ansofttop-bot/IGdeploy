package app.igseek.mobile.ui.components

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.igseek.mobile.R
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.ui.tabLucideIcon
import app.igseek.mobile.ui.theme.LocalIGseekPalette

/**
 * Opens the native Android Share Sheet for any text payload.
 */
fun sharePlainText(context: Context, title: String, text: String) {
    runCatching {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(intent, title))
    }
}

/**
 * Formats relative timestamps for mobile cards (e.g., "2 ч назад", "just now").
 */
fun formatRelativeTime(timestampMs: Long, isEn: Boolean): String {
    if (timestampMs <= 0L) return ""
    val diffSec = ((System.currentTimeMillis() - timestampMs) / 1000L).coerceAtLeast(0L)
    return when {
        diffSec < 60L -> if (isEn) "just now" else "только что"
        diffSec < 3600L -> {
            val m = diffSec / 60L
            if (isEn) "${m}m ago" else "$m мин"
        }
        diffSec < 86400L -> {
            val h = diffSec / 3600L
            if (isEn) "${h}h ago" else "$h ч"
        }
        diffSec < 86400L * 7L -> {
            val d = diffSec / 86400L
            if (isEn) "${d}d ago" else "$d д"
        }
        else -> {
            val w = diffSec / (86400L * 7L)
            if (isEn) "${w}w ago" else "$w нед"
        }
    }
}

/**
 * Real IGseek curling Fox logo tinted to match the website's `.logo-mark`.
 * Always pure black (#000000) with zero colored halo in Light theme.
 */
@Composable
fun IGseekFoxLogo(
    size: Dp = 32.dp,
    showGlow: Boolean = false,
    tintOverride: Color? = null,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    val tintColor = tintOverride ?: palette.logoTint
    val renderGlow = showGlow && palette.isDark

    Box(
        modifier = modifier.size(if (renderGlow) size + 24.dp else size),
        contentAlignment = Alignment.Center
    ) {
        if (renderGlow) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                tintColor.copy(alpha = 0.24f),
                                Color.Transparent
                            )
                        ),
                        shape = CircleShape
                    )
            )
        }
        Image(
            painter = painterResource(id = R.drawable.ic_igseek_fox),
            contentDescription = "IGseek",
            contentScale = ContentScale.Fit,
            colorFilter = ColorFilter.tint(tintColor),
            modifier = Modifier.size(size)
        )
    }
}

/**
 * Website-authentic IGseek typographic wordmark (`IG` in brand accent + `seek` in primary text).
 */
@Composable
fun IGseekWordmark(
    fontSize: TextUnit = 34.sp,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Text(
        text = buildAnnotatedString {
            withStyle(
                SpanStyle(
                    color = palette.brand,
                    fontWeight = FontWeight.ExtraBold
                )
            ) {
                append("IG")
            }
            withStyle(
                SpanStyle(
                    color = palette.textPrimary,
                    fontWeight = FontWeight.Bold
                )
            ) {
                append("seek")
            }
        },
        style = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontSize = fontSize,
            lineHeight = (fontSize.value + 6f).sp,
            letterSpacing = (-0.8).sp
        ),
        modifier = modifier
    )
}

/**
 * Official 4-color Google "G" mark rendered as native vector for the Google Sign-In pill.
 */
@Composable
fun GoogleGIcon(modifier: Modifier = Modifier.size(18.dp)) {
    val vector = remember {
        ImageVector.Builder(
            name = "GoogleG",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            addPath(
                pathData = PathParser().parsePathString(
                    "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                ).toNodes(),
                fill = SolidColor(Color(0xFF4285F4))
            )
            addPath(
                pathData = PathParser().parsePathString(
                    "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                ).toNodes(),
                fill = SolidColor(Color(0xFF34A853))
            )
            addPath(
                pathData = PathParser().parsePathString(
                    "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                ).toNodes(),
                fill = SolidColor(Color(0xFFFBBC05))
            )
            addPath(
                pathData = PathParser().parsePathString(
                    "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                ).toNodes(),
                fill = SolidColor(Color(0xFFEA4335))
            )
        }.build()
    }
    Image(
        imageVector = vector,
        contentDescription = "Google",
        modifier = modifier
    )
}

/**
 * Refined IGseek background canvas with subtle top ambient illumination in dark mode
 * and crisp editorial surface in light mode.
 */
@Composable
fun IGseekCanvas(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    val palette = LocalIGseekPalette.current
    val baseModifier = if (palette.isDark) {
        modifier
            .fillMaxSize()
            .background(palette.bg)
            .background(
                brush = Brush.verticalGradient(
                    0f to palette.brandGlow,
                    0.32f to Color.Transparent,
                    1f to Color.Transparent
                )
            )
    } else {
        modifier
            .fillMaxSize()
            .background(palette.bg)
    }
    Box(modifier = baseModifier, content = content)
}

/**
 * Unified native mobile top bar across all workspace tabs (44dp+ touch targets, crisp subtitle).
 */
@Composable
fun IGseekTopBar(
    title: String,
    subtitle: String? = null,
    onOpenDrawer: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {}
) {
    val palette = LocalIGseekPalette.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onOpenDrawer,
            modifier = Modifier.size(44.dp)
        ) {
            Icon(
                imageVector = LucideIcons.Menu,
                contentDescription = "Menu",
                tint = palette.textPrimary,
                modifier = Modifier.size(21.dp)
            )
        }
        Spacer(Modifier.width(4.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = palette.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            content = actions
        )
    }
}

/**
 * Tactile segmented control for switching views or filters cleanly without pill clutter.
 */
@Composable
fun IGseekSegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = palette.chipBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            options.forEachIndexed { index, label ->
                val selected = index == selectedIndex
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(11.dp))
                        .clickable { onSelect(index) },
                    shape = RoundedCornerShape(11.dp),
                    color = if (selected) {
                        if (palette.isDark) palette.surfaceElevated else palette.brand
                    } else {
                        Color.Transparent
                    },
                    border = if (selected && palette.isDark) {
                        BorderStroke(1.dp, palette.glassBorder)
                    } else null
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 9.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                            color = when {
                                selected && !palette.isDark -> palette.brandOn
                                selected -> palette.textPrimary
                                else -> palette.textMuted
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

/**
 * Compact tactile search field used across Library, Memory, Saved, and Docs.
 */
@Composable
fun IGseekSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 13.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Icon(
                imageVector = LucideIcons.Search,
                contentDescription = null,
                tint = palette.textMuted,
                modifier = Modifier.size(16.dp)
            )
            Box(modifier = Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = palette.textPrimary),
                    cursorBrush = SolidColor(palette.brand),
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (query.isNotEmpty()) {
                Icon(
                    imageVector = LucideIcons.X,
                    contentDescription = "Clear",
                    tint = palette.textMuted,
                    modifier = Modifier
                        .size(17.dp)
                        .clip(CircleShape)
                        .clickable { onQueryChange("") }
                )
            }
        }
    }
}

/**
 * Editorial natural-case section header with optional right meta text or action.
 */
@Composable
fun IGseekSectionHeader(
    title: String,
    trailing: String? = null,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = palette.textPrimary
        )
        if (!trailing.isNullOrBlank()) {
            Text(
                text = trailing,
                style = MaterialTheme.typography.labelSmall,
                color = palette.textMuted
            )
        }
    }
}

/**
 * Clean minimalist empty state with soft icon container and optional CTA button.
 */
@Composable
fun IGseekEmptyState(
    icon: ImageVector,
    title: String,
    description: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(15.dp))
                    .background(palette.brandSoft),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = palette.brand,
                    modifier = Modifier.size(22.dp)
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = palette.textPrimary,
                textAlign = TextAlign.Center
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center
            )
            if (!actionLabel.isNullOrBlank() && onAction != null) {
                Spacer(Modifier.height(4.dp))
                Button(
                    onClick = onAction,
                    shape = RoundedCornerShape(50),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.brand,
                        contentColor = palette.brandOn
                    )
                ) {
                    Text(actionLabel, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/**
 * Signature mobile floating glass navigation dock for effortless 1-handed workspace switching.
 */
@Composable
fun IGseekFloatingDock(
    tabs: List<IGseekTab>,
    activeTab: IGseekTab,
    lang: String,
    onSelectTab: (IGseekTab) -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    val dockTabs = remember(tabs) {
        val base = if (tabs.size >= 3) tabs.take(4) else listOf(
            IGseekTab.CHAT,
            IGseekTab.FLOW,
            IGseekTab.LIBRARY,
            IGseekTab.ENGINE
        )
        base
    }
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp),
        shape = RoundedCornerShape(24.dp),
        color = if (palette.isDark) Color(0xFF141419).copy(alpha = 0.96f) else Color.White.copy(alpha = 0.97f),
        border = BorderStroke(1.dp, palette.composerBorder),
        shadowElevation = if (palette.isDark) 10.dp else 6.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            dockTabs.forEach { tab ->
                val selected = tab == activeTab
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (selected) palette.brandSoft else Color.Transparent)
                        .clickable { onSelectTab(tab) }
                        .padding(vertical = 7.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Icon(
                        imageVector = tabLucideIcon(tab),
                        contentDescription = tab.label(lang),
                        tint = if (selected) palette.brand else palette.textMuted,
                        modifier = Modifier.size(19.dp)
                    )
                    Text(
                        text = tab.label(lang),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (selected) palette.textPrimary else palette.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Column(
                modifier = Modifier
                    .weight(0.85f)
                    .clip(RoundedCornerShape(18.dp))
                    .clickable(onClick = onOpenMenu)
                    .padding(vertical = 7.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Icon(
                    imageVector = LucideIcons.LayoutGrid,
                    contentDescription = if (lang == "en") "All" else "Ещё",
                    tint = palette.textMuted,
                    modifier = Modifier.size(19.dp)
                )
                Text(
                    text = if (lang == "en") "More" else "Ещё",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    maxLines = 1
                )
            }
        }
    }
}

/**
 * Website `.glass-card` equivalent with clean elevation and crisp 1dp border.
 */
@Composable
fun IGseekGlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(20.dp),
    highlighted: Boolean = false,
    contentPadding: Dp = 15.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = modifier,
        shape = shape,
        color = if (highlighted) palette.brandSoft else palette.glassBg,
        border = BorderStroke(
            width = 1.dp,
            color = if (highlighted) palette.brandBorder else palette.glassBorder
        )
    ) {
        Column(
            modifier = Modifier.padding(contentPadding),
            content = content
        )
    }
}

/**
 * Interactive filter chip matching IGseek website chips.
 */
@Composable
fun IGseekGlassChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null
) {
    val palette = LocalIGseekPalette.current
    val activeBg = if (selected && !palette.isDark) palette.brand else if (selected) palette.brandSoft else palette.chipBg
    val activeBorder = if (selected) palette.brandBorder else palette.chipBorder
    val activeText = when {
        selected && !palette.isDark -> Color.White
        selected -> palette.brand
        else -> palette.textSecondary
    }
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(50),
        color = activeBg,
        border = BorderStroke(width = 1.dp, color = activeBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            if (leading != null) leading()
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = activeText,
                maxLines = 1
            )
        }
    }
}

private sealed class MdBlock {
    data class Paragraph(val text: String) : MdBlock()
    data class Heading(val level: Int, val text: String) : MdBlock()
    data class Code(val language: String, val code: String) : MdBlock()
    data class Quote(val text: String) : MdBlock()
    data class Bullet(val prefix: String, val text: String) : MdBlock()
}

private fun parseMarkdownBlocks(raw: String): List<MdBlock> {
    val lines = raw.replace("\r\n", "\n").split("\n")
    val blocks = mutableListOf<MdBlock>()
    var inCode = false
    var codeLang = ""
    val codeBuf = StringBuilder()
    val paraBuf = StringBuilder()

    fun flushPara() {
        val text = paraBuf.toString().trim()
        if (text.isNotEmpty()) blocks.add(MdBlock.Paragraph(text))
        paraBuf.clear()
    }

    for (line in lines) {
        val trimmed = line.trim()
        if (trimmed.startsWith("```")) {
            if (!inCode) {
                flushPara()
                inCode = true
                codeLang = trimmed.removePrefix("```").trim()
                codeBuf.clear()
            } else {
                blocks.add(MdBlock.Code(codeLang, codeBuf.toString().trimEnd()))
                inCode = false
                codeLang = ""
                codeBuf.clear()
            }
            continue
        }
        if (inCode) {
            codeBuf.append(line).append("\n")
            continue
        }
        when {
            trimmed.isEmpty() -> flushPara()
            trimmed.startsWith("### ") -> {
                flushPara()
                blocks.add(MdBlock.Heading(3, trimmed.removePrefix("### ").trim()))
            }
            trimmed.startsWith("## ") -> {
                flushPara()
                blocks.add(MdBlock.Heading(2, trimmed.removePrefix("## ").trim()))
            }
            trimmed.startsWith("# ") -> {
                flushPara()
                blocks.add(MdBlock.Heading(1, trimmed.removePrefix("# ").trim()))
            }
            trimmed.startsWith("> ") -> {
                flushPara()
                blocks.add(MdBlock.Quote(trimmed.removePrefix("> ").trim()))
            }
            trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                flushPara()
                blocks.add(MdBlock.Bullet("•", trimmed.drop(2).trim()))
            }
            Regex("^\\d+\\.\\s+.*").matches(trimmed) -> {
                flushPara()
                val num = trimmed.substringBefore(".") + "."
                val rest = trimmed.substringAfter(". ").trim()
                blocks.add(MdBlock.Bullet(num, rest))
            }
            else -> {
                if (paraBuf.isNotEmpty()) paraBuf.append("\n")
                paraBuf.append(line)
            }
        }
    }
    if (inCode && codeBuf.isNotEmpty()) {
        blocks.add(MdBlock.Code(codeLang, codeBuf.toString().trimEnd()))
    }
    flushPara()
    return blocks
}

private fun formatInlineMarkdown(text: String, codeBg: Color, accentColor: Color): AnnotatedString {
    return buildAnnotatedString {
        var i = 0
        val n = text.length
        while (i < n) {
            when {
                i + 1 < n && text[i] == '*' && text[i + 1] == '*' -> {
                    val end = text.indexOf("**", i + 2)
                    if (end > i + 2) {
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                            append(text.substring(i + 2, end))
                        }
                        i = end + 2
                    } else {
                        append("**")
                        i += 2
                    }
                }
                text[i] == '`' -> {
                    val end = text.indexOf('`', i + 1)
                    if (end > i + 1) {
                        withStyle(
                            SpanStyle(
                                fontFamily = FontFamily.Monospace,
                                background = codeBg,
                                color = accentColor,
                                fontSize = 13.sp
                            )
                        ) {
                            append(" ${text.substring(i + 1, end)} ")
                        }
                        i = end + 1
                    } else {
                        append('`')
                        i += 1
                    }
                }
                text[i] == '*' && (i == 0 || text[i - 1] == ' ') -> {
                    val end = text.indexOf('*', i + 1)
                    if (end > i + 1 && !text.substring(i + 1, end).contains('\n')) {
                        withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                            append(text.substring(i + 1, end))
                        }
                        i = end + 1
                    } else {
                        append('*')
                        i += 1
                    }
                }
                else -> {
                    append(text[i])
                    i += 1
                }
            }
        }
    }
}

/**
 * Native Compose Markdown renderer with Lucide Copy icon and syntax-framed code cards.
 */
@Composable
fun IGseekMarkdownText(
    markdown: String,
    modifier: Modifier = Modifier,
    textColor: Color = LocalIGseekPalette.current.textPrimary
) {
    val palette = LocalIGseekPalette.current
    val clipboard = LocalClipboardManager.current
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }
    val inlineCodeBg = if (palette.isDark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)

    SelectionContainer {
        Column(
            modifier = modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            blocks.forEach { block ->
                when (block) {
                    is MdBlock.Heading -> {
                        val size = when (block.level) {
                            1 -> 19.sp
                            2 -> 17.sp
                            else -> 15.sp
                        }
                        Text(
                            text = formatInlineMarkdown(block.text, inlineCodeBg, palette.brand),
                            style = TextStyle(
                                fontFamily = FontFamily.SansSerif,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = size,
                                lineHeight = (size.value + 6).sp,
                                color = textColor
                            )
                        )
                    }

                    is MdBlock.Paragraph -> {
                        Text(
                            text = formatInlineMarkdown(block.text, inlineCodeBg, palette.brand),
                            style = MaterialTheme.typography.bodyLarge.copy(color = textColor)
                        )
                    }

                    is MdBlock.Bullet -> {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(start = 4.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Text(
                                text = block.prefix,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    color = palette.brand,
                                    fontWeight = FontWeight.SemiBold
                                ),
                                modifier = Modifier.width(22.dp)
                            )
                            Text(
                                text = formatInlineMarkdown(block.text, inlineCodeBg, palette.brand),
                                style = MaterialTheme.typography.bodyLarge.copy(color = textColor),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    is MdBlock.Quote -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(palette.chipBg)
                                .padding(horizontal = 10.dp, vertical = 8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(3.dp)
                                    .height(20.dp)
                                    .background(palette.brand, RoundedCornerShape(2.dp))
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = formatInlineMarkdown(block.text, inlineCodeBg, palette.brand),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    color = palette.textSecondary,
                                    fontStyle = FontStyle.Italic
                                )
                            )
                        }
                    }

                    is MdBlock.Code -> {
                        var copied by remember(block.code) { mutableStateOf(false) }
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            color = palette.codeBg,
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.09f))
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
                                    Text(
                                        text = block.language.ifBlank { "code" }.lowercase(),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color(0xFFA1A1AA)
                                    )
                                    Row(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .clickable {
                                                clipboard.setText(AnnotatedString(block.code))
                                                copied = true
                                            }
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            imageVector = if (copied) LucideIcons.Check else LucideIcons.Copy,
                                            contentDescription = "Copy",
                                            tint = if (copied) Color(0xFF10B981) else Color(0xFFA1A1AA),
                                            modifier = Modifier.size(13.dp)
                                        )
                                        Text(
                                            text = if (copied) "Скопировано" else "Копировать",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (copied) Color(0xFF10B981) else Color(0xFFD4D4D8)
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
                                        text = block.code,
                                        style = TextStyle(
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = FontWeight.Normal,
                                            fontSize = 12.5.sp,
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
}
