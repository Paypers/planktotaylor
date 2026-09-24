import { ALBUM_ORDER, ALBUMS, SONG_BY_ID, SONGS, formatDuration, type Album, type AlbumId, type Song } from '../data/songs'
import type { Attempt } from './attempts'
import { toDayKey, type DayKey } from './dates'
import { DAILY_EPOCH } from './daily'
import type { Completion } from './progress'
import { allPlanks, type Plank } from './planks'
import { streakInfo } from './streaks'
import { rankName, type PlayerRank } from './ranks'

// Your Plank Year: the year's planks, told as slides you tap through, like Spotify Wrapped. It opens on
// 1 December and stays until the end of January. Everything is worked out here in the browser, from
// planks and attempts, so it needs no server and works signed out. It never counts breaks.

export const REVIEW_NAME = 'Your Plank Year'
/** An Eras Tour show ran about 3½ hours. */
export const ERAS_TOUR_SECONDS = 3.5 * 3600

/** Which year's review is open on `today`: December shows the year so far, January the year just ended. */
export function reviewYear(today: DayKey): number | null {
  const [year, month] = today.split('-').map(Number)
  if (month === 12) return year
  if (month === 1) return year - 1
  return null
}

export interface YearReview {
  year: number
  /** The days it covers: the site's first day at the earliest, and never past today. */
  from: DayKey
  to: DayKey
  planks: number
  /** Days with any plank. */
  days: number
  seconds: number
  bestStreak: number
  topAlbum: { album: Album; planks: number } | null
  longest: { song: Song; seconds: number } | null
  /** Planks held all the way through, with no breaks. */
  noBreak: number
  /** The song that took the most goes before you finished it: at least two. */
  foughtBack: { song: Song; goes: number } | null
  /** Ladder levels climbed. */
  levels: number
  lights: number
}

export function yearInReview(completions: readonly Completion[], attempts: readonly Attempt[], year: number, today: DayKey): YearReview {
  const from = `${year}-01-01` < DAILY_EPOCH ? DAILY_EPOCH : `${year}-01-01`
  const to = `${year}-12-31` < today ? `${year}-12-31` : today
  const inYear = completions.filter((c) => c.day >= from && c.day <= to)
  // Every plank held to the end, goes again included, a two-for-one counted once.
  const planks = allPlanks(completions, attempts).filter((p) => p.day >= from && p.day <= to)

  const byAlbum = new Map<AlbumId, { planks: number; seconds: number }>()
  for (const p of planks) {
    const tally = byAlbum.get(p.song.album) ?? { planks: 0, seconds: 0 }
    byAlbum.set(p.song.album, { planks: tally.planks + 1, seconds: tally.seconds + p.seconds })
  }
  // Most planks, then most time, then the earlier album.
  const top = ALBUM_ORDER.filter((id) => byAlbum.has(id)).sort(
    (a, b) => byAlbum.get(b)!.planks - byAlbum.get(a)!.planks || byAlbum.get(b)!.seconds - byAlbum.get(a)!.seconds,
  )[0]

  const longest = planks.reduce<Plank | null>((best, p) => (!best || p.seconds > best.seconds ? p : best), null)

  return {
    year,
    from,
    to,
    planks: planks.length,
    days: new Set(planks.map((p) => p.day)).size,
    seconds: planks.reduce((sum, p) => sum + p.seconds, 0),
    bestStreak: streakInfo(new Set(inYear.filter((c) => c.mode === 'daily').map((c) => c.day)), to).best,
    topAlbum: top ? { album: ALBUMS[top], planks: byAlbum.get(top)!.planks } : null,
    longest: longest && { song: longest.song, seconds: longest.seconds },
    noBreak: planks.filter((p) => p.clean).length,
    foughtBack: foughtBack(attempts, from, to),
    levels: inYear.filter((c) => c.mode === 'ladder').length,
    lights: planks.reduce((sum, p) => sum + p.lights, 0),
  }
}

/**
 * The song that took the most goes to finish, counting the finishing go: shown only once finished, so
 * it reads as a win. Ties go to the one finished first.
 */
