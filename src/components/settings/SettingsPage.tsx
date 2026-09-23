import { useEffect, useRef } from 'react'
import { followLink, hashFor, HOME, navigate, type Route } from '../../lib/route'
import { Icon } from '../Icon'
import { SECTIONS } from './sections'

const MENU: Route = { page: 'settings', section: null }

/**
 * Settings: the menu of sections on the left and the open one beside it.
 * Phones show one at a time: the menu at #settings, a section at #settings/<id>.
 */
export function SettingsPage({ section: sectionId }: { section: string | null }) {
  const section = SECTIONS.find((s) => s.id === sectionId) ?? null
  // Wide screens always show a section, the first one when none is picked.
  const shown = section ?? SECTIONS[0]
  const pageHeading = useRef<HTMLHeadingElement>(null)
  const sectionHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${section ? `${section.label} · ` : ''}Settings · Plank to Taylor`
    // Screen readers start from the new heading, as on a new page.
    ;(section ? sectionHeading : pageHeading).current?.focus({ preventScroll: true })
  }, [section])

  useEffect(
    () => () => {
      document.title = 'Plank to Taylor'
    },
    [],
  )

  return (
    <div className={`settings grid ${section ? 'at-section' : 'at-menu'}`}>
      <div className="settings-top">
        <h1 ref={pageHeading} tabIndex={-1} className="settings-title">
          Settings
        </h1>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(HOME)}>
          Done
        </button>
      </div>
      <div className="section-rule" />

      <nav className="settings-nav" aria-label="Settings sections">
        <ul>
          {SECTIONS.map((s) => {
            const to: Route = { page: 'settings', section: s.id }
            return (
              <li key={s.id}>
                <a
                  href={hashFor(to)}
                  className="settings-link"
                  aria-current={s.id === shown.id ? 'page' : undefined}
                  onClick={(e) => followLink(e, to)}
                >
                  <Icon name={s.icon} />
                  <span className="settings-link-text">
                    <span className="settings-link-label">{s.label}</span>
                    <span className="settings-link-summary">{s.summary}</span>
                  </span>
                  <Icon name="right" className="settings-link-chevron" />
                </a>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="settings-body" aria-labelledby={`settings-${shown.id}`}>
        <a href={hashFor(MENU)} className="settings-back" onClick={(e) => followLink(e, MENU)}>
          <Icon name="left" size={18} />
          Settings
        </a>
        <h2 ref={sectionHeading} tabIndex={-1} id={`settings-${shown.id}`} className="settings-section-title">
          {shown.label}
        </h2>
        <shown.Content />
      </section>
    </div>
  )
}
