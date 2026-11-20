import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Colors, Font, Shadow } from '@/constants/theme';
import type { Metric } from '@/lib/analytics';

import { Icon, type IconName } from './icon';
import { CountUpMoney } from './motion';
import { Badge, CoinBadge } from './ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Point = { x: number; y: number };
type Box = { x0: number; x1: number; y0: number; y1: number };

/** Smooth curve through the series (Catmull-Rom), plus its length so it can be drawn in. */
function buildLine(series: number[], box: Box) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const flat = max === min;
  const pts: Point[] = series.map((v, i) => ({
    x: box.x0 + (i / (series.length - 1)) * (box.x1 - box.x0),
    y: flat ? (box.y0 + box.y1) / 2 : box.y1 - ((v - min) / (max - min)) * (box.y1 - box.y0),
  }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;

    // Arc length by sampling the cubic.
    let prev = p1;
    for (let s = 1; s <= 8; s++) {
      const t = s / 8;
      const u = 1 - t;
      const q = {
        x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
        y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
      };
      length += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
  }
  return { d, length: Math.ceil(length) + 2, end: pts[pts.length - 1] };
}

const METRICS: { key: Metric; icon: IconName; label: string }[] = [
  { key: 'spent', icon: 'down', label: 'Show spending' },
  { key: 'income', icon: 'up', label: 'Show income' },
  { key: 'saved', icon: 'savings', label: 'Show what is left over' },
];

const RIM_BUTTON = 46;

/**
 * Round feature dial: the month's running total drawn as a line that sweeps in,
 * the headline number counting up beneath it, and controls seated on the lower rim
 * (outer pair steps the month, inner three pick the metric).
 */
export function Dial({
  size,
  series,
  amount,
  negative,
  currency,
  caption,
  change,
  changeIsGood,
  metric,
  onMetric,
  onPrevMonth,
  onNextMonth,
  canGoNext,
}: {
  size: number;
  series: number[];
  amount: number;
  negative?: boolean;
  currency: string;
  caption: string;
  /** Percent change vs the previous month, if there is one to compare with. */
  change: number | null;
  changeIsGood: boolean;
  metric: Metric;
  onMetric: (metric: Metric) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoNext: boolean;
}) {
  const r = size / 2;
  const box: Box = { x0: size * 0.2, x1: size * 0.8, y0: size * 0.27, y1: size * 0.46 };
  const line = buildLine(series, box);
  const lineLength = line.length;

  const draw = useSharedValue(0);
  const marker = useSharedValue(0);

  useEffect(() => {
    draw.set(0);
    marker.set(0);
    draw.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    marker.set(withDelay(850, withTiming(1, { duration: 280 })));
  }, [line.d, draw, marker]);

  const strokeProps = useAnimatedProps(() => ({ strokeDashoffset: lineLength * (1 - draw.get()) }));
  const markerStyle = useAnimatedStyle(() => ({
    opacity: marker.get(),
    transform: [{ scale: 0.4 + 0.6 * marker.get() }],
  }));

  // Controls sit on the rim, fanned around the bottom of the circle.
  const rim = [-58, -29, 0, 29, 58].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { left: r + (r - 6) * Math.sin(a) - RIM_BUTTON / 2, top: r + (r - 6) * Math.cos(a) - RIM_BUTTON / 2 };
  });

  const badgeLeft = Math.min(Math.max(line.end.x - 22, size * 0.16), size * 0.84 - 44);

  return (
    <View style={[styles.wrap, { width: size, height: size + RIM_BUTTON / 2 }]}>
      <View style={[styles.disc, { width: size, height: size, borderRadius: r }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="dial-line" gradientUnits="userSpaceOnUse" x1={box.x0} y1={0} x2={box.x1} y2={0}>
              <Stop offset="0" stopColor={Colors.limeDeep} />
              <Stop offset="1" stopColor={Colors.forest} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={r}
            cy={r}
            r={r * 0.84}
            fill="none"
            stroke={Colors.border}
            strokeWidth={1.2}
            strokeDasharray="3 7"
            strokeLinecap="round"
          />
          {/* Soft underglow, then the line itself; both are drawn in together. */}
          <AnimatedPath
            d={line.d}
            fill="none"
            stroke={Colors.lime}
            strokeOpacity={0.45}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={`${lineLength} ${lineLength}`}
            animatedProps={strokeProps}
          />
          <AnimatedPath
            d={line.d}
            fill="none"
            stroke="url(#dial-line)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${lineLength} ${lineLength}`}
            animatedProps={strokeProps}
          />
        </Svg>

        {/* Coin at the top of the ring */}
        <View style={[styles.coin, { top: r - r * 0.84 - 16, left: r - 16 }]}>
          <CoinBadge currency={currency} size={32} tone="forest" />
        </View>

        {/* Where the line has got to, with the month-on-month change beneath it */}
        <Animated.View style={[styles.marker, { left: line.end.x - 6, top: line.end.y - 6 }, markerStyle]} />
        {change !== null && (
          <Animated.View style={[styles.change, { left: badgeLeft, top: box.y1 + 12 }, markerStyle]}>
            <Badge
              label={`${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change))}%`}
              tone={changeIsGood ? 'forest' : 'negative'}
            />
          </Animated.View>
        )}

        <View style={[styles.readout, { top: size * 0.59 }]}>
          <CountUpMoney
            amount={amount}
            currency={currency}
            size={Math.round(size * 0.115)}
            sign={negative ? '−' : undefined}
            color={negative ? Colors.negative : Colors.text}
          />
          <Text style={styles.caption}>{caption}</Text>
        </View>
      </View>

      <RimButton
        style={rim[0]}
        icon="chevronLeft"
        label="Previous month"
        onPress={onPrevMonth}
      />
      {METRICS.map((m, i) => (
        <RimButton
          key={m.key}
          style={rim[i + 1]}
          icon={m.icon}
          label={m.label}
          active={metric === m.key}
          onPress={() => onMetric(m.key)}
        />
      ))}
      <RimButton
        style={rim[4]}
        icon="chevronRight"
        label="Next month"
        onPress={onNextMonth}
        disabled={!canGoNext}
      />
    </View>
  );
}

function RimButton({
  style,
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  style: { left: number; top: number };
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.rimButton,
        style,
        active && styles.rimButtonActive,
        { opacity: pressed ? 0.8 : 1 },
      ]}>
      <Icon
        name={icon}
        size={19}
        color={active ? Colors.onForest : disabled ? Colors.textTertiary : Colors.accent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  disc: { backgroundColor: Colors.card, ...Shadow.card },
  coin: { position: 'absolute' },
  marker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.forest,
    borderWidth: 2.5,
    borderColor: Colors.card,
  },
  change: { position: 'absolute' },
  readout: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 2 },
  caption: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  // The canvas-coloured ring makes each control look seated into the rim of the dial.
  rimButton: {
    position: 'absolute',
    width: RIM_BUTTON,
    height: RIM_BUTTON,
    borderRadius: RIM_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 4,
    borderColor: Colors.background,
  },
  rimButtonActive: { backgroundColor: Colors.forest },
});
