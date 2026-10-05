import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { realtimeClient } from '../account'
import { randomLetters } from './code'
import { latestEvery } from './latest'
import type { LiveLink, LiveMember, LiveStatus } from './link'
import { hostOf, isFull, joinTime, readPresences, roomMembers, sameMembers, withLatestStatus, withRejoining, type HeardStatus, type Presence } from './members'
import { readMessage, type RoomMessage } from './messages'
import { adopt, missedCommands, newRoom, position, press, receive, resync, settle, snapshot, SYNC_EVERY_MS, syncFor, tick, type Press, type Room } from './room'

// Planking together over Supabase Realtime: presence says who's here, broadcast carries the commands
// and everyone's status. Nothing is stored anywhere: the room lasts as long as someone's in it.

/**
 * connecting    joining, and hearing from the room where it's up to
 * open          in the room
 * reconnecting  lost the room for now: it carries on here, and catches up when it's back
 * error         couldn't reach the room, or has kept losing it
 * full          the room already has everyone it can show
 */
export type RoomStatus = 'connecting' | 'open' | 'reconnecting' | 'error' | 'full'

export interface RoomLink extends LiveLink {
  /** The round this device saw start. Someone who arrives mid-round watches it instead. */
  startedHere: () => number | null
}

const EVENT = 'room'
// How long to wait for the room's presence, and then for the host's answer, before going on without them.
const PRESENCE_WAIT_MS = 1500
const ANSWER_WAIT_MS = 3000
// Often enough to see a round end or a 3-2-1 run out straight away. Nothing is sent unless there's something to say.
const CHECK_MS = 500
// Supabase closes the channel of a device that updates its presence more than about 5 times in 30 seconds.
// Statuses go over broadcast straight away, so presence can lag this far behind.
const PRESENCE_GAP_MS = 12_000
// Someone who dropped out of presence and has spoken since is joining again: they stay listed this long,
// long enough for their presence to follow.
const REJOIN_GRACE_MS = PRESENCE_GAP_MS + 5000
// Joining again after the channel closed: sooner at first, then backing off. Past a few goes it says so.
const REJOIN_DELAYS_MS = [1000, 2000, 4000, 8000, 15_000]
const GIVE_UP_AFTER = 4
// In the room this long, a later drop starts the backing off afresh.
const STEADY_MS = 20_000

// Rooms being left, by topic. Opening one again waits, so the old channel is gone before the new one joins.
const leaving = new Map<string, Promise<unknown>>()

/** Joins a room while mounted, and leaves it on unmount. */
export function useLiveRoom(code: string, { name, songSeconds }: { name: string; songSeconds: number }): { link: RoomLink | null; status: RoomStatus } {
  const [link, setLink] = useState<RoomLink | null>(null)
  const [status, setStatus] = useState<RoomStatus>('connecting')
  useEffect(() => {
    const room = openRoom(code, name, songSeconds, setStatus)
    setLink(room.link)
    setStatus('connecting')
    return room.close
  }, [code, name, songSeconds])
  return { link, status }
}

