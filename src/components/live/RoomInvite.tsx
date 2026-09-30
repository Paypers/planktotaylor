import { useState } from 'react'
import type { Song } from '../../data/songs'
import { roomLink } from '../../lib/live/code'

/** The room's link, to copy or share the phone's way. Anyone with it can join. */
export function RoomInvite({ code, song }: { code: string; song: Song }) {
  const [copied, setCopied] = useState(false)
  const link = roomLink(code, song.id)
  const canShare = typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // The link is on screen to copy by hand.
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: 'Plank together', text: `Plank to ${song.title} with me, at the same moment.`, url: link })
    } catch {
      // Closed without sharing, or the phone said no: Copy link still works.
    }
  }

  return (
    <section className="section grid" aria-labelledby="live-invite">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="live-invite">Invite</h2>
        <p className="label-meta">Anyone with the link can join</p>
      </div>
      <div className="section-body">
        <div className="invite-link">
          <label className="field">
            <span>The room's link</span>
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
              Copy link
            </button>
            {canShare && (
              <button type="button" className="btn btn-secondary" onClick={() => void share()}>
                Share
              </button>
            )}
            {copied && (
              <span className="fine live-copied" role="status">
                Copied.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
