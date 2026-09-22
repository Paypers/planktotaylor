import { useEffect, useRef } from 'react'
import { createPlayer, type YouTubePlayer } from '../lib/youtube'

interface Props {
  videoId: string
  onReady: (player: YouTubePlayer | null) => void
  onStateChange: (state: number) => void
  onError: (code: number) => void
}

export function YouTubeEmbed({ videoId, onReady, onStateChange, onError }: Props) {
  const host = useRef<HTMLDivElement>(null)
  // Latest callbacks, without re-creating the player when they change.
  const handlers = useRef({ onReady, onStateChange, onError })
  handlers.current = { onReady, onStateChange, onError }

  useEffect(() => {
    const container = host.current
    if (!container) return
    let player: YouTubePlayer | null = null
    let cancelled = false
    // The API swaps this placeholder for its iframe, so keep it out of React's hands.
    const placeholder = document.createElement('div')
    container.replaceChildren(placeholder)
    createPlayer(placeholder, videoId, {
      onReady: ({ target }) => !cancelled && handlers.current.onReady(target),
      onStateChange: ({ data }) => !cancelled && handlers.current.onStateChange(data),
      onError: ({ data }) => !cancelled && handlers.current.onError(data),
    })
      .then((created) => {
        if (cancelled) safeDestroy(created)
        else player = created
      })
      .catch(() => !cancelled && handlers.current.onError(-1))
    return () => {
      cancelled = true
      if (player) safeDestroy(player)
      container.replaceChildren()
      handlers.current.onReady(null)
    }
  }, [videoId])

  return <div ref={host} className="video-frame" />
}

// destroy() throws if the player is torn down before its iframe finished loading
// (React mounts effects twice in development); there's nothing left to clean up then.
function safeDestroy(player: YouTubePlayer) {
  try {
    player.destroy()
  } catch {
    // already gone
  }
}
