import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

describe('Edge Functions modern Supabase API key contract', () => {
  it('reads the default modern secret and publishable keys centrally', () => {
    const helper = read(
      'supabase/functions/_shared/supabaseApiKeys.ts',
    )

    expect(helper).toContain("'SUPABASE_SECRET_KEYS'")
    expect(helper).toContain("'SUPABASE_PUBLISHABLE_KEYS'")
    expect(helper).toContain('.default')

    expect(helper).toContain(
      'export function readSupabaseSecretKey()',
    )

    expect(helper).toContain(
      'export function readSupabasePublishableKey()',
    )

    expect(helper).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY',
    )

    expect(helper).not.toContain(
      'SUPABASE_ANON_KEY',
    )
  })

  it('keeps checkout-manual on the modern secret-key helper', () => {
    const source = read(
      'supabase/functions/checkout-manual/index.ts',
    )

    expect(source).toContain(
      '../_shared/supabaseApiKeys.ts',
    )

    expect(source).toContain(
      'readSupabaseSecretKey()',
    )

    expect(source).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY',
    )

    expect(source).not.toContain(
      'SUPABASE_ANON_KEY',
    )
  })

  it('keeps supervisor-pin on the modern secret-key helper', () => {
    const source = read(
      'supabase/functions/supervisor-pin/index.ts',
    )

    expect(source).toContain(
      '../_shared/supabaseApiKeys.ts',
    )

    expect(source).toContain(
      'readSupabaseSecretKey()',
    )

    expect(source).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY',
    )

    expect(source).not.toContain(
      'SUPABASE_ANON_KEY',
    )
  })

  it('uses modern secret and publishable keys for provision-user', () => {
    const source = read(
      'supabase/functions/provision-user/index.ts',
    )

    expect(source).toContain(
      'readSupabaseSecretKey()',
    )

    expect(source).toContain(
      'readSupabasePublishableKey()',
    )

    expect(source).not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY',
    )

    expect(source).not.toContain(
      'SUPABASE_ANON_KEY',
    )

    expect(source).not.toContain(
      'SUPABASE_PUBLISHABLE_KEY',
    )
  })

  it('keeps JWT verification explicit for the three deploy candidates', () => {
    const config = read('supabase/config.toml')

    for (
      const functionName of [
        'checkout-manual',
        'supervisor-pin',
        'provision-user',
      ]
    ) {
      const sectionHeader =
        '[functions.' + functionName + ']'

      const start =
        config.indexOf(sectionHeader)

      expect(start).toBeGreaterThanOrEqual(0)

      const next = config.indexOf(
        '\n[functions.',
        start + sectionHeader.length,
      )

      const section = config.slice(
        start,
        next === -1 ? config.length : next,
      )

      expect(section).toMatch(
        /verify_jwt\s*=\s*true/,
      )
    }
  })

  it('preserves provision-user application authorization', () => {
    const source = read(
      'supabase/functions/provision-user/index.ts',
    )

    expect(source).toContain('getUser(token)')
    expect(source).toContain('auth.admin.createUser')
    expect(source).toContain('auth.admin.deleteUser')
    expect(source).toContain('es_superadmin')
  })
})
