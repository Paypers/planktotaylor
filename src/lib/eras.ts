import { ALBUMS, ALBUM_ORDER, SONGS, UPCOMING, type Album, type AlbumId, type Song, type UpcomingSong } from '../data/songs'
import { RELEASES } from './daily'
import { addDays, type DayKey } from './dates'
import type { Completion } from './progress'

// Collect the eras: every song you plank is stamped into its album. Hold it with no breaks and the stamp
// is gold. Stamp every song on an album and its badge is yours; a release that joined an album later
// (The Encore) has a charm of its own. Worked out from the plank records alone, so it works signed out.

/** One song's stamp: the first day it was planked, and the first day it was held with no breaks. */
export interface Stamp {
  song: Song
  stampedOn: DayKey | null
  goldOn: DayKey | null
}

/** An announced song that isn't out yet, with the day it premieres when that's known. */
export interface Upcoming {
  song: UpcomingSong
  premiere: DayKey | null
}

/** An album's songs, or a release's that joined one: what's stamped, and the badge (or charm) for it. */
export interface Collection {
  album: Album
  stamps: Stamp[]
  upcoming: Upcoming[]
  /** Every song on it, out or announced: a badge (or charm) needs them all. */
  total: number
  stamped: number
  gold: number
  /**
   * The day its badge (a charm, for a release) was earned: the first day every song out by then was
   * stamped. Songs that come out later never take it away.
   */
  earnedOn: DayKey | null
  /** The same for gold: the first day every song out by then had a gold stamp. */
  goldOn: DayKey | null
  /** Songs out since the badge was earned, and not stamped yet. */
  newToStamp: number
}

export interface Era extends Collection {
  /** Releases that joined the album later, each with a charm of its own. */
  releases: Collection[]
}

/** Each new song's premiere day. Launch songs have none. */
const PREMIERE_OF: ReadonlyMap<string, DayKey> = new Map(
  RELEASES.flatMap((release) => release.songs.map((id, i) => [id, addDays(release.from, i)] as const)).reverse(),
)

/**
 * When each new song's release began: the first premiere day of the songs released with it. A release's
 * songs count together from that day, so a badge needs the whole release, not only the songs out so far.
 * Launch songs have none.
 */
const RELEASE_OF: ReadonlyMap<string, DayKey> = new Map(
  RELEASES.flatMap((release) => release.songs.map((id) => [id, release.from] as const)).reverse(),
)

/** A song for earnedOn: its id, the day it got its stamp (or gold one), and the day it was first stamped. */
interface Dated {
  id: string
  on: DayKey | null
  stampedOn: DayKey | null
}

/**
 * The first day every song that counted by then had its stamp, or null. Launch songs always count. A
 * release's songs count together, all of them, from its first day or from the first day one of them was
 * stamped, if that's sooner; a release that began later doesn't count against it, so a badge stays when
 * new songs join. `releaseOf`: the first day of each new song's release (a parameter for tests).
 */
export function earnedOn(songs: readonly Dated[], releaseOf: ReadonlyMap<string, DayKey> = RELEASE_OF): DayKey | null {
  const begun = (release: DayKey, day: DayKey) =>
    release <= day || songs.some((s) => releaseOf.get(s.id) === release && s.stampedOn !== null && s.stampedOn <= day)
  const days = [...new Set(songs.map((s) => s.on).filter((d): d is DayKey => d !== null))].sort()
  return (
    days.find((day) => {
      const counted = songs.filter((s) => {
        const release = releaseOf.get(s.id)
        return release === undefined || begun(release, day)
      })
      return counted.length > 0 && counted.every((s) => s.on !== null && s.on <= day)
    }) ?? null
  )
}

function collect(album: Album, firsts: ReadonlyMap<string, { stampedOn: DayKey; goldOn: DayKey | null }>): Collection {
  const stamps = SONGS.filter((song) => song.album === album.id).map((song) => {
    const first = firsts.get(song.id)
    return { song, stampedOn: first?.stampedOn ?? null, goldOn: first?.goldOn ?? null }
  })
  const upcoming = UPCOMING.filter((song) => song.album === album.id).map((song) => ({ song, premiere: PREMIERE_OF.get(song.id) ?? null }))
  const stamped = stamps.filter((s) => s.stampedOn).length
  // Songs not out yet count too: they're part of their release, and nobody can have stamped them.
  const notOut = upcoming.map((u) => ({ id: u.song.id, on: null, stampedOn: null }))
  const earned = earnedOn([...stamps.map((s) => ({ id: s.song.id, on: s.stampedOn, stampedOn: s.stampedOn })), ...notOut])
  return {
    album,
    stamps,
    upcoming,
    total: stamps.length + upcoming.length,
    stamped,
    gold: stamps.filter((s) => s.goldOn).length,
    earnedOn: earned,
    goldOn: earnedOn([...stamps.map((s) => ({ id: s.song.id, on: s.goldOn, stampedOn: s.stampedOn })), ...notOut]),
    newToStamp: earned ? stamps.length - stamped : 0,
  }
}

