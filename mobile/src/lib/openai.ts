import {
  ACCOUNT_KIND_LABEL,
  CATEGORIES,
  type Account,
  type Category,
  type ChatMessage,
  type InboundMessage,
  type Insight,
  type TxnType,
} from './types';

const BASE_URL = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 90_000;

export const DEFAULT_MODEL = 'gpt-6-luna';
export const SUGGESTED_MODELS = ['gpt-6-luna', 'gpt-5.4-mini'];

export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'OpenAIError';
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

type Effort = 'none' | 'low' | 'medium';

type ResponseRequest = {
  apiKey: string;
  model: string;
  instructions: string;
  input: string | { role: 'user' | 'assistant'; content: string }[];
  schema?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
  effort?: Effort;
};

function supportsReasoning(model: string) {
  return /^(gpt-5|gpt-6|o\d)/i.test(model);
}

function describeHttpError(status: number, apiMessage: string | undefined, model: string) {
  if (status === 401) return 'OpenAI rejected this API key. Check it in Settings: it may be mistyped or revoked.';
  if (status === 403) return apiMessage ?? 'This API key is not allowed to use that model.';
  if (status === 404) return `The model "${model}" isn't available to this key. Pick another model in Settings.`;
  if (status === 429) return `OpenAI rate limit or quota reached. ${apiMessage ?? ''}`.trim();
  if (status >= 500) return 'OpenAI is having trouble right now. Try again in a minute.';
  return apiMessage ?? `OpenAI request failed (${status}).`;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) throw new OpenAIError('OpenAI took too long to respond. Try again.');
    throw new OpenAIError("Couldn't reach OpenAI. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }
}

type RawOutputItem = {
  type: string;
  content?: { type: string; text?: string; refusal?: string }[];
  // function_call items
  call_id?: string;
  name?: string;
  arguments?: string;
};

type RawResponse = {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: RawOutputItem[];
  error?: { message?: string };
};

function readOutputText(json: RawResponse) {
  let text = '';
  for (const item of json.output ?? []) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'refusal') throw new OpenAIError(part.refusal ?? 'The model declined to answer.');
      if (part.type === 'output_text' && part.text) text += part.text;
    }
  }
  return text;
}

async function createResponse(req: ResponseRequest): Promise<string> {
  const body: Record<string, unknown> = {
    model: req.model,
    instructions: req.instructions,
    input: req.input,
    // Don't keep message content on OpenAI's side for later retrieval.
    store: false,
  };
  if (req.maxOutputTokens) body.max_output_tokens = req.maxOutputTokens;
  if (req.effort && supportsReasoning(req.model)) body.reasoning = { effort: req.effort };
  if (req.schema) {
    body.text = {
      format: { type: 'json_schema', name: req.schema.name, schema: req.schema.schema, strict: true },
    };
  }

  const json = await postResponses(body, req.apiKey, req.model);
  const text = readOutputText(json);
  if (!text) throw new OpenAIError('OpenAI returned an empty response.');
  return text;
}

