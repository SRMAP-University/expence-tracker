import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  Font,
  MaxContentWidth,
  Radius,
  Shadow,
  Spacing,
  TabBarHeight,
  TabBarMargin,
  type ThemeColor,
} from '@/constants/theme';
import { moneyParts } from '@/lib/format';
import { goBack } from '@/lib/nav';
import type { Category } from '@/lib/types';

import { Bouncy, Springs, usePageSpring } from './bouncy';
import { Icon, type IconName } from './icon';

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

const TEXT = StyleSheet.create({
  hero: { fontFamily: Font.medium, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  title: { fontFamily: Font.medium, fontSize: 30, lineHeight: 35, letterSpacing: -0.7 },
  heading: { fontFamily: Font.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: Font.medium, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: Font.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: Font.medium, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: Font.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.1 },
});

export type TextVariant = keyof typeof TEXT;

export function AppText({
  variant = 'body',
  color = 'text',
  style,
  ...rest
}: TextProps & { variant?: TextVariant; color?: ThemeColor }) {
  return <Text style={[TEXT[variant], { color: Colors[color] }, style as StyleProp<TextStyle>]} {...rest} />;
}

/** An amount with its currency symbol set small and raised, as on a printed statement. */
export function Money({
  amount,
  currency,
  size = 32,
  color = Colors.text,
  symbolColor = Colors.textTertiary,
  compact,
  sign,
  style,
}: {
  amount: number;
  currency: string;
  size?: number;
  color?: string;
  symbolColor?: string;
  compact?: boolean;
  sign?: '+' | '−';
  style?: StyleProp<ViewStyle>;
}) {
  const { symbol, value } = moneyParts(amount, currency, { compact });
  return (
    <View style={[styles.money, style]} accessible accessibilityLabel={`${sign ?? ''}${symbol}${value}`}>
      {!!symbol && (
        <Text
          style={{
            fontFamily: Font.semibold,
            fontSize: Math.max(11, size * 0.46),
            lineHeight: size * 0.62,
            marginTop: size * 0.1,
            marginRight: 2,
            color: symbolColor,
          }}>
          {sign}
          {symbol}
        </Text>
      )}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: Font.semibold,
          fontSize: size,
          lineHeight: size * 1.15,
          letterSpacing: -size * 0.02,
          color,
          flexShrink: 1,
        }}>
        {!symbol && sign}
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  return TabBarHeight + TabBarMargin + insets.bottom + Spacing.four;
}

/** Soft mint wash with two pale arcs, behind every screen. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[Colors.backdropTop, Colors.backdropMid, Colors.backdropBottom]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.arcOne} />
      <View style={styles.arcTwo} />
    </View>
  );
}

export function Screen({
  children,
  refreshControl,
  scroll = true,
  contentStyle,
  ...scrollProps
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
} & Omit<ScrollViewProps, 'contentContainerStyle'>) {
  const clearance = useTabBarClearance();
  const spring = usePageSpring();
  return (
    <View style={styles.screen}>
      <Backdrop />
      <SafeAreaView edges={['top']} style={styles.fill}>
        <Animated.View style={[styles.fill, spring]}>
          {scroll ? (
            <ScrollView
              refreshControl={refreshControl}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: clearance }, contentStyle]}
              {...scrollProps}>
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.fill, contentStyle]}>{children}</View>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

/** Large, light-weight screen title with an optional eyebrow and subtitle. */
export function ScreenTitle({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.fill}>
        {eyebrow && (
          <AppText variant="body" color="textSecondary">
            {eyebrow}
          </AppText>
        )}
        <AppText variant="hero" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle && (
          <AppText variant="caption" color="textSecondary" style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );
}

/** Header for pushed/modal screens: round back button, centred title. */
export function ModalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.modalHeader}>
      <IconButton icon="back" label="Back" onPress={() => goBack()} />
      <View style={styles.modalTitle}>
        <AppText variant="title" style={styles.center} accessibilityRole="header">
          {title}
        </AppText>
        {subtitle && (
          <AppText variant="caption" color="textSecondary" style={styles.center}>
            {subtitle}
          </AppText>
        )}
      </View>
    </View>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={12} accessibilityRole="button">
          <AppText variant="label" color="textSecondary">
            {action.label}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'onDark' | 'onDarkOutline' | 'ghost' | 'danger';

