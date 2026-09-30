import { hashFor, togetherRoute } from '../route'
import { siteLink } from '../share'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'
// 252 is the last multiple of 36 a byte reaches: bytes from it up are skipped, so every letter is as likely.
const FAIR_BYTES = 252

/** Random lowercase letters and digits. */
export function randomLetters(length: number): string {
  const fair = Array.from(crypto.getRandomValues(new Uint8Array(length * 2))).filter((byte) => byte < FAIR_BYTES)
  return fair.length >= length ? fair.slice(0, length).map((byte) => LETTERS[byte % LETTERS.length]).join('') : randomLetters(length)
}

/** A new room's code: 10 letters and digits, over 3 × 10¹⁵ of them, so nobody lands in a room by guessing. */
export const makeRoomCode = () => randomLetters(10)

/** The link to a room, with its song. */
export const roomLink = (code: string, songId: string) => `${siteLink()}${hashFor(togetherRoute(code, songId))}`
