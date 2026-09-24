// Adding a channel's daily post, for the site's Settings → Discord, with the player's sign-in. It asks
// Discord about the webhook, saves it, and posts a welcome in the channel, which is the check that it
// works: if that fails, it's taken back out. The limits are in the database (schema.sql); this says which
// one was hit. The webhook's address is never sent back.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'
import { lookUp, postTo, type LookUpResult, type PostResult } from '../_shared/discord.ts'
import { knownZone, WEBHOOKS_EACH, webhookAddress, webhookLabel, welcomePost } from '../_shared/site.js'

/** What the player sees of a webhook: never its address. */
export interface Added {
  id: string
  label: string
  time_zone: string
  created_at: string
}

/** The same as AddProblem in src/lib/discord.ts. */
export type Problem =
  | 'sign-in'
  | 'bad-address'
  | 'bad-zone'
  | 'not-found'
  | 'channel-taken'
  | 'too-many'
  | 'too-many-today'
  | 'busy'
  | 'discord-down'

export interface NewWebhook {
  user_id: string
  url: string
  channel_id: string
  label: string
  time_zone: string
}

/** Everything adding needs from outside, so it can be tried without a database or Discord. */
export interface Deps {
  site: string
  /** The signed-in player's id from their access token, or null if it isn't a live sign-in. */
  player(token: string): Promise<string | null>
  /** How many webhooks the player has. */
  count(userId: string): Promise<number>
  lookUp(url: string): Promise<LookUpResult>
  /** The channel's daily post, if it already has one. */
  inChannel(channelId: string): Promise<{ id: string; url: string } | null>
  /** Throws the database's error when a limit's been hit. */
  insert(webhook: NewWebhook): Promise<Added>
  post(url: string, message: object): Promise<PostResult>
  remove(id: string): Promise<void>
}

export async function addWebhook(deps: Deps, token: string | null, body: unknown): Promise<{ added: Added } | { problem: Problem }> {
  const userId = token ? await deps.player(token) : null
  if (!userId) return { problem: 'sign-in' }
  const given = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const url = typeof given.url === 'string' ? webhookAddress(given.url) : null
  if (!url) return { problem: 'bad-address' }
  const timeZone = given.timeZone
  if (typeof timeZone !== 'string' || !knownZone(timeZone)) return { problem: 'bad-zone' }
  // Checked here first so nothing is asked of Discord for nothing; the database checks again.
  if ((await deps.count(userId)) >= WEBHOOKS_EACH) return { problem: 'too-many' }

  const found = await deps.lookUp(url)
  if (found.status === 'gone') return { problem: 'not-found' }
  if (found.status !== 'found') return { problem: 'discord-down' }

  // A channel whose last webhook was deleted in Discord keeps its row until its next post finds out:
  // find out now, so the new one can take its place.
  const before = await deps.inChannel(found.channelId)
  if (before) {
    if (before.url === url || (await deps.lookUp(before.url)).status !== 'gone') return { problem: 'channel-taken' }
    await deps.remove(before.id)
  }

  let added: Added
  try {
    const label = webhookLabel(typeof given.label === 'string' ? given.label : '', found.name)
    added = await deps.insert({ user_id: userId, url, channel_id: found.channelId, label, time_zone: timeZone })
  } catch (error) {
    const { message, code } = (error ?? {}) as { message?: string; code?: string }
    if (message?.includes('sign-ups this hour')) return { problem: 'busy' }
    if (message?.includes('sign-ups today')) return { problem: 'too-many-today' }
    if (message?.includes('too many discord webhooks')) return { problem: 'too-many' }
    // Added a moment ago from somewhere else.
    if (code === '23505') return { problem: 'channel-taken' }
    throw error
  }

  const welcome = await deps.post(url, welcomePost(deps.site, timeZone))
  if (welcome.status !== 'sent') {
    await deps.remove(added.id)
    return { problem: welcome.status === 'gone' ? 'not-found' : 'discord-down' }
  }
  return { added }
}

/** The real thing: the player's sign-in and the database through the service key, and Discord. */
export function liveDeps(env: (name: string) => string | undefined): Deps {
  const need = (name: string) => {
    const value = env(name)
    if (!value) throw new Error(`Missing secret ${name}`)
    return value
  }
  const db: SupabaseClient = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const site = (env('SITE_URL') ?? 'https://planktotaylor.pages.dev').replace(/\/$/, '')

  return {
    site,
    async player(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    async count(userId) {
      const { count, error } = await db.from('discord_webhooks').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      if (error) throw error
      return count ?? 0
    },
    lookUp: (url) => lookUp(url),
    async inChannel(channelId) {
      const { data, error } = await db.from('discord_webhooks').select('id, url').eq('channel_id', channelId).maybeSingle()
      if (error) throw error
      return data
    },
    async insert(webhook) {
      const { data, error } = await db.from('discord_webhooks').insert(webhook).select('id, label, time_zone, created_at').single()
      if (error) throw error
      return data as Added
    },
    post: (url, message) => postTo(url, message),
    async remove(id) {
      const { error } = await db.from('discord_webhooks').delete().eq('id', id)
      if (error) throw error
    },
  }
}
