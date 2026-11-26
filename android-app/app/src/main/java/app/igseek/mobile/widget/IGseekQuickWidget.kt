package app.igseek.mobile.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import app.igseek.mobile.MainActivity
import app.igseek.mobile.R

class IGseekQuickWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (widgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_igseek_quick)
            views.setOnClickPendingIntent(R.id.widget_btn_chat, buildLaunchIntent(context, "chat", 101))
            views.setOnClickPendingIntent(R.id.widget_btn_flow, buildLaunchIntent(context, "flow", 102))
            views.setOnClickPendingIntent(R.id.widget_btn_library, buildLaunchIntent(context, "library", 103))
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    private fun buildLaunchIntent(context: Context, targetTab: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_START_TAB, targetTab)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val EXTRA_START_TAB = "igseek_start_tab"
    }
}
