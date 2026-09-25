// The discord-card Edge Function: Settings → Discord calls it, with the player's sign-in, to preview a
// channel's night card. Deploy with `npm run functions:deploy`.
import { liveDeps, preview, type Problem } from './card.ts'

// Called from the browser with the sign-in token rather than cookies, so any origin can be allowed.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STATUS: Record<Problem, number> = { 'sign-in': 401, 'bad-request': 400, 'not-member': 403 }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return Response.json({ problem: 'bad-request' }, { status: 405, headers: CORS })
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? null
  let body: unknown = null
  try {
    const text = await request.text()
    if (text.length <= 500) body = JSON.parse(text)
  } catch {
    // Not JSON: a bad request, below.
  }
  try {
    const result = await preview(liveDeps((name) => Deno.env.get(name)), token, body)
    if ('png' in result) return new Response(result.png as Uint8Array<ArrayBuffer>, { headers: { ...CORS, 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } })
    if ('empty' in result) return Response.json({ empty: true }, { headers: CORS })
    return Response.json({ problem: result.problem }, { status: STATUS[result.problem], headers: CORS })
  } catch (error) {
    console.error('Discord card preview failed', String(error))
    return Response.json({}, { status: 500, headers: CORS })
  }
})
