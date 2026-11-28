package app.igseek.mobile.notifications

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.igseek.mobile.MainActivity
import app.igseek.mobile.R
import app.igseek.mobile.data.models.PushNotificationEvent
import java.time.Instant

object IGseekNotificationManager {

    const val CHANNEL_AI_ALERTS = "igseek_ai_alerts"
    const val CHANNEL_WORKSPACE_ALERTS = "igseek_workspace_alerts"

    const val EXTRA_TITLE = "igseek_notif_title"
    const val EXTRA_BODY = "igseek_notif_body"
    const val EXTRA_SOURCE = "igseek_notif_source"
    const val EXTRA_NOTIF_ID = "igseek_notif_id"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        val aiChannel = NotificationChannel(
            CHANNEL_AI_ALERTS,
            "IGseek AI Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Reminders, timers, and push notifications triggered by IGseek AI"
            enableVibration(true)
        }

        val workspaceChannel = NotificationChannel(
            CHANNEL_WORKSPACE_ALERTS,
            "Google Workspace Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for Google Tasks, Calendar events, and Gmail messages"
            enableVibration(true)
        }

        manager.createNotificationChannel(aiChannel)
        manager.createNotificationChannel(workspaceChannel)
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
    }

    fun triggerOrSchedule(context: Context, event: PushNotificationEvent): Boolean {
        ensureChannels(context)
        val now = System.currentTimeMillis()
        var fireAtMs = now

        if (event.delaySeconds > 0) {
            fireAtMs = now + event.delaySeconds * 1000L
        } else if (!event.scheduledAt.isNullOrBlank()) {
            val parsedMs = runCatching { Instant.parse(event.scheduledAt).toEpochMilli() }.getOrNull()
            if (parsedMs != null && parsedMs > now + 1500L) {
                fireAtMs = parsedMs
            }
        }

        return if (fireAtMs - now <= 1500L) {
            showNotification(
                context = context,
                title = event.title,
                body = event.body,
                source = event.source,
                notificationId = event.id.hashCode()
            )
        } else {
            scheduleNotification(
                context = context,
                title = event.title,
                body = event.body,
                source = event.source,
                notificationId = event.id.hashCode(),
                triggerAtMs = fireAtMs
            )
        }
    }

    fun showNotification(
        context: Context,
        title: String,
        body: String,
        source: String = "general",
        notificationId: Int = (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
    ): Boolean {
        ensureChannels(context)
        if (!hasNotificationPermission(context)) return false

        val channelId = when (source.lowercase()) {
            "tasks", "calendar", "gmail" -> CHANNEL_WORKSPACE_ALERTS
            else -> CHANNEL_AI_ALERTS
        }

        val subText = when (source.lowercase()) {
            "tasks" -> "Google Tasks"
            "calendar" -> "Google Calendar"
            "gmail" -> "Gmail"
            else -> "IGseek AI"
        }

        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title.ifBlank { subText })
            .setContentText(body)
            .setSubText(subText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentPendingIntent)

        return runCatching {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
            true
        }.getOrDefault(false)
    }

    fun scheduleNotification(
        context: Context,
        title: String,
        body: String,
        source: String = "general",
        notificationId: Int = (System.currentTimeMillis() and 0x7FFFFFFF).toInt(),
        triggerAtMs: Long
    ): Boolean {
        ensureChannels(context)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return false
        val intent = Intent(context, NotificationAlarmReceiver::class.java).apply {
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_BODY, body)
            putExtra(EXTRA_SOURCE, source)
            putExtra(EXTRA_NOTIF_ID, notificationId)
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent)
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent)
            }
            true
        }.getOrDefault(false)
    }
}
