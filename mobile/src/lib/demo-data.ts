import { parseLocally } from './sms-parser';
import { useStore } from './store';
import type { Transaction } from './types';

/**
 * Sample bank alerts run through the same local parser real messages use,
 * so the demo exercises the real pipeline. `{A:n}` is an amount, `{C}` the currency prefix.
 */
const TEMPLATES: { daysAgo: number; sender: string; text: string }[] = [
  { daysAgo: 1, sender: 'VM-HDFCBK', text: 'Rs.{A:486} spent on HDFC Bank Card x4421 at SWIGGY on {D}. Avl bal: Rs.{A:48210}. Not you? Call 18002586161' },
  { daysAgo: 2, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:1240.50} on {D}; BIGBASKET credited. UPI:432198765012. Call 18002662 for dispute.' },
  { daysAgo: 3, sender: 'VM-HDFCBK', text: 'Rs.{A:349} spent on HDFC Bank Card x4421 at UBER INDIA on {D}. Avl bal: Rs.{A:47374}.' },
  { daysAgo: 4, sender: 'JD-SBIINB', text: 'Dear Customer, your A/c X3381 is debited by {C}{A:2100} on {D} towards NETFLIX COM. Avl Bal {C}{A:61230.12}' },
  { daysAgo: 5, sender: 'VM-HDFCBK', text: 'Rs.{A:2850} spent on HDFC Bank Card x4421 at AMAZON PAY INDIA on {D}. Avl bal: Rs.{A:44524}.' },
  { daysAgo: 6, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:612} on {D}; ZOMATO credited. UPI:439911827364.' },
  { daysAgo: 8, sender: 'BZ-AXISBK', text: '{C}{A:3200} debited from A/c no. XX7710 on {D} at HPCL FUEL STATION. Avl Bal {C}{A:28430.55}' },
  { daysAgo: 9, sender: 'JD-SBIINB', text: 'Your A/c X3381 credited with {C}{A:1450} on {D} by REFUND FROM MYNTRA. Avl Bal {C}{A:62680.12}' },
  { daysAgo: 10, sender: 'VM-HDFCBK', text: 'Rs.{A:1899} spent on HDFC Bank Card x4421 at AIRTEL POSTPAID on {D}. Avl bal: Rs.{A:42625}.' },
  { daysAgo: 12, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:899} on {D}; BOOKMYSHOW credited. UPI:430019283746.' },
  { daysAgo: 13, sender: 'VM-HDFCBK', text: 'Rs.{A:540} spent on HDFC Bank Card x4421 at STARBUCKS on {D}. Avl bal: Rs.{A:41186}.' },
  { daysAgo: 15, sender: 'JD-SBIINB', text: 'Your A/c X3381 is credited with {C}{A:85000} on {D} by NEFT SALARY ACME TECHNOLOGIES. Avl Bal {C}{A:146230.12}' },
  { daysAgo: 15, sender: 'JD-SBIINB', text: 'Your A/c X3381 is debited by {C}{A:22000} on {D} towards RENT NOBROKER. Avl Bal {C}{A:124230.12}' },
  { daysAgo: 16, sender: 'BZ-AXISBK', text: '{C}{A:5000} debited from A/c no. XX7710 on {D} towards GROWW MUTUAL FUND SIP. Avl Bal {C}{A:23430.55}' },
  { daysAgo: 18, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:1675} on {D}; BLINKIT credited. UPI:438827364510.' },
  { daysAgo: 20, sender: 'VM-HDFCBK', text: 'Rs.{A:1240} spent on HDFC Bank Card x4421 at APOLLO PHARMACY on {D}. Avl bal: Rs.{A:39946}.' },
  { daysAgo: 22, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:428} on {D}; SWIGGY credited. UPI:437712309876.' },
  { daysAgo: 25, sender: 'VM-HDFCBK', text: 'Rs.{A:15999} spent on HDFC Bank Card x4421 at CROMA RETAIL on {D}. Avl bal: Rs.{A:23947}.' },
  { daysAgo: 27, sender: 'JD-SBIINB', text: 'Dear Customer, your A/c X3381 is debited by {C}{A:4500} on {D} towards BAJAJ FINSERV EMI. Avl Bal {C}{A:119730.12}' },
  { daysAgo: 34, sender: 'JD-SBIINB', text: 'Dear Customer, your A/c X3381 is debited by {C}{A:2100} on {D} towards NETFLIX COM. Avl Bal {C}{A:58110.12}' },
  { daysAgo: 36, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:1380} on {D}; BIGBASKET credited. UPI:431100293847.' },
  { daysAgo: 38, sender: 'VM-HDFCBK', text: 'Rs.{A:712} spent on HDFC Bank Card x4421 at SWIGGY on {D}. Avl bal: Rs.{A:51210}.' },
  { daysAgo: 40, sender: 'VM-HDFCBK', text: 'Rs.{A:1899} spent on HDFC Bank Card x4421 at AIRTEL POSTPAID on {D}. Avl bal: Rs.{A:50498}.' },
  { daysAgo: 42, sender: 'BZ-AXISBK', text: '{C}{A:2800} debited from A/c no. XX7710 on {D} at HPCL FUEL STATION. Avl Bal {C}{A:31630.55}' },
  { daysAgo: 45, sender: 'JD-SBIINB', text: 'Your A/c X3381 is credited with {C}{A:85000} on {D} by NEFT SALARY ACME TECHNOLOGIES. Avl Bal {C}{A:140110.12}' },
  { daysAgo: 45, sender: 'JD-SBIINB', text: 'Your A/c X3381 is debited by {C}{A:22000} on {D} towards RENT NOBROKER. Avl Bal {C}{A:118110.12}' },
  { daysAgo: 46, sender: 'BZ-AXISBK', text: '{C}{A:5000} debited from A/c no. XX7710 on {D} towards GROWW MUTUAL FUND SIP. Avl Bal {C}{A:26630.55}' },
  { daysAgo: 50, sender: 'AD-ICICIB', text: 'ICICI Bank Acct XX902 debited for {C}{A:2450} on {D}; MAKEMYTRIP credited. UPI:436654782910.' },
  { daysAgo: 52, sender: 'VM-HDFCBK', text: 'Rs.{A:389} spent on HDFC Bank Card x4421 at UBER INDIA on {D}. Avl bal: Rs.{A:49720}.' },
  { daysAgo: 57, sender: 'JD-SBIINB', text: 'Dear Customer, your A/c X3381 is debited by {C}{A:4500} on {D} towards BAJAJ FINSERV EMI. Avl Bal {C}{A:113610.12}' },
];

