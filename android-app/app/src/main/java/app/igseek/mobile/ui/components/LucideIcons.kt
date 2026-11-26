package app.igseek.mobile.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/**
 * Official Lucide icon set matching the IGseek web application (lucide-react).
 * Rendered natively in Compose as crisp 24dp 1.85px stroke vectors.
 */
object LucideIcons {

    private fun lucide(
        name: String,
        paths: List<String>,
        filledPaths: List<String> = emptyList(),
        strokeWidth: Float = 1.85f
    ): ImageVector {
        val builder = ImageVector.Builder(
            name = "Lucide.$name",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        )
        for (d in paths) {
            builder.addPath(
                pathData = PathParser().parsePathString(d).toNodes(),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = strokeWidth,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            )
        }
        for (d in filledPaths) {
            builder.addPath(
                pathData = PathParser().parsePathString(d).toNodes(),
                fill = SolidColor(Color.Black)
            )
        }
        return builder.build()
    }

    val BookmarkFilled: ImageVector by lazy {
        ImageVector.Builder(
            name = "Lucide.BookmarkFilled",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            addPath(
                pathData = PathParser().parsePathString("M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z").toNodes(),
                fill = SolidColor(Color.Black),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.85f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            )
        }.build()
    }

    val MessageSquare: ImageVector by lazy {
        lucide(
            name = "MessageSquare",
            paths = listOf("M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z")
        )
    }

    val Workflow: ImageVector by lazy {
        lucide(
            name = "Workflow",
            paths = listOf("M5 3h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z", "M7 11v4a2 2 0 0 0 2 2h4", "M15 13h4a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z")
        )
    }

    val Library: ImageVector by lazy {
        lucide(
            name = "Library",
            paths = listOf("m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16")
        )
    }

    val Bookmark: ImageVector by lazy {
        lucide(
            name = "Bookmark",
            paths = listOf("m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z")
        )
    }

    val Code2: ImageVector by lazy {
        lucide(
            name = "Code2",
            paths = listOf("m18 16 4-4-4-4", "m6 8-4 4 4 4", "m14.5 4-5 16")
        )
    }

    val AudioLines: ImageVector by lazy {
        lucide(
            name = "AudioLines",
            paths = listOf("M2 10v3", "M6 6v11", "M10 3v18", "M14 8v7", "M18 5v13", "M22 10v3")
        )
    }

