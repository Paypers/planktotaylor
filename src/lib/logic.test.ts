import { describe, expect, it } from 'vitest'
import { LADDER, SONGS, formatDuration, slugify } from '../data/songs'
import { DAILY_EPOCH, dailyNumber, dailySong } from './daily'
import { addDays, daysBetween } from './dates'
import { applyPlank, emptyData, ladderRecords, ladderView, mergeCompletions, newerCursor, streakDays, type Completion } from './progress'
import { normalizeTitle, parseIsoDuration, pickVideo, videoSongName, type VideoCandidate } from './match'
import { pauseLabel, plankBar, plankHeadline, plankSegments, plankSummary } from './share'
import { runLengths, streakInfo } from './streaks'
import { plankXp, rankFor, totalXp } from './xp'

describe('catalog', () => {
  it('has unique ids and sane lengths', () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length)
    for (const song of SONGS) expect(song.seconds).toBeGreaterThan(60)
  })

  it('climbs from the shortest song to All Too Well (10 Minute Version)', () => {
    expect(LADDER[0].title).toBe("I Look in People's Windows")
    expect(LADDER.at(-1)!.title).toBe('All Too Well (10 Minute Version)')
    for (let i = 1; i < LADDER.length; i++) expect(LADDER[i].seconds).toBeGreaterThanOrEqual(LADDER[i - 1].seconds)
  })

  it('slugifies awkward titles', () => {
    expect(slugify('Wi$h Li$t')).toBe('wish-list')
    expect(slugify('...Ready for It?')).toBe('ready-for-it')
    expect(slugify('Forever & Always')).toBe('forever-and-always')
    expect(formatDuration(613)).toBe('10:13')
  })
})

