import { useEffect, type ComponentProps, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useCountUp } from '@/hooks/use-count-up';

import { Money } from './ui';

/**
 * Springs a block up into place with a small bounce. `index` staggers siblings so a screen
 * assembles top to bottom.
 */
export function Rise({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(60 * index)
        .springify()
        .damping(14)
        .stiffness(150)
        .mass(0.9)}
      style={style}>
      {children}
    </Animated.View>
  );
}

/** `Money` whose number counts up to its value. */
export function CountUpMoney(props: ComponentProps<typeof Money>) {
  const value = useCountUp(props.amount);
  return <Money {...props} amount={value} />;
}

/** A bar that grows from zero to `ratio` (0–1) of its track. */
export function GrowBar({
  ratio,
  delay = 0,
  style,
}: {
  ratio: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.set(withDelay(delay, withTiming(ratio, { duration: 700, easing: Easing.out(Easing.cubic) })));
  }, [ratio, delay, width]);

  const animated = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  return <Animated.View style={[style, animated]} />;
}
