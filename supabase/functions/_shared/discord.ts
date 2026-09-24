// Talking to Discord, for the discord-add and discord-post functions. Only ever to a webhook address in
// the one form they're kept in (DISCORD_WEBHOOK in src/lib/discord.ts), whatever's asked.
import { DISCORD_WEBHOOK } from './site.js'

const HEADERS = { 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://planktotaylor.pages.dev, 1)' }

/**
 * What Discord said:
 * gone     the webhook was deleted (404) or its token changed (401): it will never work again
 * wait     too many posts too fast (429): try again after this many seconds
 * failed   anything else (Discord down, a network problem): try again on the next check
 */
export type Refusal = { status: 'gone' } | { status: 'wait'; seconds: number } | { status: 'failed'; detail: string }
export type PostResult = { status: 'sent' } | Refusal
export type LookUpResult = { status: 'found'; channelId: string; name: string | null } | Refusal

/** Posts a message through a webhook. */
export async function postTo(url: string, message: object, fetcher: typeof fetch = fetch): Promise<PostResult> {
  if (!DISCORD_WEBHOOK.test(url)) return { status: 'gone' }
  const response = await fetcher(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(message) })
  if (response.ok) {
    await response.body?.cancel()
    return { status: 'sent' }
  }
  return refusal(response)
}

/** A webhook's channel and name, from Discord: the check that it exists, before anything is posted. */
export async function lookUp(url: string, fetcher: typeof fetch = fetch): Promise<LookUpResult> {
  if (!DISCORD_WEBHOOK.test(url)) return { status: 'gone' }
  const response = await fetcher(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
  if (response.ok) {
    const webhook = (await response.json()) as { channel_id?: unknown; name?: unknown }
    if (typeof webhook.channel_id !== 'string') return { status: 'failed', detail: 'no channel in the answer' }
    return { status: 'found', channelId: webhook.channel_id, name: typeof webhook.name === 'string' ? webhook.name : null }
  }
  return refusal(response)
}

async function refusal(response: Response): Promise<Refusal> {
  if (response.status === 404 || response.status === 401) {
    await response.body?.cancel()
    return { status: 'gone' }
  }
  if (response.status === 429) {
    // Discord says how long in the answer (seconds, with a fraction); Cloudflare in front of it, in a header.
    const answer = (await response.json().catch(() => null)) as { retry_after?: unknown } | null
    const given = answer?.retry_after ?? response.headers.get('retry-after')
    const seconds = typeof given === 'number' || (typeof given === 'string' && given.trim() !== '') ? Number(given) : NaN
    if (Number.isFinite(seconds) && seconds >= 0) return { status: 'wait', seconds }
    return { status: 'failed', detail: '429 without a time to wait' }
  }
  await response.body?.cancel()
  return { status: 'failed', detail: `${response.status}` }
}
