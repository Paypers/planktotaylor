import { describe, expect, it } from 'vitest'
import { DRIFT_SECONDS, SEEK_GAP_MS, SEEK_SETTLE_MS, countdownLeft, roomMs, roomStep, shouldSeek, videoPauseIsMine } from './follow'
import type { LiveState } from './link'

const room = (fields: Partial<LiveState>): LiveState => ({ phase: 'running', at: 0, since: 0, stretchEnds: null, countdownEnds: null, pauses: [], round: 1, ...fields })

describe("the timer on the room's clock", () => {
  it('reads the room in ms, within the song', () => {
    expect(roomMs(12.3456, 200_000)).toBeCloseTo(12_345.6)
    expect(roomMs(-0.2, 200_000)).toBe(0)
    expect(roomMs(201.5, 200_000)).toBe(200_000)
  })

  it('counts 3, 2, 1 down to when the room carries on', () => {
    expect(countdownLeft(10_000, 7_000)).toBe(3)
    expect(countdownLeft(10_000, 7_001)).toBe(3)
    expect(countdownLeft(10_000, 8_000)).toBe(2)
    expect(countdownLeft(10_000, 9_500)).toBe(1)
    expect(countdownLeft(10_000, 10_000)).toBe(0)
    expect(countdownLeft(10_000, 12_000)).toBe(0)
    // Opened a moment into it: it picks up where everyone else is.
    expect(countdownLeft(10_000, 8_400)).toBe(2)
    // A countdown heard of early (a slow connection) still starts at 3.
    expect(countdownLeft(10_000, 5_000)).toBe(3)
    expect(countdownLeft(null, 5_000)).toBe(0)
  })
})

describe('the song following the room', () => {
  it('moves only when it has drifted well out', () => {
    expect(shouldSeek(60, 60 + DRIFT_SECONDS - 0.1, 10_000, -Infinity)).toBe(false)
    expect(shouldSeek(60, 60 - DRIFT_SECONDS + 0.1, 10_000, -Infinity)).toBe(false)
    expect(shouldSeek(60, 60 + DRIFT_SECONDS + 0.1, 10_000, -Infinity)).toBe(true)
    expect(shouldSeek(90, 60, 10_000, -Infinity)).toBe(true)
  })

  it('moves at most once every few seconds', () => {
    expect(shouldSeek(0, 60, 10_000, 10_000 - SEEK_GAP_MS + 1)).toBe(false)
    expect(shouldSeek(0, 60, 10_000, 10_000 - SEEK_GAP_MS)).toBe(true)
  })

  it("leaves a player that isn't ready yet", () => {
    expect(shouldSeek(null, 60, 10_000, -Infinity)).toBe(false)
  })
})

describe('whose pause it is', () => {
  it("counts pausing the video yourself as your pause, like pressing Pause", () => {
    expect(videoPauseIsMine('running', true, true, Infinity)).toBe(true)
  })

  it("doesn't when the room had already stopped: the song stopped because someone paused", () => {
    expect(videoPauseIsMine('paused', true, true, Infinity)).toBe(false)
    expect(videoPauseIsMine('countdown', true, true, Infinity)).toBe(false)
  })

  it("doesn't once you've finished or stepped out", () => {
    expect(videoPauseIsMine('running', false, true, Infinity)).toBe(false)
  })

  it("doesn't when the song never really played (a phone that wants a tap), or it's settling after a move", () => {
    expect(videoPauseIsMine('running', true, false, Infinity)).toBe(false)
    expect(videoPauseIsMine('running', true, true, SEEK_SETTLE_MS - 1)).toBe(false)
    expect(videoPauseIsMine('running', true, true, SEEK_SETTLE_MS)).toBe(true)
  })
})

describe('following the room', () => {
  it('starts fresh when the screen opens mid-countdown, mid-plank or paused', () => {
    expect(roomStep(null, room({ phase: 'countdown' }))).toEqual({ to: 'countdown', fresh: true })
    expect(roomStep(null, room({ phase: 'running' }))).toEqual({ to: 'running', fresh: true })
    expect(roomStep(null, room({ phase: 'paused' }))).toEqual({ to: 'paused', fresh: true })
  })

  it('does nothing between planks', () => {
    expect(roomStep(null, room({ phase: 'lobby' }))).toBeNull()
    expect(roomStep({ phase: 'running', round: 1 }, room({ phase: 'over' }))).toBeNull()
  })

  it('follows start, pause and continue', () => {
    expect(roomStep({ phase: 'lobby', round: 0 }, room({ phase: 'countdown', round: 1 }))).toEqual({ to: 'countdown', fresh: true })
    expect(roomStep({ phase: 'countdown', round: 1 }, room({ phase: 'running' }))).toEqual({ to: 'running', fresh: false })
    expect(roomStep({ phase: 'running', round: 1 }, room({ phase: 'paused' }))).toEqual({ to: 'paused', fresh: false })
    expect(roomStep({ phase: 'paused', round: 1 }, room({ phase: 'countdown' }))).toEqual({ to: 'countdown', fresh: false })
  })

  it('ignores the room only putting its clock right', () => {
    expect(roomStep({ phase: 'running', round: 1 }, room({ phase: 'running', at: 42, since: 9_000 }))).toBeNull()
    expect(roomStep({ phase: 'paused', round: 1 }, room({ phase: 'paused', at: 42 }))).toBeNull()
  })

  it('stretches first, then follows into the 3-2-1', () => {
    expect(roomStep({ phase: 'lobby', round: 0 }, room({ phase: 'stretch', round: 1 }))).toEqual({ to: 'stretch', fresh: true })
    expect(roomStep(null, room({ phase: 'stretch' }))).toEqual({ to: 'stretch', fresh: true })
    expect(roomStep({ phase: 'stretch', round: 1 }, room({ phase: 'countdown' }))).toEqual({ to: 'countdown', fresh: false })
  })

  it('starts fresh for another round', () => {
    expect(roomStep({ phase: 'over', round: 1 }, room({ phase: 'countdown', round: 2 }))).toEqual({ to: 'countdown', fresh: true })
    expect(roomStep({ phase: 'countdown', round: 1 }, room({ phase: 'countdown', round: 2 }))).toEqual({ to: 'countdown', fresh: true })
  })
})
