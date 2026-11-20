import type { Href } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  type ReactNode,
  type Ref,
} from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Radius, Shadow, Spacing } from '@/constants/theme';
import { goBack } from '@/lib/nav';

import { Bouncy, Springs } from './bouncy';
import { Icon, type IconName } from './icon';
import { AppText, IconBubble, IconButton } from './ui';

/** How far the sheet must be dragged down, or how fast, before letting go closes it. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.9;
const CLOSE_MS = 220;
/** Extra sheet below the screen edge, so an upward over-stretch never shows a gap. */
const OVERHANG = 60;

export type DrawerHandle = {
  /**
   * Slides the drawer away and leaves the screen, then runs `then` (for work that would
   * otherwise flash on the closing drawer, such as deleting what it shows). Returns false when
   * the drawer is already closing, so a second tap on Save does nothing.
   */
  close: (then?: () => void) => boolean;
};

const DrawerContext = createContext<DrawerHandle | null>(null);

/** Closes the drawer this component sits in, with its slide-down animation. */
export function useDrawer() {
  const drawer = use(DrawerContext);
  if (!drawer) throw new Error('useDrawer must be used inside a <Drawer>.');
  return drawer;
}

/**
 * A screen shown as a sheet that springs up from the bottom over the page it came from.
 * Close it by tapping outside, dragging the top edge down, the close button, or Back.
 *
 * The route must be registered with `presentation: 'transparentModal'` and `animation: 'none'`;
 * this component does the animating. Pass a `ref` to close it from the screen, e.g. after Save.
 */
export function Drawer({
  ref,
  title,
  subtitle,
  children,
  footer,
  fallback = '/',
  contentStyle,
}: {
  ref?: Ref<DrawerHandle>;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned under the scrolling content, e.g. the Save button. */
  footer?: ReactNode;
  /** Where to land if the drawer was opened directly, with nothing behind it. */
  fallback?: Href;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const offset = useSharedValue(windowHeight);
  const shade = useSharedValue(0);
  // A shared value rather than a ref, so the drag handlers made during render may read it.
  const closing = useSharedValue(false);

  useEffect(() => {
    offset.set(withSpring(0, Springs.sheet));
    shade.set(withTiming(1, { duration: 260 }));
  }, [offset, shade]);

  const close = useCallback(
    (then?: () => void) => {
      if (closing.get()) return false;
      closing.set(true);
      Keyboard.dismiss();
      shade.set(withTiming(0, { duration: CLOSE_MS }));
      offset.set(withTiming(windowHeight, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }));
      setTimeout(() => {
        goBack(fallback);
        then?.();
      }, CLOSE_MS);
      return true;
    },
    [closing, fallback, offset, shade, windowHeight]
  );
  useImperativeHandle(ref, () => ({ close }), [close]);

  // Android's Back slides the drawer away instead of cutting it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const drag = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          // Down follows the finger; up gives a little, like a rubber band.
          offset.set(g.dy > 0 ? g.dy : -Math.min(OVERHANG / 2, Math.sqrt(-g.dy) * 3));
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) close();
          else offset.set(withSpring(0, { ...Springs.sheet, velocity: g.vy * 1000 }));
        },
        onPanResponderTerminate: () => offset.set(withSpring(0, Springs.sheet)),
      }),
    [close, offset]
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const shadeStyle = useAnimatedStyle(() => ({
    // Fades with the sheet as it is dragged down, so the page behind comes back into view.
    opacity: shade.get() * interpolate(offset.get(), [0, windowHeight * 0.6], [1, 0.2], Extrapolation.CLAMP),
  }));

  return (
    <DrawerContext value={{ close }}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shade, shadeStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
        </Animated.View>

        <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              { maxHeight: windowHeight - insets.top - 12 + OVERHANG, paddingBottom: OVERHANG },
              sheetStyle,
            ]}
            accessibilityViewIsModal>
            <View {...drag.panHandlers} style={styles.top}>
              <View style={styles.grabber} />
              <View style={styles.header}>
                <View style={styles.fill}>
                  <AppText variant="heading" accessibilityRole="header">
                    {title}
                  </AppText>
                  {subtitle && (
                    <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                      {subtitle}
                    </AppText>
                  )}
                </View>
                <IconButton icon="close" label="Close" tone="mint" size={36} onPress={() => close()} />
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, !footer && { paddingBottom: insets.bottom + 20 }, contentStyle]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}>
              {children}
            </ScrollView>

            {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>{footer}</View>}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </DrawerContext>
  );
}

/** One line of chips that scrolls sideways, edge to edge across the drawer. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.chipRow}
      contentContainerStyle={styles.chipRowContent}>
      {children}
    </ScrollView>
  );
}

/**
 * A row that opens to show more fields beneath it, for the optional parts of a form so the
 * drawer stays short until they are wanted.
 */
export function Expander({
  icon,
  title,
  detail,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  title: string;
  detail: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.expander}>
      <Bouncy
        scaleTo={0.98}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${detail}`}
        style={styles.expanderHead}>
        <IconBubble name={icon} size={34} tone={open ? 'lime' : 'mint'} />
        <View style={styles.fill}>
          <AppText variant="label">{title}</AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {detail}
          </AppText>
        </View>
        <Icon
          name="chevronRight"
          size={18}
          color={Colors.textSecondary}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Bouncy>
      {open && (
        <Animated.View entering={FadeInDown.springify().damping(16).stiffness(180)} style={styles.expanderBody}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

/** A small label above a group of fields in a drawer. */
export function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="micro" color="textSecondary" style={styles.fieldLabel}>
      {children.toUpperCase()}
    </AppText>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  fill: { flex: 1 },
  shade: { backgroundColor: Colors.shade },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth + 40,
    alignSelf: 'center',
    marginBottom: -OVERHANG,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl + 4,
    borderTopRightRadius: Radius.xl + 4,
    ...Shadow.sheet,
  },
  top: { paddingTop: 10, paddingHorizontal: Spacing.three },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.grabber,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: Spacing.three, paddingTop: 12, gap: 14 },
  footer: { paddingHorizontal: Spacing.three, paddingTop: 12, gap: 8 },
  fieldLabel: { letterSpacing: 0.8, marginBottom: -6, paddingHorizontal: 2 },
  expander: { backgroundColor: Colors.card, borderRadius: Radius.lg, overflow: 'hidden' },
  expanderHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  expanderBody: { paddingHorizontal: 12, paddingBottom: 14, gap: 10 },
  chipRow: { marginHorizontal: -Spacing.three, flexGrow: 0 },
  chipRowContent: { gap: 8, paddingHorizontal: Spacing.three },
});
