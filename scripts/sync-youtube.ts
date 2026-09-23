// Finds each song's album track (a "Taylor Swift - Topic" upload, Taylor's Version where the
// catalog uses one) and writes its video id and exact length to src/data/youtube-videos.json.
//
//   npm run sync:youtube              re-check saved tracks, then look up the missing ones
//   npm run sync:youtube -- --check   only re-check saved tracks and report (no changes)
//   npm run sync:youtube -- --fresh   forget everything and look it all up again
//
// Re-checking is free (YouTube's oEmbed endpoint) and drops removed, unembeddable or wrong tracks.
// Looking up needs YOUTUBE_API_KEY: first the channel's upload list (1 unit per 50 tracks), then
// searches for what's left (100 units each). Out of quota, progress is saved for tomorrow.

import { readFile, writeFile } from 'node:fs/promises'
import { ALBUMS, ALBUM_ORDER, SONGS, type Song } from '../src/data/songs.ts'
import {
  ALBUM_AUDIO_CHANNEL_ID,
  isRightVideo,
  isVideoId,
  normalizeTitle,
  parseIsoDuration,
  pickVideo,
  videoSongName,
  type VideoCandidate,
  type WantedSong,
} from '../src/lib/match.ts'

const KEY = process.env.YOUTUBE_API_KEY
const OUTPUT = new URL('../src/data/youtube-videos.json', import.meta.url)
const API = 'https://www.googleapis.com/youtube/v3'
// Every channel's uploads playlist id is its channel id with "UC" swapped for "UU".
const UPLOADS_PLAYLIST = `UU${ALBUM_AUDIO_CHANNEL_ID.slice(2)}`
const checkOnly = process.argv.includes('--check')
const fresh = process.argv.includes('--fresh')

class QuotaExceeded extends Error {}
class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let units = 0
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function call(path: string, params: Record<string, string>, cost: number) {
  const response = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: KEY! })}`)
  const json = await response.json()
  if (!response.ok) {
    const message: string = json?.error?.message ?? 'unknown error'
    const reason: string = json?.error?.errors?.[0]?.reason ?? ''
    // Google reports the daily cap as 403 quotaExceeded or as 429 "Quota exceeded … per day".
    if (response.status === 429 || (response.status === 403 && /quota|limit/i.test(`${reason} ${message}`))) {
      throw new QuotaExceeded(message)
    }
    throw new ApiError(`YouTube ${path} failed (${response.status}): ${message}`, response.status)
  }
  units += cost
  await sleep(100)
  return json
}

/** Titles, channels and lengths for up to any number of ids (1 unit per 50). */
async function videoDetails(ids: string[]): Promise<VideoCandidate[]> {
  const videos: VideoCandidate[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const details = await call('videos', { part: 'snippet,contentDetails,status', id: ids.slice(i, i + 50).join(',') }, 1)
    for (const v of details.items) {
      if (v.status?.embeddable === false || !isVideoId(v.id)) continue
      videos.push({ id: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, seconds: parseIsoDuration(v.contentDetails.duration) })
    }
  }
  return videos
}

/** A search limited to the album-track channel (100 units). */
async function searchAlbumTracks(q: string, maxResults: number): Promise<VideoCandidate[]> {
  const search = await call(
    'search',
    { part: 'snippet', type: 'video', videoEmbeddable: 'true', channelId: ALBUM_AUDIO_CHANNEL_ID, maxResults: String(maxResults), q },
    100,
  )
  return videoDetails(search.items.map((item: { id: { videoId?: string } }) => item.id.videoId).filter(Boolean))
}

/**
 * Every upload on the album-track channel whose title looks like one of `titles`, read from the
 * channel's uploads playlist (1 unit per 50). Null if YouTube won't list that playlist.
 */
async function albumTrackUploads(titles: Set<string>): Promise<VideoCandidate[] | null> {
  const ids: string[] = []
  let pageToken: string | undefined
  let pages = 0
  do {
    let page
    try {
      page = await call('playlistItems', { part: 'snippet', playlistId: UPLOADS_PLAYLIST, maxResults: '50', ...(pageToken ? { pageToken } : {}) }, 1)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && pages === 0) return null
      throw error
    }
    for (const item of page.items as { snippet: { title: string; resourceId: { videoId: string } } }[]) {
      if (titles.has(videoSongName(item.snippet.title))) ids.push(item.snippet.resourceId.videoId)
    }
    pageToken = page.nextPageToken
    pages++
    process.stdout.write(`\r  read ${pages * 50} uploads, ${ids.length} possible matches`)
  } while (pageToken && pages < 400)
  process.stdout.write('\n')
  return videoDetails(ids)
}

const wanted = (song: Song): WantedSong => ({
  title: song.title,
  seconds: song.seconds,
  taylorsVersion: ALBUMS[song.album].title.includes("Taylor's Version"),
})

const songById = new Map(SONGS.map((song) => [song.id, song]))
const saved: Record<string, { id: string; seconds?: number }> = fresh ? {} : JSON.parse(await readFile(OUTPUT, 'utf8'))
const pending = () => SONGS.filter((song) => !saved[song.id])
const missing: Song[] = []
const lengthChanges: string[] = []
const lengthMismatches: string[] = []

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Album tracks with the right title and version whose length disagrees with songs.ts. */
function noteLengthMismatches(pool: VideoCandidate[], songs: Song[]) {
  for (const song of songs) {
    const close = pool.find((video) => isRightVideo(video, wanted(song)))
    if (close) lengthMismatches.push(`${song.title}: "${close.title}" is ${clock(close.seconds)}, songs.ts says ${clock(song.seconds)}`)
  }
}

async function save() {
  if (checkOnly) return
  const sorted = Object.fromEntries(Object.entries(saved).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`)
}

