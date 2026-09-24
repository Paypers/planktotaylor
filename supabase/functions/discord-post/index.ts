// The discord-post Edge Function. The schedule (pg_cron, in supabase/schema.sql) calls it every 15 minutes
// with the same secret as send-reminders; anyone else is turned away. Deploy with `npm run functions:deploy`.
import { hideTokens } from '../_shared/site.js'
import { fromSchedule } from '../_shared/secret.ts'
import { liveDeps, postDue } from './post.ts'

Deno.serve(async (request) => {
  if (!fromSchedule(request, Deno.env.get('REMINDERS_SECRET'))) return new Response('Not allowed', { status: 401 })
  try {
    const report = await postDue(liveDeps((name) => Deno.env.get(name)))
    return Response.json(report)
  } catch (error) {
    console.error('Discord posts failed', hideTokens(String(error)))
    return new Response('Discord posts failed', { status: 500 })
  }
})
