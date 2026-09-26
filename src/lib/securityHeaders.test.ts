import { describe, expect, it } from 'vitest'
import headers from '../../public/_headers?raw'
import page from '../../index.html?raw'

// The live site is built from the repository's copy, which has \n line endings whatever this checkout has
const inlineScripts = (html: string) => [...html.replace(/\r\n/g, '\n').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

describe('security headers', () => {
  it("let index.html's theme script run: the policy has its hash", async () => {
    const policy = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? ''
    const scripts = inlineScripts(page)
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) expect(policy).toContain(`'sha256-${await sha256(script)}'`)
  })
})