/** Re-checks every saved track through oEmbed (free) and returns the ones that should go. */
async function verifySaved(): Promise<{ songId: string; reason: string }[]> {
  const problems: { songId: string; reason: string }[] = []
  const entries = Object.entries(saved)
  const seen = new Map<string, string>()
  for (const [songId, { id }] of entries) {
    if (seen.has(id)) problems.push({ songId, reason: `same video as ${songById.get(seen.get(id)!)?.title ?? seen.get(id)}` })
    seen.set(id, songId)
  }
  const queue = [...entries]
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const [songId, { id, seconds }] = entry
      const song = songById.get(songId)
      if (!song) {
        problems.push({ songId, reason: 'no longer in the catalog' })
        continue
      }
      const url = `https://www.youtube.com/watch?v=${id}`
      const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
      if (!response.ok) {
        // 401: embedding turned off; 404: removed or private.
        problems.push({ songId, reason: response.status === 401 ? 'embedding turned off' : `video unavailable (${response.status})` })
        continue
      }
      const { title, author_name: channel } = (await response.json()) as { title: string; author_name: string }
      if (!isRightVideo({ title, channel }, wanted(song))) problems.push({ songId, reason: `"${title}" by ${channel}` })
      else if (seconds === undefined) problems.push({ songId, reason: 'saved without its length' })
      await sleep(50)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return problems
}

function record(song: Song, video: VideoCandidate) {
  saved[song.id] = { id: video.id, seconds: video.seconds }
  const diff = video.seconds - song.seconds
  if (Math.abs(diff) >= 2) lengthChanges.push(`${song.title}: ${diff > 0 ? '+' : ''}${diff}s`)
}

function matchAll(pool: VideoCandidate[], songs: Song[]) {
  for (const song of songs) {
    const video = pickVideo(pool, wanted(song))
    if (video) record(song, video)
  }
}

