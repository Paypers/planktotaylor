import { useMemo } from 'react'
import { ALBUMS, LADDER, formatDuration, type AlbumId, type Song } from '../data/songs'
import { dailySong } from '../lib/daily'
import { formatShortDate, fromDayKey, type DayKey } from '../lib/dates'
import { eraOf, eraStamps, type Collection, type Era, type Stamp, type Upcoming } from '../lib/eras'
import type { Completion } from '../lib/progress'
import { ERAS, eraRoute, followLink, hashFor } from '../lib/route'
import { CharmMark, EraBadge, StampMark, type Charm } from './EraBadge'
import { Icon } from './Icon'
import { PageTop } from './PageTop'
import type { PlankSession } from './PlankTimer'

interface Props {
  /** The album whose page is open, or null for every album. */
  album: AlbumId | null
  completions: readonly Completion[]
  today: DayKey
  onStart: (session: PlankSession) => void
}

/** Where each launch song sits on the ladder, for "Level 57" beside a song still to stamp. */
const LADDER_LEVEL = new Map(LADDER.map((song, i) => [song.id, i + 1]))

const charmsOf = (era: Era): Charm[] => era.releases.map((r) => ({ album: r.album, won: !!r.earnedOn, gold: !!r.goldOn }))

/** Collect the eras: every album and how much of it is stamped, or one album's page. */
export function ErasPage({ album, completions, today, onStart }: Props) {
  const eras = useMemo(() => eraStamps(completions), [completions])
  const era = album ? eraOf(eras, album) : null
  return era ? <AlbumPage era={era} completions={completions} today={today} onStart={onStart} /> : <Index eras={eras} />
}