/** Every song's first plank, and first plank with no breaks, from the records. */
function firstPlanks(completions: readonly Completion[]): Map<string, { stampedOn: DayKey; goldOn: DayKey | null }> {
  const firsts = new Map<string, { stampedOn: DayKey; goldOn: DayKey | null }>()
  for (const c of completions) {
    const clean = !c.pauses?.length
    const was = firsts.get(c.songId)
    firsts.set(c.songId, {
      stampedOn: !was || c.day < was.stampedOn ? c.day : was.stampedOn,
      goldOn: clean && (!was?.goldOn || c.day < was.goldOn) ? c.day : (was?.goldOn ?? null),
    })
  }
  return firsts
}

/** Albums by the year they came out. (ALBUM_ORDER puts 1989 first: JavaScript lists number-like keys first.) */
const BY_YEAR = [...ALBUM_ORDER].sort((a, b) => ALBUMS[a].year - ALBUMS[b].year)

/**
 * Every album's stamps, by the year it came out. A release that joined an album later (`partOf`) is on
 * that album's era, not an era of its own. Albums with no songs out yet are left out.
 */
export function eraStamps(completions: readonly Completion[]): Era[] {
  const firsts = firstPlanks(completions)
  return BY_YEAR.filter((id) => !ALBUMS[id].partOf)
    .map((id) => ({
      ...collect(ALBUMS[id], firsts),
      releases: ALBUM_ORDER.filter((r) => ALBUMS[r].partOf === id).map((r) => collect(ALBUMS[r], firsts)),
    }))
    .filter((era) => era.stamps.length > 0 || era.upcoming.length > 0)
}

/** The era an album's page is: its own, or the one a release joined. */
export function eraOf(eras: readonly Era[], album: AlbumId): Era | null {
  const id = ALBUMS[album]?.partOf ?? album
  return eras.find((era) => era.album.id === id) ?? null
}

/** The collection a song is stamped into: its album, or the release it came out in. */
export function collectionOf(eras: readonly Era[], song: Song): Collection | null {
  const era = eraOf(eras, song.album)
  if (!era) return null
  return era.album.id === song.album ? era : (era.releases.find((r) => r.album.id === song.album) ?? null)
}

/** What a plank did for the collection, for the finished screen. */
export interface StampNews {
  /** The song's album, or its release, after the plank. */
  collection: Collection
  /** A first stamp, or a first gold one. */
  stamp: 'new' | 'gold'
  /** This plank earned the badge (or the charm, for a release). */
  earned: boolean
  /** This plank made every stamp gold. */
  allGold: boolean
}

export function stampNews(before: readonly Completion[], after: readonly Completion[], song: Song): StampNews | null {
  const was = collectionOf(eraStamps(before), song)
  const now = collectionOf(eraStamps(after), song)
  if (!was || !now) return null
  const find = (c: Collection) => c.stamps.find((s) => s.song.id === song.id)
  const [then, fresh] = [find(was), find(now)]
  if (!fresh?.stampedOn) return null
  const stamp = !then?.stampedOn ? 'new' : !then.goldOn && fresh.goldOn ? 'gold' : null
  if (!stamp) return null
  return { collection: now, stamp, earned: !was.earnedOn && !!now.earnedOn, allGold: !was.goldOn && !!now.goldOn }
}

/** A badge or a charm won: the album (or release) and whether its edge is gold. */
export interface Won {
  album: Album
  gold: boolean
  /** A release's charm, rather than an album's badge. */
  charm: boolean
}

/** The badges and charms won, in release order: for the profile. */
export function wonBadges(eras: readonly Era[]): Won[] {
  return eras.flatMap((era) => [
    ...(era.earnedOn ? [{ album: era.album, gold: !!era.goldOn, charm: false }] : []),
    ...era.releases.filter((r) => r.earnedOn).map((r) => ({ album: r.album, gold: !!r.goldOn, charm: true })),
  ])
}
