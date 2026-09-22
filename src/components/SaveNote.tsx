/**
 * A quiet by-the-way for people without an account: their progress lives in this browser only.
 * Shown where there's something to lose (the streak, a finished plank), never as a popup.
 */
export function SaveNote({ onSignIn, className = '' }: { onSignIn: () => void; className?: string }) {
  return (
    <p className={`save-note ${className}`}>
      Saved in this browser only.{' '}
      <button type="button" className="text-btn" onClick={onSignIn}>
        Sign in
      </button>{' '}
      to keep your streak on any device.
    </p>
  )
}
