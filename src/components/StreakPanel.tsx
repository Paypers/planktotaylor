import { useMemo, useState } from 'react'
import { ALBUMS, formatDuration } from '../data/songs'
import { addDays, fromDayKey, type DayKey } from '../lib/dates'
import { songFor, totalSeconds, type Completion } from '../lib/progress'
import type { PlayerRank } from '../lib/ranks'
import { runLengths, type StreakInfo } from '../lib/streaks'
import { Flame, Icon } from './Icon'
import { RankBar } from './Rank'
import { SaveNote } from './SaveNote'

interface Props {
  completions: Completion[]
  /** Days today's song was planked: the streak. */
  days: ReadonlySet<DayKey>
  streak: StreakInfo
  today: DayKey
  /** Set when accounts are on and nobody's signed in. */
  onSignIn?: () => void
  /** Signed-in players' rank. */
  rank?: PlayerRank | null
  onHistory: () => void
}

function formatTotal(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  if (seconds >= 60) return `${m} min`
  return `${seconds} s`
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function StreakPanel({ completions, days, streak, today, onSignIn, rank, onHistory }: Props) {
  const message = streak.doneToday
    ? 'Safe for today. See you tomorrow.'
    : streak.atRisk
      ? "Plank today's song to keep it going."
      : "Plank today's song to start one."

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
        {rank && <RankBar rank={rank} linked />}
        <dl className="facts">
          <dt>Best streak</dt>
          <dd>{plural(streak.best, 'day')}</dd>
          <dt>Planks</dt>
          <dd>{completions.length}</dd>
          <dt>Time planked</dt>
          <dd>{formatTotal(totalSeconds(completions))}</dd>
        </dl>
        <div className="streak-history">
          <button type="button" className="btn btn-secondary" onClick={onHistory}>
            Plank history
          </button>
        </div>
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
    // Today's song first: it paints the day. Days with only ladder levels are just outlined.
    map.forEach((list) => list.sort((a, b) => (a.mode === 'daily' ? -1 : b.mode === 'daily' ? 1 : a.at.localeCompare(b.at))))
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
          const streakDay = days.has(day)
          const song = streakDay && planks ? songFor(planks[0]) : undefined
          const album = song && ALBUMS[song.album]
          // The flame and count sit on the last day of each run of two or more days.
          const run = runs.get(day) ?? 0
          const runEnd = run >= 2 && !days.has(addDays(day, 1))
          const classes = ['day', streakDay && 'planked', planks && !streakDay && 'climbed', day === today && 'today', day === selected && 'selected']
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
              aria-label={`${date}${streakDay ? ", planked today's song" : planks ? ', ladder levels only' : ''}${runEnd ? `, end of a ${run}-day streak` : ''}${day === today ? ', today' : ''}`}
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
              <p key={`${c.mode}-${c.songId}`}>
                {c.mode === 'daily' ? "Today's song" : `Level ${c.level}`} · {planked.title} · {formatDuration(c.seconds)}
                {c.xp ? ` · +${c.xp} XP` : ''}
              </p>
            )
          })
        )}
      </div>
    </div>
  )
}
