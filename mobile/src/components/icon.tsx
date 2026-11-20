import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import type { AccountKind, Category } from '@/lib/types';

type Glyph = { sf: SFSymbol; md: AndroidSymbol };

const GLYPHS = {
  home: { sf: 'house', md: 'home' },
  list: { sf: 'list.bullet.rectangle', md: 'receipt_long' },
  chat: { sf: 'bubble.left.and.text.bubble.right', md: 'forum' },
  settings: { sf: 'gearshape', md: 'settings' },
  sync: { sf: 'arrow.triangle.2.circlepath', md: 'sync' },
  sparkle: { sf: 'sparkles', md: 'auto_awesome' },
  search: { sf: 'magnifyingglass', md: 'search' },
  trash: { sf: 'trash', md: 'delete' },
  edit: { sf: 'pencil', md: 'edit' },
  calculator: { sf: 'plus.forwardslash.minus', md: 'calculate' },
  camera: { sf: 'camera', md: 'photo_camera' },
  photo: { sf: 'photo', md: 'image' },
  send: { sf: 'arrow.up', md: 'send' },
  key: { sf: 'key', md: 'key' },
  lock: { sf: 'lock', md: 'lock' },
  paste: { sf: 'doc.on.clipboard', md: 'content_paste' },
  close: { sf: 'xmark', md: 'close' },
  chevronLeft: { sf: 'chevron.left', md: 'chevron_left' },
  chevronRight: { sf: 'chevron.right', md: 'chevron_right' },
  check: { sf: 'checkmark', md: 'check' },
  sms: { sf: 'message', md: 'sms' },
  shield: { sf: 'checkmark.shield', md: 'shield' },
  info: { sf: 'info.circle', md: 'info' },
  warning: { sf: 'exclamationmark.triangle', md: 'warning' },
  up: { sf: 'arrow.up.right', md: 'trending_up' },
  down: { sf: 'arrow.down.right', md: 'trending_down' },
  calendar: { sf: 'calendar', md: 'calendar_month' },
  repeat: { sf: 'repeat', md: 'subscriptions' },
  wallet: { sf: 'creditcard', md: 'account_balance_wallet' },
  visible: { sf: 'eye', md: 'visibility' },
  hidden: { sf: 'eye.slash', md: 'visibility_off' },
  back: { sf: 'arrow.left', md: 'arrow_back' },
  arrowOut: { sf: 'arrow.up.right', md: 'arrow_outward' },
  plus: { sf: 'plus', md: 'add' },
  chart: { sf: 'chart.bar', md: 'bar_chart' },
  bank: { sf: 'building.columns', md: 'account_balance' },
  card: { sf: 'creditcard', md: 'credit_card' },
  crypto: { sf: 'bitcoinsign.circle', md: 'currency_bitcoin' },
  invest: { sf: 'chart.line.uptrend.xyaxis', md: 'show_chart' },
  cash: { sf: 'banknote', md: 'payments' },
  platform: { sf: 'storefront', md: 'storefront' },
  savings: { sf: 'banknote', md: 'savings' },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

export const CATEGORY_GLYPHS: Record<Category, Glyph> = {
  'Food & Dining': { sf: 'fork.knife', md: 'restaurant' },
  Groceries: { sf: 'cart', md: 'shopping_cart' },
  Shopping: { sf: 'bag', md: 'shopping_bag' },
  Transport: { sf: 'car', md: 'directions_car' },
  Fuel: { sf: 'fuelpump', md: 'local_gas_station' },
  'Bills & Utilities': { sf: 'bolt', md: 'bolt' },
  'Rent & Housing': { sf: 'house', md: 'home_work' },
  Entertainment: { sf: 'film', md: 'movie' },
  Subscriptions: { sf: 'repeat', md: 'subscriptions' },
  Health: { sf: 'cross.case', md: 'local_hospital' },
  Education: { sf: 'book', md: 'school' },
  Travel: { sf: 'airplane', md: 'flight' },
  Investments: { sf: 'chart.line.uptrend.xyaxis', md: 'trending_up' },
  'EMI & Loans': { sf: 'building.columns', md: 'account_balance' },
  'Fees & Charges': { sf: 'doc.text', md: 'request_quote' },
  Transfers: { sf: 'arrow.left.arrow.right', md: 'swap_horiz' },
  'Salary & Income': { sf: 'banknote', md: 'payments' },
  'Refunds & Cashback': { sf: 'arrow.uturn.backward', md: 'replay' },
  Other: { sf: 'ellipsis.circle', md: 'more_horiz' },
};

/** Icon for each kind of account in the portfolio. */
export const ACCOUNT_GLYPH_NAME: Record<AccountKind, IconName> = {
  bank: 'bank',
  card: 'card',
  wallet: 'wallet',
  payments: 'platform',
  crypto: 'crypto',
  investment: 'invest',
  cash: 'cash',
};

export function glyphFor(name: IconName): Glyph {
  return GLYPHS[name];
}

type Props = {
  name?: IconName;
  category?: Category;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, category, size = 20, color, style }: Props) {
  const glyph = category ? CATEGORY_GLYPHS[category] : GLYPHS[name ?? 'info'];
  return (
    <SymbolView
      name={{ ios: glyph.sf, android: glyph.md, web: glyph.md }}
      size={size}
      tintColor={color}
      style={[{ width: size, height: size }, style]}
    />
  );
}
