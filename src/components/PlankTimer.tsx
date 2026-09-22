import { useCallback, useEffect, useRef, useState } from 'react'
import { ALBUMS, formatDuration, type Song } from '../data/songs'
import { useWakeLock } from '../lib/hooks'
import type { Completion, Pause, Prefs } from '../lib/progress'
import { pausedSeconds } from '../lib/share'
import { sounds, unlockAudio } from '../lib/sound'
import { youtubeUrl } from '../lib/youtube'
import { ConfirmDialog } from './ConfirmDialog'
import { Flame, Icon } from './Icon'
import { PlankReceipt } from './Receipt'
import { SaveNote } from './SaveNote'
import { Sleeve } from './Sleeve'
import { SongLine } from './SongRow'
import { useMusic, type PlayerEvents } from './useMusic'
import { YouTubeEmbed } from './YouTubeEmbed'

export interface PlankSession {
  song: Song
  /** Shown in the top bar, e.g. "Today's song" or "Level 12 of 243". */
  label: string
}

export interface FinishSummary {
  counted: Completion[]
  streak: number
  /** Tomorrow's ladder level, when this plank finished today's. */
  next: { level: number; song: Song } | null
}

/** One finished plank, as it gets shared. */
export interface PlankShare {
  song: Song
  pauses: Pause[]
  counted: Completion[]
}

interface Props {
  session: PlankSession
  prefs: Prefs
  onFinish: (song: Song, pauses: Pause[]) => FinishSummary
  onShare: (plank: PlankShare) => void
  onClose: () => void
  /** Set when accounts are on and nobody's signed in. */
  onSignIn?: () => void
}

/**
 * ready      waiting for Start
 * countdown  3, 2, 1
 * waiting    countdown over, waiting for the song to actually play
 * running    planking
 * paused     song and timer both stopped
 */
type Phase = 'ready' | 'countdown' | 'waiting' | 'running' | 'paused' | 'done' | 'quit'

/**
 * video   the timer reads the song's position, so the two can never drift apart
 * manual  no playable track (or music off): the timer keeps its own time
 */
type ClockSource = 'video' | 'manual'

/** Breaks shorter than this are fumbles, not pauses. */
const MIN_PAUSE_MS = 1000
/** Song position not moving for this long while planking: an ad, buffering, or it never started. */
const STALL_MS = 1500

function coachLine(elapsed: number, total: number): string {
  const remaining = total - elapsed
  if (remaining <= 10_000) return 'Final ten. Hold it!'
  if (remaining <= 30_000) return 'Last 30 seconds!'
  if (elapsed >= total / 2) return 'Past halfway. Breathe.'
  if (elapsed >= total / 4) return 'Hips level. Keep breathing.'
  return 'Elbows under shoulders. Squeeze everything.'
}