async function postResponses(body: Record<string, unknown>, apiKey: string, model: string) {
  const res = await fetchWithTimeout(`${BASE_URL}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as RawResponse;
  if (!res.ok) throw new OpenAIError(describeHttpError(res.status, json.error?.message, model), res.status);
  if (json.status === 'incomplete') {
    throw new OpenAIError(`OpenAI stopped early (${json.incomplete_details?.reason ?? 'unknown reason'}).`);
  }
  return json;
}

async function createJson<T>(req: ResponseRequest & { schema: NonNullable<ResponseRequest['schema']> }) {
  const text = await createResponse(req);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OpenAIError('OpenAI returned malformed JSON.');
  }
}

/** Lightweight key check that costs no tokens. */
export async function validateApiKey(apiKey: string) {
  const res = await fetchWithTimeout(`${BASE_URL}/models?limit=1`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return;
  const json = (await res.json().catch(() => ({}))) as RawResponse;
  throw new OpenAIError(describeHttpError(res.status, json.error?.message, ''), res.status);
}

// ---------------------------------------------------------------------------
// 1. Transaction extraction
// ---------------------------------------------------------------------------

export type ExtractedTransaction = {
  id: string;
  isTransaction: boolean;
  /** Whether the user's wealth changed (expense, income) or money only moved between their own pockets. */
  kind: 'expense' | 'income' | 'transfer' | null;
  /** Id of an earlier message in the batch that reports this same money movement. */
  duplicateOf: string | null;
  type: TxnType | null;
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  category: Category | null;
  account: string | null;
  /** Exact name, from the user's accounts list, of the account this alert is about. */
  ownAccount: string | null;
  /** For a transfer: exact name of the user's account on the other side. */
  counterAccount: string | null;
  balanceAfter: number | null;
  date: string | null;
  note: string | null;
};

const nullable = (type: string) => ({ type: [type, 'null'] });

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'isTransaction',
          'kind',
          'duplicateOf',
          'type',
          'amount',
          'currency',
          'merchant',
          'category',
          'account',
          'ownAccount',
          'counterAccount',
          'balanceAfter',
          'date',
          'note',
        ],
        properties: {
          id: { type: 'string' },
          isTransaction: { type: 'boolean' },
          kind: { type: ['string', 'null'], enum: ['expense', 'income', 'transfer', null] },
          duplicateOf: nullable('string'),
          type: { type: ['string', 'null'], enum: ['debit', 'credit', null] },
          amount: nullable('number'),
          currency: nullable('string'),
          merchant: nullable('string'),
          category: { type: ['string', 'null'], enum: [...CATEGORIES, null] },
          account: nullable('string'),
          ownAccount: nullable('string'),
          counterAccount: nullable('string'),
          balanceAfter: nullable('number'),
          date: nullable('string'),
          note: nullable('string'),
        },
      },
    },
  },
};

const EXTRACTION_INSTRUCTIONS = `You extract personal-finance transactions from the alerts a person receives: SMS from banks, cards, wallets and UPI, and notifications from finance apps (banks, payment platforms such as Stripe, crypto exchanges) and from their email app.

Each message has a channel. For channel "notification" the sender is the name of the app that posted it, the first line is the notification's title and the rest is its text. When the app is an email app, the title is who the email is from and the text is its subject and opening lines.
For channel "email" the sender is the email's From name and domain, the first line is its subject, and the rest is the opening of its body with links removed.
For channel "binance" the message is a record the app read from the user's own Binance account. It is always a completed money movement in or out of that account. When it gives a crypto amount with a value like "(≈ $120.50)", use that US dollar value as the amount with currency USD, and put the crypto amount in the note. Money moving between Binance and another of the user's own accounts is a transfer; a Binance Pay payment to a merchant or another person is an expense, and one received from someone is income.
An email is a transaction only when it says money was charged, paid, received, refunded or transferred. Bills that are due, orders not yet charged, quotes, statements, newsletters and marketing are not.

Return exactly one result per input message, echoing its id.

isTransaction is true ONLY when money actually moved: a completed debit, credit, purchase, withdrawal, transfer, refund, cashback, salary, interest or fee.
Set isTransaction=false (and every other field null) for: OTPs, promotions and offers, bill-due or payment reminders, scheduled or future debits, failed/declined transactions, balance-only alerts, payment/collect requests, and anything else that is not a money movement.

Fields for real transactions:
- kind: decide this first.
  "transfer" means the money only moved between the user's OWN pockets, so their wealth did not change: moving between two of their own bank accounts, paying their own credit-card bill, loading or withdrawing from their own wallet, payouts from their own payment platform (such as Stripe) into their bank, and deposits to or withdrawals from their own investment or crypto platform.
  Use the "User's own accounts" list and the user's name (when given) to decide. If the counterparty is one of those accounts or platforms, or is the user themself, it is a transfer. Both sides of such a move are transfers: the debit from one account and the credit to the other.
  A payment to another person or to a merchant is never a transfer, even by UPI or bank transfer.
  An ATM cash withdrawal is a transfer only when the user's accounts include a cash account; otherwise it is an expense with note "ATM withdrawal".
  Otherwise "expense" when the user spent money, or "income" when they earned it or received it from someone else.
- duplicateOf: a bank and a payment app often both text about one payment. If this message reports the exact same money movement as an EARLIER message in this batch (same amount and direction, minutes apart, same reference or counterparty), set duplicateOf to that earlier message's id. Otherwise null. Two separate payments of the same amount are not duplicates, and the two sides of a transfer are not duplicates.
- type: "debit" if money left the user's account/card/wallet, "credit" if it came in.
- amount: the transaction amount as a positive number. Never the balance.
- currency: ISO 4217 code. Rs, Rs., INR and ₹ mean INR. If unclear, use the default currency given.
- merchant: short human-readable counterparty, e.g. "Swiggy", "Amazon", "Uber", "Netflix", "Rahul Sharma", "HDFC Credit Card". Derive names from UPI handles (e.g. "swiggy.upi@icici" -> "Swiggy"). Never return reference numbers. If unknown, use the bank's name.
- category: one of the allowed values. Every kind "transfer" must use "Transfers", and nothing else may. "Salary & Income" covers salary, interest and other earnings. "Refunds & Cashback" covers refunds, reversals and cashback. For person-to-person payments make your best guess, else "Other".
- account: issuer plus masked last digits if present, e.g. "HDFC ••1234" or "ICICI Card ••9876"; null if absent.
- ownAccount: file the transaction under the right one of the user's accounts. Give the exact name, copied from the "User's own accounts" list, of the account this alert is about (the one debited or credited). Match on the bank or platform name and on the ending digits when the list shows them. Use the sender too: an alert from a bank's sender id belongs to that bank. Null when no listed account fits or two fit equally.
- counterAccount: only for kind "transfer". The exact name, from the same list, of the user's account on the other side of the move (where the money went, or where it came from). Null when it is not in the list.
- balanceAfter: available balance stated in the message, else null.
- date: the transaction date stated in the message as YYYY-MM-DD, else null.
- note: at most 8 words of useful context (e.g. "UPI payment", "ATM withdrawal", "EMI 3 of 12"), else null.

Digits shown as ••1234 were masked for privacy; treat them as account or reference numbers.`;

type ExtractionContext = { currency: string; accounts: Account[]; userName: string };

/**
 * The accounts as the AI sees them: name, type, ending, and each card's name, type and ending,
 * so a "card ••1234" alert is filed under the right bank. Holder names and logins never go here.
 */
function describeAccounts(accounts: Account[]) {
  if (!accounts.length) return '(none listed)';
  return accounts
    .map((a) => {
      const cards = (a.cards ?? []).map((c) => `${c.label} ${c.type} card ends ${c.last4}`);
      const ending = a.last4 ? `, ends ${a.last4}` : '';
      const cardList = cards.length ? `; cards: ${cards.join(', ')}` : '';
      return `- ${a.name} (${ACCOUNT_KIND_LABEL[a.kind].toLowerCase()}${ending}${cardList})`;
    })
    .join('\n');
}

function formatMessagesForPrompt(messages: InboundMessage[], ctx: ExtractionContext) {
  const header = [
    `Default currency: ${ctx.currency}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    ctx.userName.trim() ? `User's name: ${ctx.userName.trim()}` : null,
    `User's own accounts:\n${describeAccounts(ctx.accounts)}`,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
  const body = messages
    .map(
      (m) =>
        `<message id="${m.id}" channel="${m.source}" sender="${m.sender.replace(/"/g, '')}" received="${new Date(m.receivedAt).toISOString()}">\n${m.text}\n</message>`
    )
    .join('\n');
  return `${header}\n${body}`;
}

export async function extractTransactions(
  messages: InboundMessage[],
  opts: { apiKey: string; model: string } & ExtractionContext
): Promise<ExtractedTransaction[]> {
  const result = await createJson<{ results: ExtractedTransaction[] }>({
    apiKey: opts.apiKey,
    model: opts.model,
    instructions: EXTRACTION_INSTRUCTIONS,
    input: formatMessagesForPrompt(messages, opts),
    schema: { name: 'transactions', schema: EXTRACTION_SCHEMA },
    effort: 'low',
    maxOutputTokens: 12_000,
  });
  const ids = new Set(messages.map((m) => m.id));
  return (result.results ?? []).filter((r) => ids.has(r.id));
}

// ---------------------------------------------------------------------------
// 2. Monthly insights
// ---------------------------------------------------------------------------

const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'insights'],
  properties: {
    headline: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'tone'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          tone: { type: 'string', enum: ['positive', 'neutral', 'warning'] },
        },
      },
    },
  },
};

