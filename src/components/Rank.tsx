import type { RankInfo } from '../lib/xp'

/** Your rank, and how far through it you are. */
export function RankBar({ rank }: { rank: RankInfo }) {
  const into = rank.xp - rank.floor
  const span = rank.next - rank.floor
  return (
    <div className="rank">
      <div className="rank-head">
        <span className="rank-name">Rank {rank.rank}</span>
        <span className="meta">
          {rank.xp.toLocaleString()} / {rank.next.toLocaleString()} XP
        </span>
      </div>
      <div
        className="bar bar-thin"
        role="progressbar"
        aria-valuemin={rank.floor}
        aria-valuemax={rank.next}
        aria-valuenow={rank.xp}
        aria-label={`Rank ${rank.rank}: ${rank.next - rank.xp} XP to rank ${rank.rank + 1}`}
      >
        <span style={{ width: `${(into / span) * 100}%` }} />
      </div>
    </div>
  )
}
