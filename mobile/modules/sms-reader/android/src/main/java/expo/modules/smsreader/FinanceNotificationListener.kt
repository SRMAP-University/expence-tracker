package expo.modules.smsreader

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification the phone posts (once the user grants "Notification access"),
 * and keeps only those from apps the user chose to watch. Everything else is dropped on the
 * spot, before any of its content is read or stored.
 */
class FinanceNotificationListener : NotificationListenerService() {

  override fun onListenerConnected() {
    instance = this
    // Pick up what is already showing, e.g. alerts that arrived before access was granted.
    if (captureActive() > 0) onCaptured?.invoke()
  }

  override fun onListenerDisconnected() {
    if (instance === this) instance = null
    // Android drops the connection at times (an app update, low memory). Ask for it back.
    try {
      requestRebind(ComponentName(this, FinanceNotificationListener::class.java))
    } catch (e: Exception) {
      // Refused when access has been switched off, which is the one case that needs no rebind.
    }
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn != null && capture(sbn)) onCaptured?.invoke()
  }

  /**
   * Stores every notification currently showing from a watched app, and returns how many were new.
   * This is what catches an alert that arrived before its app was ticked, or while Android had
   * the listener disconnected.
   */
  fun captureActive(): Int =
    try {
      activeNotifications?.count { capture(it) } ?: 0
    } catch (e: Exception) {
      // Access can be revoked between the callback and this call.
      0
    }

  /** Returns true when the notification was stored, false when it was ignored or already known. */
  private fun capture(sbn: StatusBarNotification): Boolean {
    try {
      val store = NotificationStore(applicationContext)
      if (!store.isWatched(sbn.packageName)) return false

      val notification = sbn.notification ?: return false
      // Group headers ("3 new messages") and ongoing ones (sync, calls) carry no transaction.
      if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return false
      if (notification.flags and Notification.FLAG_ONGOING_EVENT != 0) return false

      val extras = notification.extras ?: return false
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
      val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()
      val shortText = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
      // Inbox-style notifications (several lines, no single body) keep their text here instead.
      val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        ?.joinToString("\n") { it.toString().trim() }
      val text = listOf(bigText, shortText, lines).firstOrNull { !it.isNullOrEmpty() }.orEmpty()
      if (title.isEmpty() && text.isEmpty()) return false

      val appName = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(sbn.packageName, 0)).toString()
      } catch (e: Exception) {
        sbn.packageName
      }

      // Apps re-post a notification when they update it; identical content is stored once.
      val id = "${sbn.packageName}:${(title + "\n" + text).hashCode()}:${sbn.postTime / DEDUPE_WINDOW_MS}"
      return store.append(id, sbn.packageName, appName, title, text, sbn.postTime)
    } catch (e: Exception) {
      // Never let a malformed notification crash the listener.
      return false
    }
  }

  companion object {
    private const val DEDUPE_WINDOW_MS = 60_000L

    /** The connected listener, or null while Android has not bound it. Same process as the JS module. */
    @Volatile
    var instance: FinanceNotificationListener? = null
      private set

    /** Called after something new is stored, so an open app can read it straight away. */
    @Volatile
    var onCaptured: (() -> Unit)? = null
  }
}
