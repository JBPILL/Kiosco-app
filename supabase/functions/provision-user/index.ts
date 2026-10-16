import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { readSupabasePublishableKey, readSupabaseSecretKey } from '../_shared/supabaseApiKeys.ts'
import { receiveProvisionUser } from '../_shared/provisionUserHttp.ts'

serve(async request => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = readSupabaseSecretKey()
  const publicKey = readSupabasePublishableKey()
  if (!url || !serviceKey || !publicKey) {
    return new Response('Servicio no configurado', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const columns = 'id,kiosco_id,nombre,rol,activo'
  return receiveProvisionUser(request, {
    origins: (Deno.env.get('CHECKOUT_ALLOWED_ORIGINS') || '').split(',').map(origin => origin.trim()).filter(Boolean),
    authenticate: async token => {
      const callerClient = createClient(url, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: caller, error: callerError } = await callerClient.auth.getUser(token)
      if (callerError || !caller.user) return null
      const { data, error } = await admin.from('usuarios')
        .select('id,kiosco_id,rol,activo,es_superadmin').eq('auth_user_id', caller.user.id).maybeSingle()
      if (error) throw error
      return data
    },
    findTarget: async (id, kioskId) => {
      const { data, error } = await admin.from('usuarios')
        .select('id,kiosco_id,nombre,rol,auth_user_id,activo,es_superadmin')
        .eq('id', id).eq('kiosco_id', kioskId).maybeSingle()
      if (error) throw error
      return data
    },
    createIdentity: async (body, kioskId, rol) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email, password: body.password, email_confirm: true,
        app_metadata: { kiosco_id: kioskId, rol },
      })
      if (error || !data.user) throw new Error('Identity creation failed')
      return data.user.id
    },
    insertProfile: async (body, kioskId, authId) => {
      const { data, error } = await admin.from('usuarios').insert({
        auth_user_id: authId, kiosco_id: kioskId, nombre: body.nombre, email: body.email,
        rol: body.rol, activo: true, es_superadmin: false,
      }).select(columns).maybeSingle()
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) return null // SQL rejection: no commit.
        throw error // Transport or API ambiguity: preserve identity for reconciliation.
      }
      return data
    },
    linkProfile: async (target, email, authId) => {
      // Compare-and-set: never overwrite credentials, a changed role, or a disabled profile.
      const { data, error } = await admin.from('usuarios').update({ auth_user_id: authId, email })
        .eq('id', target.id).eq('kiosco_id', target.kiosco_id).is('auth_user_id', null)
        .eq('activo', true).eq('es_superadmin', false).eq('rol', target.rol)
        .select(columns).maybeSingle()
      if (error) {
        if (/^[0-9A-Z]{5}$/.test(error.code || '')) return null
        throw error
      }
      return data
    },
    deleteIdentity: async authId => {
      const { error } = await admin.auth.admin.deleteUser(authId)
      if (error) throw new Error('Identity compensation failed')
    },
  })
})
