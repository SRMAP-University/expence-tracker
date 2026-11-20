import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * The app's springs, in one place so everything moves with the same feel.
 * Reanimated already honours the phone's "remove animations" setting for each of them.
 */
export const Springs = {
  /** A finger pressing down: quick, no wobble. */
  press: { damping: 18, stiffness: 520, mass: 0.6 },
  /** Letting go: overshoots a little, so controls feel springy. */
  release: { damping: 9, stiffness: 300, mass: 0.7 },
  /** A page settling in. */
  page: { damping: 15, stiffness: 150, mass: 0.9 },
  /** The sliding pill in a switch. */
  pill: { damping: 15, stiffness: 240, mass: 0.8 },
  /** A drawer rising from the bottom. */
  sheet: { damping: 19, stiffness: 190, mass: 0.9 },
} as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that squashes under the finger and springs back when let go. */
export function Bouncy({
  scaleTo = 0.95,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style'> & { scaleTo?: number; style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, Springs.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, Springs.release));
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}

/**
 * Style that springs a page up into place each time it comes into view, so switching tabs
 * feels alive rather than a hard cut.
 */
export function usePageSpring() {
  const progress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      progress.set(withSequence(withTiming(0, { duration: 0 }), withSpring(1, Springs.page)));
    }, [progress])
  );

  return useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: interpolate(p, [0, 0.5], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: (1 - p) * 26 }, { scale: 0.97 + 0.03 * p }],
    };
  });
}

/** A view that springs into place each time its screen comes into view. */
export function PageSpring({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const spring = usePageSpring();
  return <Animated.View style={[{ flex: 1 }, style, spring]}>{children}</Animated.View>;
}