export function PlankTimer({ session, prefs, onFinish, onShare, onClose, onSignIn }: Props) {
  const { song } = session
  const album = ALBUMS[song.album]
  const total = song.seconds * 1000

  // The player's events are wired up before the handlers below exist, so route them through a ref.
  const events = useRef<PlayerEvents>({})
  const music = useMusic(song, prefs.music, {
    onPlaying: () => events.current.onPlaying?.(),
    onPaused: () => events.current.onPaused?.(),
    onEnded: () => events.current.onEnded?.(),
  })
  const musicRef = useRef(music)
  musicRef.current = music

  const [phase, setPhaseState] = useState<Phase>('ready')
  const phaseRef = useRef<Phase>('ready')
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  const [source, setSourceState] = useState<ClockSource>(music.mode === 'video' ? 'video' : 'manual')
  const sourceRef = useRef(source)
  const setSource = (next: ClockSource) => {
    sourceRef.current = next
    setSourceState(next)
  }

  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [stalled, setStalled] = useState(false)
  const [pauses, setPauses] = useState<Pause[]>([])
  const [summary, setSummary] = useState<FinishSummary | null>(null)
  const [askingToStop, setAskingToStop] = useState(false)

  const clock = useRef({ startedAt: 0, banked: 0 }) // manual clock
  const anchor = useRef({ pos: 0, at: 0 }) // last song position the player reported, and when
  const playing = useRef(false) // the player says the song is playing
  const pausesRef = useRef<Pause[]>([])
  const pauseStart = useRef<{ at: number; t: number } | null>(null)
  const progress = useRef({ ms: 0, at: 0 }) // for spotting stalls
  const stalledRef = useRef(false)
  const lastBeep = useRef(Infinity)
  const finished = useRef(false)

  const active = phase === 'countdown' || phase === 'waiting' || phase === 'running' || phase === 'paused'
  useWakeLock(active)

  useEffect(() => {
    document.body.classList.add('no-scroll')
    return () => document.body.classList.remove('no-scroll')
  }, [])

  const readElapsed = useCallback((): number => {
    const now = performance.now()
    if (sourceRef.current === 'video') {
      const pos = musicRef.current.position()
      if (pos !== null && Math.abs(pos - anchor.current.pos) > 0.001) anchor.current = { pos, at: now }
      // Smooth over the gaps between the player's position reports.
      const drift = playing.current ? Math.min(now - anchor.current.at, 400) : 0
      return Math.min(total, anchor.current.pos * 1000 + drift)
    }
    return clock.current.banked + (phaseRef.current === 'running' ? now - clock.current.startedAt : 0)
  }, [total])

  const beginPause = (atMs: number) => {
    pauseStart.current ??= { at: atMs / 1000, t: performance.now() }
  }

  const endPause = () => {
    const open = pauseStart.current
    if (!open) return
    pauseStart.current = null
    const ms = performance.now() - open.t
    if (ms < MIN_PAUSE_MS) return
    pausesRef.current = [...pausesRef.current, { at: Math.round(open.at * 10) / 10, ms: Math.round(ms) }]
    setPauses(pausesRef.current)
  }

  const run = () => {
    endPause()
    progress.current = { ms: readElapsed(), at: performance.now() }
    setPhase('running')
  }

  const reset = () => {
    pausesRef.current = []
    pauseStart.current = null
    setPauses([])
    finished.current = false
    lastBeep.current = Infinity
    anchor.current = { pos: 0, at: performance.now() }
    clock.current = { startedAt: performance.now(), banked: 0 }
    setElapsed(0)
    setStalled(false)
    stalledRef.current = false
  }

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    endPause()
    setElapsed(total)
    setPhase('done')
    if (prefs.sounds) sounds.finish()
    navigator.vibrate?.([200, 100, 200])
    setSummary(onFinish(song, pausesRef.current))
  }, [onFinish, prefs.sounds, song, total, setPhase])

  // The song drives the timer: playing, pausing (even from the video itself) and ending all carry over.
  events.current = {
    onPlaying: () => {
      playing.current = true
      if (sourceRef.current !== 'video') return
      const current = phaseRef.current
      if (current === 'ready' || current === 'countdown') {
        // They pressed play on the video itself: the plank starts with the song.
        reset()
        run()
      } else if (current === 'waiting' || current === 'paused') {
        run()
      }
    },
    onPaused: () => {
      playing.current = false
      if (sourceRef.current === 'video' && phaseRef.current === 'running') {
        beginPause(readElapsed())
        setPhase('paused')
      }
    },
    onEnded: () => {
      playing.current = false
      if (sourceRef.current === 'video' && (phaseRef.current === 'running' || phaseRef.current === 'paused')) finish()
    },
  }

  // The track turned out not to play here (embedding blocked): carry on with the timer alone.
  useEffect(() => {
    if (music.mode === 'video' || sourceRef.current !== 'video') return
    const soFar = anchor.current.pos * 1000
    setSource('manual')
    clock.current = { startedAt: performance.now(), banked: phaseRef.current === 'waiting' ? 0 : soFar }
    if (phaseRef.current === 'waiting') run()
  }, [music.mode])

  // 3, 2, 1, go.
  useEffect(() => {
    if (phase !== 'countdown') return
    const timers = [3, 2, 1].map((n, i) =>
      setTimeout(() => {
        setCount(n)
        if (prefs.sounds) sounds.tick()
      }, i * 1000),
    )
    timers.push(
      setTimeout(() => {
        if (prefs.sounds) sounds.go()
        if (sourceRef.current === 'video') {
          // The timer starts when the song does, not a moment before.
          setPhase('waiting')
          musicRef.current.start()
        } else {
          clock.current = { startedAt: performance.now(), banked: 0 }
          run()
        }
      }, 3000),
    )
    return () => timers.forEach(clearTimeout)
  }, [phase, prefs.sounds])

  // Redraw every frame; the time itself always comes from the song or the timestamps.
  useEffect(() => {
    if (phase !== 'running') return
    let frame = 0
    const tick = () => {
      const now = performance.now()
      const ms = readElapsed()
      if (ms >= total) return finish()
      if (ms > progress.current.ms + 1) progress.current = { ms, at: now }
      const isStalled = sourceRef.current === 'video' && now - progress.current.at > STALL_MS
      if (isStalled !== stalledRef.current) {
        stalledRef.current = isStalled
        setStalled(isStalled)
      }
      const secondsLeft = Math.ceil((total - ms) / 1000)
      if (secondsLeft <= 3 && secondsLeft < lastBeep.current) {
        lastBeep.current = secondsLeft
        if (prefs.sounds) sounds.tick()
      }
      setElapsed(ms)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    // requestAnimationFrame pauses in background tabs; this keeps the finish on time.
    const backup = setInterval(() => readElapsed() >= total && finish(), 500)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(backup)
    }
  }, [phase, total, finish, readElapsed, prefs.sounds])

  const start = () => {
    unlockAudio()
    music.cue()
    reset()
    setCount(3)
    setPhase('countdown')
  }

  const pause = () => {
    const ms = readElapsed()
    beginPause(ms)
    if (sourceRef.current === 'manual') clock.current.banked = ms
    setElapsed(ms)
    setPhase('paused')
    music.pause()
  }

  const resume = () => {
    if (sourceRef.current === 'manual') clock.current.startedAt = performance.now()
    // With the song as the clock, the timer holds still until the music is really back.
    else music.resume()
    run()
  }

  const startWithoutMusic = () => {
    music.stop()
    setSource('manual')
    clock.current = { startedAt: performance.now(), banked: 0 }
    run()
  }

  const cancel = () => {
    music.stop()
    setPhase('ready')
  }

  const giveUp = () => {
    const ms = readElapsed()
    pauseStart.current = null
    setElapsed(ms)
    setPhase('quit')
    music.stop()
  }

  const stop = () => {
    music.stop()
    onClose()
  }

  // Mid-plank, ask first. The song and the timer carry on while you decide.
  const close = () => (active ? setAskingToStop(true) : stop())
  const confirming = askingToStop && active

  const closeRef = useRef(close)
  closeRef.current = close
  const spaceRef = useRef<() => void>(() => {})
  spaceRef.current = () => {
    if (phase === 'ready' || phase === 'quit') start()
    else if (phase === 'running') pause()
    else if (phase === 'paused') resume()
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog on top (stop, sign in) handles its own keys: Escape closes it, Space types or presses.
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') {
        // Claim the key, or the browser treats it as "close the top dialog" and shuts the one it just opened.
        event.preventDefault()
        closeRef.current()
      }
      if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        spaceRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const synced = source === 'video'
  const secondsLeft = Math.ceil((total - elapsed) / 1000)
  const clockLabel = {
    ready: 'Plank length',
    countdown: 'Get ready',
    waiting: 'Starting the song',
    running: 'Time left',
    paused: 'Paused',
    quit: 'You held',
    done: '',
  }[phase]
  const clockValue =
    phase === 'countdown'
      ? String(count)
      : formatDuration(phase === 'ready' || phase === 'waiting' ? song.seconds : phase === 'quit' ? elapsed / 1000 : secondsLeft)
  const coach = {
    ready: synced
      ? 'Get into position, then press Start. The timer runs with the song: pause one and both stop.'
      : "Get into position, then press Start. You'll get a 3-second countdown.",
    countdown: 'Get into position.',
    waiting: music.hint ?? 'Starting the song…',
    running: stalled ? (playing.current ? 'Waiting for the song…' : 'Tap ▶ on the video to carry on.') : coachLine(elapsed, total),
    paused: synced ? 'Paused. The song waits with you.' : 'Paused. Take a breath.',
    quit: `of ${formatDuration(song.seconds)}. Every second counts. Go again when you're ready.`,
    done: '',
  }[phase]

  return (
    <div className="plank" role="dialog" aria-modal="true" aria-label={`Plank to ${song.title}`}>
      <div className="plank-inner">
        <div className="plank-top">
          <p className="plank-label">{session.label}</p>
          <button type="button" className="icon-btn" onClick={close} aria-label={active ? 'Stop plank' : 'Close'}>
            <Icon name="x" />
          </button>
        </div>

        {phase === 'done' && summary ? (
          <DoneView song={song} summary={summary} pauses={pauses} onSignIn={onSignIn} />
        ) : (
          <div className="plank-body">
            <div className="plank-song">
              <Sleeve album={album} size="md" />
              <div className="plank-song-text">
                <h2 className="plank-title">{song.title}</h2>
                <p className="plank-album">
                  {album.title} ({album.year})
                </p>
              </div>
            </div>

            <div className="plank-clock" role="timer" aria-label={`${clockLabel} ${clockValue}`}>
              <p className="plank-clock-label">{clockLabel}</p>
              <p
                key={phase === 'countdown' ? count : 'time'}
                className={`plank-time${clockValue.length > 4 ? ' long' : ''}${phase === 'countdown' ? ' counting' : ''}`}
              >
                {clockValue}
              </p>
            </div>

            <div className="plank-progress">
              <div className="bar">
                <span style={{ width: `${Math.min(1, elapsed / total) * 100}%`, background: album.color }} />
              </div>
              <div className="plank-progress-times">
                <span>{formatDuration(elapsed / 1000)}</span>
                {pauses.length > 0 && (
                  <span className="plank-pauses">
                    {pauses.length} {pauses.length === 1 ? 'pause' : 'pauses'}, {formatDuration(pausedSeconds(pauses))}
                  </span>
                )}
                <span>{formatDuration(song.seconds)}</span>
              </div>
            </div>

            <p className="plank-coach" aria-live="polite">
              {coach}
            </p>
          </div>
        )}

        <MusicStrip song={song} music={music} phase={phase} />

        <div className="plank-actions">
          {phase === 'ready' && (
            <button type="button" className="btn btn-primary btn-lg" onClick={start} autoFocus>
              Start
            </button>
          )}
          {phase === 'countdown' && (
            <button type="button" className="btn btn-secondary btn-lg" onClick={cancel}>
              Cancel
            </button>
          )}
          {phase === 'waiting' && (
            <>
              <button type="button" className="btn btn-secondary btn-lg" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-secondary btn-lg" onClick={startWithoutMusic}>
                Start without music
              </button>
            </>
          )}
          {(phase === 'running' || phase === 'paused') && (
            <>
              <button type="button" className="btn btn-secondary btn-lg" onClick={giveUp}>
                Give up
              </button>
              {phase === 'running' ? (
                <button type="button" className="btn btn-primary btn-lg" onClick={pause}>
                  Pause
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-lg" onClick={resume} autoFocus>
                  Resume
                </button>
              )}
            </>
          )}
          {phase === 'quit' && (
            <>
              <button type="button" className="btn btn-secondary btn-lg" onClick={close}>
                Close
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={start} autoFocus>
                Try again
              </button>
            </>
          )}
          {phase === 'done' && summary && (
            <>
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => onShare({ song, pauses, counted: summary.counted })}>
                Share
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={onClose} autoFocus>
                Done
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Stop this plank?"
        confirmLabel="Stop plank"
        cancelLabel="Keep going"
        destructive
        onConfirm={stop}
        onCancel={() => setAskingToStop(false)}
      >
        <p>
          {phase === 'running' || phase === 'paused' ? `You've held ${formatDuration(elapsed / 1000)} so far. ` : ''}
          It only counts if you hold it to the end of the song.
        </p>
      </ConfirmDialog>
    </div>
  )
}