const savedCount = Object.keys(saved).length
if (savedCount > 0) {
  console.log(`Re-checking ${savedCount} saved tracks…`)
  const problems = await verifySaved()
  const shown = problems.slice(0, 25)
  for (const { songId, reason } of shown) console.log(`  ✗ ${songById.get(songId)?.title ?? songId}: ${reason}`)
  if (problems.length > shown.length) console.log(`  …and ${problems.length - shown.length} more`)
  for (const { songId } of problems) delete saved[songId]
  console.log(problems.length ? `${problems.length} to replace.\n` : 'All good.\n')
  if (checkOnly) {
    const good = savedCount - problems.length
    console.log(`${good} of ${SONGS.length} songs have their album track; ${SONGS.length - good} need one.`)
    process.exit(0)
  }
  await save()
} else if (checkOnly) {
  console.log('No saved tracks yet.')
  process.exit(0)
}

if (!KEY) {
  const left = pending().length
  if (left === 0) process.exit(0)
  console.log(`${left} songs still need their album track. Set YOUTUBE_API_KEY (in .env or your shell) to look them up:`)
  console.log('Google Cloud Console → enable "YouTube Data API v3" → Credentials → Create API key.')
  process.exit(0)
}

let quotaHit = false
try {
  // Pass 1: read the album-track channel's whole upload list (cheap).
  if (pending().length) {
    console.log('Reading the "Taylor Swift - Topic" upload list…')
    const pool = await albumTrackUploads(new Set(pending().map((song) => normalizeTitle(song.title))))
    if (pool) {
      const before = pending().length
      matchAll(pool, pending())
      noteLengthMismatches(pool, pending())
      await save()
      console.log(`Found ${before - pending().length} of ${before}.\n`)
    } else {
      console.log('YouTube would not list that channel’s uploads; searching instead.\n')
    }
  }

  // Pass 2: one search per album, limited to album tracks.
  for (const albumId of ALBUM_ORDER) {
    const songs = pending().filter((song) => song.album === albumId)
    if (songs.length < 2) continue
    matchAll(await searchAlbumTracks(ALBUMS[albumId].title, 50), songs)
    await save()
    const found = songs.length - pending().filter((s) => s.album === albumId).length
    console.log(`${ALBUMS[albumId].title}: ${found}/${songs.length} found`)
  }

  // Pass 3: search each remaining song on its own.
  const rest = pending()
  if (rest.length) console.log(`\nSearching ${rest.length} remaining songs one at a time…`)
  for (const [i, song] of rest.entries()) {
    const query = `${song.title}${wanted(song).taylorsVersion ? " (Taylor's Version)" : ''}`
    const video = pickVideo(await searchAlbumTracks(query, 10), wanted(song))
    if (video) record(song, video)
    else missing.push(song)
    await save()
    process.stdout.write(`\r${i + 1}/${rest.length}`)
  }
} catch (error) {
  if (!(error instanceof QuotaExceeded)) throw error
  quotaHit = true
  await save()
}

const found = SONGS.length - pending().length
console.log(`\n\n${found} of ${SONGS.length} songs have their album track → src/data/youtube-videos.json (about ${units} quota units used)`)
if (lengthChanges.length) console.log(`\nLengths corrected by 2s or more:\n  ${lengthChanges.join('\n  ')}`)
if (lengthMismatches.length) {
  console.log('\nFound the album track, but its length is more than 10s off the one in songs.ts, so it was skipped.')
  console.log(`If the track's length is right, correct songs.ts and run this again:\n  ${lengthMismatches.join('\n  ')}`)
}
if (quotaHit) {
  console.log(`\nYouTube's daily quota ran out with ${pending().length} songs to go. Progress is saved; run this again tomorrow`)
  console.log('(the quota resets at midnight Pacific time).')
} else if (missing.length) {
  console.log('\nNo album track found (these fall back to a "Play on YouTube" link):')
  for (const song of missing) console.log(`  ${song.title} (${ALBUMS[song.album].title})`)
}
