import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { contrast, hexToHsv, hsvToHex, normalizeHex, TOKENS, type Hsv, type Palette } from '../../lib/palette'
import { HeldMark, Icon } from '../Icon'

/** What a colour has to stay readable on, from the theme's contrast checks. */
export interface ReadCheck {
  /** What it sits on, as the editor names it ("Background"). */
  on: string
  onHex: string
  min: number
}

interface Props {
  label: string
  hint: string
  /** The colour as it is now: every change shows on the site straight away. */
  value: string
  /** The theme being edited: its colours are offered to pick from. */
  palette: Palette
  check?: ReadCheck
  onChange: (hex: string) => void
  onClose: () => void
}

const clamp = (x: number) => Math.min(1, Math.max(0, x))

/**
 * A colour, picked by eye: a box for how much colour and how bright, a strip for the hue, the hex code to
 * type, and the theme's own colours. Under the swatch on a wide screen; a sheet from the bottom on a phone.
 */
export function ColorPicker({ label, hint, value, palette, check, onChange, onClose }: Props) {
  // The colour when the picker opened: Reset goes back to it.
  const [start] = useState(value)
  // Held here rather than worked out from the hex, so the hue stays put in greys, black and white.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [typed, setTyped] = useState<string | null>(null)
  const hex = hsvToHex(hsv)
  const field = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const dragging = useRef<'field' | 'hue' | null>(null)
  // Changes go to the site at most once a frame while dragging.
  const pending = useRef<string | null>(null)
  const frame = useRef(0)
  // The last colour this picker sent: anything else arriving is a change from outside it.
  const sent = useRef(value)

  const send = (next: string) => {
    sent.current = next
    onChange(next)
  }

  // A colour typed in the row's own hex box moves the picker too.
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value
      setHsv(hexToHsv(value))
    }
  }, [value])

  useEffect(() => {
    field.current?.focus({ preventScroll: true })
    // Under a swatch near the bottom of the screen, bring it into view.
    dialog.current?.scrollIntoView({ block: 'nearest' })
    return () => cancelAnimationFrame(frame.current)
  }, [])

  const choose = (next: Hsv) => {
    setHsv(next)
    setTyped(null)
    pending.current = hsvToHex(next)
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        if (pending.current) send(pending.current)
        pending.current = null
      })
    }
  }
  const chooseHex = (next: string) => choose(hexToHsv(next))

  const at = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) }
  }
  const press = (part: 'field' | 'hue') => (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = part
    move(part)(event)
  }
  const move = (part: 'field' | 'hue') => (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== part) return
    const { x, y } = at(event)
    choose(part === 'field' ? { ...hsv, s: x, v: 1 - y } : { ...hsv, h: Math.min(359.9, x * 360) })
  }
  const release = () => {
    dragging.current = null
  }

  const fieldKeys = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02
    const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const move = by[event.key]
    if (!move) return
    event.preventDefault()
    choose({ ...hsv, s: clamp(hsv.s + move[0]), v: clamp(hsv.v + move[1]) })
  }
  const hueKeys = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 15 : 2
    const by: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }
    if (!(event.key in by)) return
    event.preventDefault()
    choose({ ...hsv, h: (hsv.h + by[event.key] + 360) % 360 })
  }

  // The theme's own colours, once each, in the editor's order.
  const swatches = [...new Set(TOKENS.map((token) => palette[token]))]
  const ratio = check ? contrast(hex, check.onHex) : 0
  const readable = check ? ratio >= check.min : true

  return (
    <>
      <div className="color-picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialog}
        className="color-picker"
        role="dialog"
        aria-label={`Choose a colour for ${label}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="color-picker-head">
          <div>
            <p className="color-picker-title">{label}</p>
            <p className="color-picker-hint">{hint}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div
          ref={field}
          className="color-field"
          role="slider"
          tabIndex={0}
          aria-label="Shade: how much colour, and how light"
          aria-valuetext={`${Math.round(hsv.s * 100)}% colour, ${Math.round(hsv.v * 100)}% light`}
          style={{ backgroundColor: `hsl(${Math.round(hsv.h)} 100% 50%)` }}
          onPointerDown={press('field')}
          onPointerMove={move('field')}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={fieldKeys}
        >
          <span className="color-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
        </div>

        <div
          className="color-hue"
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={press('hue')}
          onPointerMove={move('hue')}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={hueKeys}
        >
          <span className="color-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${Math.round(hsv.h)} 100% 50%)` }} />
        </div>

        <div className="color-picker-now">
          <span className="color-compare" aria-hidden="true">
            <span style={{ background: start }} />
            <span style={{ background: hex }} />
          </span>
          <label className="color-picker-hex">
            <span>Hex</span>
            <input
              value={typed ?? hex}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              aria-label={`${label}, hex code`}
              aria-invalid={typed !== null && normalizeHex(typed) === null}
              onChange={(event) => {
                setTyped(event.target.value)
                const next = normalizeHex(event.target.value, { short: false })
                if (next) {
                  setHsv(hexToHsv(next))
                  send(next)
                }
              }}
              onBlur={() => {
                const next = typed === null ? null : normalizeHex(typed)
                if (next && next !== hex) chooseHex(next)
                setTyped(null)
              }}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          </label>
        </div>

        <div className="color-picker-theme">
          <p>From this theme</p>
          <div className="color-picker-swatches">
            {swatches.map((color) => (
              <button
                key={color}
                type="button"
                className="color-picker-swatch"
                style={{ background: color }}
                aria-label={`Use ${color}`}
                aria-pressed={color === hex}
                onClick={() => chooseHex(color)}
              />
            ))}
          </div>
        </div>

        {check && (
          <p className={readable ? 'color-picker-read' : 'color-picker-read hard'} aria-live="polite">
            {readable ? <HeldMark /> : <span className="color-picker-warn" aria-hidden="true">!</span>}
            {ratio.toFixed(1)}:1 on {check.on.toLowerCase()} ·{' '}
            {readable ? (ratio >= 4.5 ? 'easy to read' : 'fine for big text and marks') : `hard to read. Aim for ${check.min}:1`}
          </p>
        )}

        <div className="button-row color-picker-actions">
          <button type="button" className="btn btn-secondary" onClick={() => chooseHex(start)}>
            Reset
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}
