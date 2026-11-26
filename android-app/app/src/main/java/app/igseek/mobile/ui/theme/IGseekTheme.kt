package app.igseek.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.igseek.mobile.data.models.AccentPresetId

data class AccentColors(
    val darkPrimary: Color,
    val lightPrimary: Color,
    val darkBubble: Color,
    val swatch: Color
)

fun accentPaletteFor(id: AccentPresetId): AccentColors = when (id) {
    AccentPresetId.DEFAULT -> AccentColors(Color(0xFFEF4444), Color(0xFF18181B), Color(0xFF3A131A), Color(0xFFEF4444))
    AccentPresetId.RED -> AccentColors(Color(0xFFEF4444), Color(0xFFDC2626), Color(0xFF3A131A), Color(0xFFEF4444))
    AccentPresetId.ORANGE -> AccentColors(Color(0xFFF97316), Color(0xFFEA580C), Color(0xFF3D2011), Color(0xFFF97316))
    AccentPresetId.BLACK -> AccentColors(Color(0xFFA1A1AA), Color(0xFF18181B), Color(0xFF27272A), Color(0xFF18181B))
    AccentPresetId.EMERALD -> AccentColors(Color(0xFF10B981), Color(0xFF059669), Color(0xFF0D3424), Color(0xFF10B981))
    AccentPresetId.BLUE -> AccentColors(Color(0xFF3B82F6), Color(0xFF2563EB), Color(0xFF112749), Color(0xFF3B82F6))
    AccentPresetId.PURPLE -> AccentColors(Color(0xFF8B5CF6), Color(0xFF7C3AED), Color(0xFF291642), Color(0xFF8B5CF6))
    AccentPresetId.PINK -> AccentColors(Color(0xFFEC4899), Color(0xFFDB2777), Color(0xFF421229), Color(0xFFEC4899))
    AccentPresetId.AMBER -> AccentColors(Color(0xFFF59E0B), Color(0xFFD97706), Color(0xFF3D2608), Color(0xFFF59E0B))
}

private val IGseekTypography = Typography(
    headlineSmall = TextStyle(FontFamily.SansSerif, FontWeight.SemiBold, 22.sp, lineHeight = 28.sp, letterSpacing = (-0.3).sp),
    titleMedium = TextStyle(FontFamily.SansSerif, FontWeight.SemiBold, 16.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(FontFamily.SansSerif, FontWeight.Normal, 14.5.sp, lineHeight = 21.sp),
    labelMedium = TextStyle(FontFamily.SansSerif, FontWeight.Medium, 12.sp, lineHeight = 16.sp)
)

@Composable
fun IGseekTheme(
    darkTheme: Boolean,
    accent: AccentPresetId,
    content: @Composable () -> Unit
) {
    val palette = accentPaletteFor(accent)
    val scheme = if (darkTheme) {
        darkColorScheme(
            primary = palette.darkPrimary,
            onPrimary = Color.White,
            primaryContainer = palette.darkBubble,
            onPrimaryContainer = Color(0xFFFAFAFA),
            secondary = Color(0xFF27272A),
            onSecondary = Color(0xFFE4E4E7),
            background = Color(0xFF09090B),
            onBackground = Color(0xFFFAFAFA),
            surface = Color(0xFF111114),
            onSurface = Color(0xFFFAFAFA),
            surfaceVariant = Color(0xFF18181B),
            onSurfaceVariant = Color(0xFFA1A1AA),
            outline = Color(0xFF27272A),
            error = Color(0xFFF87171)
        )
    } else {
        lightColorScheme(
            primary = palette.lightPrimary,
            onPrimary = Color.White,
            primaryContainer = palette.lightPrimary.copy(alpha = 0.12f),
            onPrimaryContainer = Color(0xFF18181B),
            secondary = Color(0xFFF4F4F5),
            onSecondary = Color(0xFF18181B),
            background = Color(0xFFFAFAFA),
            onBackground = Color(0xFF09090B),
            surface = Color(0xFFFFFFFF),
            onSurface = Color(0xFF09090B),
            surfaceVariant = Color(0xFFF4F4F5),
            onSurfaceVariant = Color(0xFF52525B),
            outline = Color(0xFFE4E4E7),
            error = Color(0xFFDC2626)
        )
    }
    MaterialTheme(colorScheme = scheme, typography = IGseekTypography, content = content)
}
