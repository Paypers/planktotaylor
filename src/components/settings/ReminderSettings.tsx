import { useEffect, useState } from 'react'
import { askToSignIn, useAccount, type DeviceReminder } from '../../lib/account'
import { changeReminder, reminderSupport, thisDeviceReminder, turnOffReminders, turnOnReminders, type ReminderSupport } from '../../lib/push'
import { DEFAULT_REMINDER, EVENING_NUDGE, NUDGE_STREAK, STEP_MINUTES } from '../../lib/reminders'

/** "09:00" as this device writes times: "9:00 AM", "09:00". */
function clockTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Every time a reminder can be set to: a quarter hour apart, all day. */
const TIMES = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, i) => {
  const minutes = i * STEP_MINUTES
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

/** Settings → Reminders: a daily nudge to plank today's song, on this device. */
export function ReminderSettings() {
  const { user } = useAccount()
  const [support, setSupport] = useState<ReminderSupport | null>(null)
  const [reminder, setReminder] = useState<DeviceReminder | null>(null)
  const [loading, setLoading] = useState(true)
  /** The switch's new position while turning reminders on or off: it moves at once, and back if that fails. */
  const [switching, setSwitching] = useState<'on' | 'off' | null>(null)
  const busy = switching !== null
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    void (async () => {
      const found = await reminderSupport()
      if (!live) return
      setSupport(found)
      if (found === 'ready' && user) {
        try {
          const saved = await thisDeviceReminder()
          if (live) setReminder(saved)
        } catch {
          if (live) setError("Couldn't check this device's reminder. Try again in a moment.")
        }
      }
      if (live) setLoading(false)
    })()
    return () => {
      live = false
    }
  }, [user])

  if (!user) {
    return (
      <section className="settings-group" aria-labelledby="reminders-heading">
        <h3 id="reminders-heading">Daily reminder</h3>
        <p>
          A nudge each day to plank today's song. Reminders are for signed-in players: the site needs to see whether
          you've planked today's song, so it never reminds you once you have.
        </p>
        <div>
          <button type="button" className="btn btn-primary" onClick={askToSignIn}>
            Sign in
          </button>
        </div>
      </section>
    )
  }

  const turnOn = () => {
    const first = { remind_at: DEFAULT_REMINDER, evening: false }
    setSwitching('on')
    setError(null)
    // Straight from the tap: browsers only ask for permission from one.
    turnOnReminders(first)
      .then((result) => {
        if (result === 'on') setReminder(first)
        else if (Notification.permission === 'denied') setSupport('blocked')
        else setError('Reminders need notifications to be allowed. Try again and choose Allow.')
      })
      .catch(() => setError("Couldn't turn reminders on. Try again in a moment."))
      .finally(() => setSwitching(null))
  }

  const turnOff = () => {
    setSwitching('off')
    setError(null)
    turnOffReminders()
      .then(() => setReminder(null))
      .catch(() => setError("Couldn't turn reminders off. Try again in a moment."))
      .finally(() => setSwitching(null))
  }

  const change = (patch: Partial<DeviceReminder>) => {
    if (!reminder) return
    const before = reminder
    const next = { ...reminder, ...patch }
    setReminder(next)
    setError(null)
    changeReminder(next).catch(() => {
      setReminder(before)
      setError("Couldn't save that. Try again in a moment.")
    })
  }

  return (
    <section className="settings-group" aria-labelledby="reminders-heading" aria-busy={loading || busy}>
      <h3 id="reminders-heading">Daily reminder</h3>
      <p>A nudge to plank today's song, with the song and your streak. Never once today's song is done.</p>

      {loading ? (
        <p className="fine">Checking this device…</p>
      ) : support === 'install-first' ? (
        <p className="settings-note">
          On iPhone and iPad, reminders come to Plank to Taylor on your home screen. Add it there first: tap Share, then
          Add to Home Screen. Then open it from your home screen and come back here.
        </p>
      ) : support === 'blocked' ? (
        <p className="settings-note">
          Notifications are turned off for this site. Turn them on in your browser's settings for the site, then come back
          here.
        </p>
      ) : support === 'unsupported' ? (
        <p className="settings-note">This browser can't show reminders.</p>
      ) : (
        <>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={switching ? switching === 'on' : reminder !== null}
              disabled={busy}
              onChange={(e) => (e.target.checked ? turnOn() : turnOff())}
            />
            <span>Remind me on this device</span>
          </label>
          {reminder && (
            <>
              <label className="field reminder-time">
                <span>At</span>
                <select className="input" value={reminder.remind_at} onChange={(e) => change({ remind_at: e.target.value })}>
                  {TIMES.map((time) => (
                    <option key={time} value={time}>
                      {clockTime(time)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="switch-row">
                <input type="checkbox" checked={reminder.evening} onChange={(e) => change({ evening: e.target.checked })} />
                <span>
                  And at {clockTime(EVENING_NUDGE)} if today's song isn't done yet, with a streak of {NUDGE_STREAK} days or
                  more
                </span>
              </label>
            </>
          )}
          <p className="fine">
            Reminders come to this device, at its time. Turn them on on each device you'd like them on. Each comes at most
            once a day.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
