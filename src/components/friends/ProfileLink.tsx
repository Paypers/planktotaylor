import { useState } from 'react'
import { showFriendCode } from '../../lib/friends'
import { siteLink } from '../../lib/share'

/**
 * A player's profile link: whoever opens it sees their name and photo, and can send them a friend request, or
 * make an account to (#friend/<code>).
 */
export const profileLink = (code: string) => `${siteLink()}#friend/${showFriendCode(code)}`

/** The profile link, to share the phone's way or copy, with the friend code to read out. */
export function ShareProfileLink({ code }: { code: string }) {
  const [said, setSaid] = useState<string | null>(null)
  const link = profileLink(code)

  const share = async () => {
    const text = 'Plank with me on Plank to Taylor: add me as a friend.'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Plank to Taylor', text, url: link })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`)
      setSaid('Link copied.')
    } catch {
      // The link is on screen to copy by hand.
    }
  }

  const copyCode = () =>
    navigator.clipboard.writeText(showFriendCode(code)).then(
      () => setSaid('Code copied.'),
      () => {},
    )

  return (
    <div className="invite-link">
      <label className="field">
        <span>Profile link</span>
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={() => void share()}>
          Share link
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void copyCode()}>
          Copy code
        </button>
      </div>
      {said && (
        <p className="fine" role="status">
          {said}
        </p>
      )}
    </div>
  )
}
