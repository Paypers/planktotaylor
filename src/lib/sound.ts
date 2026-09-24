// Tiny synthesized cues so you can hear the countdown, how far along you are, and the finish with your face to the floor.
let ctx: AudioContext | null = null

/** Must run inside a tap/click; browsers keep audio locked until then. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    ctx = null
  }
}

function tone(frequency: number, delay: number, duration: number, volume = 0.18) {
  if (!ctx) return
  const start = ctx.currentTime + delay
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

export const sounds = {
  tick: () => tone(660, 0, 0.14),
  go: () => tone(990, 0, 0.3, 0.22),
  finish: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.13, 0.4, 0.2)),
  /** Past halfway: a slow, low rise. Breathe. */
  halfway: () => [392, 587.33].forEach((f, i) => tone(f, i * 0.22, 0.5, 0.16)),
  /** Last 30 seconds: ding, ding, up. */
  lastThirty: () => [880, 880, 1174.66].forEach((f, i) => tone(f, i * 0.16, i === 2 ? 0.35 : 0.14, 0.18)),
  /** An aurora light has appeared: a soft, high bell, held. */
  light: () => [1046.5, 1567.98].forEach((f) => tone(f, 0, 1.1, 0.07)),
  /** Past your best on this song: a quick high sparkle. */
  pastBest: () => [1318.51, 1567.98, 2093].forEach((f, i) => tone(f, i * 0.08, 0.28, 0.12)),
}
