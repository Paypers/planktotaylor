import { useState } from 'react'

/** A player's photo in a circle, or the first letter of their name until they add one (or if it won't load). */
export function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  const [broken, setBroken] = useState<string | null>(null)
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) }
  return url && url !== broken ? (
    <img className="avatar" src={url} alt="" width={size} height={size} style={style} onError={() => setBroken(url)} />
  ) : (
    <span className="avatar avatar-initial" style={style} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