function DoneView({
  song,
  summary,
  pauses,
  onSignIn,
}: {
  song: Song
  summary: FinishSummary
  pauses: Pause[]
  onSignIn?: () => void
}) {
  const ladder = summary.counted.find((c) => c.mode === 'ladder')
  const daily = summary.counted.some((c) => c.mode === 'daily')
  const length = formatDuration(song.seconds)
  const [title, text] =
    ladder && daily
      ? ['Two for one.', `${song.title} counted for today's song and level ${ladder.level}.`]
      : ladder
        ? [`Level ${ladder.level} done.`, `You held a plank for all of ${song.title}, ${length}.`]
        : daily
          ? ["Today's song, done.", `You held a plank for all of ${song.title}, ${length}.`]
          : ['Extra credit.', `Today was already in the bag. That's ${length} more.`]
  const next = summary.next

  return (
    <div className="plank-done">
      <div className="done-streak">
        <span className="done-num">{summary.streak}</span>
        <span className="done-unit">
          <Flame size={32} lit />
          day streak
        </span>
      </div>
      <h2 className="done-title">{title}</h2>
      <p className="done-text">{text}</p>

      <PlankReceipt seconds={song.seconds} pauses={pauses} />
      {onSignIn && <SaveNote onSignIn={onSignIn} className="done-save" />}

      {next && (
        <section className="done-next" aria-labelledby="done-next-heading">
          <div className="done-next-head">
            <h3 id="done-next-heading">Tomorrow</h3>
            <p className="meta">Level {next.level}</p>
          </div>
          <SongLine song={next.song} />
        </section>
      )}
    </div>
  )
}

function MusicStrip({ song, music, phase }: { song: Song; music: ReturnType<typeof useMusic>; phase: Phase }) {
  // The timer ends with the song, so once it's done the player has nothing left to play.
  if (music.mode === 'off' || phase === 'done') return null
  if (music.mode === 'link') {
    return (
      <div className="plank-music">
        <p className="music-note">
          <a href={youtubeUrl(song)} target="_blank" rel="noreferrer">
            Play {song.title} on YouTube
          </a>
          {music.failed && ' (this track only plays on YouTube)'}
          {phase === 'ready' && '. Start it playing, then press Start here.'}
        </p>
      </div>
    )
  }
  return (
    <div className="plank-music">
      <YouTubeEmbed videoId={song.youtubeId!} onReady={music.onReady} onStateChange={music.onStateChange} onError={music.onError} />
    </div>
  )
}
