import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ALBUMS, LADDER, formatDuration, type Album, type AlbumId, type Song } from '../data/songs'
import { useWakeLock } from '../lib/hooks'
import type { Completion, Pause, PlankResult, Prefs } from '../lib/progress'
import type { PlayerRank } from '../lib/ranks'
import { pausedSeconds, plankHeadline } from '../lib/share'
import { beginAttempt, endAttempt, getAttempts, ghostFor, saveAttemptProgress, type AttemptKind, type AttemptOutcome } from '../lib/attempts'
import type { Collection, StampNews } from '../lib/eras'
import { LIGHT_SHOW_MS, LIGHT_SIZE, lightTimes, placeLight, type Box } from '../lib/lights'
import { sounds, unlockAudio } from '../lib/sound'
import { getData } from '../lib/store'
import { LIGHT_XP, MARATHON_SECONDS, type XpAward } from '../lib/xp'
import { youtubeUrl } from '../lib/youtube'
import { ConfirmDialog } from './ConfirmDialog'
import { Confetti } from './Confetti'
import { StampMark } from './EraBadge'
import { Flame, Icon } from './Icon'
import { RankBar, RankPlaque } from './Rank'
import { RankEmblem } from './RankEmblem'
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
  /** What the plank is for, as it's written in the attempt history. */
  kind: AttemptKind
  /** The ladder level, for a climb or practice. */
  level?: number
}

export interface FinishSummary {
  counted: Completion[]
  /** Days in a row you've planked today's song. */
  streak: number
  /** The next ladder level, when this plank climbed one. */
  next: { level: number; song: Song } | null
  /** What the plank was worth. Null when accounts are off. */
  xp: FinishXp | null
  /** Practice on a ladder level already climbed (from the setlist): it doesn't move the ladder. */
  practiceLevel: number | null
  /** Collect the eras: a first stamp or a gold one, if this plank made one. */
  stamp: StampNews | null
  /** The song's album (or release) after this plank. */
  collection: Collection | null
}

export interface FinishXp {
  /** What this go is worth on its own. */
  award: XpAward
  /** False for a signed-out player: shown as what they would have earned. */
  earned: boolean
  /** XP actually added. Less than the award for a replay: only a first no-break go earns more. */
  gained: number
  kind: PlankResult['kind']
  /** Holding this song with no breaks would still earn the no-break bonus. */
  bonusLeft: boolean
  /** Aurora lights caught, and the part of the XP they paid (or would have, signed out). */
  lights: number
  lightXp: number
  /** Your rank before and after this plank: a climb can move it as well as XP. */
  rankBefore: PlayerRank
  rankAfter: PlayerRank
}

/** One finished plank, as it gets shared. */
export interface PlankShare {
  song: Song
  pauses: Pause[]
  counted: Completion[]
  /** Aurora lights caught. */
  lights: number
}

interface Props {
  session: PlankSession
  prefs: Prefs
  /** Signed in: planks earn XP, lights included. */
  earningXp: boolean
  onFinish: (song: Song, pauses: Pause[], lights: number) => FinishSummary
  onShare: (plank: PlankShare) => void
  onClose: () => void
  /** Set when accounts are on and nobody's signed in. */
  onSignIn?: () => void
  /** Go straight on to another plank (the next ladder level). */
  onNext: (session: PlankSession) => void
  /** Close the plank screen and open an album's page in Collect the eras. */
  onOpenEra: (album: AlbumId) => void
}

/**
 * ready      waiting for Start
 * countdown  3, 2, 1
 * waiting    countdown over, waiting for the song to actually play
 * running    planking
 * paused     song and timer both stopped
 * done       held to the end
 * quit       ended early: gave up, went offline or left
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
/** While the song is stuck, how often to check whether the internet has gone. */
const STALL_CHECK_MS = 5000

/** True when the site can still be reached. navigator.onLine alone misses a connection that's up but dead. */
async function isOnline(): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}favicon.svg?online=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    return response.ok
  } catch {
    return false
  }
}

function coachLine(elapsed: number, total: number): string {
  const remaining = total - elapsed
  if (remaining <= 10_000) return 'Final ten. Hold it!'
  if (remaining <= 30_000) return 'Last 30 seconds!'
  if (elapsed >= total / 2) return 'Past halfway. Breathe.'
  if (elapsed >= total / 4) return 'Hips level. Keep breathing.'
  return 'Elbows under shoulders. Squeeze everything.'
}

