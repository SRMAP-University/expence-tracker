package expo.modules.homewidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The home screen widget. It draws what the app last sent for each widget (WidgetStore): the app
 * decides the content, so it can change with an over-the-air update; this only fills the slots
 * in the layout and keeps the sections that fit the widget's current size.
 */
class FinanceWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) render(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle?) {
    render(context, manager, appWidgetId)
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    WidgetStore(context).removeConfigs(appWidgetIds)
  }

  companion object {
    /** Must match "scheme" in app.json: the app's deep links. */
    private const val SCHEME = "expenseai"

    // Approximate heights in dp, to decide which sections fit.
    private const val BASE_DP = 98 // padding, header, headline
    private const val STATS_DP = 42
    private const val PROGRESS_DP = 34
    private const val LIST_TITLE_DP = 25
    private const val ROW_DP = 22
    private const val NARROW_DP = 200

    private val STAT_IDS = listOf(
      Triple(R.id.stat1, R.id.stat1_label, R.id.stat1_value),
      Triple(R.id.stat2, R.id.stat2_label, R.id.stat2_value),
      Triple(R.id.stat3, R.id.stat3_label, R.id.stat3_value)
    )
    private val ROW_IDS = listOf(
      Triple(R.id.row1, R.id.row1_left, R.id.row1_right),
      Triple(R.id.row2, R.id.row2_left, R.id.row2_right),
      Triple(R.id.row3, R.id.row3_left, R.id.row3_right),
      Triple(R.id.row4, R.id.row4_left, R.id.row4_right)
    )
    private const val WHITE = 0xFFFFFFFF.toInt()
    private const val LIME = 0xFFC6EA9C.toInt()

    fun widgetIds(context: Context): IntArray =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, FinanceWidgetProvider::class.java))

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (id in widgetIds(context)) render(context, manager, id)
    }

    fun render(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val views = RemoteViews(context.packageName, R.layout.finance_widget)
      val snapshot = WidgetStore(context).snapshot()
      val model = snapshot?.optJSONObject("models")?.optJSONObject(widgetId.toString())
        ?: snapshot?.optJSONObject("fallback")

      if (snapshot == null || model == null) {
        views.setTextViewText(R.id.widget_label, "Expense AI")
        views.setTextViewText(R.id.widget_value, "Open the app")
        hideAll(views)
      } else {
        // Figures for "today" are as of the app's last update; after midnight they start at zero.
        val stale = snapshot.optString("day") != today()
        val zero = snapshot.optString("zero", "0")
        fun valueOf(item: JSONObject) = if (stale && item.optBoolean("today")) zero else item.optString("value")

        views.setTextViewText(R.id.widget_label, model.optString("label"))
        views.setTextViewText(R.id.widget_value, valueOf(model))

        val options = manager.getAppWidgetOptions(widgetId)
        var room = (options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0).let { if (it > 0) it else 260 } - BASE_DP
        val width = (options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0).let { if (it > 0) it else 250 }

        // Quick stats: two on a narrow widget, three on a wide one.
        val stats = model.optJSONArray("stats")
        if (stats != null && stats.length() > 0 && room >= STATS_DP) {
          room -= STATS_DP
          views.setViewVisibility(R.id.widget_stats, View.VISIBLE)
          val shown = if (width < NARROW_DP) 2 else 3
          STAT_IDS.forEachIndexed { i, (box, label, value) ->
            val stat = if (i < shown) stats.optJSONObject(i) else null
            if (stat == null) {
              views.setViewVisibility(box, View.GONE)
            } else {
              views.setViewVisibility(box, View.VISIBLE)
              views.setTextViewText(label, stat.optString("label"))
              views.setTextViewText(value, valueOf(stat))
            }
          }
        } else {
          views.setViewVisibility(R.id.widget_stats, View.GONE)
        }

        val progress = model.optJSONObject("progress")
        if (progress != null && room >= PROGRESS_DP) {
          room -= PROGRESS_DP
          views.setViewVisibility(R.id.widget_progress, View.VISIBLE)
          views.setTextViewText(R.id.progress_label, progress.optString("label"))
          views.setTextViewText(R.id.progress_right, progress.optString("right"))
          views.setProgressBar(R.id.progress_bar, 100, progress.optInt("percent").coerceIn(0, 100), false)
        } else {
          views.setViewVisibility(R.id.widget_progress, View.GONE)
        }

        val list = model.optJSONArray("list")
        val fitRows = if (room >= LIST_TITLE_DP + ROW_DP) (room - LIST_TITLE_DP) / ROW_DP else 0
        val rows = minOf(fitRows, list?.length() ?: 0, ROW_IDS.size)
        if (rows > 0) {
          views.setViewVisibility(R.id.list_title, View.VISIBLE)
          views.setTextViewText(R.id.list_title, model.optString("listTitle"))
        } else {
          views.setViewVisibility(R.id.list_title, View.GONE)
        }
        ROW_IDS.forEachIndexed { i, (row, left, right) ->
          val item = if (i < rows) list?.optJSONObject(i) else null
          if (item == null) {
            views.setViewVisibility(row, View.GONE)
          } else {
            views.setViewVisibility(row, View.VISIBLE)
            views.setTextViewText(left, item.optString("left"))
            views.setTextViewText(right, item.optString("right"))
            views.setTextColor(right, if (item.optBoolean("positive")) LIME else WHITE)
          }
        }
      }

      views.setOnClickPendingIntent(R.id.widget_root, openApp(context, widgetId))
      views.setOnClickPendingIntent(R.id.widget_add, deepLink(context, "add", widgetId * 10 + 2))
      manager.updateAppWidget(widgetId, views)
    }

    private fun hideAll(views: RemoteViews) {
      views.setViewVisibility(R.id.widget_stats, View.GONE)
      views.setViewVisibility(R.id.widget_progress, View.GONE)
      views.setViewVisibility(R.id.list_title, View.GONE)
      for ((row, _, _) in ROW_IDS) views.setViewVisibility(row, View.GONE)
    }

    private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun openApp(context: Context, widgetId: Int): PendingIntent? {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(
        context,
        widgetId * 10 + 1,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun deepLink(context: Context, path: String, requestCode: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$SCHEME://$path"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    fun openEditor(context: Context, widgetId: Int) {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$SCHEME://widget?id=$widgetId"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
