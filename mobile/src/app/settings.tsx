import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { AppLockSettings } from '@/components/app-lock';
import { AppearanceSettings } from '@/components/appearance-settings';
import { BinanceSettings } from '@/components/binance-settings';
import { CloudBackupSettings } from '@/components/cloud-backup-settings';
import { ReminderSettings } from '@/components/reminder-settings';
import { UpdateSettings } from '@/components/update-settings';
import { WidgetSettings } from '@/components/widget-settings';
import { GmailSettings } from '@/components/gmail-settings';
import {
  AppText,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  IconBubble,
  IconButton,
  Input,
  ModalHeader,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { Colors, Font } from '@/constants/theme';
import { useNotificationStatus } from '@/hooks/use-notification-status';
import { useSync } from '@/hooks/use-sync';
import { useApiKey } from '@/lib/api-key';
import { deleteBankLogin } from '@/lib/bank-login';
import { confirmAction } from '@/lib/confirm';
import { loadDemoData, removeDemoData } from '@/lib/demo-data';
import { formatRelative } from '@/lib/format';
import { foreignCurrencies } from '@/lib/money';
import { SUGGESTED_MODELS, validateApiKey } from '@/lib/openai';
import { useStore } from '@/lib/store';
import { canReadNotifications, canReadSms, reanalyzable } from '@/lib/sync';

import {
  openNotificationAccessSettings,
  reconnectNotificationListener,
} from '../../modules/sms-reader/notifications';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD'];
const LOOKBACK = [30, 90, 180, 365];

/** One editable exchange rate: how many units of `code` make 1 US dollar. */
function RateRow({
  code,
  value,
  onCommit,
}: {
  code: string;
  value: number | undefined;
  onCommit: (rate: number | null) => void;
}) {
  const [draft, setDraft] = useState(value ? String(value) : '');

  function commit() {
    const rate = Number(draft.replace(/,/g, ''));
    if (draft.trim() === '') onCommit(null);
    else if (Number.isFinite(rate) && rate > 0) onCommit(rate);
    else setDraft(value ? String(value) : '');
  }

  return (
    <View style={styles.rateRow}>
      <AppText variant="label">1 USD =</AppText>
      <Input
        value={draft}
        onChangeText={setDraft}
        onEndEditing={commit}
        onBlur={commit}
        placeholder="rate"
        keyboardType="decimal-pad"
        style={styles.fill}
        accessibilityLabel={`${code} per US dollar`}
      />
      <AppText variant="label" style={styles.rateCode}>
        {code}
      </AppText>
    </View>
  );
}

export default function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const accounts = useStore((s) => s.accounts);
  const updateSettings = useStore((s) => s.updateSettings);
  const transactions = useStore((s) => s.transactions);
  const lastSmsSyncAt = useStore((s) => s.lastSmsSyncAt);
  const resetSyncState = useStore((s) => s.resetSyncState);
  const clearAllData = useStore((s) => s.clearAllData);
  const { hasKey, hint, save, remove } = useApiKey();
  const { running, runSmsSync, runReanalyze, outcome } = useSync();
  const notifications = useNotificationStatus();

  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyState, setKeyState] = useState<{ saving: boolean; error: string | null; saved: boolean }>({
    saving: false,
    error: null,
    saved: false,
  });
  const [nameDraft, setNameDraft] = useState(settings.name);
  const [modelDraft, setModelDraft] = useState(settings.model);
  const [currencyDraft, setCurrencyDraft] = useState(settings.currency);

  const messageCount = useMemo(() => reanalyzable(transactions).length, [transactions]);
  const localCount = useMemo(
    () => reanalyzable(transactions).filter((t) => t.parsedBy === 'local').length,
    [transactions]
  );
  const rateCurrencies = useMemo(
    () => foreignCurrencies({ transactions, accounts, settings }),
    [transactions, accounts, settings]
  );

  function setRate(code: string, rate: number | null) {
    const rates = { ...settings.rates };
    if (rate === null) delete rates[code];
    else rates[code] = rate;
    updateSettings({ rates });
  }
  const demoCount = useMemo(() => transactions.filter((t) => t.source === 'demo').length, [transactions]);

  async function handleSaveKey() {
    const key = keyDraft.trim();
    if (!key) return;
    setKeyState({ saving: true, error: null, saved: false });
    try {
      await validateApiKey(key);
      await save(key);
      setKeyDraft('');
      setKeyState({ saving: false, error: null, saved: true });
    } catch (e) {
      setKeyState({ saving: false, error: e instanceof Error ? e.message : String(e), saved: false });
    }
  }

  async function handleRemoveKey() {
    if (await confirmAction('Remove API key?', 'AI features will stop working until you add a key again.', 'Remove')) {
      await remove();
      setKeyState({ saving: false, error: null, saved: false });
    }
  }

  async function handleRescan() {
    resetSyncState();
    await runSmsSync();
  }

  async function handleClearAll() {
    const ok = await confirmAction(
      'Delete all data?',
      'This removes every transaction, account, saved bank login, insight and chat from this device. Your SMS inbox is not touched. This cannot be undone.',
      'Delete everything'
    );
    if (!ok) return;
    // Logins live in secure storage, not the data file, so they are removed one by one first.
    const withLogin = useStore.getState().accounts.filter((a) => a.hasLogin);
    await Promise.all(withLogin.map((a) => deleteBankLogin(a.id).catch(() => {})));
    clearAllData();
  }

  function commitCurrency(value: string) {
    const code = value.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) updateSettings({ currency: code });
    else setCurrencyDraft(settings.currency);
  }

  function commitModel(value: string) {
    const model = value.trim();
    if (model) updateSettings({ model });
    else setModelDraft(settings.model);
  }

  return (
    <Screen>
      <ModalHeader title="Settings" />

      {/* You */}
      <SectionHeader title="Security" />
      <AppLockSettings />

      <SectionHeader title="You" />
      <Card style={styles.card}>
        <Input
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={() => updateSettings({ name: nameDraft.trim() })}
          onBlur={() => updateSettings({ name: nameDraft.trim() })}
          placeholder="Your first name"
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Your name"
        />
        <AppText variant="caption" color="textSecondary">
          Used for the greeting, and sent to the AI so it can recognise transfers you make to yourself.
        </AppText>
      </Card>

      {/* OpenAI */}
      <SectionHeader title="OpenAI" />
      <Card style={styles.card}>
        <View style={styles.row}>
          <IconBubble name="key" tone={hasKey ? 'lime' : 'mint'} />
          <View style={styles.fill}>
            <AppText variant="label">API key</AppText>
            <AppText variant="caption" color="textSecondary">
              {hasKey ? `Saved · ends in ${hint}` : 'Not set: the AI cannot read your messages yet'}
            </AppText>
          </View>
          {hasKey ? (
            <Button label="Remove" variant="danger" compact onPress={handleRemoveKey} />
          ) : (
            <Badge label="No key" tone="white" />
          )}
        </View>

        <View style={styles.keyRow}>
          <Input
            value={keyDraft}
            onChangeText={(v) => {
              setKeyDraft(v);
              setKeyState((s) => ({ ...s, error: null, saved: false }));
            }}
            placeholder={hasKey ? 'Paste a new key to replace' : 'sk-…'}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.fill}
            accessibilityLabel="OpenAI API key"
          />
          <IconButton
            icon={showKey ? 'hidden' : 'visible'}
            label={showKey ? 'Hide key' : 'Show key'}
            onPress={() => setShowKey((v) => !v)}
          />
        </View>
        <Button label="Verify & save key" onPress={handleSaveKey} loading={keyState.saving} disabled={!keyDraft.trim()} />
        {keyState.error && <Banner tone="error" message={keyState.error} />}
        {keyState.saved && <Banner tone="success" message="Key verified and saved securely on this device." />}
        <AppText variant="caption" color="textSecondary">
          {Platform.OS === 'web'
            ? 'Web preview stores the key in browser storage. On a phone it goes into the Android Keystore / iOS Keychain.'
            : 'Stored in the Android Keystore / iOS Keychain. Calls go straight from your phone to OpenAI.'}{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}
            accessibilityRole="link">
            Get a key
          </Text>
        </AppText>

        <Divider />

        <AppText variant="label">Model</AppText>
        <View style={styles.wrap}>
          {SUGGESTED_MODELS.map((m) => (
            <Chip
              key={m}
              label={m}
              selected={settings.model === m}
              onPress={() => {
                updateSettings({ model: m });
                setModelDraft(m);
              }}
            />
          ))}
        </View>
        <Input
          value={modelDraft}
          onChangeText={setModelDraft}
          onEndEditing={() => commitModel(modelDraft)}
          onBlur={() => commitModel(modelDraft)}
          placeholder="Any model id"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Model id"
        />
      </Card>

      {/* Currency */}
      <SectionHeader title="Appearance" />
      <AppearanceSettings />

      <SectionHeader title="Currency" />
      <Card style={styles.card}>
        <AppText variant="caption" color="textSecondary">
          Totals and charts are shown in this currency. Amounts in other currencies are kept as they happened and
          converted with the rates below.
        </AppText>
        <View style={styles.wrap}>
          {CURRENCIES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={settings.currency === c}
              onPress={() => {
                updateSettings({ currency: c });
                setCurrencyDraft(c);
              }}
            />
          ))}
        </View>
        <Input
          value={currencyDraft}
          onChangeText={setCurrencyDraft}
          onEndEditing={() => commitCurrency(currencyDraft)}
          onBlur={() => commitCurrency(currencyDraft)}
          placeholder="ISO code, e.g. JPY"
          autoCapitalize="characters"
          maxLength={3}
          accessibilityLabel="Currency code"
        />

        {rateCurrencies.length > 0 && (
          <>
            <Divider />
            <AppText variant="label">Exchange rates</AppText>
            {rateCurrencies.map((code) => (
              <RateRow key={code} code={code} value={settings.rates[code]} onCommit={(rate) => setRate(code, rate)} />
            ))}
            <AppText variant="caption" color="textSecondary">
              Fixed rates you set, not live market rates. A currency with no rate is left out of totals.
            </AppText>
          </>
        )}
      </Card>

      {/* Notifications */}
      <SectionHeader title="App notifications" />
      <Card style={styles.card}>
        {canReadNotifications ? (
          <>
            <View style={styles.row}>
              <IconBubble name="sms" tone={notifications.access ? 'lime' : 'mint'} />
              <View style={styles.fill}>
                <AppText variant="label">Read alerts from your money apps</AppText>
                <AppText variant="caption" color="textSecondary">
                  {!notifications.access
                    ? 'Off: needs notification access'
                    : !notifications.listening
                      ? 'On, but not connected'
                      : `On · watching ${notifications.watched} app${notifications.watched === 1 ? '' : 's'}`}
                </AppText>
              </View>
              <Badge
                label={!notifications.access ? 'Off' : notifications.listening ? 'On' : 'Stopped'}
                tone={!notifications.access ? 'white' : notifications.listening ? 'lime' : 'negative'}
              />
            </View>
            <AppText variant="caption" color="textSecondary">
              Stripe, Revolut, Binance and most bank apps notify instead of texting. Pick the apps to watch; only
              their notifications are read, and they go through the same AI as your SMS.
            </AppText>
            {!notifications.access && (
              <>
                <Button label="Allow notification access" icon="lock" onPress={openNotificationAccessSettings} />
                <AppText variant="caption" color="textSecondary">
                  Turn on Expense AI in the list that opens. If Android says the setting is restricted, open this
                  app’s App info, tap ⋮ at the top right, then Allow restricted settings, and try again.
                </AppText>
              </>
            )}
            <Button
              label={`Choose apps to watch (${notifications.watched})`}
              icon="list"
              variant="secondary"
              onPress={() => router.push('/watch-apps')}
            />
            {notifications.access && notifications.watched === 0 && (
              <Banner tone="warning" message="No apps chosen yet, so no notifications are being read." />
            )}
            {notifications.access && !notifications.listening && (
              <Banner
                tone="warning"
                message="Access is on, but Android has not started the reader, so nothing is captured. If Reconnect does not fix it, switch notification access off and on again."
                action={{
                  label: 'Reconnect',
                  onPress: () => {
                    reconnectNotificationListener();
                    // Android binds the listener a moment later.
                    setTimeout(notifications.refresh, 1500);
                  },
                }}
              />
            )}
          </>
        ) : (
          <Banner
            tone="info"
            message={
              Platform.OS === 'android'
                ? 'Notification reading needs the latest app build. Install the updated APK to turn it on.'
                : 'Notification reading works in the Android app only.'
            }
          />
        )}
      </Card>

      {/* Widget and Live Alerts */}
      <SectionHeader title="Widget & Live Alerts" />
      <WidgetSettings />

      {/* Email */}
      <SectionHeader title="Email" />
      <GmailSettings />

      {/* Exchanges */}
      <SectionHeader title="Binance" />
      <BinanceSettings />

      {/* SMS */}
      <SectionHeader title="SMS sync" />
      <Card style={styles.card}>
        {canReadSms ? (
          <>
            <AppText variant="caption" color="textSecondary">
              {lastSmsSyncAt
                ? `Last synced ${formatRelative(lastSmsSyncAt)}. New syncs only read messages since then.`
                : 'The first sync reads this far back:'}
            </AppText>
            <View style={styles.wrap}>
              {LOOKBACK.map((d) => (
                <Chip
                  key={d}
                  label={d === 365 ? '1 year' : `${d} days`}
                  selected={settings.lookbackDays === d}
                  onPress={() => updateSettings({ lookbackDays: d })}
                />
              ))}
            </View>
            <Button
              label="Rescan inbox"
              icon="sync"
              variant="secondary"
              onPress={handleRescan}
              loading={running === 'sms'}
              disabled={!!running}
            />
            <AppText variant="caption" color="textSecondary">
              Rescanning re-reads the whole window above. Messages already analysed are skipped, so it only costs
              tokens for new ones.
            </AppText>
          </>
        ) : (
          <Banner
            tone="success"
            message={
              Platform.OS === 'ios'
                ? 'iOS does not allow apps to read SMS. Use Paste on the Overview tab to import bank alerts.'
                : Platform.OS === 'android'
                  ? 'Reading SMS needs a development build of this app (npx expo run:android). Expo Go cannot load the SMS module.'
                  : 'SMS reading works in the Android app. In this web preview, use Paste on the Overview tab.'
            }
          />
        )}

        {messageCount > 0 && (
          <>
            <Divider />
            <AppText variant="label">Let AI decide what each message is</AppText>
            <AppText variant="caption" color="textSecondary">
              {localCount > 0
                ? `${localCount} of ${messageCount} transactions are still rough guesses from before the AI read them. `
                : `${messageCount} transactions came from messages. `}
              {hasKey
                ? 'The AI sorts them into spending, income and transfers, files each under the right account, and drops duplicate alerts. It runs by itself when you save a key or change your accounts; this runs it now. Categories you set by hand are kept.'
                : 'Add a key and the AI sorts them automatically.'}
            </AppText>
            <Button
              label={`Re-analyse ${messageCount} with AI`}
              icon="sparkle"
              variant="secondary"
              onPress={runReanalyze}
              loading={running === 'reanalyze'}
              disabled={!hasKey || !!running}
            />
          </>
        )}
        {outcome && running === null && <Banner tone={outcome.tone} message={outcome.message} />}
      </Card>

      <AppText variant="caption" color="textSecondary" style={styles.note}>
        Only bank-looking messages are analysed. OTPs are skipped and long numbers are masked to their last 4 digits
        before anything is stored or sent to OpenAI. Everything else stays on this phone.
      </AppText>

      {/* Data */}
      <SectionHeader title="Reminders" />
      <ReminderSettings />

      <SectionHeader title="Backup" />
      <CloudBackupSettings />

      <SectionHeader title="About this app" />
      <UpdateSettings />

      <SectionHeader title="Data" />
      <Card style={styles.card}>
        <AppText variant="caption" color="textSecondary">
          {transactions.length} transaction{transactions.length === 1 ? '' : 's'} stored on this device
          {demoCount ? `, ${demoCount} of them demo data` : ''}.
        </AppText>
        {demoCount > 0 ? (
          <Button label="Remove demo data" variant="secondary" onPress={removeDemoData} />
        ) : (
          <Button label="Load demo data" variant="secondary" onPress={() => loadDemoData()} />
        )}
        <Button label="Delete all data" variant="danger" icon="trash" onPress={handleClearAll} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { fontFamily: Font.bold, color: Colors.accent, textDecorationLine: 'underline' },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateCode: { minWidth: 36 },
  note: { paddingHorizontal: 4 },
});
