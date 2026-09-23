// Watches the "Taylor Swift - Topic" channel for announced songs ("?" for their length in
// src/data/songs.ts) and, the moment one is out, commits its track and length on top of
// origin/main and pushes, so the site redeploys with it. See "New releases" in the README.
//
//   npm run watch:release                    watch, and publish each song the moment it's out
//   npm run watch:release -- --dry-run       watch, and show the commit it would push instead
//   npm run watch:release -- --try "Title"   rehearse on a song that's already out (never pushes)
//
// Sources: the channel's RSS feed every 15s, plus its upload list through the API every 30s when
// YOUTUBE_API_KEY is set (about 120 of the 10,000 daily quota units an hour).

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UPCOMING, formatDuration, slugify, type UpcomingSong } from '../src/data/songs.ts'
import { ALBUM_AUDIO_CHANNEL, ALBUM_AUDIO_CHANNEL_ID, isAlbumAudioChannel, isRightVideo, isVideoId, parseIsoDuration } from '../src/lib/match.ts'

const KEY = process.env.YOUTUBE_API_KEY
const SITE = 'https://planktotaylor.pages.dev'
const API = 'https://www.googleapis.com/youtube/v3'
const UPLOADS_PLAYLIST = `UU${ALBUM_AUDIO_CHANNEL_ID.slice(2)}`
const VIDEOS_FILE = 'src/data/youtube-videos.json'
const SONGS_FILE = 'src/data/songs.ts'
const TICK = 15_000

const args = process.argv.slice(2)
const tryTitle = args.includes('--try') ? (args[args.indexOf('--try') + 1] ?? '') : undefined
const dryRun = args.includes('--dry-run') || tryTitle !== undefined
if (tryTitle === '') throw new Error('Usage: npm run watch:release -- --try "Song Title"')

