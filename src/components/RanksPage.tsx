import { useEffect, useRef, type CSSProperties } from 'react'
import { RANK_STEPS, rankName, TIERS, tierStart, type PlayerRank, type Tier } from '../lib/ranks'
import { HOME, navigate } from '../lib/route'
import { CLEAN_BONUS, MARATHON_BONUS, MARATHON_SECONDS } from '../lib/xp'
import { RankCard, RankPlaque } from './Rank'
import { RankEmblem } from './RankEmblem'

/** What a tier takes besides XP. */
function needs(tier: Tier): string {
  if (tier.milestone === 'climbed') return 'Every level climbed'
  if (tier.milestone === 'clean') return 'Every level, no breaks'
  return tier.level ? `Ladder level ${tier.level}` : 'Where everyone starts'
}

const percent = (share: number) => `${Math.round(share * 100)}%`

interface Props {
  /** Signed-in players' rank. */
  rank: PlayerRank | null
  /** Set when accounts are on and nobody's signed in. */
  onSignIn?: () => void
}

/** Every rank, what each one takes, and where you are: opened from your plaque. */
export function RanksPage({ rank, onSignIn }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = 'Ranks · Plank to Taylor'
    // Screen readers start from the heading, as on a new page.
    heading.current?.focus({ preventScroll: true })
    return () => {
      document.title = 'Plank to Taylor'
    }
  }, [])

  return (
    <div className="ranks">
      <div className="grid">
        <div className="page-top">
          <h1 ref={heading} tabIndex={-1} className="page-title">
            Ranks
          </h1>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(HOME)}>
            Done
          </button>
        </div>
      </div>

      {(rank || onSignIn) && (
        <section className="section grid" aria-labelledby="ranks-yours">
          <div className="section-rule" />
          <div className="section-label">
            <h2 id="ranks-yours">Your rank</h2>
          </div>
          <div className="section-body ranks-yours">
            {rank ? (
              <>
                <RankCard rank={rank} size={112} />
                <Divisions rank={rank} />
              </>
            ) : (
              <>
                <p>XP and ranks come with an account. Everyone starts at Scribble IV, and every plank from then on counts.</p>
                <div className="button-row">
                  <button type="button" className="btn btn-primary" onClick={onSignIn}>
                    Sign in
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section className="section grid" aria-labelledby="ranks-how">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="ranks-how">How it works</h2>
        </div>
        <dl className="section-body ranks-rules">
          <dt>XP</dt>
          <dd>
            A point for every second of song you hold. No breaks: +{percent(CLEAN_BONUS)}. No breaks on a song{' '}
            {MARATHON_SECONDS / 60} minutes or longer: {MARATHON_BONUS === 1 ? 'double' : `+${percent(MARATHON_BONUS)}`}. Today's song pays every day; a ladder
            level pays the first time you climb it, and its no-break bonus the first time you hold it straight through.
          </dd>
          <dt>Divisions</dt>
          <dd>Every tier from Scribble to Anthology has four divisions, IV up to I. XP carries you through them.</dd>
          <dt>Tiers</dt>
          <dd>
            A new tier also needs a ladder level. Until you've climbed to it you wait at I, your XP still counting, and
            once you get there you move straight up to wherever your XP puts you.
          </dd>
          <dt>The top three</dt>
          <dd>
            Manuscript is for climbing every level on the ladder. Masterpiece and Magnum Opus are for holding every level
            with no breaks at least once. Each needs its XP as well.
          </dd>
        </dl>
      </section>

      <section className="section grid" aria-labelledby="ranks-all">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="ranks-all">Every rank</h2>
          <p className="label-note">Scribble to Magnum Opus, each a bigger piece of writing than the last.</p>
        </div>
        <div className="section-body">
          <ol className="tier-grid">
            {TIERS.map((tier) => {
              const start = tierStart(tier)
              const here = rank?.tier.id === tier.id
              return (
                <li key={tier.id} className={`tier${here ? ' is-here' : ''}`} aria-current={here ? 'step' : undefined}>
                  <RankEmblem tier={tier} size={96} />
                  <RankPlaque tier={tier} size="md" />
                  <p className="tier-needs">
                    {needs(tier)}
                    {start.xp > 0 && (
                      <>
                        <br />
                        {start.xp.toLocaleString()} XP
                      </>
                    )}
                  </p>
                  {here && <p className="tier-here">You're here</p>}
                </li>
              )
            })}
          </ol>

          <details className="rank-table">
            <summary>Every division and the XP it starts at</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Also needs</th>
                  <th scope="col" className="num">
                    XP
                  </th>
                </tr>
              </thead>
              <tbody>
                {RANK_STEPS.map((r) => {
                  const first = r.division === null || r.division === 'IV'
                  return (
                    <tr key={r.step} className={rank?.step === r.step ? 'is-here' : undefined}>
                      <td>
                        <RankPlaque tier={r.tier} division={r.division} />
                        {rank?.step === r.step && <span className="sr-only"> (your rank)</span>}
                      </td>
                      <td>{first && r.tier.id !== 'scribble' ? needs(r.tier) : ''}</td>
                      <td className="num">{r.xp.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
        </div>
      </section>
    </div>
  )
}

/** Your tier's four divisions and the XP each begins at, yours marked. */
function Divisions({ rank }: { rank: PlayerRank }) {
  if (!rank.division) return null
  const steps = RANK_STEPS.filter((r) => r.tier.id === rank.tier.id)
  const colours = rank.tier.fill ? ({ '--plaque': rank.tier.fill, '--plaque-ink': rank.tier.ink } as CSSProperties) : undefined
  return (
    <ol className={`divisions${rank.tier.fill ? '' : ' plaque-clear'}`} style={colours} aria-label={`${rank.tier.name}'s divisions`}>
      {steps.map((r) => (
        <li
          key={r.step}
          className={r.step === rank.step ? 'is-here' : r.step < rank.step ? 'is-past' : undefined}
          aria-current={r.step === rank.step ? 'step' : undefined}
          aria-label={`${rankName(r.tier, r.division)} from ${r.xp.toLocaleString()} XP`}
        >
          <span className="divisions-name">{r.division}</span>
          <span className="divisions-xp">{r.xp.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  )
}
