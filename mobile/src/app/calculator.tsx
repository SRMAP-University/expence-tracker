import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Bouncy } from '@/components/bouncy';
import { Drawer, type DrawerHandle } from '@/components/drawer';
import { Icon } from '@/components/icon';
import { AppText, Button, Segmented } from '@/components/ui';
import { Colors, Font, Radius } from '@/constants/theme';
import {
  evaluate,
  formatResult,
  hasOperation,
  plainResult,
  pressKey,
  type CalcKey,
} from '@/lib/calculator';
import { confirmAction } from '@/lib/confirm';
import { formatRelative, newId } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { CalcEntry } from '@/lib/types';

const ROWS: CalcKey[][] = [
  ['AC', '%', '⌫', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

const VIEWS = [
  { value: 'keys', label: 'Calculator' },
  { value: 'history', label: 'History' },
] as const;

/** Spaces around the operators, so "1200×12+45" reads as "1200 × 12 + 45". */
function spaced(expr: string) {
  let out = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    // A minus at the start or after another operator is a sign, and stays attached.
    const binary = '+×÷'.includes(c) || (c === '−' && i > 0 && !'+−×÷'.includes(expr[i - 1]));
    out += binary ? ` ${c} ` : c;
  }
  return out;
}

function historyEntry(expression: string, value: number): CalcEntry {
  return { id: newId('calc'), expression, result: formatResult(value), at: Date.now() };
}

/** A calculator, with every answer kept in a history that is saved on the phone. */
export default function CalculatorScreen() {
  const history = useStore((s) => s.calcHistory);
  const addCalcEntry = useStore((s) => s.addCalcEntry);
  const clearCalcHistory = useStore((s) => s.clearCalcHistory);
  const drawer = useRef<DrawerHandle>(null);
  const [expr, setExpr] = useState('');
  const [fresh, setFresh] = useState(false);
  const [view, setView] = useState<'keys' | 'history'>('keys');

  const value = evaluate(expr);
  const live = hasOperation(expr) && !fresh ? value : null;

  function press(key: CalcKey) {
    if (key === '=') {
      if (value === null) return;
      if (hasOperation(expr)) {
        addCalcEntry(historyEntry(expr, value));
      }
      setExpr(plainResult(value));
      setFresh(true);
      return;
    }
    setExpr(pressKey(expr, key, fresh));
    setFresh(false);
  }

  function reuse(entry: CalcEntry) {
    const result = evaluate(entry.expression);
    if (result === null) return;
    setExpr(plainResult(result));
    setFresh(true);
    setView('keys');
  }

  async function handleClear() {
    const ok = await confirmAction('Clear history?', 'Every saved calculation is removed from this phone.', 'Clear');
    if (ok) clearCalcHistory();
  }

  function addAsExpense() {
    if (value === null || value === 0) return;
    const amount = String(Math.abs(value));
    drawer.current?.close(() => router.push({ pathname: '/add', params: { amount } }));
  }

  const canAdd = view === 'keys' && value !== null && value !== 0;

  return (
    <Drawer
      ref={drawer}
      title="Calculator"
      fallback="/"
      footer={
        canAdd ? (
          <Button
            label={`Add ${formatResult(Math.abs(value!))} as an expense`}
            icon="plus"
            variant="secondary"
            onPress={addAsExpense}
          />
        ) : undefined
      }>
      <Segmented
        options={VIEWS.map((v) => (v.value === 'history' && history.length ? { ...v, label: `History (${history.length})` } : v))}
        value={view}
        onChange={setView}
      />

      {view === 'keys' ? (
        <>
          <View style={styles.display} accessibilityLiveRegion="polite">
            <Text style={styles.expression} numberOfLines={2} adjustsFontSizeToFit>
              {expr ? spaced(expr) : '0'}
            </Text>
            <Text style={styles.live} numberOfLines={1}>
              {live !== null ? `= ${formatResult(live)}` : ' '}
            </Text>
          </View>

          <View style={styles.keypad}>
            {ROWS.map((row, r) => (
              <View key={r} style={styles.keyRow}>
                {row.map((key) => (
                  <Key key={key} value={key} wide={key === '0'} onPress={() => press(key)} />
                ))}
              </View>
            ))}
          </View>
        </>
      ) : history.length === 0 ? (
        <AppText variant="body" color="textSecondary" style={styles.empty}>
          Your calculations appear here, and stay saved on this phone.
        </AppText>
      ) : (
        <View style={styles.history}>
          {history.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => reuse(entry)}
              accessibilityRole="button"
              accessibilityLabel={`${entry.expression} equals ${entry.result}. Use this answer.`}
              style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}>
              <View style={styles.fill}>
                <Text style={styles.entryExpression} numberOfLines={1}>
                  {spaced(entry.expression)}
                </Text>
                <Text style={styles.entryResult} numberOfLines={1}>
                  = {entry.result}
                </Text>
              </View>
              <Text style={styles.entryTime}>{formatRelative(entry.at)}</Text>
            </Pressable>
          ))}
          <Button label="Clear history" icon="trash" variant="ghost" compact onPress={handleClear} style={styles.clear} />
        </View>
      )}
    </Drawer>
  );
}