const INSIGHTS_INSTRUCTIONS = `You are a concise, practical personal-finance coach inside a budgeting app.
You receive a JSON summary of one month of the user's spending, auto-extracted from their bank SMS alerts.

Write:
- headline: one sentence (max 14 words) capturing the month.
- insights: 3 to 5 items. Each has a short title (max 6 words), a detail of at most 2 sentences, and a tone.
  Use "warning" for overspending, rising costs, fees or risks; "positive" for improvements or good habits; "neutral" otherwise.
  At least one insight must be a concrete, actionable suggestion (e.g. a specific category or subscription to trim, with an amount).

Rules: use only numbers present in the data, never invent figures. Format money with the given currency code. Compare with the previous month when data exists. Do not recommend specific securities.`;

export async function generateInsights(summary: unknown, opts: { apiKey: string; model: string }) {
  return createJson<{ headline: string; insights: Insight[] }>({
    apiKey: opts.apiKey,
    model: opts.model,
    instructions: INSIGHTS_INSTRUCTIONS,
    input: JSON.stringify(summary),
    schema: { name: 'month_insights', schema: INSIGHTS_SCHEMA },
    effort: 'medium',
    maxOutputTokens: 6_000,
  });
}

const WEEKLY_INSTRUCTIONS = `You write a short weekly money summary for the user of a personal finance app.
You get last week's figures: total spent and income, spending by category with what a usual week looks like (average of the 4 weeks before), and the biggest payments.
Write a headline (under 70 characters) and 2 or 3 short points (under 110 characters each). Be specific, use the numbers, compare with a usual week, and mention anything unusual. Friendly and plain, no judgement, no markdown, no emoji.
Format money with the currency given. If there was little or no spending, say so simply.`;

