import { useRef, useState, type FormEvent } from 'react'
import {
  displayName,
  removeAvatar,
  retrySync,
  saveDisplayName,
  sendSignInEmail,
  signOut,
  uploadAvatar,
  useAccount,
  verifySignInCode,
} from '../lib/account'
import { squarePhoto } from '../lib/avatar'
import { isIos, isStandalone } from '../lib/install'
import type { PlayerRank } from '../lib/ranks'
import { followLink, GROUPS, hashFor } from '../lib/route'
import { Avatar } from './Avatar'
import { Dialog } from './Dialog'
import { RankCard } from './Rank'

const SYNC_TEXT = {
  idle: '',
  syncing: 'Syncing…',
  synced: 'Your streak, ladder, XP, photo and settings are synced to this account, on every device you sign in on.',
  error: "Couldn't sync just now. Your progress is safe in this browser.",
}

export function AccountDialog({ open, onClose, rank }: { open: boolean; onClose: () => void; rank: PlayerRank | null }) {
  const { user } = useAccount()
  return (
    <Dialog open={open} title={user ? 'Your profile' : 'Sign in'} onClose={onClose}>
      {user ? <ProfileForm rank={rank} onClose={onClose} /> : <SignInForm />}
    </Dialog>
  )
}

function ProfileForm({ rank, onClose }: { rank: PlayerRank | null; onClose: () => void }) {
  const { user, sync, profile } = useAccount()
  const [name, setName] = useState(profile.name ?? '')
  const [busy, setBusy] = useState<'name' | 'photo' | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  if (!user) return null
  const shown = displayName(user, profile)

  const run = async (what: 'name' | 'photo', action: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    setSaved(false)
    try {
      await action()
      if (what === 'name') setSaved(true)
    } catch (err) {
      const message = (err as Error).message
      const reason = /fetch|network/i.test(message) ? 'Check your connection and try again.' : message
      setError(`Couldn't save the ${what}. ${reason}`)
    } finally {
      setBusy(null)
    }
  }

  const choosePhoto = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ''
    if (file) void run('photo', async () => uploadAvatar(await squarePhoto(file)))
  }

  return (
    <>
      <div className="profile-head">
        <Avatar name={shown} url={profile.avatarUrl} size={72} />
        <div className="profile-who">
          <p className="profile-shown">{shown}</p>
          <p className="fine">{user.email}</p>
        </div>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === 'photo' ? 'Uploading…' : profile.avatarUrl ? 'Change photo' : 'Add a photo'}
        </button>
        {profile.avatarUrl && (
          <button type="button" className="btn btn-link" onClick={() => void run('photo', removeAvatar)} disabled={busy !== null}>
            Remove photo
          </button>
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => choosePhoto(e.target.files?.[0])} />
      </div>

      <form
        className="dialog-section"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          void run('name', () => saveDisplayName(name))
        }}
      >
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            maxLength={40}
            autoComplete="nickname"
            placeholder={user.email?.split('@')[0]}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <div className="button-row">
          <button className="btn btn-primary" disabled={busy !== null || name.trim() === (profile.name ?? '')}>
            {busy === 'name' ? 'Saving…' : 'Save name'}
          </button>
          {saved && <span className="fine profile-saved">Saved.</span>}
        </div>
      </form>

      <section className="dialog-section">
        <h3>Groups</h3>
        <p className="muted">
          <a
            href={hashFor(GROUPS)}
            onClick={(e) => {
              followLink(e, GROUPS)
              onClose()
            }}
          >
            Your groups
          </a>
          : make one with friends, or share an invite link.
        </p>
      </section>

      {rank && (
        <section className="dialog-section">
          <h3>Your rank</h3>
          <RankCard rank={rank} linked onOpen={onClose} />
        </section>
      )}

      <section className="dialog-section">
        <p className="muted">{SYNC_TEXT[sync]}</p>
        <div className="button-row">
          {sync === 'error' && (
            <button type="button" className="btn btn-secondary" onClick={retrySync}>
              Try again
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <p className="fine">Signing out keeps this browser's copy of your progress.</p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function SignInForm() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // On an iPhone or iPad home screen, the email's link would sign Safari in instead of this copy.
  const codeOnly = isIos() && isStandalone()

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
          Optional. Sign in to keep your streak on your phone and laptop, and to earn XP. Without an account, your
          progress stays in this browser.
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
          {busy ? 'Sending…' : codeOnly ? 'Email me a sign-in code' : 'Email me a sign-in link'}
        </button>
        <p className="fine">No password. Your streak so far comes with you.</p>
      </form>
    )
  }

  return (
    <form onSubmit={(e) => run(e, () => verifySignInCode(email.trim(), code.trim()))}>
      <p>
        Check <strong>{email}</strong>.{' '}
        {codeOnly
          ? 'Type the code from it here. Its link would open Safari, which keeps its own copy of the site.'
          : 'Tap the link in the email, or type the code from it here:'}
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
