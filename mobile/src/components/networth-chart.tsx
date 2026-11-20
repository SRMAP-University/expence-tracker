import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Colors, Font } from '@/constants/theme';
import { formatMoney, formatMonth } from '@/lib/format';
import type { Ledger } from '@/lib/money';
import { netWorthHistory } from '@/lib/networth-history';

import { AppText, Badge, Card } from './ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const HEIGHT = 120;
const PAD = 8;

function history(ledger: Ledger) {
  return netWorthHistory(ledger, new Date(), 12);
}

/** Net worth month by month over the last year, as a line that draws itself in. */
export function NetWorthChart({ ledger }: { ledger: Ledger }) {
  const points = useMemo(() => history(ledger), [ledger]);
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(0);

  useEffect(() => {
    draw.set(0);
    draw.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [points, draw]);

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max));
  const x = (i: number) => PAD + (i * (width - PAD * 2)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2);

  const line = width ? points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ') : '';
  const area = width ? `${line} L${x(points.length - 1)},${HEIGHT} L${x(0)},${HEIGHT} Z` : '';
  // Long enough to cover the line, for the draw-in animation.
  const length = width * 2 + HEIGHT * 4;
  const strokeProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.get()) }));

  const first = points[0];
  const last = points[points.length - 1];
  const change = last.value - first.value;
  const changePct = first.value !== 0 ? Math.round((change / Math.abs(first.value)) * 100) : null;
  const currency = ledger.currency;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.fill}>
          <AppText variant="label">Net worth over time</AppText>
          <AppText variant="caption" color="textSecondary">
            Last 12 months · estimated from your transactions
          </AppText>
        </View>
        <Badge
          label={`${change >= 0 ? '+' : '−'}${formatMoney(Math.abs(change), currency, { compact: true })}${
            changePct !== null ? ` · ${changePct >= 0 ? '+' : ''}${changePct}%` : ''
          }`}
          tone={change >= 0 ? 'lime' : 'negative'}
        />
      </View>

      <View style={styles.chart} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={Colors.accent} stopOpacity={0.22} />
                <Stop offset="1" stopColor={Colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#nwFill)" />
            <AnimatedPath
              d={line}
              stroke={Colors.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              strokeDasharray={`${length} ${length}`}
              animatedProps={strokeProps}
            />
            <Circle cx={x(points.length - 1)} cy={y(last.value)} r={4.5} fill={Colors.accent} />
          </Svg>
        )}
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisText}>
          {formatMonth(first.month)} · {formatMoney(first.value, currency, { compact: true })}
        </Text>
        <Text style={styles.axisText}>
          Now · {formatMoney(last.value, currency, { compact: true })}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fill: { flex: 1 },
  chart: { height: HEIGHT },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontFamily: Font.medium, fontSize: 12, color: Colors.textTertiary },
});
