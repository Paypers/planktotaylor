// The send-invite Edge Function. The database calls it (a trigger on friend_invites, in supabase/schema.sql) with
// the reminders' shared secret and the invite's id; anyone else is turned away. Deploy with `npm run functions:deploy`.
import { fromSchedule } from '../_shared/secret.ts'
import { liveDeps, sendInvite } from './send.ts'

const INVITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

Deno.serve(async (request) => {
  if (!fromSchedule(request, Deno.env.get('REMINDERS_SECRET'))) return new Response('Not allowed', { status: 401 })
  let id: unknown = null
  try {
    id = ((await request.json()) as { invite?: unknown }).invite
  } catch {
    // Not JSON: turned away below.
  }
  if (typeof id !== 'string' || !INVITE_ID.test(id)) return new Response('No invite', { status: 400 })
  try {
    return Response.json(await sendInvite(await liveDeps((name) => Deno.env.get(name)), id))
  } catch (error) {
    console.error('Invite push failed', error)
    return new Response('Invite push failed', { status: 500 })
  }
})