export function PlankTimer({ session, prefs, earningXp, onFinish, onShare, onClose, onSignIn, onNext, onOpenEra }: Props) {
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
  /** Your ghost: your best on this song so far, in seconds (null once it's finished). Worked out as each go starts. */
  const findGhost = () => ghostFor(song.id, getAttempts(), getData().completions.some((c) => c.songId === song.id))
  const [ghost, setGhost] = useState(findGhost)
  const ghostRef = useRef(ghost)
  const [passedGhost, setPassedGhost] = useState(false)
  const passedGhostRef = useRef(false)
  /** "Past your best!" in place of the coach line, for a moment. */
  const [cheering, setCheering] = useState(false)
  // Aurora lights: when each one appears (song time), the one showing, and how many have been caught.
  const lightPlan = useRef<number[]>([])
  const nextLight = useRef(0)
  const [light, setLightState] = useState<ShownLight | null>(null)
  const lightRef = useRef<ShownLight | null>(null)
  const showLight = (next: ShownLight | null) => {
    lightRef.current = next
    setLightState(next)
  }
  const [caught, setCaught] = useState(0)
  const caughtRef = useRef(0)
  /** "+5 ✨" rising from where each light was caught. */
  const [sparks, setSparks] = useState<ShownLight[]>([])
  const root = useRef<HTMLDivElement>(null)
  // Lights pay only on a plank that pays XP anyway: today's song, or a ladder level the first time.
  const [lightsPay] = useState(
    () =>
      earningXp &&
      (session.kind === 'daily' ||
        (session.kind === 'ladder' && !getData().completions.some((c) => c.mode === 'ladder' && c.songId === song.id))),
  )
  /** Why a plank ended early: shown on the quit screen. */
  const [endReason, setEndReason] = useState<'gave-up' | 'offline' | 'left'>('gave-up')
  /** The attempt on the record, from the moment the plank begins until it ends, however it ends. */
  const attempt = useRef<string | null>(null)

  const clock = useRef({ startedAt: 0, banked: 0 }) // manual clock
  const anchor = useRef({ pos: 0, at: 0 }) // last song position the player reported, and when
  const playing = useRef(false) // the player says the song is playing
  const pausesRef = useRef<Pause[]>([])
  const pauseStart = useRef<{ at: number; t: number } | null>(null)
  const progress = useRef({ ms: 0, at: 0 }) // for spotting stalls
  const stalledRef = useRef(false)
  const lastBeep = useRef(Infinity)
  // The halfway and last-30-seconds chimes: once each per plank.
  const chimed = useRef({ halfway: false, lastThirty: false })
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

  const readElapsedRef = useRef(readElapsed)
  readElapsedRef.current = readElapsed
  const breakCount = () => pausesRef.current.length + (pauseStart.current ? 1 : 0)

  /** Closes the attempt on the record, however the plank ended. */
  const endRecord = (outcome: AttemptOutcome, reachedMs: number) => {
    if (!attempt.current) return
    endAttempt(attempt.current, outcome, reachedMs / 1000, breakCount())
    attempt.current = null
  }

  const run = () => {
    endPause()
    progress.current = { ms: readElapsed(), at: performance.now() }
    // The plank begins (or carries on after a pause): from here it's on the record.
    attempt.current ??= beginAttempt({ songId: song.id, kind: session.kind, level: session.level })
    setPhase('running')
  }

  const reset = () => {
    pausesRef.current = []
    pauseStart.current = null
    setPauses([])
    finished.current = false
    lastBeep.current = Infinity
    chimed.current = { halfway: false, lastThirty: false }
    // Before this go is on the record, so it never counts towards its own ghost.
    ghostRef.current = findGhost()
    setGhost(ghostRef.current)
    passedGhostRef.current = false
    setPassedGhost(false)
    setCheering(false)
    lightPlan.current = prefs.lights ? lightTimes(total) : []
    nextLight.current = 0
    showLight(null)
    caughtRef.current = 0
    setCaught(0)
    setSparks([])
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
    endRecord('finished', total)
    setElapsed(total)
    setPhase('done')
    if (prefs.sounds) sounds.finish()
    navigator.vibrate?.([200, 100, 200])
    setSummary(onFinish(song, pausesRef.current, caughtRef.current))
  }, [onFinish, prefs.sounds, song, total, setPhase])

  /**
   * Each frame of song: a light that's glowed long enough goes, and the next one comes when its time
   * does. One whose moment passed unseen (a background tab) is skipped, and so is one with nowhere to go.
   */
  const lightTick = (ms: number) => {
    const shown = lightRef.current
    if (shown && ms > shown.at + LIGHT_SHOW_MS) showLight(null)
    const plan = lightPlan.current
    if (lightRef.current || nextLight.current >= plan.length || ms < plan[nextLight.current]) return
    while (nextLight.current < plan.length && ms > plan[nextLight.current] + LIGHT_SHOW_MS) nextLight.current++
    if (nextLight.current >= plan.length || ms < plan[nextLight.current]) return
    const at = plan[nextLight.current++]
    const spot = findLightSpot(root.current)
    if (!spot) return
    showLight({ id: at, at, ...spot })
    if (prefs.sounds) sounds.light()
  }
  const lightTickRef = useRef(lightTick)
  lightTickRef.current = lightTick

  const catchLight = () => {
    const shown = lightRef.current
    if (!shown) return
    caughtRef.current++
    setCaught(caughtRef.current)
    setSparks((all) => [...all, shown])
    setTimeout(() => setSparks((all) => all.filter((s) => s.id !== shown.id)), 1400)
    showLight(null)
    navigator.vibrate?.(30)
  }

  // A light only shows while the song plays: a break (or the end) and it's gone.
  useEffect(() => {
    if (phase !== 'running') showLight(null)
  }, [phase])

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
      // Heard with your face to the floor. Both at once (back from a background tab): just the later one.
      if (!chimed.current.lastThirty && total - ms <= 30_000) {
        chimed.current = { halfway: true, lastThirty: true }
        if (prefs.sounds) sounds.lastThirty()
      } else if (!chimed.current.halfway && ms >= total / 2) {
        chimed.current.halfway = true
        if (prefs.sounds) sounds.halfway()
      }
      if (ghostRef.current !== null && !passedGhostRef.current && ms > ghostRef.current * 1000) {
        passedGhostRef.current = true
        setPassedGhost(true)
        setCheering(true)
        if (prefs.sounds) sounds.pastBest()
      }
      lightTickRef.current(ms)
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

  useEffect(() => {
    if (!cheering) return
    const timer = setTimeout(() => setCheering(false), 4000)
    return () => clearTimeout(timer)
  }, [cheering])

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

  /** Ends the plank early: it goes on the record as how far it got, and why it stopped. */
  const endEarly = (reason: 'gave-up' | 'offline' | 'left') => {
    const ms = readElapsed()
    endRecord(reason, ms)
    pauseStart.current = null
    setElapsed(ms)
    setEndReason(reason)
    setPhase('quit')
    music.stop()
  }

  const giveUp = () => endEarly('gave-up')

  const stop = () => {
    endRecord('stopped', readElapsed())
    music.stop()
    onClose()
  }

  // Leaving or losing the connection ends the attempt on the spot: it's saved with how far it got.
  // Refs, so the listeners below always call the latest versions.
  const endEarlyRef = useRef(endEarly)
  endEarlyRef.current = endEarly
  useEffect(() => {
    const lost = () => attempt.current && endEarlyRef.current('offline')
    // Closing, refreshing or navigating away. (A phone that kills the tab outright is caught on the
    // next visit: the attempt ends where it was last saved.)
    const left = () => attempt.current && endEarlyRef.current('left')
    window.addEventListener('offline', lost)
    window.addEventListener('pagehide', left)
    return () => {
      window.removeEventListener('offline', lost)
      window.removeEventListener('pagehide', left)
      // The plank screen went away some other way mid-plank.
      if (attempt.current) endAttempt(attempt.current, 'stopped', readElapsedRef.current() / 1000, breakCount())
    }
  }, [])

  // Save the attempt's progress every couple of seconds, so however it ends, the record knows how far it got.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'paused') return
    const save = () => attempt.current && saveAttemptProgress(attempt.current, readElapsed() / 1000, breakCount())
    save()
    const timer = setInterval(save, 2000)
    return () => clearInterval(timer)
  }, [phase, readElapsed])

  // The song stuck mid-plank: fine if it's an ad or a slow load, over if the internet has gone.
  useEffect(() => {
    if (!stalled || phase !== 'running') return
    let live = true
    const timer = setInterval(() => {
      void isOnline().then((online) => live && !online && attempt.current && endEarlyRef.current('offline'))
    }, STALL_CHECK_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [stalled, phase])

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
    quit: { 'gave-up': 'You held', offline: 'Connection lost at', left: 'You left at' }[endReason],
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
    running: stalled
      ? playing.current
        ? 'Waiting for the song…'
        : 'Tap ▶ on the video to carry on.'
      : cheering
        ? 'Past your best!'
        : coachLine(elapsed, total),
    paused: synced ? 'Paused. The song waits with you.' : 'Paused. Take a breath.',
    quit: {
      'gave-up': `of ${formatDuration(song.seconds)}. Every second counts. It's in your plank history. Go again when you're ready.`,
      offline: `of ${formatDuration(song.seconds)}. Losing the connection ends the attempt. It's in your plank history. Go again when you're back online.`,
      left: `of ${formatDuration(song.seconds)}. Leaving the page ends the attempt. It's in your plank history.`,
    }[endReason],
    done: '',
  }[phase]

  return (
    <div ref={root} className="plank" role="dialog" aria-modal="true" aria-label={`Plank to ${song.title}`}>
      {prefs.lights && <Aurora album={album} on={phase === 'running'} />}
      <div className="plank-inner">
        <div className="plank-top">
          <p className="plank-label">{session.label}</p>
          <button type="button" className="icon-btn" onClick={close} aria-label={active ? 'Stop plank' : 'Close'}>
            <Icon name="x" />
          </button>
        </div>

        {phase === 'done' && summary ? (
          <DoneView
            song={song}
            kind={session.kind}
            summary={summary}
            pauses={pauses}
            lights={caught}
            onSignIn={onSignIn}
            onNext={onNext}
            onOpenEra={onOpenEra}
          />
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

            <div className={`plank-progress${ghost !== null ? ' has-ghost' : ''}`}>
              <div className="plank-bar">
                <div className="bar">
                  <span style={{ width: `${Math.min(1, elapsed / total) * 100}%`, background: album.color }} />
                </div>
                {ghost !== null && <GhostMarker at={ghost} length={song.seconds} passed={passedGhost} />}
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
            {prefs.lights && phase === 'ready' && (
              <p className="plank-lights-note">
                ✨ Lights will appear as you plank: tap one to catch it. Put your phone at least an arm's length away, so
                catching one means lifting an arm.
              </p>
            )}
            {prefs.lights && caught > 0 && phase !== 'ready' && (
              <p className="plank-lights-caught" aria-live="polite">
                ✨ {caught}
              </p>
            )}
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
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => onShare({ song, pauses, counted: summary.counted, lights: caught })}>
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
          It only counts if you hold it to the end of the song. Stopping ends this attempt, and it's saved in your
          plank history.
        </p>
      </ConfirmDialog>

      {light && (
        <button
          type="button"
          className="aurora-light"
          style={{ left: light.x, top: light.y, '--glow': album.color, '--glow-ink': album.ink } as CSSProperties}
          // The tap is the light's alone: it never reaches the video or anything under it.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            catchLight()
          }}
          aria-label="Catch the light"
        />
      )}
      {sparks.map((spark) => (
        <span key={spark.id} className="aurora-spark" style={{ left: spark.x, top: spark.y }} aria-hidden="true">
          {lightsPay ? `+${LIGHT_XP} ✨` : '✨'}
        </span>
      ))}
    </div>
  )
}

