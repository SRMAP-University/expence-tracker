package expo.modules.smsreader

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * JS-facing side of notification reading: whether access is granted, which apps are watched,
 * and the notifications captured from them so far.
 */
class NotificationReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val listenerComponent: ComponentName
    get() = ComponentName(context, FinanceNotificationListener::class.java)

  private fun hasAccess(): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    val mine = listenerComponent
    return enabled.split(":").any { ComponentName.unflattenFromString(it) == mine }
  }

  private fun isListening(): Boolean = FinanceNotificationListener.instance != null

  /**
   * Access can be granted and the listener still not running: after the app is reinstalled or
   * updated, Android often leaves it unbound until access is toggled or the phone restarts.
   * Switching the service component off and on makes the system bind it again, and
   * requestRebind covers the case where the system unbound it on purpose.
   */
  private fun reconnect() {
    if (!hasAccess() || isListening()) return
    // Binding takes a moment; asking again before it lands would only restart it.
    val now = SystemClock.elapsedRealtime()
    if (now - lastReconnectAt < RECONNECT_GAP_MS) return
    lastReconnectAt = now
    try {
      val pm = context.packageManager
      val component = listenerComponent
      pm.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      pm.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      NotificationListenerService.requestRebind(component)
    } catch (e: Exception) {
      // Best effort: the settings screen reports the listener as not connected if this fails.
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NotificationReader")

    // Sent when the listener stores a notification, so an open app can read it without waiting.
    Events("onCaptured")

    OnCreate {
      val module = WeakReference(this@NotificationReaderModule)
      FinanceNotificationListener.onCaptured = {
        try {
          module.get()?.sendEvent("onCaptured", mapOf<String, Any?>())
        } catch (e: Exception) {
          // No JS runtime to tell; the notification is stored and is read on the next sync.
        }
      }
      // Give a normal bind at app start time to land before forcing one.
      Handler(Looper.getMainLooper()).postDelayed({
        try {
          module.get()?.reconnect()
        } catch (e: Exception) {
          // The app was closed meanwhile.
        }
      }, STARTUP_CHECK_MS)
    }

    OnDestroy {
      FinanceNotificationListener.onCaptured = null
    }

    Function("hasAccess") {
      hasAccess()
    }

    // True while Android has the listener bound. Access can be granted and this still be false.
    Function("isListening") {
      isListening()
    }

    Function("reconnect") {
      reconnect()
    }

    // Stores what is showing right now from watched apps; resolves to how many were new.
    AsyncFunction("captureActive") {
      FinanceNotificationListener.instance?.captureActive() ?: 0
    }

    // How many captured notifications are waiting to be read.
    Function("pendingCount") {
      NotificationStore(context).count()
    }

    // "Notification access" is a special permission the user grants on a system screen.
    Function("openAccessSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("getWatchedPackages") {
      NotificationStore(context).watchedPackages().toList()
    }

    Function("setWatchedPackages") { packages: List<String> ->
      NotificationStore(context).setWatchedPackages(packages)
      // Take an alert already showing from a newly ticked app at once.
      if ((FinanceNotificationListener.instance?.captureActive() ?: 0) > 0) {
        FinanceNotificationListener.onCaptured?.invoke()
      }
      Unit
    }

    // Apps with a launcher icon, so the user can pick which ones to watch.
    AsyncFunction("listApps") {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .filter { it.first != context.packageName }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase() }
        .map { mapOf("packageName" to it.first, "label" to it.second) }
    }

    AsyncFunction("readCaptured") { sinceMs: Double, maxCount: Int ->
      NotificationStore(context).readSince(sinceMs.toLong(), maxCount)
    }

    AsyncFunction("removeCaptured") { upToMs: Double ->
      NotificationStore(context).removeUpTo(upToMs.toLong())
    }
  }

  companion object {
    private const val RECONNECT_GAP_MS = 5_000L
    private const val STARTUP_CHECK_MS = 2_000L

    @Volatile
    private var lastReconnectAt = 0L
  }
}
