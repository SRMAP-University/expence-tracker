import type {
  LiveUpdate,
  WidgetConfig,
  WidgetItem,
  WidgetModel,
  WidgetSnapshot,
} from '../../modules/home-widget';
import { netWorth } from './accounts';
import { countsTowardTotals, summarizeMonth } from './analytics';
import { dueLabel, findBills } from './bills';
import { formatMoney, formatSignedMoney, monthKey, shiftMonth } from './format';
import type { Ledger } from './money';

/** YYYY-MM-DD in the phone's own time zone, the day the widget compares against. */
export function localDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The month's figures behind the widgets and Live Alerts, worked out the same way as the app's
 * screens: in the display currency, leaving transfers out of spending.
 */
export function widgetFigures(ledger: Ledger, now: Date) {
  const { currency, transactions, accounts } = ledger;
  const today = localDay(now);
  const month = summarizeMonth(transactions, monthKey(now), currency);
  const previous = summarizeMonth(transactions, shiftMonth(monthKey(now), -1), currency);
  const spentToday = transactions
    .filter(
      (t) =>
        t.type === 'debit' && t.currency === currency && countsTowardTotals(t) && localDay(new Date(t.date)) === today
    )
    .reduce((sum, t) => sum + t.amount, 0);
  return {
    day: today,
    currency,
    spentToday,
    month,
    previousSpent: previous.spent,
    netWorth: netWorth(accounts, currency).total,
    transactions,
    accounts,
  };
}

export type WidgetFigures = ReturnType<typeof widgetFigures>;

const money = (f: WidgetFigures, amount: number) => formatMoney(amount, f.currency);

type Headline = WidgetConfig['show'];

/** Every figure that can be the big number or a quick stat. */
function item(f: WidgetFigures, key: Headline | 'income', accountId: string | null = null): WidgetItem {
  switch (key) {
    case 'today':
      return { label: 'Spent today', value: money(f, f.spentToday), today: true };
    case 'left':
      return f.month.net < 0
        ? { label: 'Overspent', value: money(f, -f.month.net) }
        : { label: 'Left this month', value: money(f, f.month.net) };
    case 'income':
      return { label: 'Income', value: money(f, f.month.income) };
    case 'networth':
      return { label: 'Net worth', value: money(f, f.netWorth) };
    case 'account': {
      const account = f.accounts.find((a) => a.id === accountId);
      return account
        ? { label: account.name, value: formatMoney(account.balance, account.currency) }
        : { label: 'Pick an account', value: '—' };
    }
    default:
      return { label: 'Spent this month', value: money(f, f.month.spent) };
  }
}

/** Short labels for the quick stats row, where space is tight. */
const STAT_LABEL: Record<string, string> = {
  today: 'Today',
  month: 'This month',
  left: 'Left',
  income: 'Income',
  networth: 'Net worth',
};

function progressOf(f: WidgetFigures): WidgetModel['progress'] {
  const { spent, income, net } = f.month;
  if (income > 0) {
    const percent = Math.round((spent / income) * 100);
    return {
      label: `Spent ${percent}% of income`,
      right: net >= 0 ? `${money(f, net)} left` : `${money(f, -net)} over`,
      percent: Math.min(100, percent),
    };
  }
  if (f.previousSpent > 0) {
    const percent = Math.round((spent / f.previousSpent) * 100);
    return {
      label: `${percent}% of last month`,
      right: `Last month ${money(f, f.previousSpent)}`,
      percent: Math.min(100, percent),
    };
  }
  return null;
}

function listOf(f: WidgetFigures, kind: WidgetConfig['list']): Pick<WidgetModel, 'listTitle' | 'list'> {
  switch (kind) {
    case 'recent':
      return {
        listTitle: 'Recent',
        list: f.transactions.slice(0, 4).map((t) => ({
          left: t.merchant,
          right: formatSignedMoney(t.amount, t.currency, t.type),
          positive: t.type === 'credit',
        })),
      };
    case 'categories':
      return {
        listTitle: 'Top spending this month',
        list: f.month.byCategory.slice(0, 4).map((c) => ({ left: c.category, right: money(f, c.amount) })),
      };
    case 'bills':
      return {
        listTitle: 'Upcoming bills',
        list: findBills(f.transactions, new Date(`${f.day}T12:00:00`))
          .filter((b) => b.status !== 'lapsed')
          .slice(0, 4)
          .map((b) => ({ left: `${b.merchant} · ${dueLabel(b)}`, right: formatMoney(b.amount, b.currency) })),
      };
    case 'accounts':
      return {
        listTitle: 'Accounts',
        list: f.accounts.slice(0, 4).map((a) => ({ left: a.name, right: formatMoney(a.balance, a.currency) })),
      };
    default:
      return { listTitle: '', list: [] };
  }
}

/** What a widget with these settings draws. */
export function widgetModel(f: WidgetFigures, config: WidgetConfig): WidgetModel {
  const headline = item(f, config.show, config.accountId);
  const statKeys = (['today', 'month', 'left', 'income', 'networth'] as const).filter((k) => k !== config.show);
  const stats = config.stats
    ? statKeys.slice(0, 3).map((k) => ({ ...item(f, k), label: STAT_LABEL[k] }))
    : [];
  return {
    ...headline,
    stats,
    progress: config.progress ? progressOf(f) : null,
    ...listOf(f, config.list),
  };
}

export function widgetSnapshot(
  f: WidgetFigures,
  widgets: { id: number; config: WidgetConfig }[],
  fallback: WidgetConfig
): WidgetSnapshot {
  const left = item(f, 'left');
  const latest = f.transactions[0];
  return {
    day: f.day,
    zero: money(f, 0),
    models: Object.fromEntries(widgets.map((w) => [String(w.id), widgetModel(f, w.config)])),
    fallback: widgetModel(f, fallback),
    // For the first widget build (app 1.0.0), which draws a single figure.
    spentToday: money(f, f.spentToday),
    spentMonth: money(f, f.month.spent),
    left: left.value,
    leftLabel: left.label,
    netWorth: money(f, f.netWorth),
    accounts: f.accounts.map((a) => ({ id: a.id, name: a.name, balance: formatMoney(a.balance, a.currency) })),
    latest: latest
      ? `${latest.merchant} ${formatSignedMoney(latest.amount, latest.currency, latest.type)} · ${new Date(
          latest.date
        ).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      : '',
  };
}

/** The "today" Live Update: today's spending in the pill, and the month's progress when expanded. */
export function todayLiveUpdate(f: WidgetFigures): LiveUpdate {
  const left = item(f, 'left');
  const progress = progressOf(f);
  return {
    title: `Spent today ${money(f, f.spentToday)}`,
    text: `This month ${money(f, f.month.spent)} · ${left.label.toLowerCase()} ${left.value}`,
    chip: formatMoney(f.spentToday, f.currency, { compact: true }),
    ...(progress && f.month.income > 0 ? { progress: progress.percent, max: 100 } : null),
  };
}