function openRoom(code: string, name: string, songSeconds: number, report: (status: RoomStatus) => void) {
  const me = randomLetters(12)
  const topic = `plank-together:${code}`
  const listeners = new Set<() => void>()
  // Statuses heard over broadcast, newer than presence has caught up with.
  const heard = new Map<string, HeardStatus>()
  // Each device as presence last had it, and when each last said anything.
  const known = new Map<string, Presence>()
  const heardAt = new Map<string, number>()
  let room: Room = newRoom()
  let mine: Presence = { id: me, name, status: 'lobby', joinedAt: 0, round: 0, n: 0 }
  let others: Presence[] = []
  let members: LiveMember[] = []
  let supabase: SupabaseClient | null = null
  let channel: RealtimeChannel | null = null
  let subscribed = false
  let ready = false
  let closed = false
  let connection: 'open' | 'reconnecting' = 'open'
  let rejoins = 0
  let lastSync = 0
  let countdownTimer: ReturnType<typeof setTimeout> | undefined
  let waitTimer: ReturnType<typeof setTimeout> | undefined
  let rejoinTimer: ReturnType<typeof setTimeout> | undefined
  let steadyTimer: ReturnType<typeof setTimeout> | undefined

  const now = () => performance.now()
  const notify = () => listeners.forEach((fn) => fn())
  const say = (status: RoomStatus) => {
    if (!closed) report(status)
  }
  // Sent and forgotten: a message that doesn't make it is covered by the next one, or the answers to hello.
  const quietly = (sending: Promise<unknown> | undefined) => void sending?.catch(() => {})
  const presence = latestEvery<Presence>(PRESENCE_GAP_MS, (payload) => {
    if (!subscribed || !channel) return false
    quietly(channel.track(payload))
    return true
  })
  // This device counts once it has joined. Its own entry is the one here, so a change shows straight away.
  const everyone = (): Presence[] => [
    ...withLatestStatus(withRejoining(others, known, heardAt, Date.now(), REJOIN_GRACE_MS), heard),
    ...(mine.joinedAt ? [mine] : []),
  ]
  const amHost = () => hostOf(everyone()) === me

  function setConnection(next: 'open' | 'reconnecting') {
    if (next === connection) return
    connection = next
    notify()
  }

  function updateMembers() {
    const next = roomMembers(everyone(), room.state.round)
    if (!sameMembers(next, members)) members = next
  }

  function setRoom(next: Room) {
    if (next === room) return
    const newRound = next.state.round !== room.state.round
    room = next
    if (newRound) updateMembers()
    clearTimeout(countdownTimer)
    // The stretch ending starts the 3-2-1, and the 3-2-1 ending starts the song: each straight away.
    const ends = room.state.stretchEnds ?? room.state.countdownEnds
    if (ends !== null) countdownTimer = setTimeout(() => setRoom(tick(room, now())), Math.max(0, ends - now()) + 5)
    notify()
  }

  function refreshMembers() {
    const before = members
    updateMembers()
    setRoom(settle(room, members, now(), songSeconds))
    if (members !== before) notify()
  }

  function send(message: RoomMessage) {
    if (!channel || closed) return
    if (subscribed) quietly(channel.send({ type: 'broadcast', event: EVENT, payload: message }))
    // While reconnecting, commands and statuses still go, the slower way. The rest can wait.
    else if (message.type !== 'sync' && message.type !== 'hello' && message.type !== 'state') quietly(channel.httpSend(EVENT, message))
  }

  const sayStatus = () =>
    send({ type: 'status', from: me, status: mine.status, round: mine.round, n: mine.n, ...(mine.held !== undefined ? { held: mine.held } : {}) })

  function markReady() {
    clearTimeout(waitTimer)
    if (ready) return
    ready = true
    say('open')
  }

  function act(what: Press) {
    const pressed = press(room, what, me, now(), songSeconds)
    if (!pressed) return
    setRoom(pressed.room)
    send(pressed.command)
  }

  function setFriendCode(code: string | null) {
    const friendCode = code ?? undefined
    if (mine.friendCode === friendCode) return
    const { friendCode: _old, ...rest } = mine
    mine = friendCode ? { ...rest, friendCode } : rest
    if (mine.joinedAt) presence.set(mine)
    refreshMembers()
  }

  function setStatus(status: LiveStatus) {
    const round = room.state.round
    if (mine.status === status && mine.round === round) return
    // How far this device got, on the room's clock, so breaks never count. Done is the whole song.
    const held = status === 'done' ? songSeconds : status === 'out' ? Math.round(position(room.state, now(), songSeconds)) : undefined
    mine = {
      id: mine.id,
      name: mine.name,
      joinedAt: mine.joinedAt,
      status,
      round,
      n: mine.n + 1,
      ...(held !== undefined ? { held } : {}),
      ...(mine.friendCode ? { friendCode: mine.friendCode } : {}),
    }
    if (mine.joinedAt) {
      sayStatus()
      presence.set(mine)
    }
    refreshMembers()
  }

  function onMessage(payload: unknown) {
    const message = readMessage(payload)
    if (closed || !message || message.from === me) return
    heardAt.set(message.from, Date.now())
    const at = now()
    if (message.type === 'hello') {
      // Everyone says how they are, so someone arriving or back doesn't wait for presence to catch up.
      if (mine.joinedAt) sayStatus()
      if (amHost()) send(snapshot(room, me, at))
    } else if (message.type === 'status') {
      const known = heard.get(message.from)
      if (known && known.n >= message.n) return
      heard.set(message.from, { status: message.status, round: message.round, n: message.n })
      refreshMembers()
    } else if (message.type === 'state') {
      setRoom(adopt(room, message, at))
      markReady()
    } else if (message.type === 'sync') {
      if (missedCommands(room, message)) send({ type: 'hello', from: me })
      setRoom(resync(room, message, at))
    } else {
      setRoom(receive(room, message, at, songSeconds))
    }
  }

  /** Steps in once the room's presence has arrived (or didn't in time): after everyone already here. */
  function join() {
    clearTimeout(waitTimer)
    if (!channel || mine.joinedAt || closed) return
    if (isFull(others, me)) return leave('full')
    mine = { ...mine, joinedAt: joinTime(others, Date.now()) }
    presence.set(mine)
    refreshMembers()
    if (others.length === 0) return markReady()
    send({ type: 'hello', from: me })
    waitTimer = setTimeout(() => {
      send({ type: 'hello', from: me })
      markReady()
    }, ANSWER_WAIT_MS)
  }

  function onPresence(from: RealtimeChannel) {
    if (closed || from !== channel) return
    others = readPresences(from.presenceState()).filter((p) => p.id !== me)
    for (const p of others) known.set(p.id, p)
    if (!mine.joinedAt) return join()
    if (isFull(everyone(), me)) return leave('full')
    refreshMembers()
  }

  function onSubscribe(from: RealtimeChannel, status: string) {
    if (closed || from !== channel) return
    subscribed = status === 'SUBSCRIBED'
    if (status === 'SUBSCRIBED') {
      clearTimeout(steadyTimer)
      steadyTimer = setTimeout(() => (rejoins = 0), STEADY_MS)
      if (!mine.joinedAt) {
        waitTimer = setTimeout(join, PRESENCE_WAIT_MS)
        return
      }
      // Back: here again, with the same id and place in the room, and catching up on anything missed.
      presence.set(mine)
      send({ type: 'hello', from: me })
      sayStatus()
      if (ready) {
        setConnection('open')
        say('open')
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // Realtime keeps trying to join again by itself.
      if (ready) setConnection('reconnecting')
      say(ready ? 'reconnecting' : 'error')
    } else if (status === 'CLOSED') {
      rejoinSoon()
    }
  }

  /** Closed from the other end (Supabase's limits, say), which Realtime doesn't come back from by itself. */
  function rejoinSoon() {
    const old = channel
    channel = null
    subscribed = false
    if (old && supabase) quietly(supabase.removeChannel(old))
    clearTimeout(steadyTimer)
    if (ready) setConnection('reconnecting')
    say(rejoins >= GIVE_UP_AFTER ? 'error' : ready ? 'reconnecting' : 'connecting')
    rejoinTimer = setTimeout(connect, REJOIN_DELAYS_MS[Math.min(rejoins, REJOIN_DELAYS_MS.length - 1)])
    rejoins += 1
  }

  function connect() {
    if (closed || !supabase) return
    const joining = supabase.channel(topic, { config: { presence: { key: me }, broadcast: { self: false } } })
    channel = joining
    joining
      .on('broadcast', { event: EVENT }, ({ payload }) => onMessage(payload))
      .on('presence', { event: 'sync' }, () => onPresence(joining))
      .subscribe((status) => onSubscribe(joining, status))
  }

  // The heartbeat while planking: the end of a round by the clock, and the host's place in the song.
  function check() {
    // Someone joining again who's gone quiet for too long drops off the list.
    refreshMembers()
    const { phase } = room.state
    if (phase === 'lobby' || phase === 'over') return
    const at = now()
    setRoom(settle(room, members, at, songSeconds))
    if (at - lastSync < SYNC_EVERY_MS || !amHost()) return
    const sync = syncFor(room, me, at, songSeconds)
    if (!sync) return
    lastSync = at
    send(sync)
  }
  const checkTimer = setInterval(check, CHECK_MS)

  function close() {
    closed = true
    clearInterval(checkTimer)
    for (const timer of [countdownTimer, waitTimer, rejoinTimer, steadyTimer]) clearTimeout(timer)
    presence.cancel()
    listeners.clear()
    if (!supabase || !channel) return
    const done = supabase.removeChannel(channel).catch(() => {})
    leaving.set(topic, done)
    void done.then(() => leaving.get(topic) === done && leaving.delete(topic))
  }

  function leave(status: RoomStatus) {
    say(status)
    close()
  }

  void (async () => {
    const client = await realtimeClient()
    await leaving.get(topic)
    if (closed) return
    supabase = client
    connect()
  })().catch(() => say('error'))

  const link: RoomLink = {
    me,
    getMembers: () => members,
    getState: () => room.state,
    position: () => position(room.state, now(), songSeconds),
    start: () => act('start'),
    stretch: () => act('stretch'),
    pause: () => act('pause'),
    resume: () => act('resume'),
    setStatus,
    setFriendCode,
    getConnection: () => connection,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    startedHere: () => room.here,
  }
  return { link, close }
}
