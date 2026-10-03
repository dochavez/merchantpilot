/**
 * Central runtime configuration. Everything is read from environment variables so the same build
 * runs locally (demo data, no keys), against the PayPal sandbox, and on Render.
 *
 * Server-only: never import this from a client component.
 */

export type DataMode = 'live' | 'demo';
export type LlmProvider = 'openai' | 'anthropic' | 'mock' | 'none';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export const config = {
  paypal: {
    clientId: env('PAYPAL_CLIENT_ID'),
    // Accept both names: the official boilerplate uses PAYPAL_SECRET.
    clientSecret: env('PAYPAL_CLIENT_SECRET') ?? env('PAYPAL_SECRET'),
    baseUrl: env('PAYPAL_API_BASE') ?? 'https://api-m.sandbox.paypal.com',
    webhookId: env('PAYPAL_WEBHOOK_ID'),
  },
  llm: {
    openaiKey: env('OPENAI_API_KEY'),
    anthropicKey: env('ANTHROPIC_API_KEY'),
    providerOverride: env('LLM_PROVIDER') as LlmProvider | undefined,
    model: env('LLM_MODEL'),
    /** Max LLM turns per IP in a 10 minute window (protects the hosted demo budget). */
    turnsPerWindow: Number(env('LLM_TURNS_PER_10_MIN') ?? 80),
    /** Hard cap of LLM turns per server process per day. */
    dailyTurnCap: Number(env('LLM_DAILY_TURN_CAP') ?? 3000),
  },
  /** Set FORCE_DEMO=1 to use the built-in demo store even when PayPal keys are present. */
  forceDemo: env('FORCE_DEMO') === '1' || env('FORCE_DEMO') === 'true',
};

export function hasPayPalCredentials(): boolean {
  return Boolean(config.paypal.clientId && config.paypal.clientSecret);
}

export function dataMode(): DataMode {
  return hasPayPalCredentials() && !config.forceDemo ? 'live' : 'demo';
}

export function llmProvider(): LlmProvider {
  const o = config.llm.providerOverride;
  if (o === 'mock') return 'mock';
  if (o === 'openai' && config.llm.openaiKey) return 'openai';
  if (o === 'anthropic' && config.llm.anthropicKey) return 'anthropic';
  if (config.llm.openaiKey) return 'openai';
  if (config.llm.anthropicKey) return 'anthropic';
  return 'none';
}

export const DEFAULT_MODELS: Record<Exclude<LlmProvider, 'none'>, string> = {
  mock: 'scripted-mock',
  openai: 'gpt-5-mini',
  anthropic: 'claude-sonnet-4-5',
};

export function llmModelId(): string | undefined {
  const p = llmProvider();
  if (p === 'none') return undefined;
  return config.llm.model ?? DEFAULT_MODELS[p];
}
