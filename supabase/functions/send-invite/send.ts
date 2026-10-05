// An invite from a friend, as a push to their phone. The database calls this (a trigger on friend_invites, in
// supabase/schema.sql) with the invite's id, only when the friend has a device with reminders on and Invites from
// friends on, and at most once from the same friend every 10 minutes. What it says comes from the site itself
// (../_shared/site.js, built from src/lib/invitePush.ts by `npm run functions:build`).
import * as webpush from 'jsr:@negrel/webpush@0.5.0'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'
import { invitePush, PUSH_SERVICE } from '../_shared/site.js'

export interface InviteRow {
  id: string
  to_user: string
  kind: 'room' | 'group'
  room_code: string | null
  song_id: string | null
  group_id: string | null
  expires_at: string
  /** The sender's name, as friends see it, and the group's name for a group's invite. */
  from_name: string
  group_name: string | null
}

export interface DeviceRow {
  endpoint: string
  p256dh: string
  auth: string
}

type Push = { title: string; body: string; hash: string; tag: string }

/** Everything the sending needs from outside, so it can be tried without a database or a push service. */
export interface Deps {
  invite(id: string): Promise<InviteRow | null>
  /** The friend's devices with reminders on and Invites from friends on. */
  devices(userId: string): Promise<DeviceRow[]>
  /** 'gone' when the push service says the subscription no longer exists. */
  send(row: DeviceRow, push: Push, ttlSeconds: number): Promise<'sent' | 'gone'>
  remove(row: DeviceRow): Promise<void>
}

export interface Report {
  /** False for an invite that's gone, run out, or has nothing to open. */
  invite: boolean
  sent: number
  /** Subscriptions the push service no longer has, now deleted. */
  removed: number
  failed: number
}

export async function sendInvite(deps: Deps, id: string, now = new Date()): Promise<Report> {
  const report: Report = { invite: false, sent: 0, removed: 0, failed: 0 }
  const invite = await deps.invite(id)
  const left = invite ? Math.floor((Date.parse(invite.expires_at) - now.getTime()) / 1000) : 0
  if (!invite || left <= 0) return report
  // site.js is plain JavaScript: its types are only what Deno can guess, so say what this is.
  const push = invitePush({
    from: invite.from_name,
    kind: invite.kind,
    roomCode: invite.room_code,
    songId: invite.song_id,
    groupId: invite.group_id,
    groupName: invite.group_name,
  }) as Push | null
  if (!push) return report
  report.invite = true
  // No longer than the invite lasts, and a group's no more than a day: an old one isn't news.
  const ttl = Math.min(left, 24 * 60 * 60)
  await Promise.all(
    (await deps.devices(invite.to_user)).map(async (row) => {
      try {
        if ((await deps.send(row, push, ttl)) === 'gone') {
          await deps.remove(row)
          report.removed++
        } else report.sent++
      } catch (error) {
        report.failed++
        console.error('Invite not sent', row.endpoint.slice(0, 60), error)
      }
    }),
  )
  return report
}

/** The real thing: the database through the service key, pushes signed with the VAPID keys. */
export async function liveDeps(env: (name: string) => string | undefined): Promise<Deps> {
  const need = (name: string) => {
    const value = env(name)
    if (!value) throw new Error(`Missing secret ${name}`)
    return value
  }
  const db: SupabaseClient = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const site = (env('SITE_URL') ?? 'https://planktotaylor.pages.dev').replace(/\/$/, '')
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(need('VAPID_KEYS')))
  const server = await webpush.ApplicationServer.new({ contactInformation: env('VAPID_SUBJECT') ?? site, vapidKeys })

  return {
    async invite(id) {
      const { data, error } = await db
        .from('friend_invites')
        .select('id, from_user, to_user, kind, room_code, song_id, group_id, expires_at')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const [profile, group] = await Promise.all([
        db.from('plank_profiles').select('display_name').eq('user_id', data.from_user).maybeSingle(),
        data.group_id ? db.from('groups').select('name').eq('id', data.group_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ])
      if (profile.error) throw profile.error
      if (group.error) throw group.error
      return {
        ...(data as Omit<InviteRow, 'from_name' | 'group_name'>),
        from_name: (profile.data?.display_name as string | null)?.trim() || 'A friend',
        group_name: (group.data?.name as string | undefined) ?? null,
      }
    },
    async devices(userId) {
      const { data, error } = await db.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId).eq('invites', true)
      if (error) throw error
      return data as DeviceRow[]
    },
    async send(row, push, ttlSeconds) {
      // Only ever to a browser's push service, whatever's in the table.
      if (!PUSH_SERVICE.test(row.endpoint)) return 'gone'
      const subscriber = server.subscribe({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })
      try {
        // A room's invite is for now: high urgency. A newer room invite replaces one not shown yet (the topic).
        await subscriber.pushTextMessage(JSON.stringify(push), {
          ttl: ttlSeconds,
          urgency: push.tag === 'invite-room' ? webpush.Urgency.High : webpush.Urgency.Normal,
          topic: push.tag === 'invite-room' ? 'invite' : undefined,
        })
        return 'sent'
      } catch (error) {
        if (error instanceof webpush.PushMessageError && error.isGone()) return 'gone'
        throw error
      }
    },
    async remove(row) {
      const { error } = await db.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
      if (error) throw error
    },
  }
}
