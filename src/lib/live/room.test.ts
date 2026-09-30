import { describe, expect, it } from 'vitest'
import type { LiveMember, LiveStatus } from './link'
import type { Command, Sync } from './messages'
import {
  adopt,
  advance,
  compareStamps,
  missedCommands,
  newRoom,
  position,
  press,
  receive,
  resync,
  roundIsOver,
  settle,
  snapshot,
  syncFor,
  tick,
  type Room,
} from './room'

// A 200-second song. Times are each device's performance.now(), in ms.
const SONG = 200

const start = (seq: number, from: string, round = 1): Command => ({ type: 'start', seq, from, round })
const pause = (seq: number, from: string, at: number): Command => ({ type: 'pause', seq, from, at })
const resume = (seq: number, from: string, at: number): Command => ({ type: 'resume', seq, from, at })
const sync = (seq: number, at: number): Sync => ({ type: 'sync', seq, from: 'host', at })

/** Commands as they arrive at one device: each with the time it got there. */
const arrive = (room: Room, ...steps: [Command, number][]) => steps.reduce((r, [command, now]) => receive(r, command, now, SONG), room)

/** Started at 0, so the song is running from 3000. */
const running = () => arrive(newRoom(), [start(1, 'a'), 0])

const member = (id: string, status: LiveStatus): LiveMember => ({ id, name: id, status, joinedAt: 0 })

describe('the order commands go in', () => {
  it('puts higher numbers later, and settles a tie by the sender', () => {
    expect(compareStamps({ seq: 2, from: 'a' }, { seq: 1, from: 'z' })).toBeGreaterThan(0)
    expect(compareStamps({ seq: 1, from: 'b' }, { seq: 1, from: 'a' })).toBeGreaterThan(0)
    expect(compareStamps({ seq: 1, from: 'a' }, { seq: 1, from: 'a' })).toBe(0)
  })

  it('settles two pauses pressed at once the same way, whichever arrives first', () => {
    const base = running()
    // Each device hears its own pause first. The one from "b" wins on both.
    const onA = arrive(base, [pause(2, 'a', 10), 13_000], [pause(2, 'b', 10.4), 13_100])
    const onB = arrive(base, [pause(2, 'b', 10.4), 13_000], [pause(2, 'a', 10), 13_100])
    expect(onA.state.phase).toBe('paused')
    expect(onA.state.at).toBe(10.4)
    expect(onB.state.at).toBe(10.4)
    expect(onA.last).toEqual({ seq: 2, from: 'b' })
    expect(onB.last).toEqual({ seq: 2, from: 'b' })
  })

  it('settles two Starts pressed at once into one round', () => {
    const onA = arrive(newRoom(), [start(1, 'a'), 0], [start(1, 'b'), 80])
    const onB = arrive(newRoom(), [start(1, 'b'), 0], [start(1, 'a'), 80])
    expect(onA.state.round).toBe(1)
    expect(onB.state.round).toBe(1)
    expect(onA.last).toEqual(onB.last)
  })

  it('ignores a command from before the last one applied, but numbers past it', () => {
    const paused = arrive(running(), [pause(5, 'a', 10), 13_000])
    const stale = arrive(paused, [resume(4, 'b', 10), 14_000])
    expect(stale.state).toBe(paused.state)
    expect(stale.highest).toBe(5)
    // A command that doesn't make sense now is ignored too, but the next press still goes past its number.
    const odd = arrive(paused, [pause(9, 'b', 12), 14_000])
    expect(odd.state).toBe(paused.state)
    expect(press(odd, 'resume', 'a', 15_000, SONG)?.command.seq).toBe(10)
  })

  it("ignores what doesn't make sense for where the room is", () => {
    const lobby = newRoom()
    expect(arrive(lobby, [pause(1, 'a', 0), 0]).state).toBe(lobby.state)
    expect(arrive(lobby, [resume(1, 'a', 0), 0]).state).toBe(lobby.state)
    const counting = arrive(lobby, [start(1, 'a'), 0])
    // A pause in the 3-2-1, and a second Start for the same round.
    expect(arrive(counting, [pause(2, 'b', 0), 1000]).state).toBe(counting.state)
    expect(arrive(counting, [start(2, 'b', 1), 1000]).state).toBe(counting.state)
    const run = arrive(counting, [resume(2, 'b', 0), 4000])
    expect(run.state.phase).toBe('countdown')
    expect(run.last).toEqual(counting.last)
  })
})

