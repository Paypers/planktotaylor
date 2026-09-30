import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanName, NAME_LENGTH, rememberedName, rememberName } from './name'

describe("a guest's name", () => {
  beforeEach(() => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a name on one line, trimmed, and cut short', () => {
    expect(cleanName('  Ana\n\u202eB  ')).toBe('Ana B')
    expect(cleanName('x'.repeat(40))).toBe(`${'x'.repeat(NAME_LENGTH - 1)}…`)
    expect(cleanName('x'.repeat(NAME_LENGTH))).toBe('x'.repeat(NAME_LENGTH))
  })

  it('remembers the name typed last time', () => {
    expect(rememberedName()).toBe('')
    rememberName(' Ana ')
    expect(rememberedName()).toBe('Ana')
  })

  it("carries on without storage (private mode)", () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => rememberName('Ana')).not.toThrow()
    expect(rememberedName()).toBe('')
  })
})
