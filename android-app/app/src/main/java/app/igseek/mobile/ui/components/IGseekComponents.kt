package app.igseek.mobile.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Icon
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Shape
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
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.igseek.mobile.R
import app.igseek.mobile.ui.theme.LocalIGseekPalette

/**
 * Real IGseek curling Fox logo tinted to match the website's `.logo-mark` CSS mask behavior.
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

    Box(
        modifier = modifier.size(if (showGlow) size + 24.dp else size),
        contentAlignment = Alignment.Center
    ) {
        if (showGlow) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                palette.brand.copy(alpha = if (palette.isDark) 0.28f else 0.16f),
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
 * Website-authentic radial glow canvas (`bg-radial-glow`) on warm obsidian dark or alabaster light.
 */
@Composable
fun IGseekCanvas(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    val palette = LocalIGseekPalette.current
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(palette.bg)
            .background(
                brush = Brush.radialGradient(
                    colors = listOf(
                        palette.brandGlow,
                        Color.Transparent
                    ),
                    center = Offset(540f, 120f),
                    radius = 920f
                )
            ),
        content = content
    )
}

/**
 * Website `.glass-card` equivalent with subtle frosted elevation and crisp 1dp border.
 */
@Composable
fun IGseekGlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(18.dp),
    highlighted: Boolean = false,
    contentPadding: Dp = 14.dp,
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
 * Interactive glass chip matching `.glass-chip` on the IGseek website.
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
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) palette.brandSoft else palette.chipBg,
        border = BorderStroke(
            width = 1.dp,
            color = if (selected) palette.brandBorder else palette.chipBorder
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            if (leading != null) leading()
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) palette.brand else palette.textSecondary,
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
 * Clean native Compose Markdown renderer with syntax-framed code blocks and 1-tap copy.
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
                            shape = RoundedCornerShape(14.dp),
                            color = palette.codeBg,
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.09f))
                        ) {
                            Column {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(Color.White.copy(alpha = 0.04f))
                                        .padding(horizontal = 12.dp, vertical = 7.dp),
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
                                            imageVector = if (copied) Icons.Rounded.Check else Icons.Rounded.Share,
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
