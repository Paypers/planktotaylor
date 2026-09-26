import type { ReactNode } from 'react'

/** One topic on a page of rules: its name in the left column on wide screens, the rules beside it. */
export function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="section grid" aria-labelledby={`topic-${id}`}>
      <div className="section-rule" />
      <div className="section-label">
        <h2 id={`topic-${id}`}>{title}</h2>
      </div>
      <dl className="section-body rules">{children}</dl>
    </section>
  )
}
