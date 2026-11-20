import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Colors, Font } from '@/constants/theme';
import { formatMoney } from '@/lib/format';

const COLS = 3;
const ROWS = 7;
const UNITS = COLS * ROWS;

type Point = { month: string; spent: number };

function shortMonth(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

/**
 * Six months of spending as a dot matrix: each month is a 3×7 block that fills from the bottom,
 * so one dot is 1/21 of the busiest month. The selected month is forest, the rest lime.
 * Tapping a block selects that month.
 */
export function DotChart({
  data,
  selected,
  currency,
  onSelect,
}: {
  data: Point[];
  selected: string;
  currency: string;
  onSelect: (month: string) => void;
}) {
  const max = Math.max(...data.map((d) => d.spent), 0);

  return (
    <View style={styles.chart}>
      {data.map((d, monthIndex) => {
        const isSelected = d.month === selected;
        const filled = max > 0 && d.spent > 0 ? Math.max(1, Math.round((d.spent / max) * UNITS)) : 0;
        return (
          <Pressable
            key={d.month}
            onPress={() => onSelect(d.month)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${shortMonth(d.month)}: ${formatMoney(d.spent, currency, { compact: true })} spent`}
            style={styles.block}>
            <View style={styles.grid}>
              {Array.from({ length: ROWS }, (_, row) => (
                <View key={row} style={styles.gridRow}>
                  {Array.from({ length: COLS }, (__, col) => {
                    // Row 0 is the top; units fill the bottom row first, left to right.
                    const unit = (ROWS - 1 - row) * COLS + col;
                    const on = unit < filled;
                    if (!on) return <View key={col} style={styles.dot} />;
                    // Lit dots pop in from the bottom row upward, one month after another.
                    return (
                      <Animated.View
                        key={col}
                        entering={ZoomIn.delay(250 + monthIndex * 70 + unit * 22).duration(260)}
                        style={[styles.dot, isSelected ? styles.dotSelected : styles.dotOn]}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
            <Text style={[styles.label, isSelected && styles.labelSelected]}>{shortMonth(d.month)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', justifyContent: 'space-between' },
  block: { alignItems: 'center', gap: 8 },
  grid: { gap: 4 },
  gridRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.dot },
  dotOn: { backgroundColor: Colors.limeDeep },
  dotSelected: { backgroundColor: Colors.accent },
  label: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  labelSelected: { fontFamily: Font.bold, color: Colors.text },
});
