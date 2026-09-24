import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { useAttempts } from '../lib/attempts'
import type { DayKey } from '../lib/dates'
import type { Completion } from '../lib/progress'
import { playerRank } from '../lib/ranks'
import { HOME, navigate } from '../lib/route'
import { siteLink } from '../lib/share'
import { CARD_WIDTH } from '../lib/shareCard'
import { cardHeight, renderYearCard, type CardSize } from '../lib/yearCard'
import { REVIEW_NAME, reviewSlides, reviewText, reviewYear, yearInReview, type Slide, type YearReview as Review } from '../lib/yearInReview'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { RankPlaque } from './Rank'
import { RankEmblem } from './RankEmblem'
import { ShareSheet } from './ShareDialog'

/**
 * Before December, Your Plank Year can still be opened to try it out: on this computer while building
 * the site, or on the live site with ?preview in the address (https://…/?preview#year).
 */
export function yearPreview(): boolean {
  return /(^|[?&])preview\b/.test(location.search) || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
}

/** Which year to show today, if any: the review's own window, or the year so far in a preview. */
export function shownYear(today: DayKey): number | null {
  return reviewYear(today) ?? (yearPreview() ? Number(today.slice(0, 4)) : null)
}

interface Props {
  completions: Completion[]
  today: DayKey
  /** Signed in: the ladder slide shows the rank reached. */
  earningXp: boolean
}

/** Your Plank Year, full screen: slides you tap through, each with a card to share. */
export function YearReview({ completions, today, earningXp }: Props) {
  const attempts = useAttempts()
  const year = shownYear(today)
  const review = useMemo(() => (year ? yearInReview(completions, attempts, year, today) : null), [completions, attempts, year, today])
  const slides = useMemo(() => {
    if (!review) return []
    // The rank as it stood at the end of the year (or now, in December).
    const rank = earningXp ? playerRank(completions.filter((c) => c.day <= review.to)) : null
    return reviewSlides(review, rank)
  }, [review, completions, earningXp])

  const [index, setIndex] = useState(0)
  const [sharing, setSharing] = useState(false)
  const close = useCallback(() => navigate(HOME), [])
  const last = slides.length - 1
  const go = useCallback((step: number) => setIndex((i) => Math.min(Math.max(0, i + step), Math.max(0, last))), [last])

  useEffect(() => {
    document.body.classList.add('no-scroll')
    document.title = `${REVIEW_NAME}${year ? ` ${year}` : ''} · Plank to Taylor`
    return () => {
      document.body.classList.remove('no-scroll')
      document.title = 'Plank to Taylor'
    }
  }, [year])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The share box handles its own keys.
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'ArrowRight') go(1)
      else if (event.key === 'ArrowLeft') go(-1)
      else if (event.key === 'Escape') close()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, close])

  // Tap the right of the slide to go on, the left to go back; or swipe.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const onPointerDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY }
    swiped.current = false
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = e.clientX - start.x
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - start.y)) {
      swiped.current = true
      go(dx < 0 ? 1 : -1)
    }
  }
  const onTap = (e: MouseEvent<HTMLDivElement>) => {
    if (swiped.current) return
    const { left, width } = e.currentTarget.getBoundingClientRect()
    go(e.clientX - left < width / 3 ? -1 : 1)
  }

  if (!year || !review || slides.length === 0) {
    return (
      <div className="year-review" role="dialog" aria-modal="true" aria-label={REVIEW_NAME}>
        <div className="year-top">
          <span />
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="year-stage">
          <div className="year-slide">
            <p className="year-eyebrow">{REVIEW_NAME}</p>
            <p className="year-big words">{year ? `Nothing planked in ${year} yet.` : 'Opens on 1 December.'}</p>
            <p className="year-line">
              {year
                ? "Plank today's song and your year starts here."
                : 'Come back then for your year in planks, with a card to share for each part of it.'}
            </p>
          </div>
        </div>
        <div className="year-actions">
          <button type="button" className="btn btn-primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const slide = slides[Math.min(index, last)]
  const colours = slide.album ? ({ '--year-bg': slide.album.color, '--year-ink': slide.album.ink } as CSSProperties) : undefined

  return (
    <>
      <div
        className={`year-review${slide.album ? ' on-album' : ''}`}
        style={colours}
        role="dialog"
        aria-modal="true"
        aria-label={`${REVIEW_NAME} ${year}`}
      >
        <div className="year-top">
          <div className="year-marks" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.kind} className={i <= index ? 'seen' : undefined} />
            ))}
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="year-stage" onClick={onTap} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <SlideView key={slide.kind} slide={slide} position={`${index + 1} of ${slides.length}`} />
        </div>

        <div className="year-actions">
          <button type="button" className="icon-btn" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous">
            <Icon name="left" />
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setSharing(true)}>
            Share
          </button>
          {index < last ? (
            <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Next">
              <Icon name="right" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={close}>
              Done
            </button>
          )}
        </div>
      </div>
      {/* Outside the slide, so it keeps the page's own colours on the album's slide. */}
      <Dialog open={sharing} title="Share your year" onClose={() => setSharing(false)}>
        <YearShare slide={slide} review={review} />
      </Dialog>
    </>
  )
}

function SlideView({ slide, position }: { slide: Slide; position: string }) {
  const figure = /^[\d.,:]+$/.test(slide.big)
  return (
    <div className="year-slide" aria-live="polite">
      <p className="year-eyebrow">
        {slide.eyebrow}
        <span className="sr-only">, {position}</span>
      </p>
      <p className={`year-big${figure ? '' : ' words'}`}>{slide.big}</p>
      {slide.unit && <p className="year-unit">{slide.unit}</p>}
      {slide.line && <p className="year-line">{slide.line}</p>}
      {slide.rank && (
        <div className="year-rank">
          <RankEmblem tier={slide.rank.tier} size={112} />
          <RankPlaque tier={slide.rank.tier} division={slide.rank.division} size="lg" />
        </div>
      )}
      {slide.rows && (
        <dl className="facts year-rows">
          {slide.rows.map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  )
}

/** The slide as a card, a story (9:16) or a post (4:5), and the year as text. */
function YearShare({ slide, review }: { slide: Slide; review: Review }) {
  const [size, setSize] = useState<CardSize>('story')
  const render = useCallback(() => renderYearCard(slide, review.year, size), [slide, review.year, size])
  const text = useMemo(() => reviewText(review, siteLink()), [review])
  return (
    <>
      <div className="size-choice" role="radiogroup" aria-label="Card size">
        {(['story', 'post'] as const).map((s) => (
          <label key={s} className={size === s ? 'chosen' : undefined}>
            <input type="radio" name="card-size" className="sr-only" checked={size === s} onChange={() => setSize(s)} />
            {s === 'story' ? 'Story' : 'Post'}
          </label>
        ))}
      </div>
      <div className={size === 'story' ? 'share-tall' : undefined}>
        <ShareSheet
          render={render}
          fileName={`plank-year-${review.year}-${slide.kind}-${size}.png`}
          alt={`${REVIEW_NAME} ${review.year}: ${slide.eyebrow}, ${slide.big}${slide.unit ? ` ${slide.unit}` : ''}.`}
          width={CARD_WIDTH}
          height={cardHeight(size)}
          text={text}
        />
      </div>
    </>
  )
}
