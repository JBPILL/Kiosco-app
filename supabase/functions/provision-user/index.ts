import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { readSupabasePublishableKey, readSupabaseSecretKey } from '../_shared/supabaseApiKeys.ts'

interface ProvisionRequest {
  action: 'create_staff' | 'link_credentials'
  email: string
  password: string
  nombre?: string
  rol?: 'CAJERO' | 'VISOR'
  usuarioId?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })
}

serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = readSupabaseSecretKey()
  const publicKey = readSupabasePublishableKey()
  if (!url || !serviceKey || !publicKey) return json({ error: 'Servicio no configurado' }, 503)

  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'Autenticación requerida' }, 401)
  const callerClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: caller, error: callerError } = await callerClient.auth.getUser(token)
  if (callerError || !caller.user) return json({ error: 'Sesión inválida' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: actor, error: actorError } = await admin.from('usuarios')
    .select('id,kiosco_id,rol,activo,es_superadmin')
    .eq('auth_user_id', caller.user.id).maybeSingle()
  if (actorError || !actor?.activo || (actor.rol !== 'DUEÑO' && !actor.es_superadmin)) {
    return json({ error: 'Sólo un dueño activo puede administrar usuarios del kiosco' }, 403)
  }

  let body: ProvisionRequest
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'Solicitud inválida' }, 400)
    body = parsed as ProvisionRequest
  } catch { return json({ error: 'Solicitud inválida' }, 400) }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
    return json({ error: 'Email o contraseña inválidos' }, 400)
  }

  let targetProfileId: string | null = null
  let nombre: string
  let rol: 'CAJERO' | 'VISOR'
  if (body.action === 'create_staff') {
    if (body.rol !== 'CAJERO' && body.rol !== 'VISOR') return json({ error: 'Rol no permitido' }, 400)
    nombre = typeof body.nombre === 'string' ? body.nombre.trim().slice(0, 120) : ''
    if (!nombre) return json({ error: 'Nombre obligatorio' }, 400)
    rol = body.rol
  } else if (body.action === 'link_credentials') {
    if (typeof body.usuarioId !== 'string') return json({ error: 'Usuario objetivo obligatorio' }, 400)
    const { data: target, error } = await admin.from('usuarios')
      .select('id,kiosco_id,nombre,rol,auth_user_id,activo,es_superadmin')
      .eq('id', body.usuarioId).eq('kiosco_id', actor.kiosco_id).maybeSingle()
    if (error || !target?.activo || target.es_superadmin) return json({ error: 'Usuario objetivo no disponible' }, 404)
    if (target.auth_user_id) return json({ error: 'El usuario ya tiene credenciales asociadas' }, 409)
    targetProfileId = target.id
    nombre = target.nombre
    rol = target.rol === 'VISOR' ? 'VISOR' : 'CAJERO'
  } else {
    return json({ error: 'Acción no permitida' }, 400)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { kiosco_id: actor.kiosco_id, rol },
  })
  if (createError || !created.user) return json({ error: createError?.message || 'No se pudo crear la identidad' }, 400)

  const profileResult = targetProfileId
    ? await admin.from('usuarios').update({ auth_user_id: created.user.id, email }).eq('id', targetProfileId).eq('kiosco_id', actor.kiosco_id).select('id,kiosco_id,nombre,rol,activo').maybeSingle()
    : await admin.from('usuarios').insert({ auth_user_id: created.user.id, kiosco_id: actor.kiosco_id,
      nombre, email, rol, activo: true, es_superadmin: false }).select('id,kiosco_id,nombre,rol,activo').maybeSingle()
  if (profileResult.error || !profileResult.data) {
    const { error: compensationError } = await admin.auth.admin.deleteUser(created.user.id)
    if (compensationError) console.error('provision-user compensation failed', compensationError.message)
    return json({ error: 'No se pudo vincular el perfil; la identidad fue revertida si Auth permitió la compensación' }, 409)
  }
  return json({ usuario: profileResult.data, id: profileResult.data.id })
})
