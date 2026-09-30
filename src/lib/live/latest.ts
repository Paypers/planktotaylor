/**
 * Sends a value at most once every `gapMs`, and only the newest: one set sooner waits, and replaces any
 * still waiting. `send` returns false when it can't send yet (offline), and the value waits for the next `set`.
 */
export function latestEvery<T>(gapMs: number, send: (value: T) => boolean) {
  let lastSent = -Infinity
  let waiting: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush() {
    timer = undefined
    if (!waiting || !send(waiting.value)) return
    waiting = null
    lastSent = Date.now()
  }

  return {
    set(value: T) {
      waiting = { value }
      if (timer !== undefined) return
      const wait = lastSent + gapMs - Date.now()
      if (wait <= 0) flush()
      else timer = setTimeout(flush, wait)
    },
    cancel() {
      clearTimeout(timer)
      timer = undefined
      waiting = null
    },
  }
}
