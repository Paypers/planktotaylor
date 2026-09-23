import type { CSSProperties } from 'react'
import { rankName, type Division, type PlayerRank, type Tier } from '../lib/ranks'
import { followLink, hashFor, RANKS } from '../lib/route'
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

/**
 * Your plaque as a way to the ranks page, for working out what a rank means. `onOpen` runs when
 * it opens the page in place (to close the dialog it's in, say).
 */
export function RankLink({ rank, size = 'sm', onOpen }: { rank: PlayerRank; size?: 'sm' | 'md' | 'lg'; onOpen?: () => void }) {
  return (
    <a
      href={hashFor(RANKS)}
      className="plaque-link"
      title="See every rank"
      aria-label={`${rankName(rank.tier, rank.division)}. See every rank`}
      onClick={(e) => {
        followLink(e, RANKS)
        if (e.defaultPrevented) onOpen?.()
      }}
    >
      <RankPlaque tier={rank.tier} division={rank.division} size={size} />
    </a>
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

interface BarProps {
  rank: PlayerRank
  /** The plaque opens the ranks page. `onOpen` as for RankLink. */
  linked?: boolean
  onOpen?: () => void
}

/** Your rank, XP so far out of the next rank, and what the next rank takes. */
export function RankBar({ rank, linked = false, onOpen }: BarProps) {
  const into = rank.next === null ? 1 : Math.min(1, (rank.xp - rank.floor) / (rank.next - rank.floor))
  return (
    <div className="rank">
      <div className="rank-head">
        {linked ? (
          <RankLink rank={rank} size="md" onOpen={onOpen} />
        ) : (
          <RankPlaque tier={rank.tier} division={rank.division} size="md" />
        )}
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
export function RankCard({ size = 88, ...bar }: BarProps & { size?: number }) {
  return (
    <div className="rank-card">
      <RankEmblem tier={bar.rank.tier} size={size} />
      <RankBar {...bar} />
    </div>
  )
}
