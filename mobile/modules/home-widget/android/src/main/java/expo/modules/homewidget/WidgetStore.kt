package expo.modules.homewidget

import android.content.Context
import org.json.JSONObject

/**
 * What the widgets show, kept on the device so they can draw while the app is closed: the
 * latest figures the app pushed (one snapshot for all widgets), and each widget's own choice of
 * what to show.
 */
class WidgetStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun snapshot(): JSONObject? = prefs.getString(KEY_SNAPSHOT, null)?.let { parse(it) }

  fun setSnapshot(json: String) {
    prefs.edit().putString(KEY_SNAPSHOT, json).apply()
  }

  /** The widget's settings, or the defaults for a widget never edited. */
  fun config(widgetId: Int): JSONObject = prefs.getString(configKey(widgetId), null)?.let { parse(it) } ?: defaultConfig()

  fun configJson(widgetId: Int): String? = prefs.getString(configKey(widgetId), null)

  fun setConfig(widgetId: Int, json: String) {
    prefs.edit().putString(configKey(widgetId), json).apply()
  }

  fun removeConfigs(widgetIds: IntArray) {
    val edit = prefs.edit()
    for (id in widgetIds) edit.remove(configKey(id))
    edit.apply()
  }

  private fun parse(json: String): JSONObject? =
    try {
      JSONObject(json)
    } catch (e: Exception) {
      null
    }

  private fun configKey(widgetId: Int) = "config_$widgetId"

  companion object {
    private const val PREFS = "expense_ai_widgets"
    private const val KEY_SNAPSHOT = "snapshot"

    fun defaultConfig(): JSONObject = JSONObject().put("show", "month").put("latest", true)
  }
}
