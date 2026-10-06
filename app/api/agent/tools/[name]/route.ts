import { runAgentTool } from '@/lib/agent-tools';
import { ActionValidationError } from '@/lib/actions';
import { withBusiness } from '@/lib/businesses';

async function POST_handler(req: Request, ctx: RouteContext<'/api/agent/tools/[name]'>) {
  const { name } = await ctx.params;
  const args = await req.json().catch(() => ({}));
  try {
    const result = await runAgentTool(name, args);
    return Response.json({ ok: true, result });
  } catch (e) {
    const status = e instanceof ActionValidationError ? 422 : (e as Error).message.startsWith('Unknown tool') ? 404 : 400;
    return Response.json({ ok: false, error: (e as Error).message }, { status });
  }
}

export const POST = withBusiness(POST_handler);
