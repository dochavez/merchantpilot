/**
 * npm run check:env
 * Verifies every external dependency with a real call: PayPal OAuth + each API MerchantPilot reads,
 * and the configured LLM. Prints a checklist; exit code 1 if something required is broken.
 */
import './_env';
import { config, dataMode, hasPayPalCredentials, llmModelId, llmProvider } from '../lib/config';
import { getAccessToken, paypalGet } from '../lib/paypal/rest';

const ok = (s: string) => console.log(`  \x1b[32m✔\x1b[0m ${s}`);
const warn = (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✘\x1b[0m ${s}`);

async function main() {
  let failed = false;
  console.log('\nMerchantPilot environment check\n');

  console.log('PayPal');
  if (!hasPayPalCredentials()) {
    warn('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set → app runs on DEMO data');
  } else {
    try {
      await getAccessToken();
      ok(`OAuth token OK (${config.paypal.baseUrl})`);
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86_400_000);
      const checks: [string, () => Promise<unknown>][] = [
        ['Transaction Search (/v1/reporting/transactions)', () => paypalGet('/v1/reporting/transactions', { start_date: start.toISOString().replace(/\.\d{3}Z$/, 'Z'), end_date: end.toISOString().replace(/\.\d{3}Z$/, 'Z'), page_size: 1 })],
        ['Disputes (/v1/customer/disputes)', () => paypalGet('/v1/customer/disputes', { page_size: 1 })],
        ['Invoicing (/v2/invoicing/invoices)', () => paypalGet('/v2/invoicing/invoices', { page_size: 1 })],
      ];
      for (const [label, fn] of checks) {
        try {
          await fn();
          ok(label);
        } catch (e) {
          warn(`${label}: ${(e as Error).message}`);
          if (label.startsWith('Transaction')) warn('  → Enable "Transaction search" in your sandbox app features, then wait a few minutes.');
        }
      }
    } catch (e) {
      bad(`OAuth failed: ${(e as Error).message}`);
      failed = true;
    }
  }
  console.log(`  data mode: ${dataMode()}`);

  console.log('\nAI model');
  const p = llmProvider();
  if (p === 'none') warn('No OPENAI_API_KEY / ANTHROPIC_API_KEY → AI chat will show a setup message');
  else {
    try {
      const { generateText } = await import('ai');
      const { resolveModel } = await import('../lib/llm/run');
      const r = await generateText({ model: resolveModel()!, prompt: 'Reply with the single word: ready' });
      ok(`${p} / ${llmModelId()} → "${r.text.trim().slice(0, 40)}"`);
    } catch (e) {
      bad(`${p} / ${llmModelId()} failed: ${(e as Error).message}`);
      failed = true;
    }
  }

  console.log('\nAG Studio');
  if (process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY) ok('License key set (no watermark)');
  else warn('NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY not set → trial watermark (fine for development)');

  console.log('');
  process.exit(failed ? 1 : 0);
}

main();
