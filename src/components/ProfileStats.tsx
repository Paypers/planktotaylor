import { useMemo, type ReactNode } from 'react'
import { formatDuration } from '../data/songs'
import { ATTEMPTS_KEPT, useAttempts } from '../lib/attempts'
import { plankStats, timePlankedLine } from '../lib/plankStats'

/** In your profile: your planks in numbers. Only what you've done, never what you didn't finish. */
export function ProfileStats() {
  const attempts = useAttempts()
  const stats = useMemo(() => plankStats(attempts), [attempts])
  return (
    <section className="dialog-section" aria-labelledby="profile-stats">
      <h3 id="profile-stats">Your planks</h3>
      {attempts.length === 0 ? (
        <p className="muted">Your numbers show here after your first plank.</p>
      ) : (
        <>
          <dl className="stat-grid">
            <Stat label="Time planked" value={timePlankedLine(stats.timePlanked)} />
            <Stat label="Held to the end" value={stats.finished.toLocaleString()} />
            {stats.noBreaks > 0 && <Stat label="With no breaks" value={stats.noBreaks.toLocaleString()} />}
            {stats.longestUnbroken && (
              <Stat label="Longest without a break" value={formatDuration(stats.longestUnbroken.seconds)} note={stats.longestUnbroken.song.title} />
            )}
            {stats.longest && <Stat label="Longest song held" value={formatDuration(stats.longest.seconds)} note={stats.longest.title} />}
            {stats.shortest && stats.shortest !== stats.longest && (
              <Stat label="Shortest song held" value={formatDuration(stats.shortest.seconds)} note={stats.shortest.title} />
            )}
            {stats.mostPlanked && <Stat label="Most planked" value={`${stats.mostPlanked.times}×`} note={stats.mostPlanked.song.title} />}
          </dl>
          {attempts.length >= ATTEMPTS_KEPT && <p className="fine">From your last {ATTEMPTS_KEPT.toLocaleString()} goes.</p>}
        </>
      )}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        <span className="stat-value">{value}</span>
        {note && <span className="stat-note">{note}</span>}
      </dd>
    </div>
  )
}
