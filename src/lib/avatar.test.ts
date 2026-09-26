import { describe, expect, it } from 'vitest'
import { photoInOwnBucket } from './avatar'

const PROJECT = 'https://abcdefghijklmnopqrst.supabase.co'
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PHOTO = `${PROJECT}/storage/v1/object/public/avatars/${ID}/avatar.jpg`

describe('photo links', () => {
  it("lets through a player's photo in the project's bucket, as uploadAvatar saves it", () => {
    expect(photoInOwnBucket(`${PHOTO}?v=1727300000000`, PROJECT)).toBe(`${PHOTO}?v=1727300000000`)
    expect(photoInOwnBucket(PHOTO, PROJECT)).toBe(PHOTO)
  })

  it('stops anything that would send a browser somewhere else', () => {
    for (const link of [
      `https://tracker.example/storage/v1/object/public/avatars/${ID}/avatar.jpg`,
      `https://abcdefghijklmnopqrst.supabase.co.tracker.example/storage/v1/object/public/avatars/${ID}/avatar.jpg`,
      `https://abcdefghijklmnopqrst.supabase.co@tracker.example/storage/v1/object/public/avatars/${ID}/avatar.jpg`,
      `${PHOTO}/../../../../../rest/v1/`,
      `${PROJECT}/storage/v1/object/public/avatars/${ID}/pixel.png`,
      `${PHOTO}?v=1&next=https://tracker.example`,
      '',
      null,
      undefined,
    ]) {
      expect(photoInOwnBucket(link, PROJECT)).toBeNull()
    }
  })

  it('shows none on a site without accounts', () => {
    expect(photoInOwnBucket(PHOTO, '')).toBeNull()
  })
})
