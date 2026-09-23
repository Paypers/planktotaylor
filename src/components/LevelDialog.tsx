import { LADDER, type Song } from '../data/songs'
import { formatShortDate, type DayKey } from '../lib/dates'
import { ladderRecords, upgradeTarget, type Completion } from '../lib/progress'
import { plankXp, totalXp } from '../lib/xp'
import { youtubeUrl } from '../lib/youtube'
import { Dialog } from './Dialog'
import type { PlankSession } from './PlankTimer'
import { SongLine } from './SongRow'

interface Props {
  /** The level whose details are open, or null. */
  level: number | null
  /** Where you are on the ladder. */
  cursor: number
  completions: readonly Completion[]
  today: DayKey
  earningXp: boolean
  onClose: () => void
  /** Plank this song: your next level, or practice on one you've climbed. */
  onPlank: (session: PlankSession) => void
}

/** A level's details from the setlist. The ladder is climbed in order, so there's no moving to it. */
export function LevelDialog({ level, onClose, ...rest }: Props) {
  const song = level !== null ? (LADDER[level - 1] ?? null) : null
  return (
    <Dialog open={song !== null} title={level !== null ? `Level ${level}` : ''} onClose={onClose}>
      {song && level !== null && <LevelDetails song={song} level={level} {...rest} />}
    </Dialog>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function LevelDetails({ song, level, cursor, completions, today, earningXp, onPlank }: Omit<Props, 'level' | 'onClose'> & { song: Song; level: number }) {
  const mine = completions.filter((c) => c.songId === song.id)
  const record = ladderRecords(completions).get(song.id)
  const climb = mine.filter((c) => c.mode === 'ladder').sort((a, b) => a.at.localeCompare(b.at))[0]
  const target = upgradeTarget(completions, song.id, today)
  const bonus = target ? plankXp(song.seconds, []).total - totalXp(target) : 0

  // One line per plank; a two-for-one's two records share a finishing time.
  const planks = [...new Set(mine.map((c) => c.at))].sort().map((at) => {
    const records = mine.filter((c) => c.at === at)
    const ladderRecord = records.find((c) => c.mode === 'ladder')
    const what =
      records.some((c) => c.mode === 'daily') && ladderRecord
        ? `Today's song + level ${ladderRecord.level}`
        : ladderRecord
          ? `Level ${ladderRecord.level}`
          : "Today's song"
    const breaks = records[0].pauses?.length ?? 0
    const xp = totalXp(records)
    return { at, day: records[0].day, what, breaks, xp }
  })

  const status =
    level === cursor
      ? 'Up next on your ladder.'
      : record && climb
        ? record.clean
          ? `Climbed ${formatShortDate(climb.day)}, held with no breaks.`
          : `Climbed ${formatShortDate(climb.day)}, with ${plural(record.breaks, 'break')} at best.`
        : level < cursor
          ? 'Moved past without planking it.'
          : `${plural(level - cursor, 'level')} above where you are. Climb up to it to plank it.`

  return (
    <>
      <SongLine song={song} />
      <p className="level-status">{status}</p>
      {record && !record.clean && bonus > 0 && (
        <p className="fine level-bonus">
          {earningXp
            ? `Plank it again with no breaks for the no-break bonus: +${bonus.toLocaleString()} XP.`
            : 'Plank it again with no breaks to clear it clean.'}
        </p>
      )}

      <div className="button-row">
        {level === cursor && (
          <button type="button" className="btn btn-primary" onClick={() => onPlank({ song, label: `Level ${level} of ${LADDER.length}`, kind: 'ladder', level })}>
            Start level {level}
          </button>
        )}
        {record && level !== cursor && (
          <button type="button" className="btn btn-secondary" onClick={() => onPlank({ song, label: `Level ${level} · practice`, kind: 'practice', level })}>
            Plank it again
          </button>
        )}
        <a className="btn btn-link" href={youtubeUrl(song)} target="_blank" rel="noreferrer">
          Listen on YouTube
        </a>
      </div>
      {record && level !== cursor && <p className="fine">Practice doesn't move your ladder.</p>}

      {planks.length > 0 && (
        <section className="dialog-section">
          <h3>Your planks of this song</h3>
          <ul className="level-planks">
            {planks.map((p) => (
              <li key={p.at}>
                <span>
                  {formatShortDate(p.day)} · {p.what}
                </span>
                <span className="meta">
                  {p.breaks ? plural(p.breaks, 'break') : 'no breaks'}
                  {p.xp > 0 && ` · +${p.xp} XP`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
