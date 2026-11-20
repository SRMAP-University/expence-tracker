import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow, Drawer, FieldLabel, type DrawerHandle } from '@/components/drawer';
import { AppText, Button, Chip } from '@/components/ui';
import { Colors, Font } from '@/constants/theme';
import { useLedger } from '@/hooks/use-ledger';
import type { Ledger } from '@/lib/money';
import { widgetFigures, widgetModel } from '@/lib/widget-data';

import {
  canPinWidget,
  DEFAULT_WIDGET_CONFIG,
  getWidgetConfig,
  getWidgetIds,
  isHomeWidgetAvailable,
  pinWidget,
  setWidgetConfig,
  type WidgetConfig,
  type WidgetModel,
} from '../../modules/home-widget';

const SHOW_OPTIONS: { value: WidgetConfig['show']; label: string }[] = [
  { value: 'month', label: 'Spent this month' },
  { value: 'today', label: 'Spent today' },
  { value: 'left', label: 'Left this month' },
  { value: 'networth', label: 'Net worth' },
  { value: 'account', label: 'One account' },
];

const LIST_OPTIONS: { value: WidgetConfig['list']; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'bills', label: 'Upcoming bills' },
  { value: 'categories', label: 'Top categories' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'none', label: 'None' },
];

function currentFigures(ledger: Ledger) {
  return widgetFigures(ledger, new Date());
}

/** Edits what one home screen widget shows. Opened from Settings, or by editing the widget itself. */
export default function WidgetScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const ledger = useLedger();
  const drawer = useRef<DrawerHandle>(null);
  const [widgetIds] = useState(getWidgetIds);
  const fromParam = params.id ? Number(params.id) : NaN;
  const widgetId = Number.isFinite(fromParam) ? fromParam : (widgetIds[0] ?? null);
  const [config, setConfig] = useState<WidgetConfig>(() =>
    widgetId !== null ? getWidgetConfig(widgetId) : DEFAULT_WIDGET_CONFIG
  );
  const figures = currentFigures(ledger);
  const model = widgetModel(figures, config);
  const accountMissing = config.show === 'account' && !config.accountId;

  if (!isHomeWidgetAvailable || widgetId === null) {
    return (
      <Drawer ref={drawer} title="Home screen widget" fallback="/settings">
        <AppText variant="body" color="textSecondary">
          {!isHomeWidgetAvailable
            ? 'Widgets need the latest app build. Install the updated APK first.'
            : canPinWidget()
              ? 'Add the widget to your home screen first, then choose what it shows.'
              : 'Long-press your home screen, tap Widgets, and drag Expense AI onto it. Then choose what it shows here.'}
        </AppText>
        {isHomeWidgetAvailable && canPinWidget() && (
          <Button label="Add to home screen" icon="plus" onPress={() => pinWidget()} />
        )}
      </Drawer>
    );
  }

  function handleSave() {
    if (accountMissing) return;
    if (!drawer.current?.close()) return;
    setWidgetConfig(widgetId!, config);
  }

  return (
    <Drawer
      ref={drawer}
      title="Home screen widget"
      subtitle={
        widgetIds.length > 1
          ? `Widget ${widgetIds.indexOf(widgetId) + 1} of ${widgetIds.length}. A small widget shows only what fits.`
          : 'A small widget shows only what fits. Make it bigger to see more.'
      }
      fallback="/settings"
      footer={<Button label="Save" icon="check" onPress={handleSave} disabled={accountMissing} />}>
      <WidgetPreview model={model} />

      <FieldLabel>Big number</FieldLabel>
      <ChipRow>
        {SHOW_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={config.show === o.value}
            onPress={() => setConfig({ ...config, show: o.value })}
          />
        ))}
      </ChipRow>
      {config.show === 'account' && (
        <ChipRow>
          {figures.accounts.length ? (
            figures.accounts.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                selected={config.accountId === a.id}
                onPress={() => setConfig({ ...config, accountId: a.id })}
              />
            ))
          ) : (
            <AppText variant="caption" color="textSecondary">
              No accounts yet. Add one in the Accounts tab.
            </AppText>
          )}
        </ChipRow>
      )}

      <FieldLabel>Also show</FieldLabel>
      <ChipRow>
        <Chip
          label="Quick stats"
          icon={config.stats ? 'check' : undefined}
          selected={config.stats}
          onPress={() => setConfig({ ...config, stats: !config.stats })}
        />
        <Chip
          label="Month progress"
          icon={config.progress ? 'check' : undefined}
          selected={config.progress}
          onPress={() => setConfig({ ...config, progress: !config.progress })}
        />
      </ChipRow>

      <FieldLabel>List</FieldLabel>
      <ChipRow>
        {LIST_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={config.list === o.value}
            onPress={() => setConfig({ ...config, list: o.value })}
          />
        ))}
      </ChipRow>
    </Drawer>
  );
}

/** The widget as it will look, drawn with the same figures the home screen gets. */
function WidgetPreview({ model }: { model: WidgetModel }) {
  return (
    <View style={styles.widget} accessibilityLabel={`Preview: ${model.label}, ${model.value}`}>
      <View style={styles.top}>
        <Text style={styles.label} numberOfLines={1}>
          {model.label}
        </Text>
        <View style={styles.add}>
          <Text style={styles.plus}>+</Text>
        </View>
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {model.value}
      </Text>

      {model.stats.length > 0 && (
        <View style={styles.stats}>
          {model.stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={styles.small} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={styles.statValue} numberOfLines={1}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {model.progress && (
        <View style={styles.section}>
          <View style={styles.progressRow}>
            <Text style={[styles.small, styles.fill]} numberOfLines={1}>
              {model.progress.label}
            </Text>
            <Text style={[styles.small, styles.lime]} numberOfLines={1}>
              {model.progress.right}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${model.progress.percent}%` }]} />
          </View>
        </View>
      )}

      {model.list.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.small, styles.lime, styles.semibold]}>{model.listTitle}</Text>
          {model.list.map((row, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.rowText, styles.fill]} numberOfLines={1}>
                {row.left}
              </Text>
              <Text style={[styles.rowText, styles.semibold, row.positive && styles.lime]} numberOfLines={1}>
                {row.right}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  widget: {
    alignSelf: 'center',
    width: 260,
    borderRadius: 28,
    backgroundColor: Colors.forest,
    paddingTop: 14,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 12,
  },
  top: { flexDirection: 'row', alignItems: 'center', height: 30 },
  label: { flex: 1, fontFamily: Font.semibold, fontSize: 13, color: Colors.lime },
  add: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { fontFamily: Font.bold, fontSize: 20, lineHeight: 22, color: Colors.onLime },
  value: { fontFamily: Font.semibold, fontSize: 30, lineHeight: 40, color: Colors.onForest },
  stats: { flexDirection: 'row', marginTop: 8 },
  stat: { flex: 1 },
  small: { fontFamily: Font.medium, fontSize: 11, color: Colors.onForestMuted },
  statValue: { fontFamily: Font.semibold, fontSize: 14, color: Colors.onForest },
  section: { marginTop: 10, gap: 4 },
  progressRow: { flexDirection: 'row', gap: 6 },
  lime: { color: Colors.lime },
  semibold: { fontFamily: Font.semibold },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.lime },
  row: { flexDirection: 'row', gap: 8 },
  rowText: { fontFamily: Font.medium, fontSize: 13, color: Colors.onForest },
});
