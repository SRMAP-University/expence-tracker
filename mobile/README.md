# Expense AI (mobile)

A personal finance app for Android (React Native + Expo SDK 58). It reads the bank and card alerts in your SMS inbox, turns them into categorised transactions with the OpenAI API, and shows where the money went.

## What it does

- **Reads bank SMS** on Android through a small native module (`modules/sms-reader`). iOS never lets apps read SMS, so there (and in Expo Go) you paste alerts in instead.
- **Reads notifications from apps you choose.** Stripe, Revolut, Binance and most bank apps notify instead of texting. With Android's "Notification access" granted, a listener in the same module keeps notifications only from the apps ticked in Settings > App notifications; anything from another app is dropped before its content is read. Ticking your email app picks up alerts that arrive only by email (sender, subject, first lines). They are captured while the app is closed and analysed the next time it opens; while it is open, a new one is analysed a few seconds after it arrives. Alerts already showing from an app when you tick it are taken too. If Android leaves the reader stopped (common after reinstalling the app), the app asks for it to be restarted, and Settings shows a Reconnect button. Some phones (OPPO, Xiaomi, Vivo) also need background activity and auto-launch allowed for the app.
- **Reads Binance with a read-only API key** (Settings > Binance). Crypto deposits and withdrawals, bank deposits and withdrawals, card and bank purchases of crypto, and Binance Pay payments become records the AI classifies like any alert; crypto amounts are valued in dollars at that day's price. The Binance account's balance is set from Binance's own total. The key and secret are kept in the Android Keystore and sent only to Binance; a key that can trade, transfer or withdraw is refused. Requests are signed with HMAC-SHA256 in `src/lib/sha256.ts`, since Hermes has no Web Crypto.
- **Counts a payment once.** SMS and notifications are analysed together, so a text and an app alert about the same payment are merged: by the AI within a batch, and otherwise by a rule (same amount, direction and currency, within five minutes, from a different channel).
- **Syncs by itself.** Bringing the app to the front checks for new SMS and captured notifications, using only what is already allowed, and a notification from a watched app is read moments after it arrives while the app is open.
- **Filters and redacts on the phone first.** Only messages that look like transactions are analysed. OTP messages are dropped, and account, card, phone and reference numbers are masked to their last 4 digits before anything is stored or sent.
- **OpenAI does the reading**: merchant, category, amount, account and date for each alert, a monthly insights summary, and a chat that answers questions about your spending.
- **The AI is the only reader.** Messages are not turned into transactions without an OpenAI key; there is no offline guess. (The demo data is the one exception: it uses a small built-in parser.)
- **It runs by itself.** Saving a key, or adding or editing an account, re-sorts your messages a few seconds later. A failed run is not retried until something changes.
- **Accounts in one place.** List each bank account, payment platform (Stripe), crypto exchange, card and cash. Net worth is the total. A bank account's balance follows the newest alert that states one; everything else is entered by hand.
- **Filed in the right place.** The AI is given the accounts list and your name. It files each transaction under the account it belongs to (an account's last 4 digits, when set, take priority), and marks a move between two of your own accounts (a card bill payment, a Stripe payout to your bank) as a transfer, left out of spending and income. It also drops a second alert about the same payment.
- **Manual entries** for cash, or anything a bank never texted about: expense, income, or a transfer between two accounts.
- **One display currency.** Amounts are stored as they happened and shown in the display currency (USD by default) using fixed rates you set in Settings, e.g. 100 INR = 1 USD.
- **Everything stays on the device.** Transactions live in a JSON file in the app's documents folder; the API key lives in the Android Keystore.

## Run it

```bash
cd mobile
npm install
npx expo start
```

**Phone on another network:** `npm run phone` starts the dev server behind a tunnel and skips Expo's `adb reverse` step, which can hang on Windows.

**Quick look (Expo Go):** install Expo Go on the phone, keep phone and PC on the same Wi-Fi, and scan the QR code. SMS reading is not available in Expo Go, so use **Paste**.

**Full app with SMS reading (Android):** needs a build that includes the native module.

Cloud build (works from any machine, needs a free Expo account):

```bash
npx eas-cli@latest build -p android --profile preview
```

When it finishes, open the link it prints on the phone and install the APK.

Local build:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The APK lands in `android/app/build/outputs/apk/release/`.

### Windows: local builds hit the 260-character path limit

The native C++ step fails with `ninja: error: mkdir(...): No such file or directory`. Several libraries produce object paths over 260 characters, and Ninja 1.10.2 (bundled with the Android SDK's CMake 3.22.1) cannot create them. A shorter project folder is not enough on its own, and a `subst` drive or junction does not help because the tools resolve them back to the real path. Either use the cloud build above, or build with Ninja 1.12 or newer (Windows long paths must also be enabled).

### Installing the APK on a phone

Copy the APK to the phone and open it. Because it isn't from the Play Store, Android asks you to allow installs from that app (your browser or file manager), and Play Protect may warn about an app that reads SMS; choose to install anyway.

On recent Android versions, SMS access is a *restricted setting* for apps installed this way. If tapping **Sync SMS** shows a "Restricted setting" notice, or the permission is refused, use **Open app settings** in the app, then tap **⋮** (top right) > **Allow restricted settings**, and then **Permissions > SMS > Allow**.

## Updates over the air

The installed app updates itself: it checks for a new version each time it starts (and when it comes back to the front), downloads it in the background, and Home offers **Restart now**. Updates come from EAS Update (project `@adarshagupta/expense-ai`, channel `production`).

Publish the current code to the phone:

```bash
npm run ota -- "What changed"
```

This covers JavaScript and assets only. A change to native code (anything in `modules/`, a new native library, or `app.json` plugins and permissions) needs a new APK: bump `version` in `app.json` (the runtime version follows it, so old installs never receive updates they can't run), rebuild, and install.

## First run

1. Open **Settings** (gear on Home) and paste your OpenAI API key. It is verified, then stored in the Keystore.
2. Pick your currency.
3. On Home, tap **Sync SMS** and allow the permission, or tap **Paste**.

The default model is `gpt-6-luna`; any model id can be typed in Settings.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app` | Screens (Expo Router). `(tabs)` holds Home, Overview, Activity and Ask AI. |
| `src/components` | UI kit (`ui.tsx`), notched cards, the dial, charts, motion helpers. |
| `src/lib/sms-parser.ts` | Transaction filter, redaction, and the offline parser. |
| `src/lib/openai.ts` | OpenAI Responses API calls with strict JSON schemas. |
| `src/lib/sync.ts` | SMS sync, paste import, and re-analysis. |
| `src/lib/analytics.ts` | Month summaries, recurring-payment detection, chart series. |
| `src/lib/store.ts` | Persisted app state (Zustand). |
| `modules/sms-reader` | Kotlin module that queries the SMS inbox. |

## Checks

```bash
npx tsc --noEmit
npx expo lint
```

## Publishing note

`READ_SMS` is a restricted permission on Google Play. This is built as a personal, sideloaded app; a Play listing would need Google's SMS permission declaration.
