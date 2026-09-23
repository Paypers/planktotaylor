import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

interface Piece {
  x: number
  y: number
  spin: number
  delay: number
  duration: number
  color: string
  star: boolean
  size: number
}

function burst(colors: readonly string[]): Piece[] {
  return Array.from({ length: 44 }, (_, i) => {
    // A short hop up, fanning out wide either side, then falling down past the headline.
    // Kept low: on a phone the streak number sits near the top of the screen.
    const angle = (0.08 + Math.random() * 0.84) * Math.PI
    const power = 110 + Math.random() * 170
    return {
      x: Math.cos(angle) * power * 1.5,
      y: -Math.sin(angle) * power * 0.55,
      spin: (Math.random() - 0.5) * 900,
      delay: Math.random() * 0.12,
      duration: 1.5 + Math.random() * 0.9,
      color: colors[i % colors.length],
      star: i % 6 === 0,
      size: 6 + Math.random() * 5,
    }
  })
}

/** A one-off burst of confetti from where it's placed. Skipped when reduced motion is asked for. */
export function Confetti({ colors }: { colors: readonly string[] }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [pieces] = useState(() => burst(colors))

  useLayoutEffect(() => {
    const box = anchor.current?.getBoundingClientRect()
    if (box) setOrigin({ x: box.left, y: box.top })
  }, [])

  return (
    <span ref={anchor} className="confetti-anchor" aria-hidden="true">
      {origin && (
        <span className="confetti" style={{ left: origin.x, top: origin.y }}>
          {pieces.map((p, i) => (
            <span
              key={i}
              className={p.star ? 'confetti-star' : 'confetti-bit'}
              style={
                {
                  '--x': `${p.x}px`,
                  '--y': `${p.y}px`,
                  '--spin': `${p.spin}deg`,
                  width: p.star ? p.size * 1.6 : p.size,
                  height: p.size * 1.6,
                  background: p.color,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  )
}