describe('dates', () => {
  it('crosses month, year and DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })
})

describe('daily song', () => {
  it('is stable for a given date and numbered from launch', () => {
    expect(dailySong('2026-10-01').id).toBe(dailySong('2026-10-01').id)
    expect(dailyNumber(DAILY_EPOCH)).toBe(1)
  })

  it('deals every song once before any repeats', () => {
    const ids = Array.from({ length: SONGS.length }, (_, i) => dailySong(addDays(DAILY_EPOCH, i)).id)
    expect(new Set(ids).size).toBe(SONGS.length)
  })
})

describe('streaks', () => {
  const today = '2026-09-22'
  const set = (...days: string[]) => new Set(days)

  it('counts a streak that includes today', () => {
    expect(streakInfo(set('2026-09-20', '2026-09-21', today), today)).toMatchObject({ current: 3, doneToday: true, atRisk: false })
  })

  it("keeps yesterday's streak alive until today ends", () => {
    expect(streakInfo(set('2026-09-20', '2026-09-21'), today)).toMatchObject({ current: 2, doneToday: false, atRisk: true })
  })

  it('resets after a missed day but remembers the best run', () => {
    const info = streakInfo(set('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-20'), today)
    expect(info.current).toBe(0)
    expect(info.best).toBe(4)
  })

  it('reports run lengths for the calendar', () => {
    const runs = runLengths(set('2026-09-01', '2026-09-02', '2026-09-05'))
    expect(runs.get('2026-09-01')).toBe(2)
    expect(runs.get('2026-09-05')).toBe(1)
  })
})

describe('recording planks', () => {
  const today = '2026-09-22'
  const at = '2026-09-22T12:00:00.000Z'

  it('climbs as many ladder levels in a day as you like', () => {
    const first = applyPlank(emptyData(), LADDER[0], today, at)
    expect(first.data.ladder.level).toBe(2)
    const second = applyPlank(first.data, LADDER[1], today, '2026-09-22T12:05:00.000Z')
    expect(second.added.find((c) => c.mode === 'ladder')?.level).toBe(2)
    expect(second.data.ladder.level).toBe(3)
    expect(ladderView(second.data, today).climbedToday.map((c) => c.level)).toEqual([1, 2])
  })

  it("keeps the streak for today's song only", () => {
    const daily = dailySong(today)
    const ladderOnly = LADDER.find((s) => s.id !== daily.id)!
    const level = LADDER.indexOf(ladderOnly) + 1
    const climbed = applyPlank({ ...emptyData(), ladder: { level, updatedAt: at } }, ladderOnly, today, at)
    expect(climbed.added.map((c) => c.mode)).toEqual(['ladder'])
    expect(streakDays(climbed.data.completions).has(today)).toBe(false)
    const both = applyPlank(climbed.data, daily, today, at)
    expect(streakDays(both.data.completions).has(today)).toBe(true)
  })

  it("counts twice when today's song is also the ladder level, but pays XP once", () => {
    const daily = dailySong(today)
    const level = LADDER.findIndex((s) => s.id === daily.id) + 1
    const data = { ...emptyData(), ladder: { level, updatedAt: at } }
    const { added } = applyPlank(data, daily, today, at, [], true)
    expect(added.map((c) => c.mode).sort()).toEqual(['daily', 'ladder'])
    expect(totalXp(added)).toBe(plankXp(daily.seconds, []).total)
  })

  it('only earns XP when signed in', () => {
    expect(totalXp(applyPlank(emptyData(), LADDER[0], today, at).added)).toBe(0)
    expect(totalXp(applyPlank(emptyData(), LADDER[0], today, at, [], true).added)).toBeGreaterThan(0)
  })
})

describe('replays and XP', () => {
  const today = '2026-09-22'
  const tomorrow = '2026-09-23'
  const t = (n: number) => `2026-09-22T12:0${n}:00.000Z`
  const breaks = [{ at: 60, ms: 9_000 }]
  const daily = dailySong(today)
  const clean = plankXp(daily.seconds, [])
  const held = plankXp(daily.seconds, breaks)

  it("earns nothing for today's song again after a clean go", () => {
    const first = applyPlank(emptyData(), daily, today, t(0), [], true)
    const again = applyPlank(first.data, daily, today, t(1), [], true)
    expect(again).toMatchObject({ kind: 'repeat', gained: 0, bonusLeft: false })
    expect(totalXp(again.data.completions)).toBe(clean.total)
  })

  it('earns nothing for another go with breaks, but says the bonus is still there', () => {
    const first = applyPlank(emptyData(), daily, today, t(0), breaks, true)
    expect(first).toMatchObject({ gained: held.total, bonusLeft: true })
    const again = applyPlank(first.data, daily, today, t(1), breaks, true)
    expect(again).toMatchObject({ kind: 'repeat', gained: 0, bonusLeft: true })
  })

  it('pays the no-break bonus once, for the first go held straight through', () => {
    const first = applyPlank(emptyData(), daily, today, t(0), breaks, true)
    const straight = applyPlank(first.data, daily, today, t(1), [], true)
    expect(straight).toMatchObject({ kind: 'upgrade', gained: clean.total - held.total })
    expect(totalXp(straight.data.completions)).toBe(clean.total)
    // Today's record is now the clean plank.
    expect(straight.data.completions.find((c) => c.mode === 'daily')?.pauses).toBeUndefined()
    const third = applyPlank(straight.data, daily, today, t(2), [], true)
    expect(third).toMatchObject({ kind: 'repeat', gained: 0 })
  })

  it("pays a two-for-one's bonus once, not once per record", () => {
    const level = LADDER.findIndex((s) => s.id === daily.id) + 1
    const first = applyPlank({ ...emptyData(), ladder: { level, updatedAt: t(0) } }, daily, today, t(0), breaks, true)
    const back = { ...first.data, ladder: { level, updatedAt: t(1) } }
    const straight = applyPlank(back, daily, today, t(2), [], true)
    expect(straight.gained).toBe(clean.total - held.total)
    expect(totalXp(straight.data.completions)).toBe(clean.total)
    expect(straight.updated.every((c) => c.pauses === undefined)).toBe(true)
  })

  it('pays a ladder level once, however many days you come back to it', () => {
    const song = LADDER[0]
    const first = applyPlank(emptyData(), song, today, t(0), [], true)
    // Tomorrow: move back down to level 1 and plank it again.
    const redo = applyPlank({ ...first.data, ladder: { level: 1, updatedAt: t(1) } }, song, tomorrow, '2026-09-23T12:00:00.000Z', [], true)
    expect(redo).toMatchObject({ kind: 'new', gained: 0, bonusLeft: false })
    expect(redo.data.ladder.level).toBe(2)
  })

  it('pays only the no-break bonus when a ladder level with breaks is redone straight through', () => {
    const song = LADDER[0]
    const first = applyPlank(emptyData(), song, today, t(0), breaks, true)
    const back = { ...first.data, ladder: { level: 1, updatedAt: t(1) } }
    const heldAgain = applyPlank(back, song, tomorrow, '2026-09-23T12:00:00.000Z', breaks, true)
    expect(heldAgain).toMatchObject({ gained: 0, bonusLeft: true })
    const straight = applyPlank(back, song, tomorrow, '2026-09-23T12:00:00.000Z', [], true)
    expect(straight.gained).toBe(plankXp(song.seconds, []).bonus)
  })

  it('lets you practise a level you climbed with breaks for its bonus, without moving your ladder', () => {
    const song = LADDER[0]
    const climbed = applyPlank(emptyData(), song, today, t(0), breaks, true)
    expect(climbed.data.ladder.level).toBe(2)
    // Tomorrow, from the setlist: plank level 1 again. It's not tomorrow's song, and not your next level.
    const later = '2026-09-23T12:00:00.000Z'
    expect(dailySong(tomorrow).id).not.toBe(song.id)
    const practice = applyPlank(climbed.data, song, tomorrow, later, [], true)
    expect(practice).toMatchObject({ kind: 'upgrade', gained: plankXp(song.seconds, []).bonus, added: [] })
    expect(practice.data.ladder.level).toBe(2)
    // The level's own record is now the clean one, still dated the day it was climbed.
    expect(ladderRecords(practice.data.completions).get(song.id)).toEqual({ clean: true, breaks: 0 })
    expect(practice.updated[0].day).toBe(today)
    expect(applyPlank(practice.data, song, tomorrow, later, [], true)).toMatchObject({ kind: 'repeat', gained: 0, bonusLeft: false })
  })

  it('never pays a replay when signed out', () => {
    const first = applyPlank(emptyData(), daily, today, t(0), breaks, false)
    expect(applyPlank(first.data, daily, today, t(1), [], false).gained).toBe(0)
  })

  it('keeps the improved plank when syncing', () => {
    const first = applyPlank(emptyData(), daily, today, t(0), breaks, true)
    const straight = applyPlank(first.data, daily, today, t(1), [], true)
    const [merged] = mergeCompletions(first.data.completions, straight.data.completions)
    expect(merged).toMatchObject({ xp: clean.total })
    expect(merged.pauses).toBeUndefined()
  })
})

describe('setlist marks', () => {
  it('shows each ladder song at its best: no breaks beats breaks, fewer breaks beat more', () => {
    const c = (songId: string, pauses: number, mode: 'daily' | 'ladder' = 'ladder'): Completion => ({
      day: '2026-09-22',
      mode,
      songId,
      seconds: 100,
      at: `2026-09-22T12:0${pauses}:00.000Z`,
      ...(pauses ? { pauses: Array.from({ length: pauses }, (_, i) => ({ at: i * 10, ms: 2000 })) } : {}),
    })
    const records = ladderRecords([c('a', 3), c('a', 1), c('b', 2), c('b', 0), c('d', 0, 'daily')])
    expect(records.get('a')).toEqual({ clean: false, breaks: 1 })
    expect(records.get('b')).toEqual({ clean: true, breaks: 0 })
    // Today's song doesn't mark the ladder.
    expect(records.has('d')).toBe(false)
  })
})

describe('xp', () => {
  it('gives a point a second, and never takes any away for breaks', () => {
    expect(plankXp(212, [{ at: 60, ms: 9_000 }])).toEqual({ base: 212, bonus: 0, total: 212, kind: 'held' })
  })

  it('adds half again for no breaks, and doubles it on songs over 6 minutes', () => {
    expect(plankXp(212, [])).toEqual({ base: 212, bonus: 106, total: 318, kind: 'clean' })
    // All Too Well (10 Minute Version) straight through.
    expect(plankXp(613, [])).toEqual({ base: 613, bonus: 613, total: 1226, kind: 'marathon' })
    expect(plankXp(613, [{ at: 300, ms: 5_000 }]).kind).toBe('held')
  })

  it('spaces ranks further apart as you go', () => {
    expect(rankFor(0)).toMatchObject({ rank: 1, floor: 0, next: 500 })
    expect(rankFor(499).rank).toBe(1)
    expect(rankFor(500)).toMatchObject({ rank: 2, floor: 500, next: 1500 })
    expect(rankFor(22_500).rank).toBe(10)
  })
})

describe('pauses', () => {
  it('saves the breaks with the plank, and nothing extra for a clean one', () => {
    const at = '2026-09-22T12:00:00.000Z'
    const clean = applyPlank(emptyData(), LADDER[0], '2026-09-22', at)
    expect(clean.added.every((c) => c.pauses === undefined)).toBe(true)
    const paused = applyPlank(emptyData(), LADDER[0], '2026-09-22', at, [{ at: 60, ms: 10_000 }])
    expect(paused.added[0].pauses).toEqual([{ at: 60, ms: 10_000 }])
  })

  it('shares ten green squares for a clean plank', () => {
    expect(plankBar([], 174)).toBe('🟩'.repeat(10))
    expect(plankSummary([], 174)).toBe('2:54 plank, no breaks')
  })

  it('drops an orange square in where each pause happened', () => {
    // 60s into a 174s song is in the 4th tenth; 170s is in the last.
    const pauses = [
      { at: 60, ms: 10_000 },
      { at: 170, ms: 4_000 },
    ]
    expect(plankBar(pauses, 174)).toBe('🟩🟩🟩🟩🟧🟩🟩🟩🟩🟩🟩🟧')
    expect(plankSummary(pauses, 174)).toBe('2:54 plank · 2 pauses, 0:14 · 3:08 total')
  })

  it('draws the bar in order, with breaks between the stretches held', () => {
    const segments = plankSegments([{ at: 60, ms: 10_000 }], 174)
    expect(segments).toEqual([
      { kind: 'hold', ms: 60_000 },
      { kind: 'pause', ms: 10_000 },
      { kind: 'hold', ms: 114_000 },
    ])
    expect(plankSegments([], 174)).toEqual([{ kind: 'hold', ms: 174_000 }])
    expect(pauseLabel(9_400)).toBe('9s')
    expect(pauseLabel(65_000)).toBe('1:05')
  })

  it('heads the card with what the plank counted for', () => {
    expect(plankHeadline(true, 12)).toBe('Two for one.')
    expect(plankHeadline(false, 12)).toBe('Level 12 done.')
    expect(plankHeadline(true)).toBe("Today's song, done.")
    expect(plankHeadline(false)).toBe('Extra credit.')
  })
})

describe('sync merge', () => {
  const c = (day: string, mode: 'daily' | 'ladder', at: string): Completion => ({ day, mode, songId: 'x', seconds: 1, at })

  it('unions histories and keeps the earliest plank per day and mode', () => {
    const merged = mergeCompletions(
      [c('2026-09-01', 'daily', '2026-09-01T10:00:00.000Z'), c('2026-09-02', 'ladder', '2026-09-02T10:00:00.000Z')],
      [c('2026-09-01', 'daily', '2026-09-01T08:00:00.000Z'), c('2026-09-03', 'daily', '2026-09-03T10:00:00.000Z')],
    )
    expect(merged.map((m) => `${m.day}|${m.mode}`)).toEqual(['2026-09-01|daily', '2026-09-02|ladder', '2026-09-03|daily'])
    expect(merged[0].at).toBe('2026-09-01T08:00:00.000Z')
  })

  it("keeps XP the account has that this browser's copy doesn't", () => {
    const local = c('2026-09-22', 'daily', '2026-09-22T12:00:00.000Z')
    const [merged] = mergeCompletions([local], [{ ...local, xp: 212 }])
    expect(merged.xp).toBe(212)
  })

  it('takes the most recently changed ladder level', () => {
    const older = { level: 9, updatedAt: '2026-09-01T00:00:00.000Z' }
    const newer = { level: 4, updatedAt: '2026-09-02T00:00:00.000Z' }
    expect(newerCursor(older, newer)).toBe(newer)
  })
})

describe('youtube matching', () => {
  const v = (id: string, title: string, seconds: number, channel = 'Taylor Swift - Topic'): VideoCandidate => ({ id, title, seconds, channel })

  it('reduces upload titles to the song name', () => {
    expect(videoSongName('Taylor Swift - Anti-Hero (Official Music Video)')).toBe('anti hero')
    expect(videoSongName("Mr. Perfectly Fine (Taylor’s Version) (From The Vault)")).toBe(normalizeTitle('Mr. Perfectly Fine'))
    expect(videoSongName('Taylor Swift - End Game ft. Ed Sheeran, Future')).toBe('end game')
    expect(videoSongName('Taylor Swift - Elizabeth Taylor (Official Audio)')).toBe('elizabeth taylor')
    expect(videoSongName('Snow On The Beach (feat. Lana Del Rey)')).toBe('snow on the beach')
  })

  it('parses API durations', () => {
    expect(parseIsoDuration('PT3M51S')).toBe(231)
    expect(parseIsoDuration('PT10M13S')).toBe(613)
    expect(parseIsoDuration('PT4M')).toBe(240)
  })

  it("prefers the Taylor's Version recording from the Topic channel", () => {
    const pool = [
      v('mv', 'Taylor Swift - Love Story', 236, 'TaylorSwiftVEVO'),
      v('orig', 'Love Story', 235),
      v('tv', "Love Story (Taylor's Version)", 235),
    ]
    expect(pickVideo(pool, { title: 'Love Story', seconds: 235, taylorsVersion: true })?.id).toBe('tv')
  })

  it('only takes album tracks, never music videos or lyric videos', () => {
    const pool = [
      v('lyric', "Taylor Swift - Love Story (Taylor's Version) (Lyric Video)", 240, 'Taylor Swift'),
      v('mv', "Taylor Swift - Love Story (Taylor's Version)", 236, 'TaylorSwiftVEVO'),
    ]
    expect(pickVideo(pool, { title: 'Love Story', seconds: 235, taylorsVersion: true })).toBeNull()
  })

  it('never uses the original recording of a re-recorded song', () => {
    const pool = [v('orig', 'Hey Stephen', 254), v('mv', 'Taylor Swift - Hey Stephen', 254, 'Taylor Swift')]
    expect(pickVideo(pool, { title: 'Hey Stephen', seconds: 254, taylorsVersion: true })).toBeNull()
  })

  it('rejects live takes, remixes, fan uploads and the wrong All Too Well', () => {
    const pool = [
      v('live', 'Cruel Summer (Live From The Eras Tour)', 190),
      v('remix', 'Cruel Summer (LP Giobbi Remix)', 185),
      v('fan', 'Taylor Swift - Cruel Summer (Official Audio)', 178, 'swiftie4ever'),
      v('lookalike', 'Cruel Summer', 178, 'Taylor Swift Lyrics'),
      v('atw10', "All Too Well (10 Minute Version) (Taylor's Version) (From The Vault)", 613),
    ]
    expect(pickVideo(pool, { title: 'Cruel Summer', seconds: 178, taylorsVersion: false })).toBeNull()
    expect(pickVideo(pool, { title: 'All Too Well', seconds: 329, taylorsVersion: true })).toBeNull()
    expect(pickVideo(pool, { title: 'All Too Well (10 Minute Version)', seconds: 613, taylorsVersion: true })?.id).toBe('atw10')
  })
})
