import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useAccount } from '../../lib/account'
import { DARK, LIGHT, TOKENS, type Palette } from '../../lib/palette'
import { setLeaveGuard } from '../../lib/route'
import {
  activeCustom,
  BUILT_IN_THEMES,
  createTheme,
  deleteTheme,
  discardChanges,
  hasUnsavedChanges,
  selectTheme,
  useTheme,
} from '../../lib/theme'
import { ConfirmDialog } from '../ConfirmDialog'
import { Icon } from '../Icon'
import { ThemeEditor } from './ThemeEditor'

type Pending = { kind: 'leave'; proceed: () => void } | { kind: 'delete'; id: string; name: string }

export function AppearanceSettings() {
  const theme = useTheme()
  const { user } = useAccount()
  const custom = activeCustom(theme)
  const unsaved = hasUnsavedChanges(theme)
  const [pending, setPending] = useState<Pending | null>(null)

  // Unsaved edits: ask before leaving settings, as well as before switching theme.
  useEffect(() => setLeaveGuard({ blocks: () => hasUnsavedChanges(), ask: (proceed) => setPending({ kind: 'leave', proceed }) }), [])
  // Nothing unsaved outlives the editor.
  useEffect(() => discardChanges, [])

  const guarded = (action: () => void) => (hasUnsavedChanges() ? setPending({ kind: 'leave', proceed: action }) : action())
  const savedName = (id: string) => theme.themes.find((t) => t.id === id)?.name ?? 'this theme'

  return (
    <>
      <section className="settings-group" aria-labelledby="theme-heading">
        <h3 id="theme-heading">Theme</h3>
        <p>System matches your device's light or dark setting. The theme you pick here is for this device only.</p>
        <div role="radiogroup" aria-labelledby="theme-heading" className="theme-choices">
          <div className="theme-grid">
            {BUILT_IN_THEMES.map((t) => (
              <ThemeCard
                key={t.id}
                name={t.name}
                checked={theme.selected === t.id}
                onSelect={() => guarded(() => selectTheme(t.id))}
                preview={
                  t.id === 'system' ? (
                    <span className="theme-preview-split" aria-hidden="true">
                      <ThemePreview colors={LIGHT} />
                      <ThemePreview colors={DARK} />
                    </span>
                  ) : (
                    <ThemePreview colors={t.id === 'dark' ? DARK : LIGHT} />
                  )
                }
              />
            ))}
          </div>
          {theme.themes.length > 0 && (
            <>
              <h4 className="theme-subhead">Your themes</h4>
              <div className="theme-grid">
                {theme.themes.map((t) => {
                  const editing = theme.draft?.id === t.id
                  const shown = editing ? theme.draft! : t
                  return (
                    <ThemeCard
                      key={t.id}
                      name={shown.name.trim() || 'Untitled'}
                      badge={editing && unsaved ? 'Unsaved' : undefined}
                      checked={theme.selected === t.id}
                      onSelect={() => guarded(() => selectTheme(t.id))}
                      preview={<ThemePreview colors={shown.colors} />}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-secondary" onClick={() => guarded(createTheme)}>
            <Icon name="plus" size={18} />
            New theme
          </button>
        </div>
        <p className="fine">
          A new theme starts from the colors showing now.{' '}
          {user
            ? 'Your themes are saved to your account, ready to pick on every device you sign in on.'
            : 'Your themes are saved in this browser.'}
        </p>
      </section>

      {custom && (
        <ThemeEditor
          theme={custom}
          unsaved={unsaved}
          onDelete={() => setPending({ kind: 'delete', id: custom.id, name: savedName(custom.id) })}
        />
      )}

      <ConfirmDialog
        open={pending?.kind === 'leave'}
        title="Discard your changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          if (pending?.kind !== 'leave') return
          setPending(null)
          discardChanges()
          pending.proceed()
        }}
        onCancel={() => setPending(null)}
      >
        <p>Your edits to {custom ? `“${custom.name.trim() || 'Untitled'}”` : 'this theme'} haven't been saved.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title="Delete this theme?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (pending?.kind === 'delete') deleteTheme(pending.id)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      >
        <p>
          “{pending?.kind === 'delete' ? pending.name : ''}” will be gone for good, and the site goes back to the System
          theme.
        </p>
      </ConfirmDialog>
    </>
  )
}

interface CardProps {
  name: string
  checked: boolean
  onSelect: () => void
  preview: ReactNode
  badge?: string
}

/** One theme to pick: a small picture of the site in its colors, and its name. */
function ThemeCard({ name, checked, onSelect, preview, badge }: CardProps) {
  return (
    <label className="theme-card">
      <input type="radio" name="theme" className="sr-only" checked={checked} onChange={onSelect} />
      {preview}
      <span className="theme-card-foot">
        <span className="theme-radio" aria-hidden="true" />
        <span className="theme-card-name">{name}</span>
        {badge && <span className="theme-card-badge">{badge}</span>}
      </span>
    </label>
  )
}

/** The site in miniature: the star and name, a headline, a line of text, a highlighted row with the plank bar and a button. */
export function ThemePreview({ colors }: { colors: Palette }) {
  const vars = Object.fromEntries(TOKENS.map((token) => [`--p-${token}`, colors[token]])) as CSSProperties
  return (
    <span className="theme-preview" style={vars} aria-hidden="true">
      <span className="tp-top">
        <span className="tp-star" />
        <span className="tp-brand" />
      </span>
      <span className="tp-headline" />
      <span className="tp-text" />
      <span className="tp-rule" />
      <span className="tp-row">
        <span className="tp-bar">
          <span className="tp-held" />
          <span className="tp-paused" />
        </span>
        <span className="tp-button" />
      </span>
    </span>
  )
}
