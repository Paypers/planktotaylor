import { describe, expect, it } from 'vitest'
import type { Attempt } from './attempts'
import type { Completion, Pause } from './progress'
import { plankSegments, plankSummary, timelineParts } from './share'
import { attemptBreaks, partAt, plankTimeline } from './timeline'

const SONG = 225 // 3:45

const attempt = (fields: Partial<Attempt> = {}): Attempt => ({
  id: 'a',
  songId: 'style',
  kind: 'daily',
  startedAt: '2026-09-20T09:00:00.000Z',
  endedAt: '2026-09-20T09:04:00.000Z',
  reached: SONG,
  pauses: 0,
  outcome: 'finished',
  ...fields,
})

const record = (fields: Partial<Completion> = {}): Completion => ({
  day: '2026-09-20',
  mode: 'daily',
  songId: 'style',
  seconds: SONG,
  at: '2026-09-20T09:04:00.000Z',
  ...fields,
})

describe('the parts of a plank', () => {
  it('is one stretch held for a clean plank', () => {
    expect(timelineParts([], SONG)).toEqual([{ kind: 'hold', from: 0, to: SONG, ms: SONG * 1000 }])
  })

  it('puts each break between the stretches held, in order, without using up song', () => {
    const pauses: Pause[] = [
      { at: 150, ms: 4_000 },
      { at: 72, ms: 9_000 },
    ]
    expect(timelineParts(pauses, SONG)).toEqual([
      { kind: 'hold', from: 0, to: 72, ms: 72_000 },
      { kind: 'pause', from: 72, to: 72, ms: 9_000 },
      { kind: 'hold', from: 72, to: 150, ms: 78_000 },
      { kind: 'pause', from: 150, to: 150, ms: 4_000 },
      { kind: 'hold', from: 150, to: SONG, ms: 75_000 },
    ])
  })

  it('starts with the break when it came before any song, and ends with one at the very end', () => {
    expect(timelineParts([{ at: 0, ms: 3_000 }], SONG).map((p) => p.kind)).toEqual(['pause', 'hold'])
    expect(timelineParts([{ at: SONG, ms: 3_000 }], SONG).map((p) => p.kind)).toEqual(['hold', 'pause'])
  })

  it('leaves the rest of the song after where it got', () => {
    expect(timelineParts([], SONG, 72)).toEqual([
      { kind: 'hold', from: 0, to: 72, ms: 72_000 },
      { kind: 'rest', from: 72, to: SONG, ms: 153_000 },
    ])
    expect(timelineParts([], SONG, 0)).toEqual([{ kind: 'rest', from: 0, to: SONG, ms: SONG * 1000 }])
  })

  it('keeps a break still open when it ended where it got, and pulls one past that back to it', () => {
    const givenUp = timelineParts([{ at: 72, ms: 20_000 }], SONG, 72)
    expect(givenUp.map((p) => p.kind)).toEqual(['hold', 'pause', 'rest'])
    expect(timelineParts([{ at: 80, ms: 5_000 }], SONG, 72)[1]).toEqual({ kind: 'pause', from: 72, to: 72, ms: 5_000 })
  })

  it('never runs past the song', () => {
    expect(timelineParts([], SONG, SONG + 3)).toEqual([{ kind: 'hold', from: 0, to: SONG, ms: SONG * 1000 }])
  })

  it('still gives the share card and the receipt the same segments', () => {
    expect(plankSegments([{ at: 0, ms: 3_000 }], 174)).toEqual([
      { kind: 'pause', ms: 3_000 },
      { kind: 'hold', ms: 174_000 },
    ])
    expect(plankSegments([{ at: 200, ms: 3_000 }], 174)).toEqual([
      { kind: 'hold', ms: 174_000 },
      { kind: 'pause', ms: 3_000 },
    ])
  })
})

describe("an attempt's breaks", () => {
  const breaks: Pause[] = [{ at: 72, ms: 9_000 }]

  it('are none with no pauses, and the saved ones when there are', () => {
    expect(attemptBreaks(attempt(), [])).toEqual([])
    expect(attemptBreaks(attempt({ pauses: 1, breaks, outcome: 'gave-up', reached: 90 }), [])).toBe(breaks)
  })

  it("come from the plank's record when the attempt was saved before breaks were timed", () => {
    // Finished a few seconds apart: the attempt is logged just after the record.
    const late = attempt({ pauses: 1, endedAt: '2026-09-20T09:04:03.000Z' })
    expect(attemptBreaks(late, [record({ pauses: breaks })])).toBe(breaks)
  })

  it("aren't known otherwise", () => {
    const old = attempt({ pauses: 1 })
    // A later go with no breaks wiped the record's.
    expect(attemptBreaks(old, [record()])).toBeNull()
    expect(attemptBreaks(old, [record({ pauses: breaks, songId: 'love-story' })])).toBeNull()
    expect(attemptBreaks(old, [record({ pauses: breaks, at: '2026-09-20T09:05:00.000Z' })])).toBeNull()
    expect(attemptBreaks(attempt({ pauses: 1, outcome: 'gave-up', reached: 90 }), [record({ pauses: breaks })])).toBeNull()
  })
})

