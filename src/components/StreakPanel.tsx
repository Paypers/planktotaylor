import { useMemo, useState } from 'react'
import { ALBUMS, formatDuration } from '../data/songs'
import { addDays, fromDayKey, type DayKey } from '../lib/dates'
import { useAttempts } from '../lib/attempts'
import { allPlanks } from '../lib/planks'
import { songFor, type Completion } from '../lib/progress'
import type { PlayerRank } from '../lib/ranks'
import { streakRuns, type StreakInfo } from '../lib/streaks'
import { Flame, Icon } from './Icon'
import { RankBar } from './Rank'
import { SaveNote } from './SaveNote'
import { TimeSplit } from './TimeSplit'

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function StreakPanel({ completions, days, streak, today, onSignIn, rank, onHistory }: Props) {
  // Every plank held to the end, once each: goes again included, a two-for-one counted once.
  const attempts = useAttempts()
  const planks = useMemo(() => allPlanks(completions, attempts), [completions, attempts])
  const message = streak.doneToday
    ? 'Safe for today. See you tomorrow.'
    : streak.lastChance
      ? "Plank today's song to keep it going. A freeze can't cover today."
      : streak.atRisk
        ? "Plank today's song to keep it going."
        : "Plank today's song to start one."
  // The morning after a freeze kept the streak alive, say so, quietly.
  const yesterday = addDays(today, -1)
  const saved =
    streak.current === 0 || !streak.frozen.has(yesterday)
      ? null
      : streak.frozen.has(addDays(today, -2))
        ? 'Freezes saved your streak the last two days.'
        : 'A freeze saved your streak yesterday.'

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
          {streak.current > 0 && (
            <span className="streak-freezes" title="Streak freezes left this month">
              <Icon name="snowflake" size={18} />
              {streak.freezesLeft} left
              <span className="sr-only"> {streak.freezesLeft === 1 ? 'freeze' : 'freezes'} this month</span>
            </span>
          )}
        </div>
        <p className="streak-msg">{message}</p>
        {saved && (
          <p className="streak-saved">
            <Icon name="snowflake" size={16} />
            {saved}
          </p>
        )}
        {onSignIn && completions.length > 0 && <SaveNote onSignIn={onSignIn} className="streak-save" />}
        {rank && <RankBar rank={rank} linked />}
        <dl className="facts">
          <dt>Best streak</dt>
          <dd>{plural(streak.best, 'day')}</dd>
          <dt>Planks</dt>
          <dd>{planks.length}</dd>
        </dl>
        <TimeSplit planks={planks} />
        <div className="streak-history">
          <button type="button" className="btn btn-secondary" onClick={onHistory}>
            Plank history
          </button>
        </div>
      </div>
      <div className="streak-calendar">
        <Calendar completions={completions} days={days} frozen={streak.frozen} today={today} />
      </div>
    </section>
  )
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface CalendarProps {
  completions: Completion[]
  days: ReadonlySet<DayKey>
  /** Missed days a freeze covered. */
  frozen: ReadonlySet<DayKey>
  today: DayKey
}

function Calendar({ completions, days, frozen, today }: CalendarProps) {
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [selected, setSelected] = useState<DayKey>(today)
  const runs = useMemo(() => streakRuns(days, today), [days, today])
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
          const run = runs.lengths.get(day) ?? 0
          const runEnd = run >= 2 && runs.ends.has(day)
          const froze = frozen.has(day)
          const classes = [
            'day',
            streakDay && 'planked',
            planks && !streakDay && 'climbed',
            froze && 'frozen',
            day === today && 'today',
            day === selected && 'selected',
          ]
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
              aria-label={`${date}${streakDay ? ", planked today's song" : planks ? ', ladder levels only' : ''}${froze ? ', a freeze kept the streak' : ''}${runEnd ? `, end of a ${run}-day streak` : ''}${day === today ? ', today' : ''}`}
            >
              <span>{Number(day.slice(8))}</span>
              {froze && (
                <span className="day-frozen">
                  <Icon name="snowflake" size={12} />
                </span>
              )}
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
        {frozen.has(selected) && <p>A freeze kept your streak going.</p>}
        {selectedPlanks.length === 0 ? (
          !frozen.has(selected) && <p>{selected === today ? 'Nothing yet today.' : 'Rest day.'}</p>
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
