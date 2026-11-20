package expo.modules.smsreader

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ReadInboxOptions : Record {
  /** Only return messages received after this epoch-millis timestamp. */
  @Field
  var sinceMs: Double = 0.0

  /** Hard cap on how many messages are returned (newest first). */
  @Field
  var maxCount: Int = 1000
}

class SmsPermissionException :
  CodedException("ERR_SMS_PERMISSION", "READ_SMS permission has not been granted", null)

class SmsReaderModule : Module() {
  private fun hasReadSmsPermission(): Boolean {
    val context = appContext.reactContext ?: return false
    return context.checkSelfPermission(Manifest.permission.READ_SMS) ==
      PackageManager.PERMISSION_GRANTED
  }

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Function("hasPermission") {
      hasReadSmsPermission()
    }

    // AsyncFunction bodies run off the main thread, so the content-provider query won't block UI.
    AsyncFunction("readInbox") { options: ReadInboxOptions ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (!hasReadSmsPermission()) {
        throw SmsPermissionException()
      }

      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      val results = mutableListOf<Map<String, Any?>>()

      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        "${Telephony.Sms.DATE} > ?",
        arrayOf(options.sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} DESC"
      )?.use { cursor ->
        val idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)

        while (cursor.moveToNext() && results.size < options.maxCount) {
          results.add(
            mapOf(
              "id" to cursor.getLong(idIdx).toString(),
              "address" to (cursor.getString(addressIdx) ?: ""),
              "body" to (cursor.getString(bodyIdx) ?: ""),
              "date" to cursor.getLong(dateIdx).toDouble()
            )
          )
        }
      }

      results
    }
  }
}
