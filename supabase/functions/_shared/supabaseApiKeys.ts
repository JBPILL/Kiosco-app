type SupabaseKeyEnvironment =
  | 'SUPABASE_SECRET_KEYS'
  | 'SUPABASE_PUBLISHABLE_KEYS'

function readDefaultSupabaseKey(
  environmentName: SupabaseKeyEnvironment,
): string | undefined {
  const raw = Deno.env.get(environmentName)
  if (!raw) return undefined

  try {
    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return undefined
    }

    const value =
      (parsed as Record<string, unknown>).default

    if (
      typeof value !== 'string' ||
      value.length === 0
    ) {
      return undefined
    }

    return value
  } catch {
    return undefined
  }
}

export function readSupabaseSecretKey(): string | undefined {
  return readDefaultSupabaseKey('SUPABASE_SECRET_KEYS')
}

export function readSupabasePublishableKey(): string | undefined {
  return readDefaultSupabaseKey('SUPABASE_PUBLISHABLE_KEYS')
}