type Wanted = Pick<UpcomingSong, 'id' | 'title'>
interface Upload {
  id: string
  title: string
  published: string
}
interface Track {
  id: string
  seconds: number
  embeddable: boolean
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const clockTime = () => new Date().toLocaleTimeString()
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function gitRaw(gitArgs: string[], options: { input?: string; env?: Record<string, string> } = {}): string {
  return execFileSync('git', gitArgs, { encoding: 'utf8', input: options.input, env: { ...process.env, ...options.env }, stdio: ['pipe', 'pipe', 'pipe'] })
}
const git = (gitArgs: string[], options?: { input?: string; env?: Record<string, string> }) => gitRaw(gitArgs, options).trim()

// ── YouTube ─────────────────────────────────────────────────────────────────

class QuotaExceeded extends Error {}
let units = 0
let apiOn = Boolean(KEY)

async function api(path: string, params: Record<string, string>, cost: number) {
  const response = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key: KEY! })}`)
  const json = await response.json()
  if (!response.ok) {
    const text = `${json?.error?.errors?.[0]?.reason ?? ''} ${json?.error?.message ?? ''}`
    if (response.status === 429 || (response.status === 403 && /quota|limit/i.test(text))) throw new QuotaExceeded(text)
    throw new Error(`YouTube ${path} failed (${response.status}): ${text.trim()}`)
  }
  units += cost
  return json
}

const decodeXml = (text: string) =>
  text.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** The newest uploads from the Topic channel's RSS feed (free, no key). */
async function feedUploads(): Promise<Upload[]> {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${UPLOADS_PLAYLIST}&t=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache' },
  })
  if (!response.ok) throw new Error(`RSS feed failed (${response.status})`)
  const xml = await response.text()
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map(([, entry]) => ({
      id: /<yt:videoId>([^<]+)</.exec(entry)?.[1] ?? '',
      title: decodeXml(/<title>([^<]*)</.exec(entry)?.[1] ?? ''),
      published: /<published>([^<]+)</.exec(entry)?.[1] ?? '',
    }))
    .filter((upload) => isVideoId(upload.id))
}

/** The newest 50 uploads from the Topic channel's upload list (1 unit). */
async function apiUploads(): Promise<Upload[]> {
  const page = await api('playlistItems', { part: 'snippet', playlistId: UPLOADS_PLAYLIST, maxResults: '50' }, 1)
  return (page.items as { snippet: { title: string; publishedAt: string; resourceId: { videoId: string } } }[])
    .map(({ snippet }) => ({ id: snippet.resourceId.videoId, title: snippet.title, published: snippet.publishedAt }))
    .filter((upload) => isVideoId(upload.id))
}

/** The track's exact length, from the API (1 unit) or, without one, from its watch page. Null until it's public. */
async function trackDetails(videoId: string): Promise<Track | null> {
  if (apiOn) {
    try {
      const json = await api('videos', { part: 'snippet,contentDetails,status', id: videoId }, 1)
      const video = json.items[0]
      if (!video) return null
      if (!isAlbumAudioChannel(video.snippet.channelTitle)) return null
      return { id: videoId, seconds: parseIsoDuration(video.contentDetails.duration), embeddable: video.status?.embeddable !== false }
    } catch (error) {
      if (error instanceof QuotaExceeded) apiOn = false
      console.log(`\n  API: ${message(error)} (reading the watch page instead)`)
    }
  }
  const html = await (await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: { 'accept-language': 'en-US' } })).text()
  const seconds = Number(/"lengthSeconds":"(\d+)"/.exec(html)?.[1] ?? 0)
  return seconds ? { id: videoId, seconds, embeddable: !/"playableInEmbed":false/.test(html) } : null
}

// ── Publishing ──────────────────────────────────────────────────────────────

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A commit on top of origin/main that adds the track to youtube-videos.json and fills in the
 * song's length in songs.ts, built in a throwaway index so the working copy is never touched.
 */
function prepareCommit(song: Wanted, track: Track): string {
  git(['fetch', '--quiet', 'origin', 'main'])
  const base = git(['rev-parse', 'origin/main'])
  const files: Record<string, string> = {}

  const videos = JSON.parse(gitRaw(['show', `${base}:${VIDEOS_FILE}`])) as Record<string, unknown>
  videos[song.id] = { id: track.id, seconds: track.seconds }
  const sorted = Object.fromEntries(Object.entries(videos).sort(([a], [b]) => a.localeCompare(b)))
  files[VIDEOS_FILE] = `${JSON.stringify(sorted, null, 2)}\n`

  const songs = gitRaw(['show', `${base}:${SONGS_FILE}`])
  // The last song of an album closes its string: `    Title | ?\`,`
  const line = new RegExp(`^(\\s*)${escapeRegExp(song.title)} \\| \\?(?=\`?,?\\r?$)`, 'm')
  if (line.test(songs)) {
    files[SONGS_FILE] = songs.replace(line, (_, indent: string) => `${indent}${song.title} | ${formatDuration(track.seconds)}`)
  } else if (!tryTitle) {
    throw new Error(`origin/main doesn't list "${song.title} | ?" in ${SONGS_FILE}. Push the release prep first.`)
  }

  const dir = mkdtempSync(join(tmpdir(), 'watch-release-'))
  const env = { GIT_INDEX_FILE: join(dir, 'index') }
  try {
    git(['read-tree', base], { env })
    for (const [path, content] of Object.entries(files)) {
      const blob = git(['hash-object', '-w', '--stdin'], { input: content })
      git(['update-index', '--cacheinfo', `100644,${blob},${path}`], { env })
    }
    const tree = git(['write-tree'], { env })
    return git(['commit-tree', tree, '-p', base, '-m', `${song.title} is out: its album track from YouTube (${formatDuration(track.seconds)})`])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function push(song: Wanted, track: Track): string {
  for (let attempt = 1; ; attempt++) {
    const commit = prepareCommit(song, track)
    try {
      git(['push', '--quiet', 'origin', `${commit}:refs/heads/main`])
      return commit
    } catch (error) {
      if (attempt === 3) throw error
      console.log(`  Push rejected (${message(error).split('\n')[0]}). Trying again on top of the latest origin/main…`)
    }
  }
}

/** Fast-forwards the local main to the pushed commit when that's safe; otherwise leaves it. */
function updateLocal() {
  try {
    const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'])
    if (branch !== 'main') return console.log(`  Your checkout is on ${branch}: pull main when you're ready.`)
    git(['merge', '--ff-only', '--quiet', 'origin/main'])
    console.log('  Your local main has it too.')
  } catch {
    console.log("  Your local main couldn't fast-forward (unpushed commits or local edits to the same files): pull when you're ready.")
  }
}

/** Waits for the redeployed site to serve the new track. */
async function confirmLive(videoId: string) {
  console.log(`  Waiting for ${SITE} to redeploy…`)
  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    try {
      const html = await (await fetch(`${SITE}/?t=${Date.now()}`, { cache: 'no-store' })).text()
      for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
        if ((await (await fetch(SITE + path)).text()).includes(videoId)) {
          console.log(`  ✓ Live at ${clockTime()}: ${SITE}`)
          return
        }
      }
    } catch {
      // Keep waiting: a deploy can briefly serve errors.
    }
    await sleep(15_000)
  }
  console.log('  Not live after 15 minutes: check the Cloudflare Pages dashboard.')
}

