import youtubeVideos from './youtube-videos.json' with { type: 'json' }

export type AlbumId =
  | 'debut'
  | 'fearless'
  | 'speaknow'
  | 'red'
  | '1989'
  | 'reputation'
  | 'lover'
  | 'folklore'
  | 'evermore'
  | 'midnights'
  | 'ttpd'
  | 'showgirl'
  | 'encore'

export interface Album {
  id: AlbumId
  /** Full album title as released (Taylor's Version where one exists). */
  title: string
  /** Short label for chips. */
  short: string
  year: number
  /** Era fill colour and the text colour that reads on top of it. */
  color: string
  ink: string
  /**
   * Released after the site launched. Its songs stay out of the daily rotation and the ladder:
   * adding them there would reshuffle every day's song and shift everyone's ladder level.
   * They premiere as the song of the day instead (PREMIERES in src/lib/daily.ts).
   */
  afterLaunch?: boolean
  /**
   * New songs that join an album already out, released together (The Encore joins The Life of a
   * Showgirl). They show on that album's page as a release of their own, with a charm of their own,
   * and never change its badge. A whole new album has none.
   */
  partOf?: AlbumId
}

export interface Song {
  id: string
  title: string
  album: AlbumId
  /** 1-based position on the album, used as a stable tie-breaker. */
  track: number
  /** Length in whole seconds: the plank time. */
  seconds: number
  /** The album track on YouTube (a "Taylor Swift - Topic" upload), filled in by `npm run sync:youtube`. */
  youtubeId?: string
}

export const ALBUMS: Record<AlbumId, Album> = {
  debut: { id: 'debut', title: 'Taylor Swift', short: 'Debut', year: 2006, color: '#2e8276', ink: '#ffffff' },
  fearless: { id: 'fearless', title: "Fearless (Taylor's Version)", short: 'Fearless', year: 2008, color: '#d9a92e', ink: '#2a1f05' },
  speaknow: { id: 'speaknow', title: "Speak Now (Taylor's Version)", short: 'Speak Now', year: 2010, color: '#7c4a9e', ink: '#ffffff' },
  red: { id: 'red', title: "Red (Taylor's Version)", short: 'Red', year: 2012, color: '#b3243c', ink: '#ffffff' },
  '1989': { id: '1989', title: "1989 (Taylor's Version)", short: '1989', year: 2014, color: '#8fc1e3', ink: '#0f2a3d' },
  reputation: { id: 'reputation', title: 'reputation', short: 'reputation', year: 2017, color: '#2b2b2e', ink: '#f2f2f2' },
  lover: { id: 'lover', title: 'Lover', short: 'Lover', year: 2019, color: '#f4a9c6', ink: '#3d0f24' },
  folklore: { id: 'folklore', title: 'folklore', short: 'folklore', year: 2020, color: '#a3a39b', ink: '#1d1d1a' },
  evermore: { id: 'evermore', title: 'evermore', short: 'evermore', year: 2020, color: '#a8633a', ink: '#ffffff' },
  midnights: { id: 'midnights', title: 'Midnights', short: 'Midnights', year: 2022, color: '#2f3d73', ink: '#eef0ff' },
  ttpd: { id: 'ttpd', title: 'The Tortured Poets Department', short: 'TTPD', year: 2024, color: '#d6cdbf', ink: '#2b2621' },
  showgirl: { id: 'showgirl', title: 'The Life of a Showgirl', short: 'Showgirl', year: 2025, color: '#e8742f', ink: '#2a1206' },
  encore: {
    id: 'encore',
    title: 'The Life of a Showgirl: The Encore',
    short: 'The Encore',
    year: 2026,
    color: '#c5d93b',
    ink: '#232b06',
    afterLaunch: true,
    partOf: 'showgirl',
  },
}

/** Release order, used to break ties between songs of equal length. */
export const ALBUM_ORDER = Object.keys(ALBUMS) as AlbumId[]

