import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { readSupabasePublishableKey, readSupabaseSecretKey } from '../_shared/supabaseApiKeys.ts'
import { CommerceFailure, provisionCommerceHttp } from '../_shared/provisionCommerceHttp.ts'
import type { CommerceReservation } from '../_shared/provisionCommerceHttp.ts'

serve(async request => {
  const url = Deno.env.get('SUPABASE_URL'), secret = readSupabaseSecretKey(), key = readSupabasePublishableKey()
  if (!url || !secret || !key) return new Response(JSON.stringify({ error: 'Servicio no configurado' }), { status: 503 })
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, args)
    if (error) throw new CommerceFailure(/^[0-9A-Z]{5}$/.test(error.code ?? '') || error.code === 'PGRST202')
    if (!data || typeof data !== 'object') throw new CommerceFailure(false)
    return data
  }
  return provisionCommerceHttp(request, {
    allowedOrigins: (Deno.env.get('CHECKOUT_ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean),
    authenticate: async token => {
      const caller = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } } })
      const { data, error } = await caller.auth.getUser(token)
      if (error || !data.user) return null
      const { data: actor, error: actorError } = await admin.from('usuarios')
        .select('activo,es_superadmin').eq('auth_user_id', data.user.id).maybeSingle()
      if (actorError) throw new Error('actor')
      return { authId: data.user.id, superadmin: actor?.activo === true && actor.es_superadmin === true }
    },
    reserve: async (actor, body, hash) => {
      const { operacionId, ...datos } = body
      return await rpc('reservar_provision_comercio', { p_operacion_id: operacionId, p_actor_auth_id: actor, p_datos: datos, p_hash: hash }) as CommerceReservation
    },
    createAuth: async body => {
      const { data, error } = await admin.auth.admin.createUser({ email: body.email, password: body.password,
        email_confirm: true, app_metadata: { commercial_operation_id: body.operacionId, rol: 'DUEÑO' } })
      if (error || !data.user) throw new CommerceFailure(!!error?.status && error.status >= 400 && error.status < 500)
      return data.user.id
    },
    transition: async (op, actor, action, authId) => await rpc('transicionar_provision_comercio',
      { p_operacion_id: op, p_actor_auth_id: actor, p_accion: action, p_auth_user_id: authId ?? null }) as CommerceReservation,
    finalize: async (op, actor) => await rpc('finalizar_provision_comercio', { p_operacion_id: op, p_actor_auth_id: actor }),
    deleteAuth: async id => { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw new Error('compensation') },
  })
})
