// Aurora lights: while the song plays, a light appears every so often, and tapping it catches it.
// Timed in song time, so breaks never bring more. Missing one costs nothing and is never shown.

/** The first light, this far into the song. */
export const FIRST_LIGHT_MS = 30_000
/** After that, one every 40 to 70 seconds, at random. */
export const LIGHT_GAP_MS = { min: 40_000, max: 70_000 }
/** How long each one glows. */
export const LIGHT_SHOW_MS = 6_000
/** None in the last ten seconds: the finish is for holding on. */
export const QUIET_END_MS = 10_000
export const MAX_LIGHTS = 12
/** Across, in pixels: big enough to hit from an arm's length. */
export const LIGHT_SIZE = 72

/** When each light appears, in ms of song: about 3 for a 3½-minute song, 11 or 12 for the longest. */
export function lightTimes(songMs: number, random: () => number = Math.random): number[] {
  const times: number[] = []
  const last = songMs - QUIET_END_MS - LIGHT_SHOW_MS
  for (let at = FIRST_LIGHT_MS; at <= last && times.length < MAX_LIGHTS; at += LIGHT_GAP_MS.min + random() * (LIGHT_GAP_MS.max - LIGHT_GAP_MS.min)) {
    times.push(Math.round(at))
  }
  return times
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * A spot for a light inside `area`, at least `gap` clear of every box in `avoid` (the video, the
 * buttons, the timer). Null when there's no room: that light is skipped.
 */
export function placeLight(area: Box, avoid: readonly Box[], size = LIGHT_SIZE, gap = 16, random: () => number = Math.random): { x: number; y: number } | null {
  const width = area.right - area.left - size
  const height = area.bottom - area.top - size
  if (width < 0 || height < 0) return null
  for (let tries = 0; tries < 80; tries++) {
    const x = area.left + random() * width
    const y = area.top + random() * height
    const clear = avoid.every((b) => x + size + gap <= b.left || x >= b.right + gap || y + size + gap <= b.top || y >= b.bottom + gap)
    if (clear) return { x: Math.round(x), y: Math.round(y) }
  }
  return null
}
