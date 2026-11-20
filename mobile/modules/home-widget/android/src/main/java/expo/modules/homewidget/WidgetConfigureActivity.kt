package expo.modules.homewidget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle

/**
 * Opened by the launcher when the user edits a widget (long-press > settings). It has no screen
 * of its own: it confirms to the launcher straight away and opens the app's widget editor, where
 * the choice is made in the app's own design.
 */
class WidgetConfigureActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val widgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      ?: AppWidgetManager.INVALID_APPWIDGET_ID
    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
      FinanceWidgetProvider.render(this, AppWidgetManager.getInstance(this), widgetId)
      try {
        FinanceWidgetProvider.openEditor(this, widgetId)
      } catch (e: Exception) {
        // The app could not be opened; the widget keeps its current settings.
      }
    }
    finish()
  }
}
