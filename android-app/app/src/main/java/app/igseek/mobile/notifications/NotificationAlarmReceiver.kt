package app.igseek.mobile.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NotificationAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra(IGseekNotificationManager.EXTRA_TITLE).orEmpty()
        val body = intent.getStringExtra(IGseekNotificationManager.EXTRA_BODY).orEmpty()
        val source = intent.getStringExtra(IGseekNotificationManager.EXTRA_SOURCE).orEmpty().ifBlank { "general" }
        val notifId = intent.getIntExtra(
            IGseekNotificationManager.EXTRA_NOTIF_ID,
            (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
        )
        if (title.isNotBlank() || body.isNotBlank()) {
            IGseekNotificationManager.showNotification(
                context = context,
                title = title,
                body = body,
                source = source,
                notificationId = notifId
            )
        }
    }
}