    val FileCode: ImageVector by lazy {
        lucide(
            name = "FileCode",
            paths = listOf("M10 12.5 8 15l2 2.5", "m14 12.5 2 2.5-2 2.5", "M14 2v4a2 2 0 0 0 2 2h4", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z")
        )
    }

    val Brain: ImageVector by lazy {
        lucide(
            name = "Brain",
            paths = listOf("M12 18V5", "M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4", "M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5", "M17.997 5.125a4 4 0 0 1 2.526 5.77", "M18 18a4 4 0 0 0 2-7.464", "M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517", "M6 18a4 4 0 0 1-2-7.464", "M6.003 5.125a4 4 0 0 0-2.526 5.77")
        )
    }

    val Settings: ImageVector by lazy {
        lucide(
            name = "Settings",
            paths = listOf("M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0")
        )
    }

    val Crown: ImageVector by lazy {
        lucide(
            name = "Crown",
            paths = listOf("M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z", "M5 21h14")
        )
    }

    val Plus: ImageVector by lazy {
        lucide(
            name = "Plus",
            paths = listOf("M5 12h14", "M12 5v14")
        )
    }

    val Search: ImageVector by lazy {
        lucide(
            name = "Search",
            paths = listOf("m21 21-4.34-4.34", "M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0")
        )
    }

    val Globe: ImageVector by lazy {
        lucide(
            name = "Globe",
            paths = listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20")
        )
    }

    val Sparkles: ImageVector by lazy {
        lucide(
            name = "Sparkles",
            paths = listOf("M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z", "M20 2v4", "M22 4h-4", "M2 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0")
        )
    }

    val Image: ImageVector by lazy {
        lucide(
            name = "Image",
            paths = listOf("M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2Z", "M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21")
        )
    }

    val Paperclip: ImageVector by lazy {
        lucide(
            name = "Paperclip",
            paths = listOf("m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551")
        )
    }

    val Mic: ImageVector by lazy {
        lucide(
            name = "Mic",
            paths = listOf("M12 19v3", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 2h0a3 3 0 0 1 3 3v7a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3v-7a3 3 0 0 1 3 -3Z")
        )
    }

    val ArrowUp: ImageVector by lazy {
        lucide(
            name = "ArrowUp",
            paths = listOf("m5 12 7-7 7 7", "M12 19V5")
        )
    }

    val Menu: ImageVector by lazy {
        lucide(
            name = "Menu",
            paths = listOf("M4 5h16", "M4 12h16", "M4 19h16")
        )
    }

    val X: ImageVector by lazy {
        lucide(
            name = "X",
            paths = listOf("M18 6 6 18", "m6 6 12 12")
        )
    }

    val ChevronDown: ImageVector by lazy {
        lucide(
            name = "ChevronDown",
            paths = listOf("m6 9 6 6 6-6")
        )
    }

    val ChevronRight: ImageVector by lazy {
        lucide(
            name = "ChevronRight",
            paths = listOf("m9 18 6-6-6-6")
        )
    }

    val ChevronUp: ImageVector by lazy {
        lucide(
            name = "ChevronUp",
            paths = listOf("m18 15-6-6-6 6")
        )
    }

    val RefreshCw: ImageVector by lazy {
        lucide(
            name = "RefreshCw",
            paths = listOf("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5")
        )
    }

    val Trash2: ImageVector by lazy {
        lucide(
            name = "Trash2",
            paths = listOf("M10 11v6", "M14 11v6", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")
        )
    }

    val Copy: ImageVector by lazy {
        lucide(
            name = "Copy",
            paths = listOf("M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2")
        )
    }

    val Share2: ImageVector by lazy {
        lucide(
            name = "Share2",
            paths = listOf("M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M15 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M8.59 13.51L15.42 17.49", "M15.41 6.51L8.59 10.49")
        )
    }

    val Check: ImageVector by lazy {
        lucide(
            name = "Check",
            paths = listOf("M20 6 9 17l-5-5")
        )
    }

    val Sun: ImageVector by lazy {
        lucide(
            name = "Sun",
            paths = listOf("M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41")
        )
    }

    val Moon: ImageVector by lazy {
        lucide(
            name = "Moon",
            paths = listOf("M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401")
        )
    }

    val Languages: ImageVector by lazy {
        lucide(
            name = "Languages",
            paths = listOf("m5 8 6 6", "m4 14 6-6 2-3", "M2 5h12", "M7 2h1", "m22 22-5-10-5 10", "M14 18h6")
        )
    }

    val LogOut: ImageVector by lazy {
        lucide(
            name = "LogOut",
            paths = listOf("m16 17 5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4")
        )
    }

    val Mail: ImageVector by lazy {
        lucide(
            name = "Mail",
            paths = listOf("m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7", "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2Z")
        )
    }

    val Lock: ImageVector by lazy {
        lucide(
            name = "Lock",
            paths = listOf("M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2Z", "M7 11V7a5 5 0 0 1 10 0v4")
        )
    }

    val Eye: ImageVector by lazy {
        lucide(
            name = "Eye",
            paths = listOf("M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0")
        )
    }

    val EyeOff: ImageVector by lazy {
        lucide(
            name = "EyeOff",
            paths = listOf("M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49", "M14.084 14.158a3 3 0 0 1-4.242-4.242", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143", "m2 2 20 20")
        )
    }

    val Play: ImageVector by lazy {
        lucide(
            name = "Play",
            paths = listOf("M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z")
        )
    }

    val Folder: ImageVector by lazy {
        lucide(
            name = "Folder",
            paths = listOf("M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z")
        )
    }

    val ArrowLeft: ImageVector by lazy {
        lucide(
            name = "ArrowLeft",
            paths = listOf("m12 19-7-7 7-7", "M19 12H5")
        )
    }

    val Palette: ImageVector by lazy {
        lucide(
            name = "Palette",
            paths = listOf("M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"),
            filledPaths = listOf("M13 6.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M17 10.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M6 12.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0", "M8 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0")
        )
    }

    val Shield: ImageVector by lazy {
        lucide(
            name = "Shield",
            paths = listOf("M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z")
        )
    }

    val CheckCircle: ImageVector by lazy {
        lucide(
            name = "CheckCircle",
            paths = listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "m9 12 2 2 4-4")
        )
    }

    val AlertCircle: ImageVector by lazy {
        lucide(
            name = "AlertCircle",
            paths = listOf("M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 8L12 12", "M12 16L12.01 16")
        )
    }

    val TrendingUp: ImageVector by lazy {
        lucide(
            name = "TrendingUp",
            paths = listOf("M16 7h6v6", "m22 7-8.5 8.5-5-5L2 17")
        )
    }

    val Users: ImageVector by lazy {
        lucide(
            name = "Users",
            paths = listOf("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87", "M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0")
        )
    }

    val Hash: ImageVector by lazy {
        lucide(
            name = "Hash",
            paths = listOf("M4 9L20 9", "M4 15L20 15", "M10 3L8 21", "M16 3L14 21")
        )
    }

    val Compass: ImageVector by lazy {
        lucide(
            name = "Compass",
            paths = listOf("m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0")
        )
    }

    val CreditCard: ImageVector by lazy {
        lucide(
            name = "CreditCard",
            paths = listOf("M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2Z", "M2 10L22 10")
        )
    }

    val ExternalLink: ImageVector by lazy {
        lucide(
            name = "ExternalLink",
            paths = listOf("M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")
        )
    }

    val SquarePen: ImageVector by lazy {
        lucide(
            name = "SquarePen",
            paths = listOf("M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z")
        )
    }

    val User: ImageVector by lazy {
        lucide(
            name = "User",
            paths = listOf("M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0")
        )
    }

    val SlidersHorizontal: ImageVector by lazy {
        lucide(
            name = "SlidersHorizontal",
            paths = listOf("M10 5H3", "M12 19H3", "M14 3v4", "M16 17v4", "M21 12h-9", "M21 19h-5", "M21 5h-7", "M8 10v4", "M8 12H3")
        )
    }
}
