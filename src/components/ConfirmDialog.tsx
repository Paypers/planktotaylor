import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  confirmLabel: string
  cancelLabel: string
  /** Confirming loses something: the safe choice gets the emphasis and the focus. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
}

/** Asks before doing something, in place of the browser's confirm(). Escape or the backdrop cancels. */
export function ConfirmDialog({ open, title, confirmLabel, cancelLabel, destructive = false, onConfirm, onCancel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const emphasis = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()

  // Before paint, so the box never shows up empty on the way in or out.
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      emphasis.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const confirm = (
    <button
      key="confirm"
      ref={destructive ? undefined : emphasis}
      type="button"
      className={`btn ${destructive ? 'btn-secondary' : 'btn-primary'}`}
      onClick={onConfirm}
    >
      {confirmLabel}
    </button>
  )
  const cancel = (
    <button
      key="cancel"
      ref={destructive ? emphasis : undefined}
      type="button"
      className={`btn ${destructive ? 'btn-primary' : 'btn-secondary'}`}
      onClick={onCancel}
    >
      {cancelLabel}
    </button>
  )

  return (
    <dialog
      ref={ref}
      className="dialog confirm"
      role="alertdialog"
      onClose={onCancel}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => e.target === ref.current && onCancel()}
      aria-labelledby={titleId}
      aria-describedby={textId}
    >
      {open && (
        <div className="confirm-body">
          <h2 id={titleId} className="confirm-title">
            {title}
          </h2>
          <div id={textId} className="confirm-text">
            {children}
          </div>
          {/* The emphasised button sits on the right, as on the plank screen. */}
          <div className="confirm-actions">{destructive ? [confirm, cancel] : [cancel, confirm]}</div>
        </div>
      )}
    </dialog>
  )
}
