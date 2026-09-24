import { describe, expect, it } from 'vitest'
import type { ScheduledSong } from './daily'
import {
  DISCORD_WEBHOOK,
  duePost,
  hideTokens,
  knownZone,
  morningPost,
  nightPost,
  webhookAddress,
  webhookLabel,
  welcomePost,
  zoneName,
  type WebhookRow,
} from './discord'
import type { DailyStats } from './together'

const ID = '1234567890123456789'
const TOKEN = 'aBcD_efGh-ijKlmNOPqrstUVwxyz0123456789abcdefghijklmnopqrstuvwxyzAB'
const SITE = 'https://planktotaylor.pages.dev'

describe('webhook addresses', () => {
  it('takes what Copy Webhook URL gives, in one form', () => {
    const tidy = `https://discord.com/api/webhooks/${ID}/${TOKEN}`
    for (const pasted of [
      tidy,
      `  ${tidy}\n`,
      `${tidy}/`,
      `https://discordapp.com/api/webhooks/${ID}/${TOKEN}`,
      `https://ptb.discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://canary.discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/v10/webhooks/${ID}/${TOKEN}`,
    ]) {
      expect(webhookAddress(pasted), pasted).toBe(tidy)
    }
    expect(DISCORD_WEBHOOK.test(tidy)).toBe(true)
  })

  it('refuses anything else', () => {
    for (const pasted of [
      '',
      'discord.com/api/webhooks',
      `http://discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}`,
      `https://discord.com/api/webhooks/${ID}/short`,
      `https://discord.com/api/webhooks/abc/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}/${TOKEN}?wait=true`,
      `https://discord.com/api/webhooks/${ID}/${TOKEN}/slack`,
      `https://discord.com.example.com/api/webhooks/${ID}/${TOKEN}`,
      `https://evil.example/https://discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com@evil.example/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.gg/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/channels/${ID}/${TOKEN}`,
    ]) {
      expect(webhookAddress(pasted), pasted).toBeNull()
    }
    expect(DISCORD_WEBHOOK.test(`https://discordapp.com/api/webhooks/${ID}/${TOKEN}`)).toBe(false)
  })

  it('keeps tokens out of logs', () => {
    expect(hideTokens(`error sending request for url (https://discord.com/api/webhooks/${ID}/${TOKEN})`)).toBe(
      `error sending request for url (https://discord.com/api/webhooks/${ID}/…)`,
    )
  })

  it('names it in the list', () => {
    expect(webhookLabel('  Swiftie gym  ', 'Captain Hook')).toBe('Swiftie gym')
    expect(webhookLabel('', 'Captain Hook')).toBe('Captain Hook')
    expect(webhookLabel(' ', null)).toBe('Discord channel')
    expect(webhookLabel('x'.repeat(80), null)).toHaveLength(60)
  })
})

