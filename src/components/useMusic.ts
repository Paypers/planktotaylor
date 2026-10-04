import { useCallback, useEffect, useRef, useState } from 'react'
import type { Song } from '../data/songs'
import { PlayerState, type YouTubePlayer } from '../lib/youtube'

/**
 * off    music turned off in settings
 * video  the song's album track from YouTube, embedded on the plank screen
 * link   no playable track: link out to YouTube instead
 */
export type MusicMode = 'off' | 'video' | 'link'

/** What the player tells the plank screen. The timer follows these, so the song and the plank stay together. */
export interface PlayerEvents {
  onPlaying?: () => void
  onPaused?: () => void
  onEnded?: () => void
}

const TAP_HINT = 'Tap ▶ on the video to start the song. The timer starts with it.'
/** How long priming waits for the video to report playing. A phone that blocks it never does. */
const PRIMING_MS = 5000

export function useMusic(song: Song, enabled: boolean, events: PlayerEvents = {}) {
  const [failed, setFailed] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const player = useRef<YouTubePlayer | null>(null)
  const state = useRef(-1)
  const started = useRef(false)
  // Played once from a tap, so phones let it start later without one.
  const primed = useRef(false)
  const primingUntil = useRef(0)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handlers = useRef(events)
  handlers.current = events

  useEffect(() => () => clearTimeout(hintTimer.current), [])

  const mode: MusicMode = !enabled ? 'off' : song.youtubeId && !failed ? 'video' : 'link'

  const onReady = useCallback((p: YouTubePlayer | null) => {
    player.current = p
  }, [])

  const onStateChange = useCallback((next: number) => {
    state.current = next
    // Priming's own play is not the song starting.
    if (performance.now() < primingUntil.current) {
      if (next !== PlayerState.PLAYING) return
      primed.current = true
      primingUntil.current = 0
      player.current?.pauseVideo()
      return
    }
    if (next === PlayerState.PLAYING) {
      // Counts as started however it began: our Start button or a tap on the video itself.
      started.current = true
      primed.current = true
      setHint(null)
      handlers.current.onPlaying?.()
    } else if (next === PlayerState.PAUSED) {
      handlers.current.onPaused?.()
    } else if (next === PlayerState.ENDED) {
      handlers.current.onEnded?.()
    }
  }, [])

  // 101/150: the uploader blocked embedding; 100: removed; 2/5: bad id or player error.
  const onError = useCallback(() => {
    player.current = null
    setFailed(true)
  }, [])

  /** Countdown started: pause and rewind, since a tap on the video itself starts the countdown too. */
  const cue = useCallback(() => {
    const p = player.current
    if (!p) return
    // Only a song that's been played needs rewinding: seeking a fresh video starts it playing,
    // which would start the plank before the countdown ends.
    const current = p.getPlayerState()
    if (current === PlayerState.PLAYING || current === PlayerState.PAUSED || current === PlayerState.BUFFERING) {
      p.pauseVideo()
      p.seekTo(0, true)
    }
  }, [])

  /**
   * On a tap anywhere on the plank screen: play and pause at once. Phones (iPhones especially) only let a
   * video start inside a tap, but once it has, it can start again from the countdown or the room.
   */
  const prime = useCallback(() => {
    const p = player.current
    if (!p || primed.current || started.current || performance.now() < primingUntil.current) return
    primingUntil.current = performance.now() + PRIMING_MS
    // Paused once it reports playing. Paused any sooner, the player never plays the video at all.
    p.playVideo()
  }, [])

  /** "Go": start the song from the top (planking together, from where the room is). The timer waits until it's actually playing. */
  const start = useCallback((from = 0) => {
    const p = player.current
    started.current = true
    primingUntil.current = 0
    clearTimeout(hintTimer.current)
    // Phones (iPhones especially) only allow playback from a tap on the video itself.
    hintTimer.current = setTimeout(() => {
      if (started.current && state.current !== PlayerState.PLAYING) setHint(TAP_HINT)
    }, 2000)
    if (!p) return
    p.seekTo(from, true)
    p.playVideo()
  }, [])

  /** Moves a song that's playing (or paused after playing) to `seconds` in. */
  const seek = useCallback((seconds: number) => player.current?.seekTo(seconds, true), [])

  const pause = useCallback(() => player.current?.pauseVideo(), [])

  const resume = useCallback(() => {
    if (started.current) player.current?.playVideo()
  }, [])

  const stop = useCallback(() => {
    started.current = false
    clearTimeout(hintTimer.current)
    setHint(null)
    player.current?.pauseVideo()
  }, [])

  /** Seconds into the song, or null before the player is ready. */
  const position = useCallback((): number | null => {
    try {
      return player.current?.getCurrentTime() ?? null
    } catch {
      return null
    }
  }, [])

  return { mode, hint, failed, onReady, onStateChange, onError, cue, prime, start, seek, pause, resume, stop, position }
}
