// The discord-add Edge Function: Settings → Discord calls it to add a channel's daily post, with the
// player's sign-in. Deploy with `npm run functions:deploy`.
import { hideTokens } from '../_shared/site.js'
import { addWebhook, liveDeps, type Problem } from './add.ts'

// The site calls it from the browser, from its own address or localhost, with its sign-in token rather
// than cookies, so any origin can be allowed.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STATUS: Record<Problem, number> = {
  'sign-in': 401,
  'bad-address': 400,
  'bad-zone': 400,
  'not-found': 400,
  'channel-taken': 409,
  'too-many': 409,
  'too-many-today': 429,
  busy: 429,
  'discord-down': 502,
}

const answer = (status: number, body: object) => Response.json(body, { status, headers: CORS })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return answer(405, { problem: 'bad-address' })
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? null
  let body: unknown = null
  try {
    const text = await request.text()
    // A webhook address, a time zone and a name: never more than this.
    if (text.length <= 2000) body = JSON.parse(text)
  } catch {
    // Not JSON: answered as a bad address below.
  }
  try {
    const result = await addWebhook(liveDeps((name) => Deno.env.get(name)), token, body)
    return 'added' in result ? answer(200, { webhook: result.added }) : answer(STATUS[result.problem], { problem: result.problem })
  } catch (error) {
    console.error('Adding a Discord webhook failed', hideTokens(String(error)))
    return answer(500, {})
  }
})
