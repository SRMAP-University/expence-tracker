package expo.modules.homewidget

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/**
 * Live Updates: ongoing notifications that Android 16 can promote to a chip in the status bar,
 * which OnePlus phones show in their Live Alerts pill. Each has a key ("today", "ai", ...) and
 * the app decides what each says, so their content can change with an app update. On older
 * Android, or when Live Updates are switched off for the app, they are ordinary quiet notifications.
 */
object LiveUpdates {
  private const val CHANNEL_ID = "live_spending"
  private const val ANDROID_16 = 36
  private const val LIME = 0xFFC6EA9C.toInt()

  private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

  private fun notificationId(key: String) = when (key) {
    "today" -> 7401
    "ai" -> 7402
    else -> 7500 + (key.hashCode() and 0x3FF)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.live_spending_channel),
      // Not MIN: Android only promotes notifications that are allowed to be seen.
      NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
      description = context.getString(R.string.live_spending_channel_description)
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager(context).createNotificationChannel(channel)
  }

  /**
   * Posts or updates one Live Update. `progress` of -1 means no bar. Returns false when Android
   * does not let the app post notifications.
   */
  fun post(context: Context, key: String, title: String, text: String, chip: String, progress: Int, max: Int): Boolean {
    if (Build.VERSION.SDK_INT >= 33 &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    ensureChannel(context)
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID)
      else @Suppress("DEPRECATION") Notification.Builder(context)
    builder
      .setSmallIcon(R.drawable.ic_stat_spend)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_STATUS)
      .setColor(0xFF0B3A33.toInt())
    openApp(context, notificationId(key))?.let { builder.setContentIntent(it) }

    val hasProgress = progress >= 0 && max > 0
    if (Build.VERSION.SDK_INT >= ANDROID_16) {
      if (chip.isNotEmpty()) builder.setShortCriticalText(chip)
      if (hasProgress) {
        // The progress style is what the status bar chip and the expanded Live Update draw.
        builder.setStyle(
          Notification.ProgressStyle()
            .addProgressSegment(Notification.ProgressStyle.Segment(max).setColor(LIME))
            .setProgress(progress.coerceIn(0, max))
        )
      }
      builder.setRequestPromotedOngoing(true)
    } else if (hasProgress) {
      builder.setProgress(max, progress.coerceIn(0, max), false)
    }
    manager(context).notify(notificationId(key), builder.build())
    return true
  }

  fun cancel(context: Context, key: String) {
    manager(context).cancel(notificationId(key))
  }

  /** Whether Android will show them as Live Updates (Android 16+, and not switched off by the user). */
  fun promotionAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT >= ANDROID_16 && manager(context).canPostPromotedNotifications()

  private fun openApp(context: Context, requestCode: Int): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, requestCode, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
