import type { Album } from '../data/songs'

/** A release's charm on its album's badge. */
export interface Charm {
  album: Album
  won: boolean
  gold: boolean
}

interface Props {
  album: Album
  size: number
  /** The share of its songs stamped, 0 to 1: drawn round the edge until the badge is won. */
  progress: number
  won: boolean
  /** Every stamp gold: a gold edge. */
  gold: boolean
  /** Releases that joined the album, each a charm hanging off the badge. */
  charms?: readonly Charm[]
}

const RING = 2 * Math.PI * 44

/**
 * An album's badge in Collect the eras: a disc in the album's colors with its name, like a record label.
 * Until it's won, an outline with the stamped share drawn round it in the album's color.
 */
export function EraBadge({ album, size, progress, won, gold, charms = [] }: Props) {
  const label = album.short
  // Long names get smaller type, so every name fits the disc.
  const fontSize = Math.min(20, 118 / Math.max(label.length, 4))
  return (
    <svg className="era-badge" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ overflow: 'visible' }}>
      {won ? (
        <>
          {gold && <circle cx="50" cy="50" r="48.5" fill="none" stroke="var(--gold)" strokeWidth="3" />}
          <circle cx="50" cy="50" r={gold ? 45 : 47} fill={album.color} />
          <circle cx="50" cy="50" r="38" fill="none" stroke={album.ink} strokeOpacity="0.35" strokeWidth="1" />
          {/* Like a record's label: the name above the spindle hole, the year below it. */}
          <circle cx="50" cy="54" r="2.5" fill={album.ink} fillOpacity="0.5" />
          <text x="50" y="38" textAnchor="middle" dominantBaseline="central" fill={album.ink} className="era-badge-name" fontSize={Math.min(fontSize, 18)}>
            {label}
          </text>
          <text x="50" y="68" textAnchor="middle" dominantBaseline="central" fill={album.ink} fillOpacity="0.75" className="era-badge-year">
            {album.year}
          </text>
        </>
      ) : (
        <>
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--rule)" strokeWidth="4" strokeDasharray="3 4" />
          {progress > 0 && (
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke={album.color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(progress * RING, 1)} ${RING}`}
              transform="rotate(-90 50 50)"
            />
          )}
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="var(--ink-2)" className="era-badge-name" fontSize={fontSize}>
            {label}
          </text>
        </>
      )}
      {charms.map((charm, i) => {
        // On the badge's edge at the bottom right, one after another round it.
        const angle = ((45 - i * 30) * Math.PI) / 180
        return <CharmShape key={charm.album.id} charm={charm} cx={50 + 44 * Math.cos(angle)} cy={50 + 44 * Math.sin(angle)} />
      })}
    </svg>
  )
}

function CharmShape({ charm, cx, cy }: { charm: Charm; cx: number; cy: number }) {
  return charm.won ? (
    <>
      <circle cx={cx} cy={cy} r="12" fill={charm.album.color} stroke={charm.gold ? 'var(--gold)' : 'var(--paper)'} strokeWidth="2.5" />
      <path d={star(cx, cy, 6.5)} fill={charm.album.ink} />
    </>
  ) : (
    <>
      <circle cx={cx} cy={cy} r="12" fill="var(--paper)" />
      <circle cx={cx} cy={cy} r="10" fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="2 2.5" />
    </>
  )
}

/** A release's charm on its own, beside its songs. */
export function CharmMark({ charm, size = 32 }: { charm: Charm; size?: number }) {
  return (
    <svg className="charm-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <CharmShape charm={charm} cx={14} cy={14} />
    </svg>
  )
}

/** A four-pointed star, like the site's mark. */
function star(cx: number, cy: number, r: number): string {
  const inner = r * 0.3
  const points = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * Math.PI) / 4 - Math.PI / 2
    const reach = i % 2 === 0 ? r : inner
    return `${(cx + reach * Math.cos(angle)).toFixed(2)},${(cy + reach * Math.sin(angle)).toFixed(2)}`
  })
  return `M${points.join('L')}Z`
}

/** A song's stamp in its album's colors: gold when held with no breaks, a dashed ring until it's planked. */
export function StampMark({ album, stamped, gold }: { album: Album; stamped: boolean; gold: boolean }) {
  return (
    <span
      className={`stamp${stamped ? ' stamped' : ''}${gold ? ' gold' : ''}`}
      style={stamped ? { background: album.color, color: album.ink } : undefined}
      aria-hidden="true"
    >
      {stamped && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d={star(12, 12, 11)} />
        </svg>
      )}
    </span>
  )
}
