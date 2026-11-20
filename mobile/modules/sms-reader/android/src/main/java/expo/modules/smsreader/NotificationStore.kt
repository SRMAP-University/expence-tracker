package expo.modules.smsreader

import android.content.Context
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/**
 * On-device storage shared by the notification listener (which writes) and the JS module (which reads).
 *
 * Two things live here: the set of app packages the user chose to watch, and the notifications
 * captured from those apps while the app was closed. Nothing from any other app is ever stored.
 */
class NotificationStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val file = File(context.applicationContext.filesDir, FILE_NAME)

  fun watchedPackages(): Set<String> = prefs.getStringSet(KEY_WATCHED, emptySet())?.toSet() ?: emptySet()

  fun setWatchedPackages(packages: Collection<String>) {
    prefs.edit().putStringSet(KEY_WATCHED, packages.toSet()).apply()
  }

  fun isWatched(packageName: String): Boolean = watchedPackages().contains(packageName)

  /**
   * Adds one captured notification and returns true, or returns false for a repeat of content
   * already stored. Keeps the newest [MAX_ITEMS].
   */
  fun append(id: String, packageName: String, appName: String, title: String, text: String, postedAt: Long): Boolean {
    synchronized(LOCK) {
      val items = readAll()
      for (i in 0 until items.length()) {
        if (items.optJSONObject(i)?.optString("id") == id) return false
      }
      items.put(
        JSONObject()
          .put("id", id)
          .put("packageName", packageName)
          .put("appName", appName)
          .put("title", title)
          .put("text", text)
          .put("postedAt", postedAt)
      )
      val trimmed = JSONArray()
      val start = maxOf(0, items.length() - MAX_ITEMS)
      for (i in start until items.length()) trimmed.put(items.get(i))
      file.writeText(trimmed.toString())
      return true
    }
  }

  /** How many captured notifications are waiting to be read by the app. */
  fun count(): Int = synchronized(LOCK) { readAll().length() }

  /** Captured notifications posted after [sinceMs], oldest first. */
  fun readSince(sinceMs: Long, maxCount: Int): List<Map<String, Any?>> {
    synchronized(LOCK) {
      val items = readAll()
      val result = mutableListOf<Map<String, Any?>>()
      for (i in 0 until items.length()) {
        val item = items.optJSONObject(i) ?: continue
        val postedAt = item.optLong("postedAt")
        if (postedAt <= sinceMs) continue
        result.add(
          mapOf(
            "id" to item.optString("id"),
            "packageName" to item.optString("packageName"),
            "appName" to item.optString("appName"),
            "title" to item.optString("title"),
            "text" to item.optString("text"),
            "postedAt" to postedAt.toDouble()
          )
        )
        if (result.size >= maxCount) break
      }
      return result
    }
  }

  /** Drops captured notifications posted at or before [upToMs], once the app has processed them. */
  fun removeUpTo(upToMs: Long) {
    synchronized(LOCK) {
      val items = readAll()
      val kept = JSONArray()
      for (i in 0 until items.length()) {
        val item = items.optJSONObject(i) ?: continue
        if (item.optLong("postedAt") > upToMs) kept.put(item)
      }
      file.writeText(kept.toString())
    }
  }

  private fun readAll(): JSONArray =
    try {
      if (file.exists()) JSONArray(file.readText()) else JSONArray()
    } catch (e: Exception) {
      // A half-written or corrupt file must not break capture; start again from empty.
      JSONArray()
    }

  companion object {
    private const val PREFS = "expense_ai_notifications"
    private const val KEY_WATCHED = "watched_packages"
    private const val FILE_NAME = "captured-notifications.json"
    private const val MAX_ITEMS = 1500

    // The listener service and the JS module run in the same process, so one lock covers both.
    private val LOCK = Any()
  }
}
