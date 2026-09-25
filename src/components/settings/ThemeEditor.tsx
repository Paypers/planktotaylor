import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { COLOR_GROUPS, COLOR_LABELS, contrast, CONTRAST_CHECKS, normalizeHex, type ColorOption, type Palette, type Token } from '../../lib/palette'
import { discardChanges, duplicateTheme, editTheme, saveTheme, type CustomTheme } from '../../lib/theme'
import { ColorPicker, type ReadCheck } from './ColorPicker'

/** Where a colour gets hard to read against what it sits on. */
function readabilityWarnings(colors: Palette): Map<Token, string> {
  const warnings = new Map<Token, string>()
  for (const { fg, bg, min } of CONTRAST_CHECKS) {
    const ratio = contrast(colors[fg], colors[bg])
    if (ratio < min) {
      warnings.set(fg, `Hard to read on ${COLOR_LABELS[bg].toLowerCase()} (${ratio.toFixed(1)}:1). Aim for ${min}:1 or more.`)
    }
  }
  return warnings
}

interface Props {
  /** The theme as it's showing, unsaved edits included. */
  theme: CustomTheme
  unsaved: boolean
  onDelete: () => void
}

/** Edits the selected custom theme. Every change shows on the site at once; Save keeps it. */
export function ThemeEditor({ theme, unsaved, onDelete }: Props) {
  const headingId = useId()
  const warnings = readabilityWarnings(theme.colors)
  // The colour whose picker is open: one at a time.
  const [picking, setPicking] = useState<Token | null>(null)

  return (
    <section className="settings-group theme-editor" aria-labelledby={headingId}>
      <h3 id={headingId}>Edit theme</h3>
      <label className="field theme-name">
        <span>Name</span>
        <input
          className="input"
          value={theme.name}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => editTheme({ name: e.target.value })}
        />
      </label>

      {COLOR_GROUPS.map((group) => (
        <ColorGroup key={group.title} title={group.title}>
          {group.colors.map((option) => (
            <ColorRow
              key={option.token}
              option={option}
              palette={theme.colors}
              warning={warnings.get(option.token)}
              picking={picking === option.token}
              onPicking={(open) => setPicking(open ? option.token : null)}
            />
          ))}
        </ColorGroup>
      ))}

      <div className="button-row">
        <button type="button" className="btn btn-secondary" onClick={() => duplicateTheme(theme.id)}>
          Duplicate
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDelete}>
          Delete theme
        </button>
      </div>

      {/* Stays in view at the bottom of the screen while there's something to save. */}
      {unsaved && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <p>Unsaved changes</p>
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={discardChanges}>
              Discard
            </button>
            <button type="button" className="btn btn-primary" onClick={saveTheme}>
              Save theme
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function ColorGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="color-group" role="group" aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      {children}
    </div>
  )
}

interface RowProps {
  option: ColorOption
  palette: Palette
  warning?: string
  /** Its picker is open. */
  picking: boolean
  onPicking: (open: boolean) => void
}

/** What a colour has to stay readable on, if anything: the first contrast check it's the text of. */
function readCheck(token: Token, palette: Palette): ReadCheck | undefined {
  const found = CONTRAST_CHECKS.find((c) => c.fg === token)
  return found && { on: COLOR_LABELS[found.bg], onHex: palette[found.bg], min: found.min }
}

/** A colour: its swatch (which opens the picker), what it paints, and its hex code to type or copy. */
function ColorRow({ option, palette, warning, picking, onPicking }: RowProps) {
  const id = useId()
  const value = palette[option.token]
  // What's being typed in the hex box, until it's left. Otherwise the box shows the colour.
  const [typed, setTyped] = useState<string | null>(null)
  const set = (hex: string) => editTheme({ colors: { [option.token]: hex } })
  const describedBy = warning ? `${id}-hint ${id}-warn` : `${id}-hint`
  const row = useRef<HTMLDivElement>(null)
  const swatch = useRef<HTMLButtonElement>(null)

  // A click anywhere else closes the picker (on a phone, the backdrop does).
  useEffect(() => {
    if (!picking) return
    const away = (event: PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) onPicking(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [picking, onPicking])

  const close = () => {
    onPicking(false)
    swatch.current?.focus({ preventScroll: true })
  }

  return (
    <div ref={row} className={picking ? 'color-row picking' : 'color-row'}>
      <button
        ref={swatch}
        id={id}
        type="button"
        className="color-swatch"
        style={{ background: value }}
        aria-haspopup="dialog"
        aria-expanded={picking}
        aria-describedby={describedBy}
        onClick={() => onPicking(!picking)}
      />
      <div className="color-text">
        <label htmlFor={id} className="color-label">
          {option.label}
        </label>
        <span id={`${id}-hint`} className="color-hint">
          {option.hint}
        </span>
        {warning && (
          <span id={`${id}-warn`} className="color-warn">
            {warning}
          </span>
        )}
      </div>
      <input
        className="input color-hex"
        value={typed ?? value}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-label={`${option.label}, hex code`}
        aria-invalid={typed !== null && normalizeHex(typed) === null}
        onFocus={() => setTyped(value)}
        onChange={(e) => {
          setTyped(e.target.value)
          // Six digits apply as they're typed; #abc shorthand waits for the box to be left.
          const hex = normalizeHex(e.target.value, { short: false })
          if (hex) set(hex)
        }}
        onBlur={() => {
          const hex = typed === null ? null : normalizeHex(typed)
          if (hex && hex !== value) set(hex)
          setTyped(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {picking && (
        <ColorPicker
          label={option.label}
          hint={option.hint}
          value={value}
          palette={palette}
          check={readCheck(option.token, palette)}
          onChange={set}
          onClose={close}
        />
      )}
    </div>
  )
}
