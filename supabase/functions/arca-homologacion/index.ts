// Preparado para instalación autorizada; flag privado desactivado por defecto.
import { createFiscalHttpHandler } from '../_shared/fiscalHttp.ts'
import { createFiscalSupabaseAdmin } from '../_shared/fiscalSupabaseAdmin.ts'
import { readSupabaseSecretKey } from '../_shared/supabaseApiKeys.ts'

Deno.serve(createFiscalHttpHandler({
  readSecret:name=>Deno.env.get(name),
  createAdmin:url=>{
    const key=readSupabaseSecretKey()
    if(!key)throw new Error('FISCAL_SERVICIO_PRIVADO_NO_DISPONIBLE')
    return createFiscalSupabaseAdmin(url,key,fetch)
  },
  fetcher:fetch,
}))