function DoneView({
  song,
  kind,
  summary,
  pauses,
  lights,
  onSignIn,
  onNext,
  onOpenEra,
}: {
  song: Song
  /** What the plank was started for. */
  kind: AttemptKind
  summary: FinishSummary
  pauses: Pause[]
  /** Aurora lights caught. Only ever shown when there were some. */
  lights: number
  onSignIn?: () => void
  onNext: (session: PlankSession) => void
  onOpenEra: (album: AlbumId) => void
}) {
  const ladder = summary.counted.find((c) => c.mode === 'ladder')
  const daily = summary.counted.some((c) => c.mode === 'daily')
  const length = formatDuration(song.seconds)
  const { next, xp, stamp, collection } = summary
  // A new release from its album page, that didn't count as today's song: it earns stamps, not XP.
  const fromAlbum = kind === 'era' && !daily && !ladder && collection
  const upgraded = xp?.kind === 'upgrade'
  const practice = summary.practiceLevel
  const title = fromAlbum
    ? stamp?.stamp === 'gold'
      ? 'Gold.'
      : stamp
        ? 'Collected.'
        : `${song.title}, again.`
    : upgraded
      ? 'Straight through.'
      : practice
        ? `Level ${practice}, again.`
        : plankHeadline(daily, ladder?.level)
  const text = fromAlbum
    ? stamp
      ? `You held a plank for all of ${song.title}, ${length}.`
      : `Another go at ${song.title}, ${length}.`
    : upgraded
      ? 'No breaks this time, so the no-break bonus is yours.'
      : practice
        ? `Another go at ${song.title}, ${length}. Practice doesn't move your ladder.`
        : ladder && daily
          ? `${song.title} counted for today's song and level ${ladder.level}.`
          : ladder || daily
            ? `You held a plank for all of ${song.title}, ${length}.`
            : `Today was already in the bag. That's ${length} more.`
  const rankedUp = !!xp?.earned && xp.rankAfter.step > xp.rankBefore.step
  const album = ALBUMS[song.album]

  return (
    <div className="plank-done">
      <div className="done-streak">
        {fromAlbum ? (
          // Planked for its stamp: show how much of the release is stamped.
          <>
            <span className="done-num">{collection.stamped}</span>
            <span className="done-unit">
              <span>of {collection.total}</span>
              in {collection.album.short}
            </span>
          </>
        ) : ladder && !daily ? (
          // A ladder level doesn't touch the streak, so show the climb instead.
          <>
            <span className="done-num">{ladder.level}</span>
            <span className="done-unit">
              <span>of {LADDER.length}</span>
              on your ladder
            </span>
          </>
        ) : (
          <>
            <span className="done-num">{summary.streak}</span>
            <span className="done-unit">
              <Flame size={32} lit />
              day streak
            </span>
          </>
        )}
        {(daily || rankedUp || stamp?.earned) && <Confetti colors={['var(--signal)', 'var(--held)', 'var(--paused)', album.color, 'var(--ink)']} />}
      </div>
      <h2 className="done-title">{title}</h2>
      <p className="done-text">{text}</p>
      {stamp && <StampLine news={stamp} song={song} onOpen={() => onOpenEra(stamp.collection.album.id)} />}

      <PlankReceipt seconds={song.seconds} pauses={pauses} />
      {lights > 0 && (
        <p className="done-lights">
          ✨ {lights} {lights === 1 ? 'light' : 'lights'} caught
        </p>
      )}

      {fromAlbum ? (
        <p className="save-note done-save">New releases planked from their album page earn stamps, not XP.</p>
      ) : xp?.earned ? (
        <XpEarned xp={xp} seconds={song.seconds} rankedUp={rankedUp} />
      ) : xp?.kind === 'new' && onSignIn ? (
        <p className="save-note done-save">
          This plank would have earned {(xp.award.total + xp.lightXp).toLocaleString()} XP.{' '}
          <button type="button" className="text-btn" onClick={onSignIn}>
            Sign in
          </button>{' '}
          to start earning XP.
        </p>
      ) : (
        onSignIn && <SaveNote onSignIn={onSignIn} className="done-save" />
      )}

      {next && (
        <section className="done-next" aria-labelledby="done-next-heading">
          <div className="done-next-head">
            <h3 id="done-next-heading">Up next</h3>
            <p className="meta">Level {next.level}</p>
          </div>
          <SongLine song={next.song} />
          <div>
            <button type="button" className="btn btn-secondary" onClick={() => onNext({ song: next.song, label: `Level ${next.level} of ${LADDER.length}`, kind: 'ladder', level: next.level })}>
              Keep climbing
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

/** What a plank did for Collect the eras: a new stamp, a gold one, a badge or a charm won. */
function StampLine({ news, song, onOpen }: { news: StampNews; song: Song; onOpen: () => void }) {
  const { collection, stamp, earned, allGold } = news
  const { album } = collection
  const prize = album.partOf ? 'charm' : 'badge'
  const gold = !!collection.stamps.find((s) => s.song.id === song.id)?.goldOn
  const line = earned
    ? `${album.title}, every song stamped: its ${prize} is yours.`
    : allGold
      ? `Every stamp on ${album.title} is gold: its ${prize} has a gold edge.`
      : stamp === 'gold'
        ? 'A gold stamp: held with no breaks.'
        : `Stamped into ${album.title}${gold ? ', in gold' : ''}: ${collection.stamped} of ${collection.total}.`
  return (
    <p className="done-stamp">
      <StampMark album={album} stamped gold={gold} />
      <span>
        {line}{' '}
        <button type="button" className="text-btn" onClick={onOpen}>
          See {album.partOf ? ALBUMS[album.partOf].short : album.short}
        </button>
      </span>
    </p>
  )
}

/** "+318 XP", where it came from, and the rank it moves you along. Replays say what's left to earn. */
function XpEarned({ xp, seconds, rankedUp }: { xp: FinishXp; seconds: number; rankedUp: boolean }) {
  const { award, gained } = xp
  const rank = xp.rankAfter
  const bonusName = seconds >= MARATHON_SECONDS ? 'marathon bonus (double XP)' : 'no-break bonus (+50%)'
  let total = `+${gained.toLocaleString()} XP`
  let detail: string
  if (gained === 0) {
    total = 'No new XP'
    detail = xp.bonusLeft
      ? `You've had this song's XP. Hold it with no breaks for the ${bonusName}.`
      : "You've already earned all the XP this song gives."
  } else if (gained < award.total) {
    // A replay held straight through after a go with breaks.
    detail = `${seconds >= MARATHON_SECONDS ? 'Marathon' : 'No-break'} bonus: straight through this time.`
  } else {
    const how =
      award.kind === 'marathon'
        ? `+${award.bonus.toLocaleString()} marathon bonus: no breaks on a song over 6 minutes`
        : award.kind === 'clean'
          ? `+${award.bonus.toLocaleString()} no-break bonus`
          : `Go again with no breaks for the ${bonusName}.`
    const lit = xp.lightXp > 0 ? ` · +${xp.lightXp.toLocaleString()} for ${xp.lights} ${xp.lights === 1 ? 'light' : 'lights'} ✨` : ''
    detail = `${award.base.toLocaleString()} for ${formatDuration(seconds)} of song · ${how}${lit}`
  }
  return (
    <section className="done-xp" aria-label="XP earned">
      <p className="done-xp-total">{total}</p>
      <p className="done-xp-detail">{detail}</p>
      {rankedUp && (
        <div className="done-rankup">
          <RankEmblem tier={rank.tier} size={120} />
          <p className="done-rankup-label">Rank up</p>
          <RankPlaque tier={rank.tier} division={rank.division} size="lg" />
        </div>
      )}
      <RankBar rank={rank} />
    </section>
  )
}

interface ShownLight {
  id: number
  /** When it appeared, in ms of song. */
  at: number
  x: number
  y: number
}

/**
 * Somewhere for a light on screen: within the plank's column, clear of the top bar, the timer, the
 * video and the buttons.
 */
function findLightSpot(plank: HTMLElement | null): { x: number; y: number } | null {
  const column = plank?.querySelector('.plank-inner')?.getBoundingClientRect()
  if (!plank || !column) return null
  const margin = 12
  const area: Box = { left: column.left + margin, top: margin, right: column.right - margin, bottom: window.innerHeight - margin }
  const avoid: Box[] = [...plank.querySelectorAll('.plank-top, .plank-clock, .plank-music, .plank-actions')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
  return placeLight(area, avoid, LIGHT_SIZE)
}

/** The aurora: soft light in the album's colour drifting behind the plank while the song plays. */
function Aurora({ album, on }: { album: Album; on: boolean }) {
  return (
    <div className={`aurora${on ? ' on' : ''}`} style={{ '--aurora': album.color, '--aurora-ink': album.ink } as CSSProperties} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  )
}

/** Your best so far on the progress bar. Once you're past it, it stays as a notch, without its label. */
function GhostMarker({ at, length, passed }: { at: number; length: number; passed: boolean }) {
  const percent = Math.min(100, (at / length) * 100)
  // Near either end the label leans inwards, so it never runs off the screen.
  const lean = percent < 15 ? '0' : percent > 85 ? '-100%' : '-50%'
  return (
    <span className={`ghost${passed ? ' passed' : ''}`} style={{ left: `${percent}%` }}>
      {!passed && (
        <span className="ghost-label" style={{ translate: `${lean} 0` }}>
          Your best: {formatDuration(at)}
        </span>
      )}
    </span>
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