const BUTTON: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: Colors.forest, fg: Colors.onForest, border: Colors.forest },
  secondary: { bg: Colors.card, fg: Colors.text, border: Colors.border },
  onDark: { bg: Colors.paper, fg: Colors.onPaper, border: Colors.paper },
  onDarkOutline: { bg: 'transparent', fg: Colors.onForest, border: Colors.onForestLine },
  ghost: { bg: 'transparent', fg: Colors.accent, border: 'transparent' },
  danger: { bg: Colors.negativeSoft, fg: Colors.negative, border: Colors.negativeSoft },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const c = BUTTON[variant];
  const inactive = disabled || loading;

  return (
    <Bouncy
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: c.bg, borderColor: c.border, opacity: inactive ? 0.5 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={c.fg} />
      ) : (
        icon && <Icon name={icon} size={compact ? 16 : 18} color={c.fg} />
      )}
      <Text style={[styles.buttonLabel, compact && styles.buttonLabelCompact, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Bouncy>
  );
}

/** Round icon-only button. `label` is read by screen readers. */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'white',
  size = 44,
  disabled,
  loading,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'white' | 'forest' | 'mint';
  size?: number;
  disabled?: boolean;
  loading?: boolean;
}) {
  const fg = tone === 'forest' ? Colors.onForest : Colors.accent;
  return (
    <Bouncy
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={6}
      scaleTo={0.86}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.iconButton,
        tone === 'white' && Shadow.card,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone === 'forest' ? Colors.forest : tone === 'mint' ? Colors.cardMuted : Colors.card,
          opacity: disabled ? 0.4 : 1,
        },
      ]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : <Icon name={icon} size={size * 0.44} color={fg} />}
    </Bouncy>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const fg = selected ? Colors.onForest : Colors.text;
  return (
    <Bouncy
      onPress={onPress}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? Colors.forest : Colors.card,
          borderColor: selected ? Colors.forest : Colors.border,
        },
      ]}>
      {icon && <Icon name={icon} size={15} color={fg} />}
      <Text style={[styles.chipLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Bouncy>
  );
}

const SEGMENT_PAD = 4;

/**
 * Two to four short choices in one pill, with a dark highlight that slides (and slightly
 * overshoots) to the chosen one.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = useSharedValue(0);
  const position = useSharedValue(index);

  useEffect(() => {
    position.set(withSpring(index, Springs.pill));
  }, [index, position]);

  const pill = useAnimatedStyle(() => ({
    width: segment.get(),
    opacity: segment.get() > 0 ? 1 : 0,
    transform: [{ translateX: position.get() * segment.get() }],
  }));

  return (
    <View
      style={[styles.segmented, style]}
      accessibilityRole="tablist"
      onLayout={(e) => segment.set((e.nativeEvent.layout.width - SEGMENT_PAD * 2) / options.length)}>
      <Animated.View style={[styles.segmentPill, pill]} />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={styles.segment}>
            <Text
              style={[styles.segmentLabel, { color: selected ? Colors.onForest : Colors.textSecondary }]}
              numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small lime pill for deltas and states, e.g. "+27%". */
