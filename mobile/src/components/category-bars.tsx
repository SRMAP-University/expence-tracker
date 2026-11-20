import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Font } from '@/constants/theme';
import type { CategoryTotal } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import type { Category } from '@/lib/types';

import { GrowBar } from './motion';
import { AppText, IconBubble } from './ui';

/**
 * Spend by category as labelled bars. One hue carries magnitude; the label and icon
 * carry identity, so 19 categories never need 19 colours.
 */
export function CategoryBars({
  data,
  total,
  currency,
  limit = 6,
  onSelect,
}: {
  data: CategoryTotal[];
  total: number;
  currency: string;
  limit?: number;
  onSelect?: (category: Category) => void;
}) {
  const max = data[0]?.amount ?? 0;
  const shown = data.slice(0, limit);
  const rest = data.slice(limit);
  const restAmount = rest.reduce((sum, c) => sum + c.amount, 0);
  const restLabel = `+ ${rest.length} more ${rest.length === 1 ? 'category' : 'categories'} · ${formatMoney(restAmount, currency, { compact: true })}`;

  return (
    <View style={styles.list}>
      {shown.map((c, i) => {
        const share = total > 0 ? Math.round((c.amount / total) * 100) : 0;
        return (
          <Pressable
            key={c.category}
            onPress={() => onSelect?.(c.category)}
            accessibilityRole="button"
            accessibilityLabel={`${c.category}: ${formatMoney(c.amount, currency)}, ${share} percent of spending`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <IconBubble category={c.category} size={38} />
            <View style={styles.body}>
              <View style={styles.labels}>
                <AppText variant="label" numberOfLines={1} style={styles.name}>
                  {c.category}
                </AppText>
                <Text style={styles.amount}>{formatMoney(c.amount, currency, { compact: true })}</Text>
                <Text style={styles.share}>{share}%</Text>
              </View>
              <View style={styles.track}>
                <GrowBar ratio={max > 0 ? Math.max(0.03, c.amount / max) : 0} delay={150 + i * 70} style={styles.fill} />
              </View>
            </View>
          </Pressable>
        );
      })}
      {rest.length > 0 && (
        <AppText variant="caption" color="textSecondary">
          {restLabel}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7 },
  body: { flex: 1, gap: 7 },
  labels: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1 },
  amount: { fontFamily: Font.semibold, fontSize: 14, color: Colors.text },
  share: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary, width: 34, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.dot, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Colors.accent },
});
