import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { countdownLeft, roomStep, shouldSeek, videoPauseIsMine, type Followed, type RoomStepTo } from '../../lib/live/follow'
import type { LiveLink, LiveMember } from '../../lib/live/link'
import { sounds, unlockAudio } from '../../lib/sound'
import type { PlayerEvents, useMusic } from '../useMusic'

/** How the plank screen answers the room. */
export interface LivePlankHandlers {
  /** Still in the room's plank: not finished, not stepped out. */
  following: () => boolean
  /** Your timer is running. */
  planking: () => boolean
  /** The room began a stretch or a 3-2-1, is planking, or has paused. Fresh: a plank new to this screen. */
  step: (to: RoomStepTo, fresh: boolean) => void
  /** You paused the video itself: the same as pressing Pause. */
  pause: () => void
}

const TAP_HINT = "Tap ▶ on the video to hear the song. Your timer's keeping the room's time."
const NO_MEMBERS: LiveMember[] = []

/**
 * Planking together: the room says when to count down, plank and pause, and the plank screen follows. The
 * song follows the room's clock too. Without a room it does nothing.
 */
export function useLivePlank(live: LiveLink | undefined, music: ReturnType<typeof useMusic>, withSounds: boolean, handlers: LivePlankHandlers) {
  const subscribe = useCallback((listener: () => void) => (live ? live.subscribe(listener) : () => {}), [live])
  const readRoom = useCallback(() => live?.getState() ?? null, [live])
  const readMembers = useCallback(() => live?.getMembers() ?? NO_MEMBERS, [live])
  const readConnection = useCallback(() => live?.getConnection() ?? 'open', [live])
  const room = useSyncExternalStore(subscribe, readRoom)
  const members = useSyncExternalStore(subscribe, readMembers)
  const connection = useSyncExternalStore(subscribe, readConnection)

  const on = useRef(handlers)
  on.current = handlers
  const musicRef = useRef(music)
  musicRef.current = music
  const followed = useRef<Followed | null>(null)
  const playing = useRef(false)
  // A ready player has been asked to play since the room last carried on.
  const asked = useRef(false)
  const lastSeek = useRef(-Infinity)

  /** Moves the song to where the room is, once it's drifted. */
  const keepInStep = useCallback(() => {
    if (!live) return
    const now = performance.now()
    const at = live.position()
    if (!shouldSeek(musicRef.current.position(), at, now, lastSeek.current)) return
    lastSeek.current = now
    musicRef.current.seek(at)
  }, [live])

  // The room changed: the plank screen follows, and the song stops for a stretch, a 3-2-1 or a pause and carries on
  // from where the room is. After the render settles, so React's development double-mount follows it once.
  useEffect(() => {
    if (!live || !room) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const step = roomStep(followed.current, room)
      followed.current = { phase: room.phase, round: room.round }
      if (!step || !on.current.following()) return
      const song = musicRef.current
      if (step.to === 'running') {
        asked.current = song.position() !== null
        if (song.mode === 'video') song.start(live.position())
      } else if (step.fresh) song.cue()
      else song.pause()
      on.current.step(step.to, step.fresh)
    })
    return () => {
      cancelled = true
    }
  }, [live, room])

  // While the room planks: start a player that got ready late (a slow load), and keep the song in step.
  const running = room?.phase === 'running'
  useEffect(() => {
    if (!live || !running || music.mode !== 'video') return
    const timer = setInterval(() => {
      if (!on.current.following() || musicRef.current.position() === null) return
      if (!asked.current) {
        asked.current = true
        musicRef.current.start(live.position())
      } else if (playing.current) keepInStep()
    }, 1000)
    return () => clearInterval(timer)
  }, [live, running, music.mode, keepInStep])

  // 3, 2, 1 from when the room's countdown ends, so everyone's lands together. It stays on 1 until the room carries on.
  const [count, setCount] = useState(3)
  const counted = useRef({ ends: null as number | null, n: 0 })
  const ends = room?.phase === 'countdown' ? room.countdownEnds : null
  useEffect(() => {
    if (ends === null) return
    const tick = () => {
      const n = Math.max(1, countdownLeft(ends, performance.now()))
      if (counted.current.ends === ends && counted.current.n === n) return
      counted.current = { ends, n }
      setCount(n)
      if (withSounds && on.current.following()) sounds.tick()
    }
    tick()
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [ends, withSounds])

  // The countdown's sounds need audio unlocked. Often the lobby's tap already did; if not, the plank screen's next tap does.
  useEffect(() => {
    if (live) unlockAudio()
  }, [live])

  // The song follows the room, so the player's own play and pause mean something else here.
  const videoEvents = useMemo<PlayerEvents | null>(() => {
    if (!live) return null
    return {
      onPlaying: () => {
        playing.current = true
        if (!on.current.following()) return
        const phase = live.getState().phase
        // Started late by a tap on the video (phones), or after a move: into step with the room.
        if (phase === 'running') keepInStep()
        // Played from the video while everyone's stopped: it waits with them.
        else if (phase === 'stretch' || phase === 'countdown' || phase === 'paused') musicRef.current.pause()
      },
      onPaused: () => {
        const wasPlaying = playing.current
        playing.current = false
        if (videoPauseIsMine(live.getState().phase, on.current.planking(), wasPlaying, performance.now() - lastSeek.current)) on.current.pause()
      },
      onEnded: () => {
        playing.current = false
      },
    }
  }, [live, keepInStep])

  return {
    members,
    /** Lost the room for now and joining it again. The plank carries on here either way. */
    reconnecting: connection === 'reconnecting',
    /** The countdown's 3, 2 or 1. */
    count,
    /** While the room stretches: when the stretch ends, on this device's clock. */
    stretchEnds: room?.phase === 'stretch' ? room.stretchEnds : null,
    /** The song hasn't started (phones want a tap on the video), but the timer has. */
    hint: running && music.mode === 'video' && music.hint ? TAP_HINT : null,
    /** The player's events while planking together: null planking alone. */
    videoEvents,
  }
}
