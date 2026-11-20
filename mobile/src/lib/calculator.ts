/**
 * The calculator's arithmetic: what a key press does to the expression, and the expression's
 * value. Parsed by hand (never `eval`): numbers, + − × ÷ with the usual precedence, and % as
 * "per cent" (50% is 0.5; 200 + 10% is 200 + 20, as on a phone calculator).
 */

export const OPERATORS = ['+', '−', '×', '÷'] as const;
type Operator = (typeof OPERATORS)[number];

export type CalcKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | Operator | '%' | 'AC' | '⌫' | '=';

const isOperator = (c: string | undefined): c is Operator => !!c && (OPERATORS as readonly string[]).includes(c);
const isDigit = (c: string | undefined) => !!c && c >= '0' && c <= '9';

/** The number being typed at the end of the expression, e.g. "12.5" in "3+12.5". */
function lastNumber(expr: string) {
  return /[\d.]*$/.exec(expr)?.[0] ?? '';
}

/**
 * The expression after pressing `key`. `fresh` is true right after "=": typing a digit then
 * starts a new calculation, while an operator carries on from the answer.
 */
export function pressKey(expr: string, key: CalcKey, fresh: boolean): string {
  if (key === 'AC') return '';
  if (key === '⌫') return fresh ? '' : expr.slice(0, -1);
  const last = expr.at(-1);

  if (isDigit(key)) {
    if (fresh) return key;
    // No leading zeros: "0" then "5" is "5", not "05".
    if (lastNumber(expr) === '0') return expr.slice(0, -1) + key;
    if (last === '%') return expr + '×' + key;
    return expr + key;
  }
  if (key === '.') {
    if (fresh) return '0.';
    if (lastNumber(expr).includes('.')) return expr;
    if (last === '%') return expr + '×0.';
    return expr + (isDigit(last) ? '.' : '0.');
  }
  if (key === '%') {
    return isDigit(last) ? expr + '%' : expr;
  }
  if (isOperator(key)) {
    if (!expr) return key === '−' ? '−' : '';
    // A second operator replaces the first ("5+×" is "5×"), except a minus sign after × or ÷.
    if (isOperator(last)) {
      if (key === '−' && (last === '×' || last === '÷')) return expr + key;
      const trimmed = expr.replace(/[+−×÷]+$/, '');
      return trimmed ? trimmed + key : key === '−' ? '−' : '';
    }
    if (last === '.') return expr.slice(0, -1) + key;
    return expr + key;
  }
  return expr;
}

type Token = { kind: 'num'; value: number } | { kind: 'op'; op: Operator };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (isDigit(c) || c === '.') {
      let j = i;
      while (j < expr.length && (isDigit(expr[j]) || expr[j] === '.')) j++;
      const text = expr.slice(i, j);
      if (text === '.' || (text.match(/\./g)?.length ?? 0) > 1) return null;
      let value = Number(text);
      // Per cent applies to the number just before it.
      let k = j;
      while (expr[k] === '%') {
        value /= 100;
        k++;
      }
      tokens.push({ kind: 'num', value });
      // Remember whether this number was a percentage, for "a + b%".
      if (k > j) (tokens[tokens.length - 1] as Token & { percent?: boolean }).percent = true;
      i = k;
    } else if (isOperator(c)) {
      tokens.push({ kind: 'op', op: c });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

/** The value of an expression, or null if it is incomplete or invalid (e.g. dividing by zero). */
export function evaluate(expr: string): number | null {
  const tokens = tokenize(expr);
  if (!tokens || !tokens.length) return null;

  // Fold unary minus into the number after it: "−5", "3×−2".
  const items: (Token & { percent?: boolean })[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = items.at(-1);
    if (t.kind === 'op' && t.op === '−' && (!prev || prev.kind === 'op')) {
      const next = tokens[i + 1];
      if (!next || next.kind !== 'num') return null;
      items.push({ ...next, value: -next.value });
      i++;
      continue;
    }
    items.push(t);
  }
  // Must alternate number, operator, number ... and end on a number.
  if (items.length % 2 === 0) return null;
  for (let i = 0; i < items.length; i++) {
    if ((i % 2 === 0) !== (items[i].kind === 'num')) return null;
  }

  // First × and ÷, then + and −, left to right.
  const sums: number[] = [(items[0] as { value: number }).value];
  const signs: Operator[] = [];
  for (let i = 1; i < items.length; i += 2) {
    const op = (items[i] as { op: Operator }).op;
    const right = items[i + 1] as { value: number; percent?: boolean };
    if (op === '×' || op === '÷') {
      const left = sums.pop()!;
      if (op === '÷' && right.value === 0) return null;
      sums.push(op === '×' ? left * right.value : left / right.value);
    } else {
      // "200 + 10%" adds 10% of 200, as phone calculators do.
      const value = right.percent ? sums[sums.length - 1] * right.value : right.value;
      signs.push(op);
      sums.push(value);
    }
  }
  let total = sums[0];
  for (let i = 0; i < signs.length; i++) total = signs[i] === '+' ? total + sums[i + 1] : total - sums[i + 1];
  if (!Number.isFinite(total)) return null;
  // Round away floating-point noise (0.1 + 0.2 is 0.3).
  return Number(total.toPrecision(12));
}

/** An answer for display: grouped digits, up to 8 decimals, e.g. 14445.5 → "14,445.5". */
export function formatResult(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

/** The answer as plain digits, to carry on calculating with or to use as an amount. */
export function plainResult(value: number) {
  const text = String(value);
  return text.startsWith('-') ? '−' + text.slice(1) : text;
}

/** True once the expression has an operation in it, so a live answer is worth showing. */
export function hasOperation(expr: string) {
  return /[\d.%][+−×÷]|%/.test(expr);
}
