/**
 * npm run smoke -- https://your-app.onrender.com
 * Post-deploy check that the hosted demo works for judges: health, data, an agent tool and one AI turn.
 */
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

async function step(name: string, fn: () => Promise<string>) {
  const t = Date.now();
  try {
    const info = await fn();
    console.log(`✔ ${name} (${Date.now() - t} ms) ${info}`);
    return true;
  } catch (e) {
    console.log(`✘ ${name}: ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  console.log(`Smoke testing ${base}\n`);
  const results = [
    await step('health', async () => {
      const h = await (await fetch(`${base}/api/health`)).json();
      if (!h.ok) throw new Error('not ok');
      return `data=${h.dataMode} llm=${h.llmProvider}/${h.llmModel} license=${h.agStudioLicensed}`;
    }),
    await step('dataset', async () => {
      const d = await (await fetch(`${base}/api/data`)).json();
      return `${d.transactions.length} transactions, ${d.disputes.length} disputes, ${d.invoices.length} invoices`;
    }),
    await step('agent tool: detect anomalies', async () => {
      const r = await (await fetch(`${base}/api/agent/tools/paypal_detect_anomalies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
      if (!r.ok) throw new Error(r.error);
      return `${r.result.findings.length} findings`;
    }),
    await step('AI turn (/api/llm)', async () => {
      const res = await fetch(`${base}/api/llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: [{ id: 'u', kind: 'input', type: 'message', role: 'user', status: 'completed', content: [{ type: 'text', text: 'Reply with: ready' }] }],
          responseFormat: { type: 'text' },
        }),
      });
      const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
      const done = lines.at(-1);
      if (done.type !== '__complete' || done.response.status !== 'completed') throw new Error(JSON.stringify(done).slice(0, 200));
      return `"${done.response.output?.[0]?.content?.[0]?.text?.slice(0, 40) ?? ''}"`;
    }),
    await step('dashboard page', async () => {
      const res = await fetch(`${base}/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return 'HTTP 200';
    }),
  ];
  process.exit(results.every(Boolean) ? 0 : 1);
}

main();
