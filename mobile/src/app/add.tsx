import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipRow, Drawer, FieldLabel, type DrawerHandle } from '@/components/drawer';
import { Banner, Button, Chip, IconButton, Input, Segmented } from '@/components/ui';
import { Colors, Font, Radius } from '@/constants/theme';
import { formatDay, moneyParts } from '@/lib/format';
import { currencyChoices } from '@/lib/money';
import { canScanReceipts, scanReceipt } from '@/lib/receipt';
import { useStore } from '@/lib/store';
import { CATEGORIES, type Category } from '@/lib/types';

type Kind = 'expense' | 'income';

const KINDS = [
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Received' },
] as const;

const INCOME_CATEGORIES: readonly Category[] = ['Salary & Income', 'Refunds & Cashback', 'Investments', 'Other'];
const EXPENSE_CATEGORIES = CATEGORIES.filter(
  (c) => c !== 'Transfers' && c !== 'Salary & Income' && c !== 'Refunds & Cashback'
);
const DEFAULT_CATEGORY: Record<Kind, Category> = { expense: 'Food & Dining', income: 'Salary & Income' };

const DAY = 86_400_000;

export default function AddScreen() {
  const accounts = useStore((s) => s.accounts);
  const displayCurrency = useStore((s) => s.settings.currency);
  const rates = useStore((s) => s.settings.rates);
  const addManualTransaction = useStore((s) => s.addManualTransaction);
  const drawer = useRef<DrawerHandle>(null);

  const [kind, setKind] = useState<Kind>('expense');
  // The calculator can open this with its answer filled in.
  const params = useLocalSearchParams<{ amount?: string }>();
  const [amount, setAmount] = useState(params.amount ?? '');
  const [currency, setCurrency] = useState(displayCurrency);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY.expense);
  const [daysAgo, setDaysAgo] = useState(0);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fixed when the drawer opens, so stepping the day never drifts the time of day.
  const [openedAt] = useState(() => Date.now());
  const [scanning, setScanning] = useState<'camera' | 'library' | null>(null);

  const date = new Date(openedAt - daysAgo * DAY);
  const currencies = currencyChoices(currency, displayCurrency, rates);
  const categories = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const symbol = moneyParts(0, currency).symbol || currency;

  function chooseKind(next: Kind) {
    setKind(next);
    setCategory(DEFAULT_CATEGORY[next]);
    setError(null);
  }

  function chooseAccount(id: string) {
    const next = accountId === id ? null : id;
    setAccountId(next);
    // Money in an account is in that account's currency.
    const account = accounts.find((a) => a.id === next);
    if (account) setCurrency(account.currency);
  }

  /** Fills the form from a receipt photo; anything the AI could not read is left as it was. */
  async function scan(source: 'camera' | 'library') {
    setError(null);
    setScanning(source);
    try {
      const reading = await scanReceipt(source);
      if (!reading) return;
      if (!reading.isReceipt) return setError('That doesn’t look like a receipt. Try again, closer and in good light.');
      setKind('expense');
      if (reading.total !== null && reading.total > 0) setAmount(String(reading.total));
      if (reading.merchant) setDescription(reading.merchant);
      setCategory((EXPENSE_CATEGORIES as readonly Category[]).includes(reading.category) ? reading.category : DEFAULT_CATEGORY.expense);
      if (reading.currency && /^[A-Za-z]{3}$/.test(reading.currency)) setCurrency(reading.currency.toUpperCase());
      const day = reading.date ? Date.parse(`${reading.date}T12:00:00`) : NaN;
      if (Number.isFinite(day)) {
        const opened = new Date(openedAt);
        opened.setHours(12, 0, 0, 0);
        setDaysAgo(Math.max(0, Math.round((opened.getTime() - day) / DAY)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(null);
    }
  }

  function handleSave() {
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return setError('Enter an amount greater than zero.');
    if (!drawer.current?.close()) return; // already saved and on its way out

    addManualTransaction({
      kind,
      amount: value,
      currency,
      description,
      category,
      date: date.toISOString(),
      accountId,
      toAccountId: null,
      note: null,
      updateBalance: true,
    });
  }

  return (
    <Drawer
      ref={drawer}
      title="Add manually"
      fallback="/transactions"
      footer={<Button label="Save" icon="check" onPress={handleSave} />}>
      <Segmented options={KINDS} value={kind} onChange={chooseKind} />

      {canScanReceipts && kind === 'expense' && (
        <View style={styles.scanRow}>
          <Button
            label={scanning === 'camera' ? 'Reading receipt…' : 'Scan receipt'}
            icon="camera"
            variant="secondary"
            compact
            loading={scanning === 'camera'}
            disabled={!!scanning}
            onPress={() => scan('camera')}
            style={styles.fill}
          />
          <Button
            label={scanning === 'library' ? 'Reading…' : 'From photos'}
            icon="photo"
            variant="secondary"
            compact
            loading={scanning === 'library'}
            disabled={!!scanning}
            onPress={() => scan('library')}
            style={styles.fill}
          />
        </View>
      )}

      <View style={styles.amountRow}>
        <Text style={styles.symbol}>{symbol}</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setError(null);
          }}
          placeholder="0"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="decimal-pad"
          autoFocus
          style={styles.amount}
          accessibilityLabel="Amount"
        />
      </View>
      {currencies.length > 1 && (
        <Segmented
          options={currencies.map((c) => ({ value: c, label: c }))}
          value={currency}
          onChange={setCurrency}
          style={styles.currency}
        />
      )}

      <Input
        value={description}
        onChangeText={setDescription}
        placeholder={kind === 'income' ? 'From whom? e.g. Freelance client' : 'What was it? e.g. Lunch'}
        accessibilityLabel="Description"
      />

      <FieldLabel>Category</FieldLabel>
      <ChipRow>
        {categories.map((c) => (
          <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </ChipRow>

      {accounts.length > 0 && (
        <>
          <FieldLabel>{kind === 'income' ? 'Into' : 'Paid from'}</FieldLabel>
          <ChipRow>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => chooseAccount(a.id)} />
            ))}
          </ChipRow>
        </>
      )}

      <View style={styles.dateRow}>
        <IconButton icon="chevronLeft" label="Day before" tone="mint" size={36} onPress={() => setDaysAgo(daysAgo + 1)} />
        <Text style={styles.dateLabel}>{formatDay(date.toISOString())}</Text>
        <IconButton
          icon="chevronRight"
          label="Day after"
          tone="mint"
          size={36}
          disabled={daysAgo === 0}
          onPress={() => setDaysAgo(Math.max(0, daysAgo - 1))}
        />
      </View>

      {error && <Banner tone="error" message={error} />}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scanRow: { flexDirection: 'row', gap: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 6 },
  symbol: { fontFamily: Font.semibold, fontSize: 28, color: Colors.textTertiary },
  amount: {
    minWidth: 80,
    fontFamily: Font.semibold,
    fontSize: 48,
    letterSpacing: -1,
    color: Colors.text,
    textAlign: 'center',
    paddingVertical: 0,
  },
  currency: { alignSelf: 'center', minWidth: 180 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
  },
  dateLabel: { flex: 1, textAlign: 'center', fontFamily: Font.semibold, fontSize: 15, color: Colors.text },
});