export function Badge({
  label,
  tone = 'lime',
  style,
}: {
  label: string;
  tone?: 'lime' | 'negative' | 'white' | 'forest';
  style?: StyleProp<ViewStyle>;
}) {
  const tones = {
    lime: { bg: Colors.lime, fg: Colors.onLime },
    negative: { bg: Colors.negativeSoft, fg: Colors.negative },
    white: { bg: Colors.paper, fg: Colors.onPaper },
    forest: { bg: Colors.forest, fg: Colors.onForest },
  };
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <Text style={[TEXT.micro, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Banner({
  tone = 'info',
  message,
  action,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success';
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const tones = {
    info: { bg: Colors.card, fg: Colors.accent, icon: 'info' as const },
    success: { bg: Colors.limeSoft, fg: Colors.accent, icon: 'check' as const },
    warning: { bg: Colors.warningSoft, fg: Colors.warning, icon: 'warning' as const },
    error: { bg: Colors.negativeSoft, fg: Colors.negative, icon: 'warning' as const },
  };
  const t = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Icon name={t.icon} size={18} color={t.fg} style={styles.bannerIcon} />
      <View style={styles.fill}>
        <AppText variant="caption">{message}</AppText>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={10} style={styles.bannerAction} accessibilityRole="button">
            <Text style={[TEXT.label, { color: t.fg }]}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function IconBubble({
  name,
  category,
  size = 42,
  tone = 'mint',
}: {
  name?: IconName;
  category?: Category;
  size?: number;
  tone?: 'mint' | 'lime' | 'white' | 'forest';
}) {
  const tones = {
    mint: { bg: Colors.cardMuted, fg: Colors.accent },
    lime: { bg: Colors.lime, fg: Colors.onLime },
    white: { bg: Colors.paper, fg: Colors.onPaper },
    forest: { bg: Colors.forest, fg: Colors.onForest },
  };
  const t = tones[tone];
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}>
      <Icon name={name} category={category} size={size * 0.46} color={t.fg} />
    </View>
  );
}

/** Tiny lime coin carrying the currency symbol, used beside money labels. */
export function CoinBadge({
  currency,
  size = 20,
  tone = 'lime',
}: {
  currency: string;
  size?: number;
  tone?: 'lime' | 'forest';
}) {
  const { symbol } = moneyParts(0, currency);
  const bg = tone === 'forest' ? Colors.forest : Colors.lime;
  const fg = tone === 'forest' ? Colors.onForest : Colors.onLime;
  return (
    <View style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ fontFamily: Font.bold, fontSize: size * 0.56, lineHeight: size * 0.8, color: fg }}>
        {symbol.length > 0 && symbol.length <= 2 ? symbol : '•'}
      </Text>
    </View>
  );
}

export function Input({ style, ...rest }: TextInputProps) {
  return <TextInput placeholderTextColor={Colors.textTertiary} style={[styles.input, style]} {...rest} />;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginHorizontal: inset }]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  arcOne: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: Colors.arcStrong,
  },
  arcTwo: {
    position: 'absolute',
    top: 260,
    left: -220,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: Colors.arcSoft,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  money: { flexDirection: 'row', alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  subtitle: { marginTop: 2 },
  modalHeader: { gap: Spacing.three, alignItems: 'flex-start' },
  modalTitle: { alignSelf: 'stretch', gap: 2 },
  card: { backgroundColor: Colors.card, borderRadius: Radius.xl, ...Shadow.card },
  cardPadded: { padding: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  buttonCompact: { minHeight: 38, paddingHorizontal: 14 },
  buttonLabel: { fontFamily: Font.semibold, fontSize: 15 },
  buttonLabelCompact: { fontSize: 13 },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  chip: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipLabel: { fontFamily: Font.semibold, fontSize: 13 },
  segmented: {
    flexDirection: 'row',
    padding: SEGMENT_PAD,
    borderRadius: Radius.pill,
    backgroundColor: Colors.cardMuted,
  },
  segmentPill: {
    position: 'absolute',
    top: SEGMENT_PAD,
    bottom: SEGMENT_PAD,
    left: SEGMENT_PAD,
    borderRadius: Radius.pill,
    backgroundColor: Colors.forest,
  },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentLabel: { fontFamily: Font.semibold, fontSize: 14 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: Radius.lg },
  bannerIcon: { marginTop: 1 },
  bannerAction: { marginTop: 6, alignSelf: 'flex-start' },
  bubble: { alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardMuted,
    paddingHorizontal: 14,
    fontFamily: Font.medium,
    fontSize: 15,
    color: Colors.text,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
});