const OPERATOR_KEYS: readonly CalcKey[] = ['+', '−', '×', '÷'];
const FUNCTION_KEYS: readonly CalcKey[] = ['AC', '%', '⌫'];

function Key({ value, wide, onPress }: { value: CalcKey; wide?: boolean; onPress: () => void }) {
  const isEquals = value === '=';
  const isOperator = OPERATOR_KEYS.includes(value);
  const isFunction = FUNCTION_KEYS.includes(value);
  const bg = isEquals ? Colors.forest : isOperator ? Colors.lime : isFunction ? Colors.cardMuted : Colors.card;
  const fg = isEquals ? Colors.onForest : isOperator ? Colors.onLime : isFunction ? Colors.accent : Colors.text;
  const label =
    value === '⌫' ? 'Delete' : value === 'AC' ? 'Clear' : value === '÷' ? 'Divide' : value === '×' ? 'Multiply' : value === '−' ? 'Minus' : value === '=' ? 'Equals' : value;

  return (
    <Bouncy
      onPress={onPress}
      scaleTo={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.key, wide && styles.keyWide, { backgroundColor: bg }]}>
      {value === '⌫' ? (
        <Icon name="back" size={22} color={fg} />
      ) : (
        <Text style={[styles.keyText, isFunction && styles.keyTextSmall, { color: fg }]}>{value}</Text>
      )}
    </Bouncy>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  display: {
    minHeight: 112,
    justifyContent: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  expression: {
    fontFamily: Font.semibold,
    fontSize: 44,
    lineHeight: 52,
    letterSpacing: -1,
    color: Colors.text,
    textAlign: 'right',
  },
  live: { fontFamily: Font.medium, fontSize: 20, lineHeight: 26, color: Colors.textSecondary, textAlign: 'right' },
  keypad: { gap: 10 },
  keyRow: { flexDirection: 'row', gap: 10 },
  key: {
    flex: 1,
    height: 62,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyWide: { flex: 2.15 },
  keyText: { fontFamily: Font.semibold, fontSize: 26 },
  keyTextSmall: { fontSize: 20 },
  empty: { textAlign: 'center', paddingVertical: 32 },
  history: { gap: 8 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
  },
  entryPressed: { opacity: 0.7 },
  entryExpression: { fontFamily: Font.medium, fontSize: 14, color: Colors.textSecondary },
  entryResult: { fontFamily: Font.semibold, fontSize: 20, color: Colors.text },
  entryTime: { fontFamily: Font.medium, fontSize: 12, color: Colors.textTertiary },
  clear: { alignSelf: 'center', marginTop: 4 },
});
