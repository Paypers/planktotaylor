// Title and video matching, shared by the app and the scripts: keep this file free of imports.

/** Lower-case, drop "(Taylor's Version)", "(From The Vault)", "(From "Some Film")", "(feat. …)" and punctuation. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&quot;/g, "'")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[([](feat\.?|featuring|ft\.?|with) [^)\]]*[)\]]/g, '')
    .replace(/\(taylor's version\)/g, '')
    .replace(/\(from the vault\)/g, '')
    .replace(/\(from ['"][^)]*\)/g, '')
    .replace(/\$/g, 's')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Words YouTube uploads wrap around a song title. Longest phrases first.
const NOISE = [
  'taylor s version',
  'from the vault',
  'official music video',
  'official lyric video',
  'official video',
  'official audio',
  'lyric video',
  'music video',
  'visualizer',
  'taylor swift',
  'official',
  'lyrics',
  'audio',
  'video',
]

/** A YouTube video title reduced to just the song name, e.g. "Taylor Swift - Karma (Official Audio)" → "karma". */
export function videoSongName(videoTitle: string): string {
  let name = ` ${normalizeTitle(videoTitle.replace(/\s(ft|feat)\.?\s.*$/i, ''))} `
  for (const phrase of NOISE) name = name.replaceAll(` ${phrase} `, ' ')
  return name.replace(/\s+/g, ' ').trim()
}

/** ISO 8601 durations from the YouTube API ("PT3M51S") to seconds. */
export function parseIsoDuration(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return 0
  const [, h = '0', m = '0', s = '0'] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

/** A YouTube video id: 11 letters, digits, - or _. Anything else from outside is ignored. */
export const isVideoId = (id: string) => /^[\w-]{11}$/.test(id)

export interface VideoCandidate {
  id: string
  title: string
  channel: string
  seconds: number
}

export interface WantedSong {
  title: string
  seconds: number
  /** The catalog uses the re-recording, so only uploads labelled "Taylor's Version" will do. */
  taylorsVersion: boolean
}

/** How far a video's length may be from the catalog's before it's considered a different recording. */
export const LENGTH_TOLERANCE = 10

/** Only album tracks: YouTube's auto-generated uploads of the album recording, never videos or re-uploads. */
export const ALBUM_AUDIO_CHANNEL = 'Taylor Swift - Topic'
export const ALBUM_AUDIO_CHANNEL_ID = 'UCPC0L1d253x-KuMNwa05TpA'

const channelKey = (channel: string) => channel.toLowerCase().replace(/\s+/g, '')

export function isAlbumAudioChannel(channel: string): boolean {
  return channelKey(channel) === channelKey(ALBUM_AUDIO_CHANNEL)
}

/**
 * An album track titled exactly as the song (so no live takes, remixes or acoustic versions),
 * and Taylor's Version where the catalog uses one.
 */
export function isRightVideo(video: Pick<VideoCandidate, 'title' | 'channel'>, song: Pick<WantedSong, 'title' | 'taylorsVersion'>): boolean {
  if (!isAlbumAudioChannel(video.channel)) return false
  if (videoSongName(video.title) !== normalizeTitle(song.title)) return false
  return !song.taylorsVersion || /taylor['’]?s version/i.test(video.title)
}

/** The song's album track, or null. Several album editions carry it: take the one closest in length. */
export function pickVideo(candidates: readonly VideoCandidate[], song: WantedSong): VideoCandidate | null {
  let best: { video: VideoCandidate; off: number } | null = null
  for (const video of candidates) {
    if (!isRightVideo(video, song)) continue
    const off = Math.abs(video.seconds - song.seconds)
    if (off > LENGTH_TOLERANCE) continue
    if (!best || off < best.off) best = { video, off }
  }
  return best?.video ?? null
}
