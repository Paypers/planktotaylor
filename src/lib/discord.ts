import type { ScheduledSong } from './daily'
import type { DayKey } from './dates'
import { localClock, timeHasCome } from './reminders'
import { togetherTime, toughestStretch, type DailyStats } from './together'

// The Discord daily post: a server admin adds a channel's webhook (Settings → Discord), and every day
// Plank to Taylor posts today's song there in the morning and how everyone did at night, at the server's
// time. There's no bot to host: a webhook is an address that posts to one channel. What's here is shared
// by the site and the discord-add and discord-post Edge Functions (bundled for them by
// `npm run functions:build`), so they always agree.

/** The morning post, today's song, in the server's time zone. */
export const MORNING_POST = '08:00'
/** The night post, how everyone did today. */
export const NIGHT_POST = '21:00'
/** Webhooks each player can add. schema.sql has the same limit: keep them in step. */
export const WEBHOOKS_EACH = 3
/** The longest name a webhook can have in the site's list. */
export const LABEL_LENGTH = 60

/**
 * A webhook's address as Discord's Copy Webhook URL gives it: from the app or the browser, the test builds
 * (ptb., canary.), the old discordapp.com, or with an API version in it.
 */
const PASTED_WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d{1,2})?\/webhooks\/(\d{17,20})\/([\w-]{50,100})\/?$/

/**
 * The one form a webhook is kept in, and the only address the functions ever send to. schema.sql has
 * the same pattern: keep them in step.
 */
export const DISCORD_WEBHOOK = /^https:\/\/discord\.com\/api\/webhooks\/\d{17,20}\/[\w-]{50,100}$/

/** A pasted webhook address in the form it's kept in, or null when it isn't a Discord webhook. */
export function webhookAddress(text: string): string | null {
  const match = PASTED_WEBHOOK.exec(text.trim())
  return match ? `https://discord.com/api/webhooks/${match[1]}/${match[2]}` : null
}

/** Text with every webhook's token taken out, for logs: the whole address is enough to post with. */
export function hideTokens(text: string): string {
  return text.replace(/(webhooks\/\d+\/)[\w-]+/g, '$1…')
}

/** A time zone this runtime knows, like "America/New_York". */
export function knownZone(timeZone: string): boolean {
  return timeZone.length > 0 && timeZone.length <= 64 && localClock(new Date(), timeZone) !== null
}

/** "America/New_York" → "New York", for saying whose time the posts go at. */
export function zoneName(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')
}

/** The name a webhook goes by in the site's list: the one given, or else the webhook's own name in Discord. */
export function webhookLabel(given: string, discordName: string | null | undefined): string {
  const tidy = (text: string | null | undefined) => text?.replace(/\s+/g, ' ').trim()
  return (tidy(given) || tidy(discordName) || 'Discord channel').slice(0, LABEL_LENGTH)
}

/** Why adding a webhook didn't work, as the discord-add function answers. */
export type AddProblem =
  | 'sign-in'
  | 'bad-address'
  | 'bad-zone'
  | 'not-found'
  | 'channel-taken'
  | 'too-many'
  | 'too-many-today'
  | 'busy'
  | 'discord-down'

/** One channel's daily post, as the discord-post function reads it. */
export interface WebhookRow {
  id: string
  url: string
  time_zone: string
  /** The last days each post went, in the server's own time zone: each goes at most once a day. */
  last_morning: DayKey | null
  last_night: DayKey | null
}

export type PostKind = 'morning' | 'night'

/** The post due in this channel now, if any: its time has come (within the last hour) and it hasn't gone today. */
export function duePost(row: WebhookRow, now: Date): { kind: PostKind; day: DayKey } | null {
  const clock = localClock(now, row.time_zone)
  if (!clock) return null
  if (timeHasCome(clock.minute, MORNING_POST) && row.last_morning !== clock.day) return { kind: 'morning', day: clock.day }
  if (timeHasCome(clock.minute, NIGHT_POST) && row.last_night !== clock.day) return { kind: 'night', day: clock.day }
  return null
}

/** What's sent to Discord. Mentions are off, so a post can never ping anyone. */
export interface DiscordMessage {
  content: string
  username: string
  avatar_url: string
  allowed_mentions: { parse: [] }
}

function message(site: string, lines: string[]): DiscordMessage {
  return { content: lines.join('\n'), username: 'Plank to Taylor', avatar_url: `${site}/icon-192.png`, allowed_mentions: { parse: [] } }
}

/** A title as Discord shows it, with nothing read as formatting. */
const plain = (text: string) => text.replace(/[\\*_~`|]/g, '\\$&')

/** "08:00" → "8 am", "21:30" → "9:30 pm". */
function hourName(hhmm: string): string {
  const hour = Number(hhmm.slice(0, 2))
  const minutes = hhmm.slice(3, 5)
  return `${hour % 12 || 12}${minutes === '00' ? '' : `:${minutes}`} ${hour < 12 ? 'am' : 'pm'}`
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`

/** The message a channel gets when it's added, which is also the check that the webhook works. */
export function welcomePost(site: string, timeZone: string): DiscordMessage {
  return message(site, [
    `**Plank to Taylor** will post here every day: today's song at ${hourName(MORNING_POST)}, and how everyone did at ${hourName(NIGHT_POST)} (${zoneName(timeZone)} time).`,
    `Plank along: <${site}>`,
  ])
}

/** The morning post: today's song, from daily.json (null if it couldn't be read). */
export function morningPost(site: string, song: ScheduledSong | null): DiscordMessage {
  if (!song) return message(site, ["**Today's song** is waiting.", `Plank along: <${site}>`])
  // daily.json from before the album and number were added has neither: leave them out.
  const album = song.album ? `, from ${plain(song.album)}` : ''
  const number = song.number ? ` · Daily No. ${song.number}` : ''
  return message(site, [`**Today's song:** ${plain(song.title)} (${song.length})${album}${number}`, `Plank along: <${site}>`])
}

/**
 * The night post: how everyone did today, the friendly version from the daily card. Planks held with no
 * breaks are a count, never a share, and there are no break counts. Null when nobody's planked yet.
 */
export function nightPost(site: string, song: ScheduledSong | null, stats: DailyStats): DiscordMessage | null {
  if (stats.planks === 0) return null
  const who = `${stats.planks.toLocaleString('en-US')} ${stats.planks === 1 ? 'person has' : 'people have'}`
  const toughest = song ? toughestStretch(stats, song.seconds) : null
  const lines = [
    `**How everyone did today:** ${who} planked ${song ? plain(song.title) : "today's song"}`,
    stats.seconds > 0 && `Together: ${togetherTime(stats.seconds)} of planking`,
    stats.noBreak > 0 && `${stats.noBreak.toLocaleString('en-US')} held it all the way through 🟩`,
    toughest !== null && `Toughest stretch: around ${mmss(toughest)}`,
    `Still time to plank along: <${site}>`,
  ]
  return message(site, lines.filter((line): line is string => typeof line === 'string'))
}
