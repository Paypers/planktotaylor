// The send-reminders Edge Function. The schedule (pg_cron, in supabase/schema.sql) calls it every 15 minutes
// with the shared secret; anyone else is turned away. Deploy with `npm run functions:deploy`.
import { fromSchedule } from '../_shared/secret.ts'
import { liveDeps, sendDue } from './send.ts'

Deno.serve(async (request) => {
  if (!fromSchedule(request, Deno.env.get('REMINDERS_SECRET'))) return new Response('Not allowed', { status: 401 })
  try {
    const report = await sendDue(await liveDeps((name) => Deno.env.get(name)))
    return Response.json(report)
  } catch (error) {
    console.error('Reminders failed', error)
    return new Response('Reminders failed', { status: 500 })
  }
})
