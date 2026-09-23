import { LADDER } from '../data/songs'
import { ladderRecords, type Completion } from './progress'
import { rankFloor, rankFor, totalXp } from './xp'

// Named ranks, each a bigger piece of writing than the last. The XP curve's first 28 steps are
// the four divisions (IV to I) of the first seven tiers; stepping up to a new tier also needs a
// ladder level. The last three steps are the top ranks, which are milestones on the ladder.

export type TierId =
  | 'scribble'
  | 'couplet'
  | 'verse'
  | 'sonnet'
  | 'ballad'
  | 'chapter'
  | 'anthology'
  | 'manuscript'
  | 'masterpiece'
  | 'magnum-opus'

export interface Tier {
  id: TierId
  name: string
  /** The ladder level you need to have climbed to reach this tier. */
  level?: number
  /** The top three: every level climbed, or every level held with no breaks. */
  milestone?: 'climbed' | 'clean'
  /** The plaque's colour and the text on it. Scribble is a clear plate. */
  fill: string | null
  ink: string | null
}

export const TIERS: readonly Tier[] = [
  { id: 'scribble', name: 'Scribble', fill: null, ink: null },
  { id: 'couplet', name: 'Couplet', level: 10, fill: '#c69263', ink: '#2b1a0c' },
  { id: 'verse', name: 'Verse', level: 25, fill: '#c3c8ce', ink: '#1f2429' },
  { id: 'sonnet', name: 'Sonnet', level: 50, fill: '#deb551', ink: '#2e2104' },
  { id: 'ballad', name: 'Ballad', level: 100, fill: '#a7d4cd', ink: '#0f2b28' },
  { id: 'chapter', name: 'Chapter', level: 150, fill: '#d9cdf0', ink: '#251d3a' },
  { id: 'anthology', name: 'Anthology', level: 200, fill: '#a6baf1', ink: '#0c1638' },
  { id: 'manuscript', name: 'Manuscript', milestone: 'climbed', fill: '#62398c', ink: '#f6eeff' },
  { id: 'masterpiece', name: 'Masterpiece', milestone: 'clean', fill: '#a4243a', ink: '#fff3f3' },
  { id: 'magnum-opus', name: 'Magnum Opus', milestone: 'clean', fill: '#1b2d5a', ink: '#f4d27a' },
]

export type Division = 'IV' | 'III' | 'II' | 'I'
const DIVISIONS: readonly Division[] = ['IV', 'III', 'II', 'I']
/** 7 tiers × 4 divisions, then the three top ranks. */
const DIVIDED_STEPS = 28
const TOP_STEP = DIVIDED_STEPS + 3

const tierAt = (step: number) => TIERS[step <= DIVIDED_STEPS ? Math.ceil(step / 4) - 1 : step - DIVIDED_STEPS + 6]
const divisionAt = (step: number): Division | null => (step <= DIVIDED_STEPS ? DIVISIONS[(step - 1) % 4] : null)

export function rankName(tier: Tier, division: Division | null): string {
  return division ? `${tier.name} ${division}` : tier.name
}

export interface LadderProgress {
  /** The highest ladder level ever climbed (restarting the ladder doesn't lower it). */
  highest: number
  climbedAll: boolean
  cleanAll: boolean
}

export function ladderProgress(completions: readonly Completion[]): LadderProgress {
  const records = ladderRecords(completions)
  let highest = 0
  for (const c of completions) if (c.mode === 'ladder' && c.level) highest = Math.max(highest, c.level)
  const climbedAll = LADDER.every((song) => records.has(song.id))
  return { highest, climbedAll, cleanAll: climbedAll && LADDER.every((song) => records.get(song.id)!.clean) }
}

function unlocked(step: number, ladder: LadderProgress): boolean {
  const tier = tierAt(step)
  if (tier.milestone === 'climbed') return ladder.climbedAll
  if (tier.milestone === 'clean') return ladder.cleanAll
  return tier.level === undefined || ladder.highest >= tier.level
}

export interface PlayerRank {
  /** 1 to 31, for comparing ranks. */
  step: number
  tier: Tier
  division: Division | null
  xp: number
  /** XP where this rank began, and where the next one starts (null at the top). */
  floor: number
  next: number | null
  /** What the next rank still takes, e.g. "4,300 XP to Sonnet I". */
  nextStep: string
}

/** A signed-in player's rank: as far as their XP goes, held back by any ladder level they haven't reached. */
export function playerRank(completions: readonly Completion[]): PlayerRank {
  const xp = totalXp(completions)
  const ladder = ladderProgress(completions)
  let step = Math.min(rankFor(xp).rank, TOP_STEP)
  while (step > 1 && !unlocked(step, ladder)) step--
  const tier = tierAt(step)
  const division = divisionAt(step)
  const base = { step, tier, division, xp, floor: rankFloor(step) }
  if (step === TOP_STEP) return { ...base, next: null, nextStep: 'The top rank.' }

  const up = step + 1
  const upName = rankName(tierAt(up), divisionAt(up))
  const next = rankFloor(up)
  const xpLeft = Math.max(0, next - xp)
  const upTier = tierAt(up)
  let nextStep: string
  if (unlocked(up, ladder)) {
    nextStep = `${xpLeft.toLocaleString()} XP to ${upName}.`
  } else {
    const need =
      upTier.milestone === 'climbed'
        ? 'every level climbed'
        : upTier.milestone === 'clean'
          ? 'every level held with no breaks'
          : `ladder level ${upTier.level}`
    nextStep =
      xpLeft > 0
        ? `${xpLeft.toLocaleString()} XP and ${need} for ${upName}.`
        : upTier.milestone === 'climbed'
          ? `Climb every level for ${upName}.`
          : upTier.milestone === 'clean'
            ? `Hold every level with no breaks for ${upName}.`
            : `Climb to level ${upTier.level} for ${upName}.`
  }
  return { ...base, next, nextStep }
}
