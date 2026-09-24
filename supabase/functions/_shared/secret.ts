/**
 * The schedule's secret (REMINDERS_SECRET) given as `Authorization: Bearer …`, compared in the same time
 * whatever the input, so it can't be guessed a character at a time.
 */
export function fromSchedule(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const given = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  if (given.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return difference === 0
}
