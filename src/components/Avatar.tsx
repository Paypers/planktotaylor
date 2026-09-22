/** A player's photo in a circle, or the first letter of their name until they add one. */
export function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) }
  return url ? (
    <img className="avatar" src={url} alt="" width={size} height={size} style={style} />
  ) : (
    <span className="avatar avatar-initial" style={style} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