describe("the room's clock", () => {
  it('counts down 3 seconds, then runs from the top', () => {
    const room = running()
    expect(room.state).toMatchObject({ phase: 'countdown', at: 0, countdownEnds: 3000, round: 1, pauses: [] })
    expect(room.here).toBe(1)
    expect(tick(room, 2999)).toBe(room)
    expect(tick(room, 3000).state).toMatchObject({ phase: 'running', at: 0, since: 3000, countdownEnds: null })
    // Late to tick, nothing's lost: running since the 3-2-1 ended.
    expect(tick(room, 3400).state.since).toBe(3000)
    expect(position(room.state, 4500)).toBe(1.5)
    expect(position(room.state, 1000)).toBe(0)
  })

  it('keeps the position within the song', () => {
    const room = running()
    expect(position(room.state, 3000 + 250_000, SONG)).toBe(SONG)
    expect(position(room.state, 3000 + 250_000)).toBe(250)
  })

  it('stops everyone where the pause was pressed, and carries on after a 3-2-1', () => {
    const paused = arrive(running(), [pause(2, 'b', 10.04), 13_000])
    expect(paused.state).toMatchObject({ phase: 'paused', at: 10.04, since: 13_000, countdownEnds: null })
    expect(position(paused.state, 20_000)).toBe(10.04)

    const back = arrive(paused, [resume(3, 'c', 10.04), 20_000])
    expect(back.state).toMatchObject({ phase: 'countdown', at: 10.04, countdownEnds: 23_000 })
    // The break, from the pause to the end of the 3-2-1, rounded like the plank screen's.
    expect(back.state.pauses).toEqual([{ at: 10, ms: 10_000 }])
    expect(position(back.state, 22_000)).toBe(10.04)
    expect(position(back.state, 25_000)).toBeCloseTo(12.04)
  })

  it('records each break of the round, and starts the next round without them', () => {
    const twice = arrive(
      running(),
      [pause(2, 'a', 30.26), 33_000],
      [resume(3, 'a', 30.26), 38_400.4],
      [pause(4, 'b', 90), 99_000],
      [resume(5, 'a', 90), 100_000],
    )
    expect(twice.state.pauses).toEqual([
      { at: 30.3, ms: 8400 },
      { at: 90, ms: 4000 },
    ])
    const over = settle(twice, [], 103_000 + 204_000, SONG)
    expect(over.state.phase).toBe('over')
    const again = arrive(over, [start(6, 'c', 2), 400_000])
    expect(again.state).toMatchObject({ phase: 'countdown', at: 0, round: 2, pauses: [] })
  })

  it("pauses at the sender's place, kept within the song", () => {
    const room = arrive(running(), [pause(2, 'a', 999), 13_000])
    expect(room.state.at).toBe(SONG)
  })

  it('makes commands from this device numbered past everything seen', () => {
    const room = arrive(newRoom(), [start(7, 'b'), 0])
    const pressed = press(room, 'pause', 'a', 13_000, SONG)
    expect(pressed?.command).toEqual({ type: 'pause', seq: 8, from: 'a', at: 10 })
    expect(pressed?.room.state.phase).toBe('paused')
    const back = press(pressed!.room, 'resume', 'a', 20_000, SONG)
    expect(back?.command).toEqual({ type: 'resume', seq: 9, from: 'a', at: 10 })
    expect(press(back!.room, 'start', 'a', 21_000, SONG)).toBeNull()
    expect(press(newRoom(), 'pause', 'a', 0, SONG)).toBeNull()
    expect(press(newRoom(), 'start', 'a', 0, SONG)?.command).toEqual({ type: 'start', seq: 1, from: 'a', round: 1 })
  })

  it('takes a Start for a new round even mid-round: someone saw the round end first', () => {
    const room = arrive(running(), [start(2, 'b', 2), 50_000])
    expect(room.state).toMatchObject({ phase: 'countdown', round: 2 })
    expect(room.here).toBe(2)
  })
})

describe("keeping in step with the host's clock", () => {
  const run = tick(running(), 3000)

  it('leaves a device within a second alone', () => {
    // 10 seconds in on this device; the host says 10.9.
    expect(resync(run, sync(1, 10.9), 13_000).state).toBe(run.state)
    expect(resync(run, sync(1, 9.1), 13_000).state).toBe(run.state)
  })

  it('moves a device more than a second out back into step', () => {
    const moved = resync(run, sync(1, 11.5), 13_000)
    expect(moved.state).toMatchObject({ at: 11.5, since: 13_000 })
    expect(position(moved.state, 14_000)).toBe(12.5)
    expect(resync(run, sync(1, 8.5), 13_000).state.at).toBe(8.5)
  })

  it("ignores the host's clock from before a command, and while paused", () => {
    const paused = arrive(run, [pause(2, 'a', 10), 13_000])
    expect(resync(paused, sync(2, 50), 14_000).state).toBe(paused.state)
    const back = arrive(paused, [resume(3, 'a', 10), 14_000])
    expect(resync(tick(back, 17_000), sync(2, 50), 20_000).state.at).toBe(10)
  })

  it('asks where the room is when the host has a command this device missed', () => {
    expect(missedCommands(run, sync(2, 10))).toBe(true)
    expect(missedCommands(run, sync(1, 10))).toBe(false)
  })

  it('sends the place in the song while running, until the song ends', () => {
    expect(syncFor(run, 'host', 13_000, SONG)).toEqual({ type: 'sync', seq: 1, from: 'host', at: 10 })
    expect(syncFor(running(), 'host', 1000, SONG)).toBeNull()
    expect(syncFor(run, 'host', 3000 + SONG * 1000, SONG)).toBeNull()
  })
})