function Index({ eras }: { eras: Era[] }) {
  const won = eras.filter((era) => era.earnedOn).length
  const stamped = eras.reduce((n, era) => n + era.stamped + era.releases.reduce((m, r) => m + r.stamped, 0), 0)
  return (
    <div className="info-page eras-page">
      <PageTop title="Collect the eras" />

      <section className="section grid" aria-labelledby="eras-all">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="eras-all">Your eras</h2>
          <p className="label-meta">
            {won} of {eras.length} badges
          </p>
          <p className="label-note">
            {stamped === 0
              ? 'Every song you plank is stamped into its album.'
              : `${stamped.toLocaleString()} ${stamped === 1 ? 'song' : 'songs'} stamped so far.`}
          </p>
        </div>
        <div className="section-body">
          <ul className="era-grid">
            {eras.map((era) => (
              <li key={era.album.id}>
                <a className="era-card" href={hashFor(eraRoute(era.album.id))} onClick={(e) => followLink(e, eraRoute(era.album.id))}>
                  <EraBadge
                    album={era.album}
                    size={88}
                    progress={era.total ? era.stamped / era.total : 0}
                    won={!!era.earnedOn}
                    gold={!!era.goldOn}
                    charms={charmsOf(era)}
                  />
                  <span className="era-card-title">{era.album.title}</span>
                  <span className="era-card-meta">
                    {era.earnedOn ? (era.goldOn ? 'Badge won, all gold' : 'Badge won') : `${era.stamped} of ${era.total} stamped`}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section grid" aria-labelledby="eras-how">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="eras-how">How it works</h2>
        </div>
        <dl className="section-body rules">
          <dt>Stamps</dt>
          <dd>Plank a song, as today's song or a ladder level, and it's stamped into its album.</dd>
          <dt>Gold</dt>
          <dd>Hold it with no breaks, any time, and its stamp turns gold.</dd>
          <dt>Badges</dt>
          <dd>
            Stamp every song on an album and its badge is yours, on your Ranks page. When every stamp on it is gold, the
            badge gets a gold edge.
          </dd>
          <dt>New releases</dt>
          <dd>
            New songs premiere as today's song and join their album's page, each release with a charm of its own for
            stamping all of its songs. After its premiere day, plank a new song from here to stamp it: that earns stamps,
            not XP. A badge you've won stays when new songs join.
          </dd>
        </dl>
      </section>
    </div>
  )
}

function AlbumPage({ era, completions, today, onStart }: { era: Era; completions: readonly Completion[]; today: DayKey; onStart: (session: PlankSession) => void }) {
  const album = era.album
  const daily = dailySong(today)
  const dailyDone = completions.some((c) => c.mode === 'daily' && c.day === today)
  const total = era.total

  /** Start this song: as today's song when it is one and isn't done, otherwise from its album page (new releases only). */
  const startFor = (song: Song): (() => void) | null => {
    if (song.id === daily.id && !dailyDone) return () => onStart({ song, label: "Today's song", kind: 'daily' })
    if (ALBUMS[song.album].afterLaunch) return () => onStart({ song, label: `${ALBUMS[song.album].short} · new release`, kind: 'era' })
    return null
  }

  return (
    <div className="info-page eras-page">
      <div className="grid">
        <a className="page-back" href={hashFor(ERAS)} onClick={(e) => followLink(e, ERAS)}>
          <Icon name="left" size={18} />
          Collect the eras
        </a>
      </div>
      <PageTop title={album.title} />

      <section className="section grid" aria-labelledby="era-stamps">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="era-stamps">Stamps</h2>
          <p className="label-meta">
            {era.stamped} of {total}
          </p>
          {era.gold > 0 && <p className="label-note">{era.gold} gold</p>}
        </div>
        <div className="section-body">
          <div className="era-summary">
            <EraBadge album={album} size={120} progress={total ? era.stamped / total : 0} won={!!era.earnedOn} gold={!!era.goldOn} charms={charmsOf(era)} />
            <p>{badgeLine(era, 'badge')}</p>
          </div>
          <Tracks collection={era} today={today} startFor={startFor} />
        </div>
      </section>

      {era.releases.map((release) => (
        <section key={release.album.id} className="section grid" aria-labelledby={`era-${release.album.id}`}>
          <div className="section-rule" />
          <div className="section-label">
            <h2 id={`era-${release.album.id}`}>{release.album.short}</h2>
            <p className="label-meta">New release</p>
            {release.stamped > 0 && (
              <p className="label-note">
                {release.stamped} of {release.total} stamped
              </p>
            )}
          </div>
          <div className="section-body">
            <div className="era-release-head">
              <CharmMark charm={{ album: release.album, won: !!release.earnedOn, gold: !!release.goldOn }} />
              <p className="era-release-line">{badgeLine(release, 'charm')}</p>
            </div>
            <Tracks collection={release} today={today} startFor={startFor} />
          </div>
        </section>
      ))}
    </div>
  )
}

/** Where the badge (or charm) stands, in a line. */
function badgeLine(collection: Collection, prize: 'badge' | 'charm'): string {
  if (collection.earnedOn) {
    const won = `${prize === 'badge' ? 'Badge' : 'Charm'} won ${longDate(collection.earnedOn)}${collection.goldOn ? ', with a gold edge' : ''}.`
    return collection.newToStamp > 0 ? `${won} New: ${collection.newToStamp} ${collection.newToStamp === 1 ? 'song' : 'songs'} to stamp.` : won
  }
  if (collection.stamps.length === 0) return `Its songs premiere as today's song. Stamp them all for its ${prize}.`
  const left = collection.total - collection.stamped
  return `${left} ${left === 1 ? 'song' : 'songs'} to go for the ${prize}.`
}

const longDate = (day: DayKey) => fromDayKey(day).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

function Tracks({ collection, today, startFor }: { collection: Collection; today: DayKey; startFor: (song: Song) => (() => void) | null }) {
  const rows: (Stamp | Upcoming)[] = [...collection.stamps, ...collection.upcoming].sort((a, b) => a.song.track - b.song.track)
  return (
    <ol className="era-tracks">
      {rows.map((row) => ('stampedOn' in row ? <Track key={row.song.id} stamp={row} album={collection.album} today={today} start={startFor(row.song)} /> : <Soon key={row.song.id} upcoming={row} today={today} />))}
    </ol>
  )
}

function Track({ stamp, album, today, start }: { stamp: Stamp; album: Collection['album']; today: DayKey; start: (() => void) | null }) {
  const { song, stampedOn, goldOn } = stamp
  const level = LADDER_LEVEL.get(song.id)
  const note = goldOn ? 'Gold' : stampedOn ? `Stamped ${formatShortDate(stampedOn)}` : level ? `Ladder level ${level}` : ''
  const isToday = song.id === dailySong(today).id
  return (
    <li className="era-track">
      <StampMark album={album} stamped={!!stampedOn} gold={!!goldOn} />
      <span className="era-track-no">{song.track}</span>
      <span className="era-track-title">
        {song.title}
        <span className="sr-only">{goldOn ? ', gold stamp' : stampedOn ? ', stamped' : ', not stamped yet'}</span>
      </span>
      <span className="era-track-note">{isToday && !stampedOn ? "Today's song" : note}</span>
      <span className="era-track-len">{formatDuration(song.seconds)}</span>
      {start ? (
        <button type="button" className="btn btn-secondary era-track-start" onClick={start} aria-label={`Plank it: ${song.title}`}>
          Plank it
        </button>
      ) : (
        <span className="era-track-start" />
      )}
    </li>
  )
}

function Soon({ upcoming, today }: { upcoming: Upcoming; today: DayKey }) {
  const { song, premiere } = upcoming
  return (
    <li className="era-track soon">
      <span className="stamp" aria-hidden="true" />
      <span className="era-track-no">{song.track}</span>
      <span className="era-track-title">{song.title}</span>
      <span className="era-track-note">{premiere && premiere >= today ? `Out ${formatShortDate(premiere)}` : 'Not out yet'}</span>
      <span className="era-track-len" />
      <span className="era-track-start" />
    </li>
  )
}