function formatDate(d: Date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
}

export function buildDemoTransactions(currency: string): Transaction[] {
  const isInr = currency === 'INR';
  // Non-INR demo amounts are scaled down so they look plausible in USD/EUR/etc.
  const scale = isInr ? 1 : 1 / 40;
  const prefix = isInr ? 'Rs.' : `${currency} `;
  const now = Date.now();

  return TEMPLATES.map((tpl, i) => {
    const date = new Date(now - tpl.daysAgo * 86_400_000 - i * 3_600_000);
    const text = tpl.text
      .replace(/Rs\.\{A:/g, '{C}{A:')
      .replace(/\{C\}/g, prefix)
      .replace(/\{A:([\d.]+)\}/g, (_, n: string) => {
        const v = Number(n) * scale;
        return isInr ? n : v.toFixed(2);
      })
      .replace(/\{D\}/g, formatDate(date));
    return parseLocally(
      { id: `demo:${i}`, source: 'demo', sender: tpl.sender, text, receivedAt: date.getTime() },
      currency
    );
  }).filter((t): t is Transaction => !!t);
}

export function loadDemoData() {
  const store = useStore.getState();
  return store.upsertTransactions(buildDemoTransactions(store.settings.currency));
}

export function removeDemoData() {
  const store = useStore.getState();
  store.removeTransactions(store.transactions.filter((t) => t.source === 'demo').map((t) => t.id));
}
