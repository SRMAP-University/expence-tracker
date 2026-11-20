package expo.modules.homewidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS-facing side of the home screen widget and the app's Live Updates (Live Alerts on OnePlus). */
class HomeWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("HomeWidget")

    // The figures every widget draws from, as JSON. Redraws all widgets.
    Function("setSnapshot") { json: String ->
      WidgetStore(context).setSnapshot(json)
      FinanceWidgetProvider.refreshAll(context)
    }

    Function("getWidgetIds") {
      FinanceWidgetProvider.widgetIds(context).toList()
    }

    // A widget's settings as JSON, or null for one never edited (it uses the defaults).
    Function("getWidgetConfig") { widgetId: Int ->
      WidgetStore(context).configJson(widgetId)
    }

    Function("setWidgetConfig") { widgetId: Int, json: String ->
      WidgetStore(context).setConfig(widgetId, json)
      FinanceWidgetProvider.render(context, AppWidgetManager.getInstance(context), widgetId)
    }

    // Whether the launcher can add the widget from inside the app.
    Function("canPinWidget") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }

    // Asks the launcher to add a widget; it shows its own confirmation.
    Function("pinWidget") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        AppWidgetManager.getInstance(context)
          .requestPinAppWidget(ComponentName(context, FinanceWidgetProvider::class.java), null, null)
      } else {
        false
      }
    }

    // Posts or updates a Live Update by key. progress -1 = no bar.
    Function("postLiveUpdate") { key: String, title: String, text: String, chip: String, progress: Int, max: Int ->
      LiveUpdates.post(context, key, title, text, chip, progress, max)
    }

    Function("cancelLiveUpdate") { key: String ->
      LiveUpdates.cancel(context, key)
    }

    Function("liveUpdatesAllowed") {
      LiveUpdates.promotionAllowed(context)
    }

    // The app's notification settings, where Live Updates can be switched on.
    Function("openNotificationSettings") {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
