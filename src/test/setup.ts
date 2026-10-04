import { vi } from 'vitest'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  })
  return { default: toast, toast }
})

vi.mock('../lib/supabase', () => ({
  supabaseUrl: 'http://localhost',
  supabaseAnonKey: 'test',
  supabase: {
    from: () => {
      throw new Error('supabase.from no está mockeado en este test')
    },
  },
  createUnauthenticatedClient: () => ({}),
}))