const WEEKLY_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'points'],
  additionalProperties: false,
};

export async function generateWeeklySummary(payload: unknown, opts: { apiKey: string; model: string }) {
  const result = await createJson<{ headline: string; points: string[] }>({
    apiKey: opts.apiKey,
    model: opts.model,
    instructions: WEEKLY_INSTRUCTIONS,
    input: JSON.stringify(payload),
    schema: { name: 'weekly_summary', schema: WEEKLY_SCHEMA },
    effort: 'low',
    maxOutputTokens: 3_000,
  });
  return { headline: result.headline.trim(), points: result.points.slice(0, 3).map((p) => p.trim()) };
}

const RECEIPT_INSTRUCTIONS = `You read a photo of a receipt or bill for a personal finance app.
Return the merchant (shop or company name as a person would say it), the final total actually paid (after tax, tips and discounts; not a subtotal), its currency as an ISO code, the date as YYYY-MM-DD, and the best category.
Use null for anything you cannot read with confidence. If the photo is not a receipt or bill, set isReceipt to false.`;

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    isReceipt: { type: 'boolean' },
    merchant: { type: ['string', 'null'] },
    total: { type: ['number', 'null'] },
    currency: { type: ['string', 'null'] },
    date: { type: ['string', 'null'] },
    category: { type: 'string', enum: [...CATEGORIES] },
  },
  required: ['isReceipt', 'merchant', 'total', 'currency', 'date', 'category'],
  additionalProperties: false,
};

export type ReceiptReading = {
  isReceipt: boolean;
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  category: Category;
};

