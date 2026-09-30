import type { LiveMember } from './link'

// Who's here, as the plank screen shows them: planking, done, or stepped out. Never anyone's breaks.

/** Longest in the room first, as the room's share lists them, so the order never says who did best. */
export function byJoined(members: readonly LiveMember[]): LiveMember[] {
  return [...members].sort((a, b) => a.joinedAt - b.joinedAt)
}

/**
 * Everyone who's held to the end so far: those already listed, and anyone newly done. Someone who leaves
 * the room after finishing stays listed. The same array back when nobody new has finished.
 */
export function addFinishers(finishers: readonly LiveMember[], members: readonly LiveMember[]): readonly LiveMember[] {
  const listed = new Set(finishers.map((f) => f.id))
  const added = members.filter((m) => m.status === 'done' && !listed.has(m.id))
  return added.length === 0 ? finishers : byJoined([...finishers, ...added])
}
