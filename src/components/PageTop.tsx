import { useEffect, useRef } from 'react'
import { HOME, navigate } from '../lib/route'

/** A page's title, with Done to go home. The title takes focus on arrival, for screen readers. */
export function PageTop({ title }: { title: string }) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${title} · Plank to Taylor`
    heading.current?.focus({ preventScroll: true })
    return () => {
      document.title = 'Plank to Taylor'
    }
  }, [title])

  return (
    <div className="grid">
      <div className="page-top">
        <h1 ref={heading} tabIndex={-1} className="page-title">
          {title}
        </h1>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(HOME)}>
          Done
        </button>
      </div>
    </div>
  )
}
