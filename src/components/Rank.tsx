import type { CSSProperties } from 'react'
import { rankName, type Division, type PlayerRank, type Tier } from '../lib/ranks'
import { StarMark } from './Icon'
import { RankEmblem } from './RankEmblem'

const plateColours = (tier: Tier) => (tier.fill ? ({ '--plaque': tier.fill, '--plaque-ink': tier.ink } as CSSProperties) : undefined)

/**
 * A rank's name on a flat plate in its tier's colour, wherever the rank is a label (under your name,
 * in a list). Every rank gets the same plate; only the colour changes.
 */
export function RankPlaque({ tier, division = null, size = 'sm' }: { tier: Tier; division?: Division | null; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`plaque plaque-${size}${tier.fill ? '' : ' plaque-clear'}`} style={plateColours(tier)}>
      <span>{tier.name}</span>
      {division && <span className="plaque-div">{division}</span>}
    </span>
  )
}

/** On phones the rank rides on your photo: its division on the same plate (a star for the top three). */
export function RankBadge({ rank }: { rank: PlayerRank }) {
  return (
    <span className={`profile-badge narrow-only${rank.tier.fill ? '' : ' plaque-clear'}`} style={plateColours(rank.tier)}>
      {rank.division ? <span>{rank.division}</span> : <StarMark size={8} />}
    </span>
  )
}

/** Your rank, XP so far out of the next rank, and what the next rank takes. */
export function RankBar({ rank }: { rank: PlayerRank }) {
  const into = rank.next === null ? 1 : Math.min(1, (rank.xp - rank.floor) / (rank.next - rank.floor))
  return (
    <div className="rank">
      <div className="rank-head">
        <RankPlaque tier={rank.tier} division={rank.division} size="md" />
        <span className="rank-xp">
          {rank.xp.toLocaleString()}
          {rank.next !== null && ` / ${rank.next.toLocaleString()}`} XP
        </span>
      </div>
      <div
        className="bar bar-thin"
        role="progressbar"
        aria-valuemin={rank.floor}
        aria-valuemax={rank.next ?? rank.xp}
        aria-valuenow={Math.min(rank.xp, rank.next ?? rank.xp)}
        aria-label={`${rankName(rank.tier, rank.division)}. ${rank.nextStep}`}
      >
        <span style={{ width: `${into * 100}%` }} />
      </div>
      <p className="rank-next">{rank.nextStep}</p>
    </div>
  )
}

/** Where the rank is the subject: its emblem beside the bar. */
export function RankCard({ rank }: { rank: PlayerRank }) {
  return (
    <div className="rank-card">
      <RankEmblem tier={rank.tier} size={88} />
      <RankBar rank={rank} />
    </div>
  )
}
