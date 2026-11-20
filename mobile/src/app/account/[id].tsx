import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, Drawer, Expander, FieldLabel, type DrawerHandle } from '@/components/drawer';
import { ACCOUNT_GLYPH_NAME, Icon } from '@/components/icon';
import { AppText, Banner, Button, Chip, IconButton, Input, Segmented } from '@/components/ui';
import { Colors, Font, Radius } from '@/constants/theme';
import {
  canSaveBankLogins,
  deleteBankLogin,
  isCancelledPrompt,
  readBankLogin,
  saveBankLogin,
} from '@/lib/bank-login';
import { confirmAction } from '@/lib/confirm';
import { newId } from '@/lib/format';
import { currencyChoices, deviceCurrency } from '@/lib/money';
import { useStore } from '@/lib/store';
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, type AccountKind, type BankCard } from '@/lib/types';

const BALANCE_LABEL: Record<AccountKind, string> = {
  bank: 'Balance',
  card: 'Amount owed',
  wallet: 'Balance',
  payments: 'Balance',
  crypto: 'Value',
  investment: 'Value',
  cash: 'Cash in hand',
};

/** One-tap starting points that fill in the type and currency. */
const PRESETS: { name: string; kind: AccountKind; currency: string }[] = [
  { name: 'Stripe', kind: 'payments', currency: 'USD' },
  { name: 'Revolut', kind: 'bank', currency: 'USD' },
  { name: 'Mercury', kind: 'bank', currency: 'USD' },
  { name: 'Binance', kind: 'crypto', currency: 'USD' },
  { name: 'HDFC Bank', kind: 'bank', currency: 'INR' },
  { name: 'ICICI Bank', kind: 'bank', currency: 'INR' },
  { name: 'SBI', kind: 'bank', currency: 'INR' },
  { name: 'Axis Bank', kind: 'bank', currency: 'INR' },
  { name: 'Kotak', kind: 'bank', currency: 'INR' },
];

/** Kinds whose bank alerts carry an account or card ending. */
const HAS_DIGITS: readonly AccountKind[] = ['bank', 'card', 'wallet'];
/** Kinds with a website or app you sign in to. */
const HAS_LOGIN: readonly AccountKind[] = ['bank', 'payments', 'wallet', 'crypto', 'investment'];

const CARD_TYPES = [
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
] as const;

