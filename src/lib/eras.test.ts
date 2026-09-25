import { describe, expect, it } from 'vitest'
import { ALBUMS, SONGS, UPCOMING, type Song } from '../data/songs'
import { earnedOn, eraOf, eraStamps, collectionOf, stampNews, wonBadges } from './eras'
import { applyPlank, emptyData, type Completion } from './progress'

const albumSongs = (album: Song['album']) => SONGS.filter((s) => s.album === album)
const plank = (song: Song, day: string, fields: Partial<Completion> = {}): Completion => ({
  day,
  mode: 'ladder',
  songId: song.id,
  seconds: song.seconds,
  at: `${day}T10:00:00.000Z`,
  ...fields,
})
const breaks = [{ at: 30, ms: 4000 }]

describe('stamps', () => {
  it('stamps every song planked, and golds the ones held with no breaks', () => {
    const [first, second, third] = albumSongs('red')
    const eras = eraStamps([
      plank(first, '2026-10-01', { pauses: breaks }),
      plank(first, '2026-10-03', { mode: 'daily' }),
      plank(second, '2026-10-02', { pauses: breaks }),
    ])
    const red = eras.find((e) => e.album.id === 'red')!
    const stampOf = (song: Song) => red.stamps.find((s) => s.song.id === song.id)!
    expect(stampOf(first)).toMatchObject({ stampedOn: '2026-10-01', goldOn: '2026-10-03' })
    expect(stampOf(second)).toMatchObject({ stampedOn: '2026-10-02', goldOn: null })
    expect(stampOf(third)).toMatchObject({ stampedOn: null, goldOn: null })
    expect(red).toMatchObject({ stamped: 2, gold: 1, earnedOn: null, goldOn: null })
  })

  it('earns an album\'s badge the day its last song is stamped, and its gold edge when every stamp is gold', () => {
    const debut = albumSongs('debut')
    const planks = debut.map((song, i) => plank(song, `2026-10-${String(i + 1).padStart(2, '0')}`, i === 3 ? { pauses: breaks } : {}))
    let era = eraStamps(planks).find((e) => e.album.id === 'debut')!
    expect(era).toMatchObject({ stamped: debut.length, earnedOn: `2026-10-${debut.length}`, goldOn: null, newToStamp: 0 })
    era = eraStamps([...planks, plank(debut[3], '2026-11-02', { mode: 'daily' })]).find((e) => e.album.id === 'debut')!
    expect(era.goldOn).toBe('2026-11-02')
  })

  it('counts only songs on the site: ones not out yet are listed with their premiere day', () => {
    const showgirl = eraStamps([]).find((e) => e.album.id === 'showgirl')!
    expect(showgirl.stamps).toHaveLength(albumSongs('showgirl').length)
    // The Encore joined The Life of a Showgirl: it's on its era, as a release of its own.
    expect(showgirl.releases.map((r) => r.album.id)).toEqual(['encore'])
    expect(eraStamps([]).some((e) => e.album.id === 'encore')).toBe(false)
    const encore = showgirl.releases[0]
    const notOut = UPCOMING.filter((s) => s.album === 'encore')
    expect(encore.stamps).toHaveLength(albumSongs('encore').length)
    expect(encore.upcoming.map((u) => u.song.id)).toEqual(notOut.map((s) => s.id))
    if (notOut.some((s) => s.id === 'patient-zero')) expect(encore.upcoming[0].premiere).toBe('2026-09-25')
    // Nothing out, so no charm to earn yet.
    expect(encore.earnedOn).toBeNull()
  })

  it('ignores planks of songs that are gone from the site', () => {
    const era = eraStamps([{ ...plank(albumSongs('red')[0], '2026-10-01'), songId: 'no-such-song' }]).find((e) => e.album.id === 'red')!
    expect(era.stamped).toBe(0)
  })

  it('finds the page for an album or a release', () => {
    const eras = eraStamps([])
    expect(eraOf(eras, 'encore')?.album.id).toBe('showgirl')
    expect(eraOf(eras, 'red')?.album.id).toBe('red')
    expect(collectionOf(eras, albumSongs('red')[0])?.album.id).toBe('red')
  })
})

describe('badges stay when new songs come out', () => {
  // Launch songs a and b; a release of c and d starting 10 October (d premieres on the 11th); and a later
  // release, e, on 1 November.
  const releases = new Map([
    ['c', '2026-10-10'],
    ['d', '2026-10-10'],
    ['e', '2026-11-01'],
  ])
  const on = (id: string, day: string | null) => ({ id, on: day, stampedOn: day })

  it('earned before a release began: kept, with its songs still to stamp', () => {
    expect(earnedOn([on('a', '2026-10-01'), on('b', '2026-10-05'), on('c', null), on('d', null)], releases)).toBe('2026-10-05')
  })

  it('a release counts as a whole from its first day, even songs not out yet', () => {
    // c stamped on the day it premiered, d the next day: not until then.
    const songs = [on('a', '2026-10-01'), on('b', '2026-10-10'), on('c', '2026-10-10'), on('d', null)]
    expect(earnedOn(songs, releases)).toBeNull()
    expect(earnedOn([...songs.slice(0, 3), on('d', '2026-10-11')], releases)).toBe('2026-10-11')
  })

  it('a later release never takes a badge away', () => {
    const songs = [on('a', '2026-10-01'), on('b', '2026-10-10'), on('c', '2026-10-10'), on('d', '2026-10-11'), on('e', null)]
    expect(earnedOn(songs, releases)).toBe('2026-10-11')
  })

  it('a release counts as a whole from the day one of its songs was stamped, even before its first day', () => {
    // c out and stamped early, on the 8th: d, from the same release, counts from then too.
    expect(earnedOn([on('c', '2026-10-08'), on('d', null)], releases)).toBeNull()
    expect(earnedOn([on('c', '2026-10-08'), on('d', '2026-10-11')], releases)).toBe('2026-10-11')
  })

  it('gold counts a release from its first stamp, not its first gold one', () => {
    const gold = [
      { id: 'c', on: '2026-10-08', stampedOn: '2026-10-08' },
      { id: 'd', on: null, stampedOn: '2026-10-09' },
    ]
    expect(earnedOn(gold, releases)).toBeNull()
  })

  it('nothing stamped, nothing earned', () => {
    expect(earnedOn([], releases)).toBeNull()
    expect(earnedOn([on('a', null)], releases)).toBeNull()
  })
})

