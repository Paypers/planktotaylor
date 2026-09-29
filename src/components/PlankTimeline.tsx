import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { partAt, plankTimeline, type TimelineInput } from '../lib/timeline'

/**
 * A plank to scale: green while held, orange where it paused, and the song it didn't reach. Hovering,
 * tapping or arrowing to a part shows how long it was. The whole bar is one tab stop.
 */
export function PlankTimeline(props: TimelineInput) {
  const { parts, summary } = plankTimeline(props)
  // Hover, keyboard focus and taps are kept apart, as in TimeSplit. Hover wins while it lasts; a tapped
  // part stays until it's tapped again or you tap elsewhere.
  const [hovered, setHovered] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  // Where the bar's one tab stop is: the part last focused.
  const [current, setCurrent] = useState(0)
  const active = hovered ?? focused ?? pinned
  const shown = active === null ? undefined : parts[active]
  const bar = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  // A tap anywhere else, or Escape, puts it away. That Escape doesn't also close the dialog it's in.
  useEffect(() => {
    if (active === null) return
    const away = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setPinned(null)
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setHovered(null)
      setFocused(null)
      setPinned(null)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [active])

  // Over its part, kept within the bar. Wider than the bar, it lines up with the bar's right end.
  // Below it instead when the dialog or the page would cut off its top.
  useLayoutEffect(() => {
    const button = active === null ? null : buttons.current[active]
    const box = bar.current
    const bubble = tip.current
    if (!button || !box || !bubble) return
    const place = () => {
      const centre = button.offsetLeft + button.offsetWidth / 2
      const width = bubble.offsetWidth
      const left = Math.min(Math.max(centre - width / 2, 0), box.clientWidth - width)
      bubble.style.left = `${left}px`
      bubble.style.setProperty('--point', `${Math.min(Math.max(centre - left, 8), width - 8)}px`)
      bubble.dataset.side = box.getBoundingClientRect().top - bubble.offsetHeight < visibleTop(box) ? 'below' : 'above'
    }
    place()
    // Scrolling the dialog or the page can bring it up against the top.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [active, shown?.label])

  if (parts.length === 0) return null

  const toggle = (i: number) => {
    const unpin = pinned === i
    setPinned(unpin ? null : i)
    if (unpin) {
      setHovered(null)
      setFocused(null)
    }
  }

  // Parts don't take the pointer themselves: the track works out which one it means, so thin ones are easy to hit.
  const pointedAt = (clientX: number) =>
    partAt(clientX, buttons.current.map((button) => button?.getBoundingClientRect() ?? { left: 0, right: 0 }))

  const tap = (event: MouseEvent) => {
    // A part's own click (the keyboard, a screen reader) was handled by the part.
    if (event.target !== event.currentTarget) return
    const i = pointedAt(event.clientX)
    if (i !== null) toggle(i)
  }

  const move = (event: KeyboardEvent) => {
    const to: Partial<Record<string, number>> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: parts.length - 1 }
    const next = to[event.key]
    if (next === undefined) return
    event.preventDefault()
    buttons.current[Math.min(Math.max(next, 0), parts.length - 1)]?.focus()
  }

  return (
    <div ref={bar} className={`timeline${shown ? ' showing' : ''}`} role="group" aria-label={summary}>
      <div
        className="timeline-track"
        style={{ '--parts': parts.length } as CSSProperties}
        onKeyDown={move}
        // Tabbing on to the next bar takes a part pinned from the keyboard with it. A press on the bar only
        // moves focus out to the dialog around it, so that doesn't count.
        onBlur={(e) => {
          const to = e.relatedTarget
          if (to && !e.currentTarget.contains(to) && !to.contains(e.currentTarget)) setPinned(null)
        }}
        onClick={tap}
        onPointerMove={(e) => e.pointerType === 'mouse' && setHovered(pointedAt(e.clientX))}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(null)}
      >
        {parts.map((part, i) => (
          <button
            key={i}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            className={`timeline-part ${part.kind}${i === active ? ' active' : ''}`}
            style={{ flexGrow: part.ms }}
            tabIndex={i === Math.min(current, parts.length - 1) ? 0 : -1}
            aria-label={part.label}
            onFocus={(e) => {
              setCurrent(i)
              // Only focus from the keyboard shows the part: a tap's focus would otherwise stick to it.
              if (e.currentTarget.matches(':focus-visible')) setFocused(i)
            }}
            onBlur={() => setFocused(null)}
            onClick={() => toggle(i)}
          />
        ))}
      </div>
      {shown && (
        <span ref={tip} className={`timeline-tip ${shown.kind}`} aria-hidden="true">
          <span className="timeline-tip-title">{shown.title}</span>
          <span className="timeline-tip-detail">{shown.detail}</span>
        </span>
      )}
    </div>
  )
}

/** Where the nearest scrolling box (the dialog) or the page starts cutting things off. */
function visibleTop(element: HTMLElement): number {
  const parent = element.parentElement
  if (!parent) return 0
  if (getComputedStyle(parent).overflowY !== 'visible') return Math.max(parent.getBoundingClientRect().top, 0)
  return visibleTop(parent)
}