// "Title | m:ss" per line, in album track order: studio albums with deluxe and vault tracks, but no
// alternate mixes, except All Too Well (10 Minute Version). `npm run sync:youtube` swaps in each
// album track's exact length. "?" marks a song that isn't out yet: it stays off the site until
// `npm run watch:release` finds it.
const CATALOG: Record<AlbumId, string> = {
  debut: `
    Tim McGraw | 3:52
    Picture to Burn | 2:53
    Teardrops on My Guitar | 3:35
    A Place in This World | 3:19
    Cold as You | 3:59
    The Outside | 3:27
    Tied Together with a Smile | 4:08
    Stay Beautiful | 3:56
    Should've Said No | 4:02
    Mary's Song (Oh My My My) | 3:33
    Our Song | 3:21
    I'm Only Me When I'm with You | 3:33
    Invisible | 3:23
    A Perfectly Good Heart | 3:40`,
  fearless: `
    Fearless | 4:01
    Fifteen | 4:54
    Love Story | 3:55
    Hey Stephen | 4:14
    White Horse | 3:54
    You Belong with Me | 3:51
    Breathe | 4:23
    Tell Me Why | 3:20
    You're Not Sorry | 4:21
    The Way I Loved You | 4:03
    Forever & Always | 3:45
    The Best Day | 4:05
    Change | 4:39
    Jump Then Fall | 3:57
    Untouchable | 5:12
    Come In with the Rain | 3:57
    Superstar | 4:26
    The Other Side of the Door | 3:58
    Today Was a Fairytale | 4:01
    You All Over Me | 3:40
    Mr. Perfectly Fine | 4:37
    We Were Happy | 4:04
    That's When | 3:09
    Don't You | 3:28
    Bye Bye Baby | 4:02`,
  speaknow: `
    Mine | 3:51
    Sparks Fly | 4:20
    Back to December | 4:54
    Speak Now | 4:02
    Dear John | 6:45
    Mean | 3:58
    The Story of Us | 4:25
    Never Grow Up | 4:50
    Enchanted | 5:53
    Better than Revenge | 3:37
    Innocent | 5:02
    Haunted | 4:03
    Last Kiss | 6:07
    Long Live | 5:18
    Ours | 3:58
    Superman | 4:36
    Electric Touch | 4:26
    When Emma Falls in Love | 4:15
    I Can See You | 4:33
    Castles Crumbling | 5:06
    Foolish One | 5:11
    Timeless | 5:21`,
  red: `
    State of Grace | 4:55
    Red | 3:43
    Treacherous | 4:02
    I Knew You Were Trouble | 3:39
    All Too Well | 5:29
    22 | 3:52
    I Almost Do | 4:04
    We Are Never Ever Getting Back Together | 3:13
    Stay Stay Stay | 3:25
    The Last Time | 4:59
    Holy Ground | 3:23
    Sad Beautiful Tragic | 4:44
    The Lucky One | 4:00
    Everything Has Changed | 4:05
    Starlight | 3:40
    Begin Again | 3:58
    The Moment I Knew | 4:45
    Come Back... Be Here | 3:43
    Girl at Home | 3:40
    Ronan | 4:24
    Better Man | 4:57
    Nothing New | 4:18
    Babe | 3:44
    Message in a Bottle | 3:45
    I Bet You Think About Me | 4:45
    Forever Winter | 4:24
    Run | 4:00
    The Very First Night | 3:20
    All Too Well (10 Minute Version) | 10:13`,
  '1989': `
    Welcome to New York | 3:32
    Blank Space | 3:51
    Style | 3:51
    Out of the Woods | 3:55
    All You Had to Do Was Stay | 3:13
    Shake It Off | 3:39
    I Wish You Would | 3:27
    Bad Blood | 3:31
    Wildest Dreams | 3:40
    How You Get the Girl | 4:07
    This Love | 4:10
    I Know Places | 3:15
    Clean | 4:31
    Wonderland | 4:05
    You Are in Love | 4:27
    New Romantics | 3:50
    "Slut!" | 3:00
    Say Don't Go | 4:39
    Now That We Don't Talk | 2:26
    Suburban Legends | 2:51
    Is It Over Now? | 3:49`,
  reputation: `
    ...Ready for It? | 3:28
    End Game | 4:04
    I Did Something Bad | 3:58
    Don't Blame Me | 3:56
    Delicate | 3:52
    Look What You Made Me Do | 3:31
    So It Goes... | 3:47
    Gorgeous | 3:29
    Getaway Car | 3:53
    King of My Heart | 3:34
    Dancing with Our Hands Tied | 3:31
    Dress | 3:50
    This Is Why We Can't Have Nice Things | 3:27
    Call It What You Want | 3:23
    New Year's Day | 3:55`,
  lover: `
    I Forgot That You Existed | 2:50
    Cruel Summer | 2:58
    Lover | 3:41
    The Man | 3:10
    The Archer | 3:31
    I Think He Knows | 2:53
    Miss Americana & the Heartbreak Prince | 3:54
    Paper Rings | 3:42
    Cornelia Street | 4:47
    Death by a Thousand Cuts | 3:18
    London Boy | 3:10
    Soon You'll Get Better | 3:21
    False God | 3:20
    You Need to Calm Down | 2:51
    Afterglow | 3:43
    ME! | 3:13
    It's Nice to Have a Friend | 2:30
    Daylight | 4:53`,
  folklore: `
    the 1 | 3:30
    cardigan | 3:59
    the last great american dynasty | 3:51
    exile | 4:45
    my tears ricochet | 4:15
    mirrorball | 3:29
    seven | 3:28
    august | 4:21
    this is me trying | 3:15
    illicit affairs | 3:10
    invisible string | 4:12
    mad woman | 3:57
    epiphany | 4:49
    betty | 4:54
    peace | 3:54
    hoax | 3:40
    the lakes | 3:31`,
  evermore: `
    willow | 3:34
    champagne problems | 4:04
    gold rush | 3:05
    'tis the damn season | 3:49
    tolerate it | 4:05
    no body, no crime | 3:35
    happiness | 5:15
    dorothea | 3:45
    coney island | 4:35
    ivy | 4:20
    cowboy like me | 4:35
    long story short | 3:35
    marjorie | 4:17
    closure | 3:00
    evermore | 5:04
    right where you left me | 4:05
    it's time to go | 4:15`,
  midnights: `
    Lavender Haze | 3:22
    Maroon | 3:38
    Anti-Hero | 3:20
    Snow on the Beach | 4:16
    You're On Your Own, Kid | 3:14
    Midnight Rain | 2:54
    Question...? | 3:30
    Vigilante Shit | 2:44
    Bejeweled | 3:14
    Labyrinth | 4:07
    Karma | 3:24
    Sweet Nothing | 3:08
    Mastermind | 3:11
    The Great War | 4:00
    Bigger Than the Whole Sky | 3:38
    Paris | 3:16
    High Infidelity | 3:51
    Glitch | 2:28
    Would've, Could've, Should've | 4:20
    Dear Reader | 3:45
    Hits Different | 3:54
    You're Losing Me | 4:37`,
  ttpd: `
    Fortnight | 3:48
    The Tortured Poets Department | 4:53
    My Boy Only Breaks His Favorite Toys | 3:23
    Down Bad | 4:21
    So Long, London | 4:22
    But Daddy I Love Him | 5:40
    Fresh Out the Slammer | 3:30
    Florida!!! | 3:35
    Guilty as Sin? | 4:14
    Who's Afraid of Little Old Me? | 5:34
    I Can Fix Him (No Really I Can) | 2:36
    loml | 4:37
    I Can Do It with a Broken Heart | 3:38
    The Smallest Man Who Ever Lived | 4:05
    The Alchemy | 3:16
    Clara Bow | 3:36
    The Black Dog | 3:58
    imgonnagetyouback | 3:42
    The Albatross | 3:03
    Chloe or Sam or Sophia or Marcus | 3:33
    How Did It End? | 3:58
    So High School | 3:48
    I Hate It Here | 4:04
    thanK you aIMee | 4:23
    I Look in People's Windows | 2:11
    The Prophecy | 4:09
    Cassandra | 4:00
    Peter | 4:43
    The Bolter | 3:59
    Robin | 4:00
    The Manuscript | 3:44`,
  showgirl: `
    The Fate of Ophelia | 3:46
    Elizabeth Taylor | 3:28
    Opalite | 3:55
    Father Figure | 3:32
    Eldest Daughter | 4:05
    Ruin the Friendship | 3:40
    Actually Romantic | 2:43
    Wi$h Li$t | 3:27
    Wood | 2:30
    CANCELLED! | 3:31
    Honey | 3:01
    The Life of a Showgirl | 4:01`,
  // The Encore's new songs. The rest of its tracklist is Showgirl's, above.
  encore: `
    Patient Zero | 3:46
    Cleveland! | 3:27
    Pink Clouding | ?
    Babylon | 3:40`,
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseDuration(text: string): number {
  const [m, s] = text.split(':').map(Number)
  return m * 60 + s
}

const videos = youtubeVideos as Record<string, { id: string; seconds?: number }>

export type UpcomingSong = Pick<Song, 'id' | 'title' | 'album' | 'track'>

function buildCatalog(): { songs: Song[]; upcoming: UpcomingSong[] } {
  const songs: Song[] = []
  const upcoming: UpcomingSong[] = []
  const seen = new Set<string>()
  for (const album of ALBUM_ORDER) {
    const lines = CATALOG[album].trim().split('\n')
    lines.forEach((line, i) => {
      const [title, length] = line.split('|').map((part) => part.trim())
      const id = slugify(title)
      if (seen.has(id)) throw new Error(`Duplicate song id "${id}"`)
      seen.add(id)
      const video = videos[id]
      const seconds = video?.seconds ?? (length === '?' ? undefined : parseDuration(length))
      if (seconds === undefined) {
        upcoming.push({ id, title, album, track: i + 1 })
        return
      }
      songs.push({ id, title, album, track: i + 1, seconds, youtubeId: video?.id })
    })
  }
  return { songs, upcoming }
}

const catalog = buildCatalog()

/** Every song that's out, in album/track order. */
export const SONGS: Song[] = catalog.songs

/** Announced songs that aren't out yet: they join SONGS once their track is found on YouTube. */
export const UPCOMING: UpcomingSong[] = catalog.upcoming

export const SONG_BY_ID = new Map(SONGS.map((song) => [song.id, song]))

/** Songs from the albums the site launched with: the daily rotation and the ladder. */
export const LAUNCH_SONGS: Song[] = SONGS.filter((song) => !ALBUMS[song.album].afterLaunch)

/** The ladder: shortest song first, longest last. Level n is LADDER[n - 1]. */
export const LADDER: Song[] = [...LAUNCH_SONGS].sort(
  (a, b) =>
    a.seconds - b.seconds ||
    ALBUM_ORDER.indexOf(a.album) - ALBUM_ORDER.indexOf(b.album) ||
    a.track - b.track,
)

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
