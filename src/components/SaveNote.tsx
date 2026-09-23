/** A quiet note for people without an account, shown where there's something to lose. */
export function SaveNote({ onSignIn, className = '' }: { onSignIn: () => void; className?: string }) {
  return (
    <p className={`save-note ${className}`}>
      Saved in this browser only.{' '}
      <button type="button" className="text-btn" onClick={onSignIn}>
        Sign in
      </button>{' '}
      to keep your streak on any device and earn XP.
    </p>
  )
}