/** "0829" or "08/29" typed in, "08/29" out. */
function formatExpiry(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export default function AccountScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; last4?: string; balance?: string }>();
  const existing = useStore((s) => s.accounts.find((a) => a.id === params.id));
  const displayCurrency = useStore((s) => s.settings.currency);
  const rates = useStore((s) => s.settings.rates);
  const addAccount = useStore((s) => s.addAccount);
  const updateAccount = useStore((s) => s.updateAccount);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const drawer = useRef<DrawerHandle>(null);
  const isNew = !existing;
  // Chosen now, so a new account's login can be saved under its id before the account exists.
  const [accountId] = useState(() => existing?.id ?? newId('acc'));
  // An account spotted in bank messages arrives with its details filled in, in the phone's currency.
  const fromMessages = isNew && !!params.last4;

  const [name, setName] = useState(existing?.name ?? params.name ?? '');
  const [kind, setKind] = useState<AccountKind>(existing?.kind ?? 'bank');
  const [last4, setLast4] = useState(existing?.last4 ?? params.last4 ?? '');
  const [balance, setBalance] = useState(existing ? String(existing.balance) : (params.balance ?? ''));
  const [currency, setCurrency] = useState(existing?.currency ?? (fromMessages ? deviceCurrency() : displayCurrency));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Login and holder name.
  const [loginOpen, setLoginOpen] = useState(false);
  const [holderName, setHolderName] = useState(existing?.holderName ?? '');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // A saved login stays hidden until it is shown with a fingerprint, or replaced.
  const [editingLogin, setEditingLogin] = useState(!existing?.hasLogin);
  const [loginEdited, setLoginEdited] = useState(false);

  // Cards.
  const [cardsOpen, setCardsOpen] = useState(false);
  const [cards, setCards] = useState<BankCard[]>(existing?.cards ?? []);
  const [cardLabel, setCardLabel] = useState('');
  const [cardType, setCardType] = useState<BankCard['type']>('debit');
  const [cardLast4, setCardLast4] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');

  // Offer only the platforms not already in the portfolio.
  const takenNames = useStore((s) => s.accounts.map((a) => a.name.toLowerCase()).join('|'));
  const presets = PRESETS.filter((p) => !takenNames.split('|').includes(p.name.toLowerCase()));
  const hasLogin = HAS_LOGIN.includes(kind);
  const isBank = kind === 'bank';

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setName(preset.name);
    setKind(preset.kind);
    setCurrency(preset.currency);
    setError(null);
  }

  async function handleShowLogin() {
    setError(null);
    try {
      const login = await readBankLogin(accountId);
      if (!login) {
        setError('This login can no longer be read: the phone’s fingerprints or screen lock changed. Enter it again.');
        setEditingLogin(true);
        return;
      }
      setLoginId(login.loginId);
      setPassword(login.password);
      setShowPassword(true);
      setEditingLogin(true);
      setLoginEdited(false);
    } catch (e) {
      if (!isCancelledPrompt(e)) setError(`Could not show the login. ${e instanceof Error ? e.message : ''}`.trim());
    }
  }

  function editLogin(field: 'id' | 'password', value: string) {
    if (field === 'id') setLoginId(value);
    else setPassword(value);
    setLoginEdited(true);
    setError(null);
  }

  /** The card typed into the card fields, a message saying what is wrong, or null when they are empty. */
  function draftCard(): BankCard | string | null {
    const digits = cardLast4.replace(/\D/g, '');
    if (!digits && !cardLabel.trim() && !cardExpiry) return null;
    if (digits.length !== 4) return 'Enter the card’s last 4 digits.';
    if (cardExpiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry)) return 'Enter the expiry as MM/YY, or leave it empty.';
    return {
      id: newId('card'),
      label: cardLabel.trim() || (cardType === 'credit' ? 'Credit card' : 'Debit card'),
      type: cardType,
      last4: digits,
      expiry: cardExpiry || null,
    };
  }

  function handleAddCard() {
    const card = draftCard();
    if (typeof card === 'string') return setError(card);
    if (!card) return setError('Enter the card’s last 4 digits.');
    setCards([...cards, card]);
    setCardLabel('');
    setCardLast4('');
    setCardExpiry('');
    setError(null);
  }

  async function handleSave() {
    if (saving) return;
    const trimmedName = name.trim();
    const amount = balance.trim() === '' ? 0 : Number(balance.replace(/,/g, ''));
    const digits = last4.replace(/\D/g, '').slice(-4);
    if (!trimmedName) return setError('Give it a name, like "HDFC Savings".');
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter the balance as a number.');
    if (digits && digits.length < 3) return setError('Enter the last 4 digits, or leave them empty.');

    // A card typed in but not yet added is kept too.
    const pending = isBank ? draftCard() : null;
    if (typeof pending === 'string') {
      setCardsOpen(true);
      return setError(pending);
    }
    const allCards = pending ? [...cards, pending] : cards;

    let loginStored = !!existing?.hasLogin;
    if (hasLogin && loginEdited) {
      const id = loginId.trim();
      if (!id && !password) {
        // Both cleared: remove the saved login.
        if (loginStored) await deleteBankLogin(accountId).catch(() => {});
        loginStored = false;
      } else {
        if (!id || !password) {
          setLoginOpen(true);
          return setError('Enter both the login ID and the password, or clear both.');
        }
        if (!canSaveBankLogins()) {
          setLoginOpen(true);
          return setError('Logins are saved only behind a fingerprint. Set one up in the phone’s settings first.');
        }
        setSaving(true);
        try {
          await saveBankLogin(accountId, { loginId: id, password });
          loginStored = true;
        } catch (e) {
          setSaving(false);
          if (!isCancelledPrompt(e)) setError(`The login was not saved. ${e instanceof Error ? e.message : ''}`.trim());
          return;
        }
      }
    }

    if (!drawer.current?.close()) return;
    const input = {
      name: trimmedName,
      kind,
      last4: HAS_DIGITS.includes(kind) && digits ? digits : null,
      balance: amount,
      currency,
      holderName: holderName.trim() || null,
      cards: allCards,
      hasLogin: loginStored,
    };
    if (existing) updateAccount(existing.id, input);
    else addAccount(input, accountId);
  }

  async function handleDelete() {
    if (!existing) return;
    const ok = await confirmAction(
      'Remove this account?',
      'Its transactions stay in your history but are no longer linked to it. A saved login is deleted from this phone.',
      'Remove'
    );
    if (!ok) return;
    drawer.current?.close(() => {
      deleteAccount(existing.id);
      if (existing.hasLogin) deleteBankLogin(existing.id).catch(() => {});
    });
  }

  const loginDetail = loginEdited
    ? loginId.trim() || password
      ? 'Saved when you tap Save'
      : 'Will be removed'
    : existing?.hasLogin
      ? 'Saved behind your fingerprint'
      : 'Optional';

  return (
    <Drawer
      ref={drawer}
      title={isNew ? 'New account' : 'Edit account'}
      fallback="/accounts"
      footer={
        <View style={styles.actions}>
          {existing && <Button label="Remove" variant="danger" icon="trash" onPress={handleDelete} disabled={saving} />}
          <Button
            label={isNew ? 'Add account' : 'Save'}
            icon="check"
            onPress={handleSave}
            loading={saving}
            style={styles.fill}
          />
        </View>
      }>
      {isNew && !fromMessages && presets.length > 0 && (
        <ChipRow>
          {presets.map((p) => (
            <Chip key={p.name} label={p.name} selected={name === p.name} onPress={() => applyPreset(p)} />
          ))}
        </ChipRow>
      )}

      <Input
        value={name}
        onChangeText={(v) => {
          setName(v);
          setError(null);
        }}
        placeholder="Name, e.g. HDFC Savings"
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel="Account name"
      />

      <FieldLabel>Type</FieldLabel>
      <ChipRow>
        {ACCOUNT_KINDS.map((k) => (
          <Chip
            key={k}
            label={ACCOUNT_KIND_LABEL[k]}
            icon={ACCOUNT_GLYPH_NAME[k]}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </ChipRow>

      <FieldLabel>{BALANCE_LABEL[kind]}</FieldLabel>
      <View style={styles.row}>
        <Input
          value={balance}
          onChangeText={setBalance}
          placeholder="0"
          keyboardType="decimal-pad"
          accessibilityLabel={BALANCE_LABEL[kind]}
          style={styles.fill}
        />
        {HAS_DIGITS.includes(kind) && (
          <Input
            value={last4}
            onChangeText={setLast4}
            placeholder="Last 4"
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel="Last 4 digits, optional"
            style={styles.short}
          />
        )}
      </View>
      <Segmented
        options={currencyChoices(currency, displayCurrency, rates).map((c) => ({ value: c, label: c }))}
        value={currency}
        onChange={setCurrency}
      />

      {hasLogin && (
        <Expander
          icon="lock"
          title={isBank ? 'Login & account holder' : 'Login'}
          detail={loginDetail}
          open={loginOpen}
          onToggle={() => setLoginOpen(!loginOpen)}>
          {isBank && (
            <Input
              value={holderName}
              onChangeText={setHolderName}
              placeholder="Name on the account"
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Account holder name"
            />
          )}
          {existing?.hasLogin && !editingLogin ? (
            <View style={styles.row}>
              <Button label="Show login" icon="visible" variant="secondary" onPress={handleShowLogin} style={styles.fill} />
              <Button
                label="Replace"
                variant="ghost"
                onPress={() => setEditingLogin(true)}
              />
            </View>
          ) : (
            <>
              <Input
                value={loginId}
                onChangeText={(v) => editLogin('id', v)}
                placeholder="Login ID or customer ID"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                importantForAutofill="no"
                accessibilityLabel="Login ID"
              />
              <View style={styles.row}>
                <Input
                  value={password}
                  onChangeText={(v) => editLogin('password', v)}
                  placeholder="Password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  accessibilityLabel="Password"
                  style={styles.fill}
                />
                <IconButton
                  icon={showPassword ? 'hidden' : 'visible'}
                  label={showPassword ? 'Hide password' : 'Show password'}
                  tone="mint"
                  size={48}
                  onPress={() => setShowPassword(!showPassword)}
                />
              </View>
            </>
          )}
          <AppText variant="caption" color="textTertiary">
            {existing?.hasLogin && editingLogin ? 'Clear both to remove the login. ' : ''}
            Kept on this phone behind your fingerprint. Never sent anywhere.
          </AppText>
        </Expander>
      )}

      {isBank && (
        <Expander
          icon="card"
          title="Cards"
          detail={cards.length ? `${cards.length} card${cards.length === 1 ? '' : 's'}` : 'None added'}
          open={cardsOpen}
          onToggle={() => setCardsOpen(!cardsOpen)}>
          {cards.map((c) => (
            <View key={c.id} style={styles.cardRow}>
              <Icon name="card" size={18} color={Colors.accent} />
              <View style={styles.fill}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {c.label}
                </Text>
                <AppText variant="caption" color="textSecondary">
                  {c.type === 'credit' ? 'Credit' : 'Debit'} · •• {c.last4}
                  {c.expiry ? ` · ${c.expiry}` : ''}
                </AppText>
              </View>
              <IconButton
                icon="close"
                label={`Remove ${c.label}`}
                tone="mint"
                size={30}
                onPress={() => setCards(cards.filter((x) => x.id !== c.id))}
              />
            </View>
          ))}

          <Input
            value={cardLabel}
            onChangeText={setCardLabel}
            placeholder="Card name, e.g. Millennia"
            autoCapitalize="words"
            accessibilityLabel="Card name"
          />
          <Segmented options={CARD_TYPES} value={cardType} onChange={setCardType} />
          <View style={styles.row}>
            <Input
              value={cardLast4}
              onChangeText={(v) => setCardLast4(v.replace(/\D/g, ''))}
              placeholder="Last 4"
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel="Card last 4 digits"
              style={styles.fill}
            />
            <Input
              value={cardExpiry}
              onChangeText={(v) => setCardExpiry(formatExpiry(v))}
              placeholder="MM/YY"
              keyboardType="number-pad"
              maxLength={5}
              accessibilityLabel="Card expiry"
              style={styles.fill}
            />
          </View>
          <Button label="Add card" icon="plus" variant="secondary" compact onPress={handleAddCard} />
          <AppText variant="caption" color="textTertiary">
            Only the last 4 digits and expiry are kept, never the full number, CVV or PIN.
          </AppText>
        </Expander>
      )}

      {error && <Banner tone="error" message={error} />}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  short: { width: 96, textAlign: 'center' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardMuted,
  },
  cardName: { fontFamily: Font.semibold, fontSize: 14, color: Colors.text },
});
