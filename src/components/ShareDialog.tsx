import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { plankSummary, shareText, siteLink, type ShareInput } from '../lib/share'
import { CARD_HEIGHT, CARD_WIDTH, renderShareCard } from '../lib/shareCard'
import { Dialog } from './Dialog'
import { Icon } from './Icon'

/** Share a finished plank two ways: as a card image, or as Wordle-style text with the link. */
export function ShareDialog({ share, onClose }: { share: ShareInput | null; onClose: () => void }) {
  return (
    <Dialog open={share !== null} title="Share your plank" onClose={onClose}>
      {share && <PlankShareSheet share={share} />}
    </Dialog>
  )
}

function PlankShareSheet({ share }: { share: ShareInput }) {
  const render = useCallback(() => renderShareCard(share), [share])
  const text = useMemo(() => shareText(share), [share])
  return (
    <ShareSheet
      render={render}
      fileName={`plank-to-taylor-${share.day}.png`}
      alt={`${share.song.title}: ${plankSummary(share.pauses, share.song.seconds)}. ${share.streak}-day streak.`}
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      text={text}
    />
  )
}

type Done = 'image' | 'text' | null

interface SheetProps {
  /** Draws the card. A new function draws it again (a different size, say). */
  render: () => Promise<Blob>
  fileName: string
  alt: string
  width: number
  height: number
  /** The same as text, with the link. */
  text: string
}

/** A card image to share, copy or save, and the same as text with the link. */
export function ShareSheet({ render, fileName, alt, width, height, text }: SheetProps) {
  const [card, setCard] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let live = true
    let url = ''
    setCard(null)
    render()
      .then((blob) => {
        if (!live) return
        url = URL.createObjectURL(blob)
        setCard({ blob, url })
      })
      .catch(() => live && setError("Couldn't draw the image here. The text version below still works."))
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [render])

  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const flash = (what: Done) => {
    setError(null)
    setDone(what)
    clearTimeout(doneTimer.current)
    doneTimer.current = setTimeout(() => setDone(null), 2000)
  }

  const file = useMemo(() => card && new File([card.blob], fileName, { type: 'image/png' }), [card, fileName])
  // Phones get the share sheet (Messages, Instagram, Save Image); computers copy or download.
  const touch = matchMedia('(pointer: coarse)').matches
  const canShareImage = touch && !!file && !!navigator.canShare?.({ files: [file] })
  const canCopyImage = typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'

  const shareImage = async () => {
    if (!file) return
    try {
      // The link rides along, so friends can tap straight through.
      await navigator.share({ files: [file], text: `Plank along: ${siteLink()}` })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError("Couldn't open the share sheet. Try Copy image instead.")
    }
  }

  const copyImage = async () => {
    if (!card) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': card.blob })])
      flash('image')
    } catch {
      setError(canShareImage ? "Couldn't copy the image. Try Share image instead." : "Couldn't copy the image here. Use Save image instead.")
    }
  }

  const saveImage = () => {
    if (!card || !file) return
    const link = document.createElement('a')
    link.href = card.url
    link.download = file.name
    link.click()
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text)
      flash('text')
    } catch {
      setError("Couldn't copy. Select the text and copy it instead.")
    }
  }

  const copied = (label: string, what: Done) =>
    done === what ? (
      <>
        <Icon name="check" size={18} />
        Copied
      </>
    ) : (
      label
    )

  return (
    <>
      <div className="share-card">
        {card ? (
          <img src={card.url} width={width} height={height} alt={alt} />
        ) : (
          <div className="share-card-waiting" style={{ aspectRatio: `${width} / ${height}` }}>
            {error ? null : 'Drawing your card…'}
          </div>
        )}
      </div>
      <div className="share-actions">
        {canShareImage ? (
          <>
            <button type="button" className="btn btn-primary" onClick={shareImage} disabled={!card}>
              Share image
            </button>
            {canCopyImage && (
              <button type="button" className="btn btn-secondary" onClick={copyImage} disabled={!card}>
                {copied('Copy image', 'image')}
              </button>
            )}
          </>
        ) : (
          <>
            {canCopyImage && (
              <button type="button" className="btn btn-primary" onClick={copyImage} disabled={!card}>
                {copied('Copy image', 'image')}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={saveImage} disabled={!card}>
              Save image
            </button>
          </>
        )}
      </div>

      <section className="dialog-section share-text-section">
        <h3>Or as text, with the link</h3>
        <p className="share-text">{text}</p>
        <div className="share-actions">
          <button type="button" className="btn btn-secondary" onClick={copyText}>
            {copied('Copy text', 'text')}
          </button>
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
