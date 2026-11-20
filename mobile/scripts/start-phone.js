/* global __dirname */
// Starts the dev server behind a tunnel, for a phone that is not on the same network as this PC.
//
// In tunnel mode Expo runs `adb reverse` whenever it can find an Android SDK. When adb hangs (as it
// does on some Windows setups), the server gives up with "Expo stopped waiting for the ADB device
// discovery operation". A phone connecting through the tunnel never needs adb, so this points
// ANDROID_HOME at a folder that does not exist for this one process, which makes Expo skip that step.
//
// Expo also gives the ngrok tunnel a fixed 10 seconds to come up. On a slow or VPN'd connection it
// often lands just after that ("Tunnel connected", then "ngrok tunnel took too long to connect"), so
// a start that fails within its first minutes is tried again a few times before giving up.
const { spawn } = require('node:child_process');
const path = require('node:path');

const MAX_ATTEMPTS = 5;
/**
 * A failure later than this is a crash of a running server, not a slow tunnel; it is not retried.
 * Generous, because Metro itself can take minutes to start while the PC is busy (e.g. building an APK).
 */
const STARTUP_WINDOW_MS = 15 * 60_000;

const env = { ...process.env, ANDROID_HOME: path.join(__dirname, '.no-android-sdk') };
delete env.ANDROID_SDK_ROOT;

const args = ['start', '--port', '8081', '--tunnel', 'ngrok', '--go', ...process.argv.slice(2)];

let child = null;
let stopping = false;

function start(attempt) {
  const startedAt = Date.now();
  child = spawn(process.execPath, [require.resolve('expo/bin/cli'), ...args], { stdio: 'inherit', env });
  child.on('exit', (code) => {
    const failedAtStartup = code && Date.now() - startedAt < STARTUP_WINDOW_MS;
    if (!stopping && failedAtStartup && attempt < MAX_ATTEMPTS) {
      console.log(`\nDev server did not start (attempt ${attempt} of ${MAX_ATTEMPTS}). Trying again…\n`);
      setTimeout(() => start(attempt + 1), 2000);
      return;
    }
    process.exit(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}

start(1);