describe('the words for a plank', () => {
  it('says a clean plank was held the whole way', () => {
    const { parts, summary } = plankTimeline({ seconds: SONG, breaks: [] })
    expect(parts).toMatchObject([{ kind: 'hold', title: 'Held 3:45', detail: 'The whole song, no breaks' }])
    expect(parts[0].label).toBe('Held 3:45. The whole song, no breaks')
    expect(summary).toBe(plankSummary([], SONG))
  })

  it('says how long each stretch and break was, and where', () => {
    const breaks: Pause[] = [
      { at: 0.3, ms: 2_000 },
      { at: 72, ms: 65_000 },
    ]
    const { parts, summary } = plankTimeline({ seconds: SONG, breaks })
    expect(parts.map(({ title, detail }) => [title, detail])).toEqual([
      ['Paused 2s', 'At the start'],
      ['Held 1:12', '0:00 – 1:12'],
      ['Paused 1:05', 'At 1:12'],
      ['Held 2:33', '1:12 – 3:45'],
    ])
    expect(parts[1].label).toBe('Held 1:12. From 0:00 to 1:12')
    expect(parts[2].label).toBe('Paused 1:05. At 1:12')
    expect(summary).toBe(plankSummary(breaks, SONG))
  })

  it('says how much was left when it stopped short', () => {
    const clean = plankTimeline({ seconds: SONG, reached: 72.4, breaks: [] })
    expect(clean.parts.map(({ title, detail }) => [title, detail])).toEqual([
      ['Held 1:12', '0:00 – 1:12'],
      ['2:33 to go', 'Ended at 1:12'],
    ])
    expect(clean.summary).toBe('Reached 1:12 of 3:45, no breaks')
    const paused = plankTimeline({ seconds: SONG, reached: 72, breaks: [{ at: 72, ms: 14_000 }] })
    expect(paused.parts.map((p) => p.title)).toEqual(['Held 1:12', 'Paused 14s', '2:33 to go'])
    expect(paused.summary).toBe('Reached 1:12 of 3:45 · 1 pause, 0:14')
  })

  it("says how many breaks there were when they weren't timed", () => {
    const finished = plankTimeline({ seconds: SONG, breaks: null, breakCount: 3 })
    expect(finished.parts).toMatchObject([{ kind: 'hold', title: 'Held 3:45', detail: '3 breaks, not timed' }])
    expect(finished.summary).toBe('3:45 plank · 3 breaks, not timed')
    const short = plankTimeline({ seconds: SONG, reached: 72, breaks: null, breakCount: 1 })
    expect(short.parts.map(({ title, detail }) => [title, detail])).toEqual([
      ['Held 1:12', '1 break, not timed'],
      ['2:33 to go', 'Ended at 1:12'],
    ])
    expect(short.summary).toBe('Reached 1:12 of 3:45 · 1 break, not timed')
  })
})

describe('which part a pointer means', () => {
  // Edges in px, as the bar lays them out: a wide stretch, a 6px break, a 5px stretch, a 6px break, a wide stretch.
  const bar = [
    { left: 0, right: 100 },
    { left: 102, right: 108 },
    { left: 110, right: 115 },
    { left: 117, right: 123 },
    { left: 125, right: 300 },
  ]

  it('picks the part under the pointer', () => {
    expect(partAt(50, bar)).toBe(0)
    expect(partAt(200, bar)).toBe(4)
  })

  it('lets a thin break be tapped from just beside it', () => {
    expect(partAt(97, bar)).toBe(1)
    expect(partAt(128, bar)).toBe(3)
  })

  it('keeps a thin stretch between two breaks reachable', () => {
    expect(partAt(112.5, bar)).toBe(2)
    expect(partAt(111, bar)).toBe(2)
    expect(partAt(104, bar)).toBe(1)
  })

  it('picks the nearest part across a gap, and nothing with no parts', () => {
    expect(partAt(101, [{ left: 0, right: 100 }, { left: 102, right: 300 }])).toBe(0)
    expect(partAt(10, [])).toBeNull()
  })
})
