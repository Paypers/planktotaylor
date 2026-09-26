/** Profile photos are stored this size: plenty for a 72px circle on a sharp screen, about 20 KB. */
const SIZE = 256

/** Crops a photo to its centre square and shrinks it to a small JPEG, ready to upload. */
export async function squarePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t a photo.')
  // createImageBitmap applies the photo's rotation, so phone pictures come out the right way up.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that photo. Try a JPEG or PNG.")
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Couldn't process the photo here.")
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process the photo here."))), 'image/jpeg', 0.88),
  )
}

// <player id>/avatar.jpg, with the version uploadAvatar adds to get past caches
const PHOTO_IN_BUCKET = /^[0-9a-f-]{36}\/avatar\.jpg(\?v=\d{1,16})?$/

// Only a player's photo in this project's bucket gets through, whatever the database says.
// A link anywhere else would tell that server who opened the page.
export function photoInOwnBucket(link: string | null | undefined, supabaseUrl: string): string | null {
  const bucket = `${supabaseUrl}/storage/v1/object/public/avatars/`
  return link?.startsWith(bucket) && PHOTO_IN_BUCKET.test(link.slice(bucket.length)) ? link : null
}