function foughtBack(attempts: readonly Attempt[], from: DayKey, to: DayKey): { song: Song; goes: number } | null {
  const inYear = attempts
    .filter((a) => {
      const day = toDayKey(new Date(a.startedAt))
      return day >= from && day <= to
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const goes = new Map<string, number>()
  const finished = new Map<string, number>()
  for (const a of inYear) {
    if (finished.has(a.songId)) continue
    const count = (goes.get(a.songId) ?? 0) + 1
    goes.set(a.songId, count)
    if (a.outcome === 'finished') finished.set(a.songId, count)
  }
  let best: { song: Song; goes: number } | null = null
  for (const [songId, count] of finished) {
    const song = SONG_BY_ID.get(songId)
    if (song && count >= 2 && (!best || count > best.goes)) best = { song, goes: count }
  }
  return best
}

/** Every song on an album that's out, end to end. */
export function albumSeconds(album: AlbumId): number {
  return SONGS.filter((s) => s.album === album).reduce((sum, s) => sum + s.seconds, 0)
}

const times = (ratio: number) => {
  const n = Math.round(ratio)
  return n === 2 ? 'twice' : `${n} times`
}

/** A fun sense of the time planked: Eras Tours for a lot, your top album for less, a song for a little. */
export function timeComparison(seconds: number, topAlbum: AlbumId | null, longest: Song | null): string {
  const eras = seconds / ERAS_TOUR_SECONDS
  if (eras >= 1.5) return `That's the Eras Tour ${times(eras)} over.`
  if (eras >= 1) return "That's longer than a whole Eras Tour show."
  if (topAlbum) {
    const album = seconds / albumSeconds(topAlbum)
    if (album >= 1.5) return `That's all of ${ALBUMS[topAlbum].title}, ${times(album)} over.`
    if (album >= 1) return `That's all of ${ALBUMS[topAlbum].title}, start to finish.`
  }
  if (longest && seconds / longest.seconds >= 1.5) return `That's ${longest.title}, ${times(seconds / longest.seconds)} over.`
  return 'Every second of it held to the end of the song.'
}

/** "47 minutes" under 100 minutes, "5.2 hours" from there. */
export function reviewTime(seconds: number): { big: string; unit: string } {
  const minutes = Math.round(seconds / 60)
  if (minutes < 100) return { big: String(Math.max(1, minutes)), unit: minutes === 1 ? 'minute' : 'minutes' }
  const hours = Math.round((seconds / 3600) * 10) / 10
  return { big: hours.toLocaleString(), unit: 'hours' }
}

export type SlideKind = 'time' | 'planks' | 'album' | 'longest' | 'clean' | 'fought' | 'ladder' | 'lights' | 'summary'

/** One slide, as the screen shows it and its card draws it. */
export interface Slide {
  kind: SlideKind
  eyebrow: string
  /** The big thing: a number, or a title. */
  big: string
  unit?: string
  line?: string
  /** Colours the slide: the top album. */
  album?: Album
  /** The rank reached, on the ladder slide (signed-in players). */
  rank?: PlayerRank
  /** The summary's lines. */
  rows?: [string, string][]
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/**
 * The slides for a year, leaving out any with nothing to show. None if nothing was planked. `rank` is
 * the rank reached (signed in only: XP is for signed-in players).
 */
export function reviewSlides(review: YearReview, rank: PlayerRank | null): Slide[] {
  if (review.planks === 0) return []
  const { planks, days, bestStreak, topAlbum, longest, noBreak, foughtBack, levels, lights } = review
  const time = reviewTime(review.seconds)
  const slides: Slide[] = [
    {
      kind: 'time',
      eyebrow: 'Time planked',
      ...time,
      line: timeComparison(review.seconds, topAlbum?.album.id ?? null, longest?.song ?? null),
    },
    {
      kind: 'planks',
      eyebrow: 'Planks',
      big: planks.toLocaleString(),
      unit: planks === 1 ? 'plank' : 'planks',
      line: `On ${plural(days, 'day')}.${bestStreak > 1 ? ` Your best streak: ${plural(bestStreak, 'day')}.` : ''}`,
    },
  ]
  if (topAlbum && planks >= 2) {
    slides.push({
      kind: 'album',
      eyebrow: 'Top album',
      big: topAlbum.album.title,
      line: `${plural(topAlbum.planks, 'plank')} in its colors.`,
      album: topAlbum.album,
    })
  }
  if (longest && planks >= 2) {
    slides.push({ kind: 'longest', eyebrow: 'Longest single hold', big: formatDuration(longest.seconds), line: longest.song.title })
  }
  if (noBreak > 0) {
    slides.push({ kind: 'clean', eyebrow: 'All the way through', big: noBreak.toLocaleString(), unit: 'held with no breaks 🟩' })
  }
  if (foughtBack) {
    slides.push({
      kind: 'fought',
      eyebrow: 'The one that fought back',
      big: foughtBack.song.title,
      line: `${foughtBack.goes} goes, and then it was yours.`,
    })
  }
  if (levels > 0) {
    slides.push({
      kind: 'ladder',
      eyebrow: 'Your ladder',
      big: levels.toLocaleString(),
      unit: levels === 1 ? 'level climbed' : 'levels climbed',
      ...(rank ? { line: `You reached ${rankName(rank.tier, rank.division)}.`, rank } : {}),
    })
  }
  if (lights > 0) slides.push({ kind: 'lights', eyebrow: 'Aurora lights', big: lights.toLocaleString(), unit: 'caught ✨' })

  const rows: [string, string][] = [
    ['Time planked', `${time.big} ${time.unit}`],
    ['Planks', planks.toLocaleString()],
  ]
  if (bestStreak > 1) rows.push(['Best streak', plural(bestStreak, 'day')])
  if (topAlbum && planks >= 2) rows.push(['Top album', topAlbum.album.short])
  if (noBreak > 0) rows.push(['No breaks 🟩', noBreak.toLocaleString()])
  if (levels > 0) rows.push(['Ladder levels', levels.toLocaleString()])
  if (rank) rows.push(['Rank', rankName(rank.tier, rank.division)])
  if (lights > 0) rows.push(['Lights caught', lights.toLocaleString()])
  slides.push({ kind: 'summary', eyebrow: REVIEW_NAME, big: String(review.year), rows })
  return slides
}

/** The year as text, for sharing with the link. */
export function reviewText(review: YearReview, link: string): string {
  const time = reviewTime(review.seconds)
  const facts = [plural(review.planks, 'plank'), `${time.big} ${time.unit}`]
  if (review.bestStreak > 1) facts.push(`best streak ${plural(review.bestStreak, 'day')}`)
  return [
    `${REVIEW_NAME} ${review.year} · Plank to Taylor`,
    facts.join(' · '),
    ...(review.topAlbum && review.planks >= 2 ? [`Top album: ${review.topAlbum.album.title}`] : []),
    `Plank along: ${link}`,
  ].join('\n')
}
