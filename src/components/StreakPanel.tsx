import { useMemo, useState } from 'react'
import { ALBUMS, formatDuration } from '../data/songs'
import { addDays, fromDayKey, type DayKey } from '../lib/dates'
import { songFor, totalSeconds, type Completion } from '../lib/progress'
import { runLengths, type StreakInfo } from '../lib/streaks'
import { Flame, Icon } from './Icon'
import { SaveNote } from './SaveNote'

interface Props {
  completions: Completion[]
  days: ReadonlySet<DayKey>
  streak: StreakInfo
  today: DayKey
  /** Set when accounts are on and nobody's signed in. */
  onSignIn?: () => void
}

function formatTotal(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (seconds >= 60) return `${m} min`
  return `${seconds} s`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function StreakPanel({ completions, days, streak, today, onSignIn }: Props) {
  const message = streak.doneToday
    ? 'Safe for today. See you tomorrow.'
    : streak.atRisk
      ? 'Plank today to keep it going.'
      : 'Finish any plank to start one.'

  return (
    <section className="section grid" aria-labelledby="streak-heading">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="streak-heading">Streak</h2>
      </div>
      <div className="streak-stats">
        <div className="streak-big">
          <span className="streak-num">{streak.current}</span>
          <span className="streak-unit">
            <Flame size={22} lit={streak.doneToday} />
            day streak
          </span>
        </div>
        <p className="streak-msg">{message}</p>
        {onSignIn && completions.length > 0 && <SaveNote onSignIn={onSignIn} className="streak-save" />}
        <dl className="facts">
          <dt>Best streak</dt>
          <dd>{plural(streak.best, 'day')}</dd>
          <dt>Planks</dt>
          <dd>{completions.length}</dd>
          <dt>Time planked</dt>
          <dd>{formatTotal(totalSeconds(completions))}</dd>
        </dl>
      </div>
      <div className="streak-calendar">
        <Calendar completions={completions} days={days} today={today} />
      </div>
    </section>
  )
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function Calendar({ completions, days, today }: { completions: Completion[]; days: ReadonlySet<DayKey>; today: DayKey }) {
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [selected, setSelected] = useState<DayKey>(today)
  const runs = useMemo(() => runLengths(days), [days])
  const byDay = useMemo(() => {
    const map = new Map<DayKey, Completion[]>()
    for (const c of completions) map.set(c.day, [...(map.get(c.day) ?? []), c])
    // Ladder first: that's the song whose colour paints the day.
    map.forEach((list) => list.sort((a, b) => (a.mode === 'ladder' ? -1 : b.mode === 'ladder' ? 1 : 0)))
    return map
  }, [completions])

  const first = `${month}-01`
  const firstDate = fromDayKey(first)
  const daysInMonth = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0).getDate()
  const cells: (DayKey | null)[] = [
    ...Array.from({ length: firstDate.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ]
  const shift = (delta: number) => {
    const d = new Date(firstDate.getFullYear(), firstDate.getMonth() + delta, 1, 12)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const title = firstDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const selectedPlanks = byDay.get(selected) ?? []

  return (
    <div className="calendar">
      <div className="calendar-head">
        <h3>{title}</h3>
        <div className="calendar-nav">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
            <Icon name="left" size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="Next month">
            <Icon name="right" size={18} />
          </button>
        </div>
      </div>
      <div className="calendar-grid" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="calendar-weekday">
            {d}
          </span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />
          const planks = byDay.get(day)
          const song = planks && songFor(planks[0])
          const album = song && ALBUMS[song.album]
          // The flame and count sit on the last day of each run of two or more days.
          const run = runs.get(day) ?? 0
          const runEnd = run >= 2 && !days.has(addDays(day, 1))
          const classes = ['day', planks && 'planked', day === today && 'today', day === selected && 'selected']
          const date = fromDayKey(day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
          return (
            <button
              type="button"
              key={day}
              className={classes.filter(Boolean).join(' ')}
              style={album ? { background: album.color, color: album.ink } : undefined}
              onClick={() => setSelected(day)}
              disabled={day > today}
              aria-pressed={day === selected}
              aria-label={`${date}${planks ? ', planked' : ''}${runEnd ? `, end of a ${run}-day streak` : ''}${day === today ? ', today' : ''}`}
            >
              <span>{Number(day.slice(8))}</span>
              {runEnd && (
                <span className="day-run">
                  <Icon name="flame" size={12} filled />
                  {run}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="calendar-detail" aria-live="polite">
        <strong>{fromDayKey(selected).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
        {selectedPlanks.length === 0 ? (
          <p>{selected === today ? 'Nothing yet today.' : 'Rest day.'}</p>
        ) : (
          selectedPlanks.map((c) => {
            const planked = songFor(c)
            if (!planked) return null
            return (
              <p key={c.mode}>
                {c.mode === 'daily' ? 'Daily song' : `Level ${c.level}`} · {planked.title} · {formatDuration(c.seconds)}
              </p>
            )
          })
        )}
      </div>
    </div>
  )
}
