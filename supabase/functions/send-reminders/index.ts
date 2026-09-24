// The send-reminders Edge Function. The schedule (pg_cron, in supabase/schema.sql) calls it every 15 minutes
// with the shared secret; anyone else is turned away. Deploy with `npm run functions:deploy`.
import { liveDeps, sendDue } from './send.ts'

/** Compares in the same time whatever the input, so the secret can't be guessed a character at a time. */
function sameSecret(given: string, secret: string): boolean {
  if (given.length !== secret.length) return false
  let difference = 0
  for (let i = 0; i < secret.length; i++) difference |= given.charCodeAt(i) ^ secret.charCodeAt(i)
  return difference === 0
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('REMINDERS_SECRET')
  if (!secret || !sameSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return new Response('Not allowed', { status: 401 })
  }
  try {
    const report = await sendDue(await liveDeps((name) => Deno.env.get(name)))
    return Response.json(report)
  } catch (error) {
    console.error('Reminders failed', error)
    return new Response('Reminders failed', { status: 500 })
  }
})