describe('time zones', () => {
  it('knows real ones only', () => {
    expect(knownZone('America/New_York')).toBe(true)
    expect(knownZone('Asia/Kathmandu')).toBe(true)
    expect(knownZone('UTC')).toBe(true)
    expect(knownZone('Mars/Olympus_Mons')).toBe(false)
    expect(knownZone('')).toBe(false)
  })

  it('says whose time', () => {
    expect(zoneName('America/New_York')).toBe('New York')
    expect(zoneName('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
    expect(zoneName('UTC')).toBe('UTC')
  })
})

describe('when posts go', () => {
  const row = (fields: Partial<WebhookRow> = {}): WebhookRow => ({
    id: 'w1',
    url: `https://discord.com/api/webhooks/${ID}/${TOKEN}`,
    time_zone: 'America/New_York',
    last_morning: null,
    last_night: null,
    ...fields,
  })
  // New York is UTC-4 in September.
  const at = (utc: string) => new Date(`2026-09-24T${utc}:00Z`)

  it('posts the song at 8:00 and the stats at 21:00, where the server is', () => {
    expect(duePost(row(), at('11:59'))).toBeNull()
    expect(duePost(row(), at('12:00'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    expect(duePost(row(), at('12:59'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    expect(duePost(row(), at('13:00'))).toBeNull()
    expect(duePost(row(), at('01:00'))).toEqual({ kind: 'night', day: '2026-09-23' })
    expect(duePost(row(), at('01:45'))).toEqual({ kind: 'night', day: '2026-09-23' })
    expect(duePost(row(), at('02:00'))).toBeNull()
  })

  it('once a day each', () => {
    expect(duePost(row({ last_morning: '2026-09-24' }), at('12:15'))).toBeNull()
    expect(duePost(row({ last_morning: '2026-09-23' }), at('12:15'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    expect(duePost(row({ last_night: '2026-09-23' }), at('01:15'))).toBeNull()
  })

  it('in zones a quarter or half hour off', () => {
    // Kathmandu is UTC+5:45: 8:00 there is 02:15 UTC.
    expect(duePost(row({ time_zone: 'Asia/Kathmandu' }), at('02:15'))).toEqual({ kind: 'morning', day: '2026-09-24' })
    expect(duePost(row({ time_zone: 'Asia/Kathmandu' }), at('02:00'))).toBeNull()
    // India is UTC+5:30: 21:00 there is 15:30 UTC.
    expect(duePost(row({ time_zone: 'Asia/Kolkata' }), at('15:30'))).toEqual({ kind: 'night', day: '2026-09-24' })
  })

  it('never for a zone it doesn\'t know', () => {
    expect(duePost(row({ time_zone: 'Nowhere/Special' }), at('12:00'))).toBeNull()
  })
})

describe('what the posts say', () => {
  const style: ScheduledSong = { id: 'style', title: 'Style', seconds: 231, length: '3:51', album: "1989 (Taylor's Version)", number: 3 }
  const stats = (fields: Partial<DailyStats> = {}): DailyStats => ({ planks: 0, noBreak: 0, seconds: 0, slices: Array(20).fill(0), ...fields })

  it('as Plank to Taylor, never pinging anyone', () => {
    const post = morningPost(SITE, style)
    expect(post.username).toBe('Plank to Taylor')
    expect(post.avatar_url).toBe(`${SITE}/icon-192.png`)
    expect(post.allowed_mentions).toEqual({ parse: [] })
  })

  it('the welcome says when, and whose time', () => {
    expect(welcomePost(SITE, 'America/New_York').content).toBe(
      "**Plank to Taylor** will post here every day: today's song at 8 am, and how everyone did at 9 pm (New York time).\n" +
        `Plank along: <${SITE}>`,
    )
  })

  it('the morning: today\'s song', () => {
    expect(morningPost(SITE, style).content).toBe(
      `**Today's song:** Style (3:51), from 1989 (Taylor's Version) · Daily No. 3\nPlank along: <${SITE}>`,
    )
    // Without daily.json.
    expect(morningPost(SITE, null).content).toBe(`**Today's song** is waiting.\nPlank along: <${SITE}>`)
    // A daily.json from before the album and number.
    const older = { id: 'style', title: 'Style', seconds: 231, length: '3:51' } as ScheduledSong
    expect(morningPost(SITE, older).content.split('\n')[0]).toBe("**Today's song:** Style (3:51)")
  })

  it('titles never turn into formatting', () => {
    const song = { ...style, title: 'Bad_Blood *Remix* ~ `x` | y' }
    expect(morningPost(SITE, song).content).toContain('Bad\\_Blood \\*Remix\\* \\~ \\`x\\` \\| y')
  })

  it('the night: how everyone did, the friendly version', () => {
    const slices = Array(20).fill(0)
    slices[13] = 40
    const busy = nightPost(SITE, style, stats({ planks: 1412, noBreak: 187, seconds: 1412 * 231, slices }))
    expect(busy?.content).toBe(
      [
        '**How everyone did today:** 1,412 people have planked Style',
        'Together: 91 hours of planking',
        '187 held it all the way through 🟩',
        'Toughest stretch: around 2:40',
        `Still time to plank along: <${SITE}>`,
      ].join('\n'),
    )
    // Never a count of breaks or a share of anything.
    expect(busy?.content).not.toMatch(/%|break/i)
  })

  it('leaves out what there isn\'t yet', () => {
    const one = nightPost(SITE, style, stats({ planks: 1, seconds: 231, slices: [5, ...Array(19).fill(0)] }))
    expect(one?.content).toBe(
      [
        '**How everyone did today:** 1 person has planked Style',
        'Together: 4 minutes of planking',
        `Still time to plank along: <${SITE}>`,
      ].join('\n'),
    )
  })

  it('says nothing on a day nobody has planked', () => {
    expect(nightPost(SITE, style, stats())).toBeNull()
  })
})
