import { useEffect, useState } from 'react'
import { ALBUMS, SONG_BY_ID, formatDuration } from '../data/songs'
import { pullAttempts } from '../lib/account'
import { useAttempts, type Attempt, type AttemptOutcome } from '../lib/attempts'
import { addDays, fromDayKey, toDayKey, todayKey } from '../lib/dates'
import type { Completion } from '../lib/progress'
import { useAppData } from '../lib/store'
import { attemptBreaks } from '../lib/timeline'
import { Dialog } from './Dialog'
import { PlankTimeline } from './PlankTimeline'

const OUTCOME: Record<AttemptOutcome, string> = {
  finished: 'Finished',
  'gave-up': 'Gave up',
  stopped: 'Stopped',
  left: 'Left the page',
  offline: 'Connection lost',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** Attempts shown at a time: the whole history can be thousands. */
const SHOWN = 100

function kindLabel(a: Attempt): string {
  if (a.kind === 'daily') return "Today's song"
  if (a.kind === 'extra') return "Today's song · extra credit"
  if (a.kind === 'practice') return `Level ${a.level} · practice`
  if (a.kind === 'era') {
    const song = SONG_BY_ID.get(a.songId)
    return song ? `${ALBUMS[song.album].short} · new release` : 'New release'
  }
  return `Level ${a.level}`
}

/** Every plank you've started, finished or not, newest first. Signed in, it includes your other devices. */
export function HistoryDialog({ open, onClose, signedIn }: { open: boolean; onClose: () => void; signedIn: boolean }) {
  return (
    <Dialog open={open} title="Plank history" onClose={onClose}>
      {open && <History signedIn={signedIn} />}
    </Dialog>
  )
}

function History({ signedIn }: { signedIn: boolean }) {
  const attempts = useAttempts()
  // Attempts saved before breaks were timed borrow them from the plank's record.
  const { completions } = useAppData()
  const [loading, setLoading] = useState(signedIn)
  const [shown, setShown] = useState(SHOWN)

  useEffect(() => {
    if (!signedIn) return
    pullAttempts()
      .catch((error) => console.error('Could not load attempts from account', error))
      .finally(() => setLoading(false))
  }, [signedIn])

  const newest = [...attempts].reverse().slice(0, shown)
  const finished = attempts.filter((a) => a.outcome === 'finished').length
  const today = todayKey()
  const heading = (day: string) =>
    day === today
      ? 'Today'
      : day === addDays(today, -1)
        ? 'Yesterday'
        : fromDayKey(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const days = [...new Set(newest.map((a) => toDayKey(new Date(a.startedAt))))]

  return (
    <>
      <p className="muted">
        {attempts.length === 0
          ? loading
            ? 'Loading…'
            : 'Nothing yet. Every plank you start shows up here, finished or not.'
          : `${plural(attempts.length, 'attempt')} · ${finished} finished. Every plank you start is here, however it ended.`}
      </p>
      {days.map((day) => (
        <section key={day} className="dialog-section history-day">
          <h3>{heading(day)}</h3>
          <ol className="attempts">
            {newest
              .filter((a) => toDayKey(new Date(a.startedAt)) === day)
              .map((a) => (
                <AttemptRow key={a.id} attempt={a} completions={completions} />
              ))}
          </ol>
        </section>
      ))}
      {attempts.length > shown && (
        <div className="button-row">
          <button type="button" className="btn btn-secondary" onClick={() => setShown((n) => n + SHOWN)}>
            Show older
          </button>
        </div>
      )}
    </>
  )
}

function AttemptRow({ attempt: a, completions }: { attempt: Attempt; completions: readonly Completion[] }) {
  const song = SONG_BY_ID.get(a.songId)
  const length = song?.seconds ?? a.reached
  const time = new Date(a.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const done = a.outcome === 'finished'
  return (
    <li className="attempt">
      <span className="attempt-time">{time}</span>
      <div className="attempt-main">
        <p className="attempt-song">{song?.title ?? 'A song no longer in the list'}</p>
        <p className="attempt-kind">
          {kindLabel(a)}
          {a.pauses > 0 && ` · ${plural(a.pauses, 'break')}`}
        </p>
      </div>
      <div className="attempt-end">
        <p className={`attempt-outcome${done ? ' done' : ''}`}>{OUTCOME[a.outcome]}</p>
        <p className="meta">
          {formatDuration(a.reached)} / {formatDuration(length)}
        </p>
      </div>
      <PlankTimeline seconds={length} reached={a.reached} breaks={attemptBreaks(a, completions)} breakCount={a.pauses} />
    </li>
  )
}
