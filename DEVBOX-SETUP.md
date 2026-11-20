# Setting up the sylica-devbox for Expense AI

Everything needed to carry on developing the Expense AI app (and its website) on the
`sylica-devbox` Windows machine in AWS Mumbai, without the home PC.

## 1. Connect

- Open `sylica-devbox.rdp` and sign in as **Administrator** with the password from
  `sylica-devbox-password.txt`. Change the password after the first sign-in
  (Ctrl+Alt+End > Change a password) and keep it in a password manager.
- The firewall only lets in a few IP addresses (`152.58.186.46`, `152.58.186.191`). If the
  connection times out from somewhere else: AWS console > EC2 > `sylica-devbox` > Security >
  security group > Edit inbound rules > RDP (3389) > Source: **My IP**.
- The machine has no fixed (Elastic) IP. If it is stopped and started, its address changes:
  take the new public IP from the EC2 console and edit the `.rdp` file (or attach an Elastic IP).

## 2. Install the tools (PowerShell)

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

Close and reopen PowerShell, then install Claude Code and sign in:

```powershell
npm install -g @anthropic-ai/claude-code
```

```powershell
claude
```

(Or install the Claude desktop app and use its Code tab.)

## 3. Get the code

Clone the repository and switch to the app's branch, into **`C:\dev\expence-tracker`**. Keep the
path short: Android builds on Windows break on long paths.

```powershell
git clone https://github.com/SRMAP-University/expence-tracker.git C:\dev\expence-tracker
```

```powershell
cd C:\dev\expence-tracker; git checkout claude/finance-app-ai-messages-9cc3c9
```

Later, `git pull` brings in new changes. (Without GitHub access, extract
`expense-tracker-src.zip` to the same folder instead.)

```powershell
cd C:\dev\expence-tracker; npm install
```

```powershell
cd C:\dev\expence-tracker\mobile; npm install
```

## 4. Sign in to the services (each asks for your own login in the browser)

| What | Command | Needed for |
| --- | --- | --- |
| Expo / EAS (account `adarshagupta`) | `cd mobile; npx eas-cli login` | Publishing OTA updates to the phone |
| Vercel | `npx vercel login`, then `npx vercel link` (project `expence-tracker`) and `npx vercel env pull .env.local` | Website, Neon database URL |
| AWS (optional) | `aws configure` | Managing the devbox itself |

The OpenAI key, Binance key and bank logins live only on the phone; nothing secret is in the zip.

## 5. Everyday work

- **Ship a change to the phone (JavaScript only):** `cd mobile; npm run ota -- "What changed"`.
  The app picks it up the next time it opens.
- **Check:** `cd mobile; npx tsc --noEmit; npx expo lint`.
- **Preview in a browser:** `cd mobile; npx expo start --web`.
- **Deploy the website:** from `C:\dev\expence-tracker`, `npx vercel deploy --prod`. The
  `.vercelignore` there keeps the `mobile` folder out of the upload; keep its `/mobile` leading slash.

## 6. A new APK (only for native changes)

Needed only when something native changes: anything under `mobile/modules/`, a new native
library, or `app.json` plugins/permissions. Raise `version` (and `android.versionCode`) in
`mobile/app.json` first: OTA updates are matched to the app version, so old installs never get
code they cannot run.

1. Install Android Studio (it brings the SDK and a JDK); in its SDK Manager add Android SDK 36/37,
   NDK and CMake. Set `JAVA_HOME` to Android Studio's `jbr` folder.
2. Windows path limit: enable long paths, and build from a short folder. The home PC built from a
   copy at `C:\dev\ea` with Ninja 1.12+ (`cmake.dir` in `android/local.properties`).
3. `cd mobile; npx expo prebuild --platform android`, then in `android`:
   `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
   The APK is in `android/app/build/outputs/apk/release/`.

## Briefing for Claude on this machine

- `mobile/` is the Expo app (SDK 58, React Native 0.88, expo-router, Zustand, Reanimated 4,
  React Compiler). The repo root is a separate Next.js 16 website (Neon Postgres via
  `@neondatabase/serverless`). Read `AGENTS.md` before touching the website.
- The app reads bank SMS, notifications from chosen apps, Gmail and Binance, and OpenAI (Responses
  API, strict JSON schemas) turns them into transactions. Ask AI is an agent with tools
  (`mobile/src/lib/agent.ts`) and an Undo for every change.
- Native code is in `mobile/modules/` (`sms-reader`: SMS and notification listener;
  `home-widget`: home screen widget and Android 16 Live Updates). JS-side features must load
  native modules optionally, so OTA updates stay safe on older app builds.
- OTA: EAS Update, project `@adarshagupta/expense-ai`, channel `production`, runtime version =
  app version (currently 1.0.2).
- Website backup API: `app/api/mobile/pair` and `app/api/mobile/backup` (`lib/mobile.ts`).
  Production: `https://expence-tracker-adarshs-projects-1953e79c.vercel.app` (Vercel Deployment
  Protection must be off for the phone to reach it).
- The user prefers short forms in slide-up drawers, a bouncy, animated UI, and plain-language
  replies.
