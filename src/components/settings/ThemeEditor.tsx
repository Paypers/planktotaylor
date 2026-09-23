import { useId, useState, type ReactNode } from 'react'
import { COLOR_GROUPS, COLOR_LABELS, contrast, CONTRAST_CHECKS, normalizeHex, type ColorOption, type Palette, type Token } from '../../lib/palette'
import { discardChanges, duplicateTheme, editTheme, saveTheme, type CustomTheme } from '../../lib/theme'

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
            <ColorRow key={option.token} option={option} value={theme.colors[option.token]} warning={warnings.get(option.token)} />
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

/** A colour: the picker, what it paints, and its hex code to type or copy. */
function ColorRow({ option, value, warning }: { option: ColorOption; value: string; warning?: string }) {
  const id = useId()
  // What's being typed in the hex box, until it's left. Otherwise the box shows the colour.
  const [typed, setTyped] = useState<string | null>(null)
  const set = (hex: string) => editTheme({ colors: { [option.token]: hex } })
  const describedBy = warning ? `${id}-hint ${id}-warn` : `${id}-hint`

  return (
    <div className="color-row">
      <input
        id={id}
        type="color"
        className="color-swatch"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-describedby={describedBy}
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
    </div>
  )
}
