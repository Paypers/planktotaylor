import type { CSSProperties } from 'react'
import { daysBetween, fromDayKey, type DayKey } from '../lib/dates'
import { lastRareDay } from '../lib/daily'

/**
 * All Too Well day's masthead: the rarest day on the calendar, when today's song is the 10 minute version. A red
 * knitted scarf laid across the top, autumn leaves drifting down behind the headline (still, for anyone who'd rather
 * no motion), and how rare it is: never twice in a year, and nobody knows when the next one is.
 */
export function AllTooWellMasthead({ today, dateline, number, done }: { today: DayKey; dateline: string; number: number; done: boolean }) {
  const last = lastRareDay(today)
  const since = last
    ? `The last one was ${fromDayKey(last).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}, ${daysBetween(last, today).toLocaleString()} days ago.`
    : 'The first one ever.'
  return (
    <section className="masthead grid atw-masthead" aria-labelledby="atw-heading">
      <div className="atw-scarf" aria-hidden="true" />
      <Leaves />
      <div className="masthead-meta">
        <p>{dateline}</p>
        <p>Daily No. {number}</p>
        <p className="atw-mark">All Too Well day</p>
      </div>
      <div className="masthead-body">
        <h1 className="headline" id="atw-heading">
          It's <em>All Too Well</em> day.
        </h1>
        <p className="lede">
          {done
            ? 'You held all ten minutes and thirteen seconds of the longest plank there is. See you at the next one, whenever that is.'
            : "Today's song is the 10 minute version: ten minutes and thirteen seconds, the longest plank there is. It comes round about once every year and a half, never twice in a year, and nobody knows when it's next."}
        </p>
        <p className="atw-since">{since}</p>
      </div>
    </section>
  )
}

/** Where each leaf starts across the masthead, how big, how fast, and where it rests when nothing moves. */
const LEAVES = [
  { x: 3, size: 26, time: 14, delay: -2, drift: 40, rest: 62, tone: 0 },
  { x: 11, size: 20, time: 18, delay: -11, drift: -30, rest: 18, tone: 2 },
  { x: 20, size: 30, time: 16, delay: -6, drift: 55, rest: 80, tone: 1 },
  { x: 30, size: 18, time: 20, delay: -15, drift: -45, rest: 35, tone: 3 },
  { x: 39, size: 24, time: 15, delay: -9, drift: 35, rest: 88, tone: 0 },
  { x: 48, size: 28, time: 17, delay: -1, drift: -25, rest: 12, tone: 2 },
  { x: 57, size: 21, time: 19, delay: -13, drift: 50, rest: 70, tone: 1 },
  { x: 66, size: 25, time: 16, delay: -4, drift: -40, rest: 44, tone: 3 },
  { x: 74, size: 19, time: 21, delay: -17, drift: 20, rest: 92, tone: 0 },
  { x: 82, size: 29, time: 15, delay: -7, drift: -35, rest: 26, tone: 1 },
  { x: 90, size: 22, time: 18, delay: -14, drift: 45, rest: 58, tone: 2 },
  { x: 97, size: 26, time: 17, delay: -10, drift: -20, rest: 76, tone: 0 },
]

function Leaves() {
  return (
    <div className="atw-leaves" aria-hidden="true">
      {LEAVES.map((leaf, i) => (
        <svg
          key={i}
          className={`atw-leaf tone-${leaf.tone}`}
          viewBox="0 0 24 24"
          style={
            {
              '--x': `${leaf.x}%`,
              '--size': `${leaf.size}px`,
              '--time': `${leaf.time}s`,
              '--delay': `${leaf.delay}s`,
              '--drift': `${leaf.drift}px`,
              '--rest': `${leaf.rest}%`,
            } as CSSProperties
          }
        >
          <path d="M12 1.5l1.4 3.7 2.1-1-.5 3.8 4.5-2.5-.9 3.5 3.9 1-3.3 2.6 1 1.8-4.8-.4.2 2.6-3-1.6-.6.6-.6-.6-3 1.6.2-2.6-4.8.4 1-1.8L1.5 10l3.9-1-.9-3.5L9 8l-.5-3.8 2.1 1z" />
          <path d="M12 15.6v5" className="atw-stem" />
        </svg>
      ))}
    </div>
  )
}