describe('what a plank did for the collection', () => {
  const red = albumSongs('red')

  it('a first stamp, a gold one, or nothing new', () => {
    const before = [plank(red[0], '2026-10-01', { pauses: breaks })]
    expect(stampNews([], before, red[0])).toMatchObject({ stamp: 'new', earned: false, collection: { stamped: 1 } })
    expect(stampNews(before, [...before, plank(red[0], '2026-10-02', { mode: 'daily' })], red[0])).toMatchObject({ stamp: 'gold' })
    expect(stampNews(before, [...before, plank(red[0], '2026-10-02', { mode: 'daily', pauses: breaks })], red[0])).toBeNull()
  })

  it('the plank that finishes an album earns its badge, and one that golds the last stamp its gold edge', () => {
    const all = red.slice(1).map((s) => plank(s, '2026-10-01'))
    const last = plank(red[0], '2026-10-02', { pauses: breaks })
    expect(stampNews(all, [...all, last], red[0])).toMatchObject({ stamp: 'new', earned: true, allGold: false })
    expect(stampNews([...all, last], [...all, last, plank(red[0], '2026-10-03', { mode: 'daily' })], red[0])).toMatchObject({
      stamp: 'gold',
      earned: false,
      allGold: true,
    })
  })

  it('lists the badges won for the profile', () => {
    const planks = albumSongs('debut').map((s) => plank(s, '2026-10-01'))
    expect(wonBadges(eraStamps(planks))).toEqual([{ album: ALBUMS.debut, gold: true, charm: false }])
  })
})

describe('new releases from their album page', () => {
  // A new release that's out, and not today's song on 10 October.
  const patientZero: Song = { id: 'patient-zero', title: 'Patient Zero', album: 'encore', track: 1, seconds: 200 }
  const today = '2026-10-10'
  const at = (time: string) => `${today}T${time}:00.000Z`

  it('the first go stamps it: an era record, with no XP, that leaves the streak and the ladder alone', () => {
    const data = emptyData()
    const result = applyPlank(data, patientZero, today, at('10:00'), breaks, true, 2)
    expect(result.kind).toBe('new')
    expect(result.gained).toBe(0)
    expect(result.added).toEqual([{ day: today, mode: 'era', songId: 'patient-zero', seconds: 200, at: at('10:00'), pauses: breaks, lights: 2 }])
    expect(result.data.ladder).toBe(data.ladder)
  })

  it('again with breaks: nothing new', () => {
    const first = applyPlank(emptyData(), patientZero, today, at('10:00'), breaks).data
    expect(applyPlank(first, patientZero, today, at('11:00'), breaks).kind).toBe('repeat')
  })

  it('with no breaks the same day: that day\'s record becomes the gold one', () => {
    const first = applyPlank(emptyData(), patientZero, today, at('10:00'), breaks).data
    const gold = applyPlank(first, patientZero, today, at('11:00'), [])
    expect(gold.kind).toBe('upgrade')
    expect(gold.data.completions).toEqual([{ day: today, mode: 'era', songId: 'patient-zero', seconds: 200, at: at('11:00') }])
    expect(gold.updated).toEqual(gold.data.completions)
  })

  it('with no breaks another day: a gold record of its own, and after that nothing new', () => {
    const first = applyPlank(emptyData(), patientZero, '2026-10-09', '2026-10-09T10:00:00.000Z', breaks).data
    const gold = applyPlank(first, patientZero, today, at('11:00'), [])
    expect(gold.kind).toBe('new')
    expect(gold.data.completions.map((c) => [c.day, c.pauses?.length ?? 0])).toEqual([
      ['2026-10-09', 1],
      [today, 0],
    ])
    expect(applyPlank(gold.data, patientZero, today, at('12:00'), []).kind).toBe('repeat')
  })

  it('never for a song from the albums the site launched with', () => {
    const style = SONGS.find((s) => s.title === 'Style')!
    const done = { ...emptyData(), completions: [plank(style, '2026-10-01', { pauses: breaks })] }
    const result = applyPlank(done, style, today, at('10:00'), [])
    expect(result.added).toEqual([])
    expect(result.data.completions.every((c) => c.mode !== 'era')).toBe(true)
  })
})
