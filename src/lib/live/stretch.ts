import { STRETCH_MS } from './room'

// The stretch together before a plank: the same moves at the same moment on every screen, from the room's clock.

export interface Stretch {
  name: string
  /** How to do it, in a line. */
  how: string
}

/** In order, each for an equal share of the stretch. Gentle, and ending on all fours, ready to get into position. */
export const STRETCHES: readonly Stretch[] = [
  { name: 'Roll your shoulders', how: 'Big, slow circles: up, back and down.' },
  { name: 'Circle your wrists', how: 'Both ways round. They hold you up in a plank.' },
  { name: 'Cat and cow', how: 'On all fours: round your back up, then let it dip. Slowly, with your breath.' },
  { name: "Child's pose", how: 'Sit back on your heels, arms long in front of you. Breathe out.' },
]

const EACH_MS = STRETCH_MS / STRETCHES.length

/** Where the stretch is with `leftMs` of it to go: the move, its place in the order, and the seconds left on it. */
export function stretchAt(leftMs: number): { stretch: Stretch; index: number; secondsLeft: number } {
  const done = STRETCH_MS - Math.min(STRETCH_MS, Math.max(0, leftMs))
  const index = Math.min(STRETCHES.length - 1, Math.floor(done / EACH_MS))
  return { stretch: STRETCHES[index], index, secondsLeft: Math.max(0, Math.ceil(((index + 1) * EACH_MS - done) / 1000)) }
}
