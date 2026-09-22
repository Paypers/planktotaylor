import type { Song } from '../data/songs'

// YouTube IFrame Player API, loaded on demand. Minimal types for the parts we use.

export interface YouTubePlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getPlayerState(): number
  /** Seconds into the video. */
  getCurrentTime(): number
  destroy(): void
}

interface PlayerOptions {
  host?: string
  videoId: string
  width?: string | number
  height?: string | number
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void
    onStateChange?: (event: { data: number }) => void
    onError?: (event: { data: number }) => void
  }
}

interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Values of YT.PlayerState. */
export const PlayerState = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

let api: Promise<YouTubeNamespace> | null = null

export function loadYouTube(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  api ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT!)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      api = null
      reject(new Error('Could not load the YouTube player'))
    }
    document.head.appendChild(script)
  })
  return api
}

export function createPlayer(element: HTMLElement, videoId: string, events: PlayerOptions['events']): Promise<YouTubePlayer> {
  return loadYouTube().then(
    (YT) =>
      new YT.Player(element, {
        // The privacy-enhanced domain: no YouTube cookies until the visitor presses play.
        host: 'https://www.youtube-nocookie.com',
        videoId,
        width: '100%',
        height: '100%',
        // No scrubber or keyboard seeking: the plank timer follows the song, so skipping ahead
        // would cut the plank short. Tapping the video still plays and pauses it.
        playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, origin: window.location.origin },
        events,
      }),
  )
}

/** The song's video on YouTube, or a search for it when we don't know the video yet. */
export function youtubeUrl(song: Song): string {
  if (song.youtubeId) return `https://www.youtube.com/watch?v=${song.youtubeId}`
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`Taylor Swift ${song.title} official audio`)}`
}