async function release(song: Wanted, track: Track) {
  process.stdout.write('\x07')
  console.log(`\n\n♪ ${song.title} is out: https://youtu.be/${track.id} (${formatDuration(track.seconds)}), found at ${clockTime()}`)
  if (!track.embeddable) console.log("  ! Embedding is turned off for now: the site will show a \"Play on YouTube\" link until it's allowed.")
  if (dryRun) {
    const commit = prepareCommit(song, track)
    console.log(`  Dry run: this is what would be pushed (commit ${commit.slice(0, 7)}, not pushed):\n`)
    console.log(git(['show', '--format=  %s', '--unified=1', commit]))
    return
  }
  let commit: string
  try {
    commit = push(song, track)
  } catch (error) {
    console.log(`\n  ✗ Couldn't push: ${message(error)}`)
    console.log(`  Add this to ${VIDEOS_FILE}, set the length in ${SONGS_FILE} to ${formatDuration(track.seconds)}, and push:`)
    console.log(`    "${song.id}": { "id": "${track.id}", "seconds": ${track.seconds} }`)
    process.exitCode = 1
    return
  }
  console.log(`  Pushed ${commit.slice(0, 7)} to main at ${clockTime()}.`)
  updateLocal()
  await confirmLive(track.id)
}

/** Keeps Windows from sleeping for as long as this process runs. */
function keepAwake() {
  if (process.platform !== 'win32') return
  const script = [
    `Add-Type -Namespace KeepAwake -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);'`,
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED, held until this helper exits with the watcher.
    '[KeepAwake.Power]::SetThreadExecutionState(0x80000001) | Out-Null',
    `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 20 }`,
  ].join('\n')
  spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true }).unref()
}

// ── Main ────────────────────────────────────────────────────────────────────

const watching: Wanted[] = tryTitle ? [{ id: slugify(tryTitle), title: tryTitle }] : [...UPCOMING]
if (!watching.length) {
  console.log(`Nothing announced: give a song "?" for its length in ${SONGS_FILE} to watch for it.`)
  process.exit(0)
}

console.log(`Watching for ${watching.map((s) => s.title).join(', ')}${tryTitle ? ' (rehearsal, never pushes)' : dryRun ? ' (dry run, never pushes)' : ''}.`)
console.log(KEY ? 'Sources: RSS feed every 15s + YouTube API every 30s.' : 'Source: RSS feed every 15s. Set YOUTUBE_API_KEY for a second source.')
if (!dryRun) {
  // Catch a missing prep or a push that needs signing in now, not at midnight.
  git(['fetch', '--quiet', 'origin', 'main'])
  const songs = gitRaw(['show', `origin/main:${SONGS_FILE}`])
  const missing = watching.filter((song) => !songs.includes(`${song.title} | ?`))
  if (missing.length) {
    console.log(`\n✗ origin/main doesn't list ${missing.map((s) => `"${s.title} | ?"`).join(', ')} yet. Push the release prep first.`)
    process.exit(1)
  }
  try {
    git(['push', '--dry-run', '--quiet', 'origin', 'origin/main:refs/heads/main'])
  } catch (error) {
    console.log(`\n✗ A test push failed, so the real one would too: ${message(error)}`)
    process.exit(1)
  }
  console.log(`origin/main is ready and pushing works. It publishes on its own, then checks ${SITE}.`)
}
keepAwake()
console.log('')

let checks = 0
let lastProblem = ''
for (let tick = 0; watching.length; tick++) {
  const uploads: Upload[] = []
  const problems: string[] = []
  try {
    uploads.push(...(await feedUploads()))
  } catch (error) {
    problems.push(`RSS: ${message(error)}`)
  }
  if (apiOn && tick % 2 === 0) {
    try {
      uploads.push(...(await apiUploads()))
    } catch (error) {
      if (error instanceof QuotaExceeded) apiOn = false
      problems.push(`API: ${message(error)}`)
    }
  }
  checks++

  for (const song of [...watching]) {
    const seen = new Set<string>()
    const matches = uploads
      .filter((upload) => isRightVideo({ title: upload.title, channel: ALBUM_AUDIO_CHANNEL }, { title: song.title, taylorsVersion: false }))
      .sort((a, b) => Date.parse(a.published) - Date.parse(b.published))
      .filter((upload) => !seen.has(upload.id) && seen.add(upload.id))
    for (const upload of matches) {
      let track: Track | null = null
      try {
        track = await trackDetails(upload.id)
      } catch (error) {
        problems.push(`length of ${upload.id}: ${message(error)}`)
      }
      if (!track) {
        problems.push(`found https://youtu.be/${upload.id} ("${upload.title}"), waiting for it to go public`)
        continue
      }
      await release(song, track)
      watching.splice(watching.indexOf(song), 1)
      break
    }
  }

  const problem = problems.join('; ')
  if (problem && problem !== lastProblem) console.log(`\n  ${clockTime()} ${problem}`)
  lastProblem = problem
  if (!watching.length) break
  process.stdout.write(`\r${clockTime()}  still watching for ${watching.map((s) => s.title).join(', ')} · ${checks} checks · ${units} quota units   `)
  await sleep(TICK)
}
