import { useState, type FormEvent } from 'react'
import { retrySync, sendSignInEmail, signOut, useAccount, verifySignInCode } from '../lib/account'
import { Dialog } from './Dialog'

const SYNC_TEXT = {
  idle: '',
  syncing: 'Syncing…',
  synced: 'Your streak and ladder are synced to this account.',
  error: "Couldn't sync just now. Your progress is safe in this browser.",
}

export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, sync } = useAccount()

  return (
    <Dialog open={open} title={user ? 'Your account' : 'Sign in'} onClose={onClose}>
      {user ? (
        <>
          <p>
            Signed in as <strong>{user.email}</strong>.
          </p>
          <p className="muted">{SYNC_TEXT[sync]}</p>
          <div className="button-row">
            {sync === 'error' && (
              <button className="btn btn-secondary" onClick={retrySync}>
                Try again
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
          <p className="fine">Signing out keeps this browser's copy of your progress.</p>
        </>
      ) : (
        <SignInForm />
      )}
    </Dialog>
  )
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (event: FormEvent, action: () => Promise<void>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!sent) {
    return (
      <form
        onSubmit={(e) =>
          run(e, async () => {
            await sendSignInEmail(email.trim())
            setSent(true)
          })
        }
      >
        <p>
          Optional. Sign in to keep your streak on your phone and laptop. Without an account, your progress stays in this
          browser.
        </p>
        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a sign-in link'}
        </button>
        <p className="fine">No password. Your streak so far comes with you.</p>
      </form>
    )
  }

  return (
    <form onSubmit={(e) => run(e, () => verifySignInCode(email.trim(), code.trim()))}>
      <p>
        Check <strong>{email}</strong>. Tap the link in the email, or type the code from it here:
      </p>
      <label className="field">
        <span>Code</span>
        <input
          className="input code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,10}"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      <button type="button" className="btn btn-link" onClick={() => setSent(false)}>
        Use a different email
      </button>
    </form>
  )
}
