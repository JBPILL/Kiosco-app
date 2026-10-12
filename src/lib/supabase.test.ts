import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

describe('configuración de Supabase', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./supabase')
    for (const name of [
      'VITE_SUPABASE_URL',
      'SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ]) {
      vi.stubEnv(name, '')
    }
    createClient.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falla rápido cuando falta la URL y no usa un proyecto hardcodeado', async () => {
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-test')

    await expect(import('./supabase')).rejects.toThrow(/Configuración de Supabase ausente/)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('falla rápido cuando faltan las keys y no usa una key hardcodeada', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://staging.supabase.co')

    await expect(import('./supabase')).rejects.toThrow(/Configuración de Supabase ausente/)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('prioriza la publishable key si también existe la variable anon', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://staging.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test')

    const { supabaseAnonKey } = await import('./supabase')

    expect(supabaseAnonKey).toBe('publishable-test')
    expect(createClient).toHaveBeenCalledWith('https://staging.supabase.co', 'publishable-test')
  })
})