/** Reads a receipt photo (base64) into what the Add form needs. */
export async function readReceipt(
  imageBase64: string,
  mimeType: string,
  opts: { apiKey: string; model: string; currency: string }
): Promise<ReceiptReading> {
  const json = await postResponses(
    {
      model: opts.model,
      instructions: `${RECEIPT_INSTRUCTIONS}
If the currency is not shown, assume ${opts.currency}. Today is ${new Date().toISOString().slice(0, 10)}.`,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Read this receipt.' },
            { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
          ],
        },
      ],
      store: false,
      max_output_tokens: 2_000,
      ...(supportsReasoning(opts.model) ? { reasoning: { effort: 'low' } } : null),
      text: { format: { type: 'json_schema', name: 'receipt', schema: RECEIPT_SCHEMA, strict: true } },
    },
    opts.apiKey,
    opts.model
  );
  const text = readOutputText(json);
  try {
    return JSON.parse(text) as ReceiptReading;
  } catch {
    throw new OpenAIError('The AI could not read that receipt. Try a clearer, closer photo.');
  }
}

// ---------------------------------------------------------------------------
// 3. Assistant chat
// ---------------------------------------------------------------------------

export async function askAssistant(
  history: ChatMessage[],
  financeContext: string,
  opts: { apiKey: string; model: string; currency: string }
) {
  const instructions = `You are the assistant inside a personal finance app. The user's transactions were extracted from their bank SMS alerts.
Answer using the data below. Be concise: under 120 words unless the user asks for more detail. Use plain text; "-" bullets are fine, no other markdown.
Format money in ${opts.currency} unless a transaction uses another currency. If the data can't answer the question, say so plainly.
General budgeting guidance is welcome; do not recommend specific securities or make tax/legal determinations.
Today is ${new Date().toISOString().slice(0, 10)}.

${financeContext}`;

  return createResponse({
    apiKey: opts.apiKey,
    model: opts.model,
    instructions,
    input: history
      .filter((m) => !m.error)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content })),
    effort: 'low',
    maxOutputTokens: 4_000,
  });
}

// ---------------------------------------------------------------------------
// 4. Assistant as an agent: it may call tools that read and change the app's data
// ---------------------------------------------------------------------------

/** Most tool rounds in one reply: enough for find, then change, then check. */
const MAX_AGENT_STEPS = 10;

/**
 * Runs one assistant reply with tools: asks the model, carries out the tool calls it makes with
 * `execute`, sends the results back, and repeats until it answers in words.
 *
 * Nothing is stored on OpenAI's side (`store: false`), so every round re-sends the conversation
 * so far, including the model's encrypted reasoning, as the API requires in that mode.
 */
export async function runAgentReply(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  history: ChatMessage[];
  tools: unknown[];
  execute: (name: string, args: string) => Promise<unknown> | unknown;
}): Promise<string> {
  const reasoning = supportsReasoning(opts.model);
  const input: Record<string, unknown>[] = opts.history
    .filter((m) => !m.error)
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const body: Record<string, unknown> = {
      model: opts.model,
      instructions: opts.instructions,
      input,
      tools: opts.tools,
      store: false,
      max_output_tokens: 8_000,
    };
    if (reasoning) {
      body.reasoning = { effort: 'low' };
      body.include = ['reasoning.encrypted_content'];
    }
    const json = await postResponses(body, opts.apiKey, opts.model);
    const output = json.output ?? [];
    const calls = output.filter((item) => item.type === 'function_call' && item.call_id && item.name);
    if (!calls.length) {
      const text = readOutputText(json);
      if (!text) throw new OpenAIError('OpenAI returned an empty response.');
      return text;
    }

    // Hand the model its own turn back, in order: reasoning, any words, and the calls.
    for (const item of output) {
      if (item.type === 'reasoning') input.push(item as Record<string, unknown>);
      else if (item.type === 'function_call') {
        input.push({ type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments ?? '{}' });
      } else if (item.type === 'message') {
        const text = (item.content ?? []).map((p) => p.text ?? '').join('');
        if (text) input.push({ role: 'assistant', content: text });
      }
    }
    for (const call of calls) {
      const result = await opts.execute(call.name!, call.arguments ?? '{}');
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
    }
  }
  throw new OpenAIError('That took the assistant too many steps. Try asking for one change at a time.');
}
