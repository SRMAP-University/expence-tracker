import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Eases a number from wherever it currently is to `target`.
 * Whole numbers while moving, the exact value once settled, and no motion at all
 * when the system's reduce-motion setting is on.
 */
export function useCountUp(target: number, duration = 750) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const from = current.current;
    const start = Date.now();
    let frame = 0;

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = t < 1 ? Math.round(from + (target - from) * eased) : target;
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduceMotion]);

  return reduceMotion ? target : value;
}
