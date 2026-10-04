// Who in a group is planking right now, from its Realtime presence: each member's device, while its plank
// screen is on, says until when. Keyed by user id, so someone on two devices counts once.

/** Long enough for the song and a few breaks. A plank that runs past it stops counting as now. */
export const PLANKING_GRACE_MS = 10 * 60_000
/** The longest song with breaks, and then some: an `until` further off than this is ignored. */
export const LONGEST_PLANK_MS = 2 * 60 * 60_000

/** What a planking device tells its groups. */
export interface PlankingPresence {
  /** Epoch ms. */
  until: number
}

/** "3 planking right now", for a group's page. */
export const plankingNowLine = (count: number): string => (count === 0 ? "Nobody's planking right now" : `${count} planking right now`)

/** Until when a plank of a song this long, starting now, counts as planking now. */
export const plankingUntil = (songSeconds: number, now: number): number => now + songSeconds * 1000 + PLANKING_GRACE_MS

/** Each device's `until`, kept when it's believable. Gone stale (a phone that never said it stopped) means gone. */
function untilOf(meta: unknown, now: number): number | null {
  const until = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).until : undefined
  return typeof until === 'number' && until > now && until <= now + LONGEST_PLANK_MS ? until : null
}

/** The members planking now, other than `me`, from a channel's presence state (keyed by user id). */
export function plankersIn(state: Readonly<Record<string, readonly unknown[]>>, me: string | null, now: number): Set<string> {
  const ids = Object.entries(state)
    .filter(([id, metas]) => id !== me && metas.some((meta) => untilOf(meta, now) !== null))
    .map(([id]) => id)
  return new Set(ids)
}

/** When the next of them stops counting, so it can be counted again then. Null when nobody's planking. */
export function nextExpiry(state: Readonly<Record<string, readonly unknown[]>>, now: number): number | null {
  const untils = Object.values(state).flatMap((metas) => metas.map((meta) => untilOf(meta, now) ?? Infinity))
  const soonest = Math.min(...untils)
  return Number.isFinite(soonest) ? soonest : null
}
