import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Radius } from '@/constants/theme';

type Notch = 'top' | 'bottom' | 'both';

/**
 * Rounded rectangle with a shallow, smoothly curved recess in the middle of the top and/or bottom edge.
 * `c` is the horizontal run of each S-curve, so the recess eases in rather than stepping.
 */
function notchedRectPath(w: number, h: number, r: number, notch: Notch, nw: number, nd: number) {
  const c = nd * 1.5;
  const x1 = (w - nw) / 2;
  const x2 = (w + nw) / 2;
  let d = `M ${r} 0`;
  if (notch !== 'bottom') {
    d += ` H ${x1 - c} C ${x1} 0 ${x1} ${nd} ${x1 + c} ${nd} H ${x2 - c} C ${x2} ${nd} ${x2} 0 ${x2 + c} 0`;
  }
  d += ` H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h}`;
  if (notch !== 'top') {
    d += ` H ${x2 + c} C ${x2} ${h} ${x2} ${h - nd} ${x2 - c} ${h - nd} H ${x1 + c} C ${x1} ${h - nd} ${x1} ${h} ${x1 - c} ${h}`;
  }
  d += ` H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  return d;
}

export function NotchCard({
  color,
  notch = 'top',
  radius = Radius.xl,
  notchDepth = 10,
  style,
  children,
}: {
  color: string;
  notch?: Notch;
  radius?: number;
  notchDepth?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };

  return (
    <View onLayout={onLayout} style={style}>
      {size ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={notchedRectPath(size.w, size.h, radius, notch, Math.min(size.w * 0.36, 150), notchDepth)}
            fill={color}
          />
        </Svg>
      ) : (
        // First frame, before the size is known: a plain rounded rect so there's no flash.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: radius }]} />
      )}
      {children}
    </View>
  );
}
