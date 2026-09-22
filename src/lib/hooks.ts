import { useEffect, useRef, useState } from 'react'
import { todayKey, type DayKey } from './dates'

/** Today's date, updating if the page stays open past midnight. */
export function useToday(): DayKey {
  const [today, setToday] = useState(todayKey)
  useEffect(() => {
    const check = () => setToday(todayKey())
    const timer = setInterval(check, 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}

/** Keeps the screen awake while `active` is true, where the browser supports it. */
export function useWakeLock(active: boolean) {
  const lock = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let cancelled = false
    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) void sentinel.release()
        else lock.current = sentinel
      } catch {
        // Battery saver or unsupported: the plank still works.
      }
    }
    // The lock is dropped whenever the tab is hidden, so take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock.current?.release()
      lock.current = null
    }
  }, [active])
}
