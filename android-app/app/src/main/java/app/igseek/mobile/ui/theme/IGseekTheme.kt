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
    val userBubbleText: Color,
    val userBubbleBorder: Color,
    val codeBg: Color,
    val logoTint: Color,
    val divider: Color,
    val danger: Color = Color(0xFFEF4444),
    val success: Color = Color(0xFF10B981),
    val warning: Color = Color(0xFFF59E0B),
    val canvas: Color = bg
)

val LocalIGseekPalette = staticCompositionLocalOf {
    buildIGseekPalette(darkTheme = false, accent = AccentPresetId.DEFAULT)
}

/**
 * Accent color for dark theme presets (exact IGseek website hex palette).
 * In light theme, IGseek Android ALWAYS uses pure black (#000000).
 */
fun accentSwatchColor(accent: AccentPresetId, darkTheme: Boolean = true): Color {
    if (!darkTheme) return Color(0xFF000000)
    return when (accent) {
        AccentPresetId.DEFAULT -> Color(0xFFEF4444)
        AccentPresetId.RED -> Color(0xFFEF4444)
        AccentPresetId.ORANGE -> Color(0xFFF97316)
        AccentPresetId.BLACK -> Color(0xFFE4E4E7)
        AccentPresetId.EMERALD -> Color(0xFF10B981)
        AccentPresetId.BLUE -> Color(0xFF3B82F6)
        AccentPresetId.PURPLE -> Color(0xFF8B5CF6)
        AccentPresetId.PINK -> Color(0xFFEC4899)
        AccentPresetId.AMBER -> Color(0xFFF59E0B)
    }
}

fun buildIGseekPalette(darkTheme: Boolean, accent: AccentPresetId): IGseekPalette {
    if (!darkTheme) {
        // Light theme: ALWAYS pure black (#000000) accent — stored dark accent is preserved separately
        val pureBlack = Color(0xFF000000)
        return IGseekPalette(
            isDark = false,
            bg = Color(0xFFF8F8FA),
            sidebarBg = Color(0xFFF3F3F6),
            surfaceElevated = Color(0xFFFFFFFF),
            glassBg = Color(0xFFFFFFFF),
            glassBorder = Color(0xFF09090B).copy(alpha = 0.085f),
            composerBg = Color(0xFFFFFFFF),
            composerBorder = Color(0xFF09090B).copy(alpha = 0.13f),
            chipBg = Color(0xFF09090B).copy(alpha = 0.045f),
            chipBorder = Color(0xFF09090B).copy(alpha = 0.10f),
            textPrimary = Color(0xFF09090B),
            textSecondary = Color(0xFF3F3F46),
            textMuted = Color(0xFF71717A),
            brand = pureBlack,
            brandOn = Color.White,
            brandSoft = pureBlack.copy(alpha = 0.065f),
            brandBorder = pureBlack.copy(alpha = 0.16f),
            brandGlow = Color.Transparent,
            userBubbleBg = pureBlack,
            userBubbleText = Color.White,
            userBubbleBorder = pureBlack,
            codeBg = Color(0xFF111114),
            logoTint = pureBlack,
            divider = Color(0xFF09090B).copy(alpha = 0.075f),
            danger = Color(0xFFDC2626),
            success = Color(0xFF059669),
            warning = Color(0xFFD97706)
        )
    }

    val brand = accentSwatchColor(accent, darkTheme = true)
    val brandOn = if (accent == AccentPresetId.BLACK) Color(0xFF09090B) else Color.White
    val logoTint = if (accent == AccentPresetId.BLACK) Color(0xFFF4F4F5) else brand

    return IGseekPalette(
        isDark = true,
        bg = Color(0xFF09090B),
        sidebarBg = Color(0xFF0E0E11),
        surfaceElevated = Color(0xFF17171C),
        glassBg = Color(0xFF131317).copy(alpha = 0.92f),
        glassBorder = Color.White.copy(alpha = 0.085f),
        composerBg = Color(0xFF15151A).copy(alpha = 0.96f),
        composerBorder = Color.White.copy(alpha = 0.11f),
        chipBg = Color.White.copy(alpha = 0.055f),
        chipBorder = Color.White.copy(alpha = 0.095f),
        textPrimary = Color(0xFFF4F4F6),
        textSecondary = Color(0xFFC8C8D0),
        textMuted = Color(0xFF8A8A96),
        brand = brand,
        brandOn = brandOn,
        brandSoft = brand.copy(alpha = 0.14f),
        brandBorder = brand.copy(alpha = 0.34f),
        brandGlow = brand.copy(alpha = 0.11f),
        userBubbleBg = brand.copy(alpha = 0.17f),
        userBubbleText = Color(0xFFF4F4F6),
        userBubbleBorder = brand.copy(alpha = 0.32f),
        codeBg = Color(0xFF0B0B0E),
        logoTint = logoTint,
        divider = Color.White.copy(alpha = 0.075f),
        danger = Color(0xFFEF4444),
        success = Color(0xFF10B981),
        warning = Color(0xFFF59E0B)
    )
}

private val IGseekTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.5).sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp,
        lineHeight = 25.sp,
        letterSpacing = (-0.3).sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.5.sp,
        lineHeight = 21.sp,
        letterSpacing = (-0.15).sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.5.sp
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
        fontSize = 12.5.sp,
        lineHeight = 17.5.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.5.sp,
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