describe('the end of a round', () => {
  const run = tick(running(), 3000)

  it('ends when everyone in it has finished or stepped out', () => {
    expect(roundIsOver(run.state, [member('a', 'done'), member('b', 'out')], 60_000, SONG)).toBe(true)
    expect(roundIsOver(run.state, [member('a', 'done'), member('b', 'planking')], 60_000, SONG)).toBe(false)
    // Someone who arrived mid-round is waiting in the lobby: they don't hold it up.
    expect(roundIsOver(run.state, [member('a', 'done'), member('c', 'lobby')], 60_000, SONG)).toBe(true)
  })

  it("doesn't end before anyone's plank screen has opened", () => {
    expect(roundIsOver(run.state, [member('a', 'lobby'), member('b', 'lobby')], 4000, SONG)).toBe(false)
    expect(roundIsOver(run.state, [], 4000, SONG)).toBe(false)
  })

  it('ends 3 seconds after the song, whoever is still showing as planking', () => {
    const planking = [member('a', 'planking')]
    expect(roundIsOver(run.state, planking, 3000 + (SONG + 2.9) * 1000, SONG)).toBe(false)
    expect(roundIsOver(run.state, planking, 3000 + (SONG + 3) * 1000, SONG)).toBe(true)
    const over = settle(run, planking, 3000 + (SONG + 3) * 1000, SONG)
    expect(over.state).toMatchObject({ phase: 'over', at: SONG, countdownEnds: null })
    expect(settle(over, planking, 400_000, SONG)).toBe(over)
  })

  it('counts a 3-2-1 that has run out as running', () => {
    expect(settle(running(), [], 3500, SONG).state.phase).toBe('running')
  })
})

describe('joining a room mid-round', () => {
  it("takes the host's room when it's further on", () => {
    const host = arrive(running(), [pause(2, 'b', 40), 43_000], [resume(3, 'a', 40), 50_000])
    // 5 seconds later on the host; the newcomer's clock reads 1000.
    const snap = snapshot(tick(host, 55_000), 'a', 55_000)
    expect(snap).toMatchObject({ type: 'state', seq: 3, by: 'a', phase: 'running', at: 42, countdownLeftMs: 0, round: 1 })
    const joined = adopt(newRoom(), snap, 1000)
    expect(joined.state).toMatchObject({ phase: 'running', at: 42, since: 1000, pauses: [{ at: 40, ms: 10_000 }], round: 1 })
    expect(position(joined.state, 2000)).toBe(43)
    // Arrived mid-round: they watch this one.
    expect(joined.here).toBeNull()
    expect(joined.highest).toBe(3)
  })

  it('picks up a 3-2-1 or a pause part way through', () => {
    const counting = adopt(newRoom(), snapshot(running(), 'a', 1200), 5000)
    expect(counting.state).toMatchObject({ phase: 'countdown', countdownEnds: 6800, since: 6800 })

    const paused = arrive(tick(running(), 3000), [pause(2, 'a', 10), 13_000])
    const joined = adopt(newRoom(), snapshot(paused, 'a', 17_000), 500)
    expect(joined.pauseStart).toBe(-3500)
    // The break is as long on the newcomer's record as on the host's.
    const back = arrive(joined, [resume(3, 'a', 10), 1000])
    expect(back.state.pauses).toEqual([{ at: 10, ms: 7500 }])
  })

  it('keeps its own room when the snapshot is no newer', () => {
    const mine = arrive(running(), [pause(2, 'b', 10), 13_000])
    const older = snapshot(running(), 'a', 1000)
    expect(adopt(mine, older, 14_000)).toBe(mine)
    const lobby = snapshot(newRoom(), 'a', 0)
    expect(lobby).toMatchObject({ seq: 0, by: '', phase: 'lobby' })
    expect(adopt(newRoom(), lobby, 0).state).toEqual(newRoom().state)
  })

  it('answers with the moment the 3-2-1 ended as running', () => {
    expect(advance(running().state, 3000).phase).toBe('running')
    expect(snapshot(running(), 'a', 4000)).toMatchObject({ phase: 'running', at: 1, countdownLeftMs: 0 })
  })
})
