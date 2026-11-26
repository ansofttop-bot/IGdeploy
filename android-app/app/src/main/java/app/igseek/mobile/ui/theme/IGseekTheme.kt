package app.igseek.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.igseek.mobile.data.models.AccentPresetId

@Immutable
data class IGseekPalette(
    val isDark: Boolean,
    val bg: Color,
    val sidebarBg: Color,
    val surfaceElevated: Color,
    val glassBg: Color,
    val glassBorder: Color,
    val composerBg: Color,
    val composerBorder: Color,
    val chipBg: Color,
    val chipBorder: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val brand: Color,
    val brandOn: Color,
    val brandSoft: Color,
    val brandBorder: Color,
    val brandGlow: Color,
    val userBubbleBg: Color,
    val userBubbleBorder: Color,
    val codeBg: Color,
    val logoTint: Color,
    val divider: Color
)

val LocalIGseekPalette = staticCompositionLocalOf {
    buildIGseekPalette(darkTheme = true, accent = AccentPresetId.DEFAULT)
}

fun accentSwatchColor(accent: AccentPresetId, darkTheme: Boolean = true): Color = when (accent) {
    AccentPresetId.DEFAULT -> if (darkTheme) Color(0xFFE61919) else Color(0xFFDC2626)
    AccentPresetId.RED -> if (darkTheme) Color(0xFFEF4444) else Color(0xFFDC2626)
    AccentPresetId.ORANGE -> if (darkTheme) Color(0xFFF97316) else Color(0xFFEA580C)
    AccentPresetId.BLACK -> if (darkTheme) Color(0xFFE4E4E7) else Color(0xFF18181B)
    AccentPresetId.EMERALD -> if (darkTheme) Color(0xFF10B981) else Color(0xFF059669)
    AccentPresetId.BLUE -> if (darkTheme) Color(0xFF3B82F6) else Color(0xFF2563EB)
    AccentPresetId.PURPLE -> if (darkTheme) Color(0xFFA855F7) else Color(0xFF9333EA)
    AccentPresetId.PINK -> if (darkTheme) Color(0xFFEC4899) else Color(0xFFDB2777)
    AccentPresetId.AMBER -> if (darkTheme) Color(0xFFF59E0B) else Color(0xFFD97706)
}

fun buildIGseekPalette(darkTheme: Boolean, accent: AccentPresetId): IGseekPalette {
    val brand = accentSwatchColor(accent, darkTheme)
    val brandOn = if (darkTheme && accent == AccentPresetId.BLACK) Color(0xFF0C0B0B) else Color.White
    val logoTint = when {
        accent == AccentPresetId.BLACK && darkTheme -> Color(0xFFF4F4F5)
        accent == AccentPresetId.BLACK && !darkTheme -> Color(0xFF18181B)
        else -> brand
    }

    return if (darkTheme) {
        IGseekPalette(
            isDark = true,
            bg = Color(0xFF0C0B0B),
            sidebarBg = Color(0xFF111010),
            surfaceElevated = Color(0xFF171515),
            glassBg = Color(0xFF161414).copy(alpha = 0.78f),
            glassBorder = Color.White.copy(alpha = 0.08f),
            composerBg = Color(0xFF161414).copy(alpha = 0.92f),
            composerBorder = Color.White.copy(alpha = 0.11f),
            chipBg = Color.White.copy(alpha = 0.045f),
            chipBorder = Color.White.copy(alpha = 0.09f),
            textPrimary = Color(0xFFF3F2F2),
            textSecondary = Color(0xFFC4BFBF),
            textMuted = Color(0xFF8C8787),
            brand = brand,
            brandOn = brandOn,
            brandSoft = brand.copy(alpha = 0.14f),
            brandBorder = brand.copy(alpha = 0.36f),
            brandGlow = brand.copy(alpha = 0.16f),
            userBubbleBg = brand.copy(alpha = 0.16f),
            userBubbleBorder = brand.copy(alpha = 0.30f),
            codeBg = Color(0xFF0A0909),
            logoTint = logoTint,
            divider = Color.White.copy(alpha = 0.07f)
        )
    } else {
        IGseekPalette(
            isDark = false,
            bg = Color(0xFFFCFBFA),
            sidebarBg = Color(0xFFF5F3F2),
            surfaceElevated = Color(0xFFFFFFFF),
            glassBg = Color.White.copy(alpha = 0.88f),
            glassBorder = Color.Black.copy(alpha = 0.08f),
            composerBg = Color.White.copy(alpha = 0.96f),
            composerBorder = Color.Black.copy(alpha = 0.11f),
            chipBg = Color.Black.copy(alpha = 0.04f),
            chipBorder = Color.Black.copy(alpha = 0.09f),
            textPrimary = Color(0xFF161515),
            textSecondary = Color(0xFF474343),
            textMuted = Color(0xFF7A7575),
            brand = brand,
            brandOn = brandOn,
            brandSoft = brand.copy(alpha = 0.10f),
            brandBorder = brand.copy(alpha = 0.28f),
            brandGlow = brand.copy(alpha = 0.09f),
            userBubbleBg = brand.copy(alpha = 0.11f),
            userBubbleBorder = brand.copy(alpha = 0.24f),
            codeBg = Color(0xFF161414),
            logoTint = logoTint,
            divider = Color.Black.copy(alpha = 0.07f)
        )
    }
}

private val IGseekTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.4).sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp,
        lineHeight = 25.sp,
        letterSpacing = (-0.25).sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        letterSpacing = (-0.1).sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 17.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp
    )
)

@Composable
fun IGseekTheme(
    darkTheme: Boolean,
    accent: AccentPresetId,
    content: @Composable () -> Unit
) {
    val palette = buildIGseekPalette(darkTheme = darkTheme, accent = accent)

    val colors = if (darkTheme) {
        darkColorScheme(
            primary = palette.brand,
            onPrimary = palette.brandOn,
            primaryContainer = palette.brandSoft,
            onPrimaryContainer = palette.textPrimary,
            secondary = palette.brand,
            onSecondary = palette.brandOn,
            background = palette.bg,
            onBackground = palette.textPrimary,
            surface = palette.sidebarBg,
            onSurface = palette.textPrimary,
            surfaceVariant = palette.surfaceElevated,
            onSurfaceVariant = palette.textMuted,
            outline = palette.glassBorder,
            error = Color(0xFFF87171),
            onError = Color.White
        )
    } else {
        lightColorScheme(
            primary = palette.brand,
            onPrimary = palette.brandOn,
            primaryContainer = palette.brandSoft,
            onPrimaryContainer = palette.textPrimary,
            secondary = palette.brand,
            onSecondary = palette.brandOn,
            background = palette.bg,
            onBackground = palette.textPrimary,
            surface = palette.sidebarBg,
            onSurface = palette.textPrimary,
            surfaceVariant = palette.surfaceElevated,
            onSurfaceVariant = palette.textMuted,
            outline = palette.glassBorder,
            error = Color(0xFFDC2626),
            onError = Color.White
        )
    }

    CompositionLocalProvider(LocalIGseekPalette provides palette) {
        MaterialTheme(
            colorScheme = colors,
            typography = IGseekTypography,
            content = content
        )
    }
}
