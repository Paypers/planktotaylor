import { describe, expect, it } from 'vitest'
import { readMessage } from './messages'

describe('messages between devices in a room', () => {
  it('reads each kind, keeping only what it knows', () => {
    expect(readMessage({ type: 'hello', from: 'abc123', extra: 1 })).toEqual({ type: 'hello', from: 'abc123' })
    expect(readMessage({ type: 'start', seq: 1, from: 'abc123', round: 1 })).toEqual({ type: 'start', seq: 1, from: 'abc123', round: 1 })
    expect(readMessage({ type: 'pause', seq: 2, from: 'abc123', at: 10.5 })).toEqual({ type: 'pause', seq: 2, from: 'abc123', at: 10.5 })
    expect(readMessage({ type: 'resume', seq: 3, from: 'abc123', at: 10.5 })).toEqual({ type: 'resume', seq: 3, from: 'abc123', at: 10.5 })
    expect(readMessage({ type: 'sync', seq: 3, from: 'abc123', at: 42 })).toEqual({ type: 'sync', seq: 3, from: 'abc123', at: 42 })
    expect(readMessage({ type: 'status', from: 'abc123', status: 'done', round: 2, n: 5, seq: 9 })).toEqual({
      type: 'status',
      from: 'abc123',
      status: 'done',
      round: 2,
      n: 5,
    })
    // How far they got, for the room's total: kept when it's a time, dropped when it isn't.
    expect(readMessage({ type: 'status', from: 'abc123', status: 'out', round: 2, n: 6, held: 61 })).toMatchObject({ held: 61 })
    expect(readMessage({ type: 'status', from: 'abc123', status: 'out', round: 2, n: 6, held: -5 })).not.toHaveProperty('held')
    expect(readMessage({ type: 'status', from: 'abc123', status: 'out', round: 2, n: 6, held: 'lots' })).not.toHaveProperty('held')
    const state = {
      type: 'state',
      from: 'abc123',
      seq: 3,
      by: 'xyz789',
      phase: 'paused',
      at: 42,
      countdownLeftMs: 0,
      pausedMs: 1200,
      pauses: [{ at: 10, ms: 5000, whose: 'nobody' }],
      round: 1,
    }
    expect(readMessage(state)).toEqual({ ...state, pauses: [{ at: 10, ms: 5000 }] })
    // Before anyone has pressed anything.
    expect(readMessage({ ...state, seq: 0, by: '', phase: 'lobby' })).toMatchObject({ seq: 0, by: '' })
  })

  it("turns away anything that isn't a message", () => {
    const bad = [
      null,
      'hello',
      { type: 'hello' },
      { type: 'hello', from: 'Not An Id' },
      { type: 'wave', seq: 1, from: 'abc123', at: 1 },
      { type: 'status', from: 'abc123', status: 'resting', round: 1, n: 1 },
      { type: 'status', from: 'abc123', status: 'done', round: 1 },
      { type: 'start', seq: -1, from: 'abc123', round: 1 },
      { type: 'start', seq: 1.5, from: 'abc123', round: 1 },
      { type: 'start', seq: 1, from: 'abc123' },
      { type: 'pause', seq: 1, from: 'abc123', at: Number.NaN },
      { type: 'pause', seq: 1, from: 'abc123', at: -3 },
      { type: 'state', seq: 1, from: 'abc123', by: 'x', phase: 'dancing', at: 0, countdownLeftMs: 0, pausedMs: 0, pauses: [], round: 1 },
      { type: 'state', seq: 1, from: 'abc123', by: 'x', phase: 'over', at: 0, countdownLeftMs: 9000, pausedMs: 0, pauses: [], round: 1 },
      { type: 'state', seq: 1, from: 'abc123', by: 'x', phase: 'over', at: 0, countdownLeftMs: 0, pausedMs: 0, pauses: [{ at: 'x' }], round: 1 },
    ]
    for (const message of bad) expect(readMessage(message)).toBeNull()
  })
})
