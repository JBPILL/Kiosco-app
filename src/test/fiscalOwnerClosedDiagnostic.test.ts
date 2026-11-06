// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { diagnoseFiscalOwnerClosed } from '../../scripts/diagnose-fiscal-owner-closed.mjs'
const owner='0e90b9a7-36d2-4762-ab1a-4982996cf9aa', kiosk='b7254826-c767-4098-94b8-71013c12021d'
const stamp=Date.parse('2026-10-28T23:00:00Z')
const credentials={email:'synthetic@example.test',password:'synthetic_only',publicKey:'sb_publishable_synthetic'}
function fixture(mode='pass') {
 const token=[{alg:'ES256'},{sub:owner,iss:'https://acoyfwwmhaeruciyedri.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',iat:stamp/1000,exp:stamp/1000+3600}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic'
 const calls:string[]=[]
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  const path=new URL(String(url)).pathname;calls.push(path)
  expect(String(url).startsWith('https://acoyfwwmhaeruciyedri.supabase.co/')).toBe(true)
  if(path==='/auth/v1/token')return mode==='login'?Response.json({secret:'DO_NOT_PRINT'},{status:400}):Response.json({access_token:token})
  if(path==='/auth/v1/user')return Response.json({id:owner})
  if(path==='/rest/v1/usuarios')return Response.json([{auth_user_id:owner,kiosco_id:kiosk,rol:mode==='cashier'?'CAJERO':'DUEÑO',activo:true,es_superadmin:false}])
  if(path==='/auth/v1/logout')return new Response(null,{status:mode==='logout'?500:204})
  if(path==='/functions/v1/arca-homologacion'){
   expect(init?.body).toBe('{}');return Response.json({codigo:mode==='open'?'OTHER':'HOMOLOGACION_NO_HABILITADA'},{status:mode==='open'?200:503})
  }
  throw Error('DO_NOT_PRINT')
 })
 return {calls,options:{fetcher,now:()=>stamp}}
}
it('checks exact real adapter identity/profile and closed backend then local logout, no fiscal actions',async()=>{
 const f=fixture();expect(await diagnoseFiscalOwnerClosed(credentials,f.options)).toBe('OWNER_CLOSED_PASS identity=true profile=true backend503=true logout_local=CONFIRMED window=false arca=false')
 expect(f.calls).toEqual(['/auth/v1/token','/auth/v1/user','/rest/v1/usuarios','/functions/v1/arca-homologacion','/auth/v1/logout'])
})
it.each([['login','PRIVATE_OWNER_LOGIN_NOT_CONFIRMED','NOT_ESTABLISHED'],['cashier','PRIVATE_OWNER_PROFILE_NOT_CONFIRMED','NOT_ESTABLISHED'],['open','PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED','CONFIRMED'],['logout','PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED','NOT_CONFIRMED']])('reports only safe codes for %s',async(mode,reason,logout)=>{
 const f=fixture(mode);const result=await diagnoseFiscalOwnerClosed(credentials,f.options)
 expect(result).toBe(`OWNER_CLOSED_NOT_CONFIRMED reason=${reason} logout_local=${logout} window=false arca=false`)
 expect(result).not.toContain('DO_NOT_PRINT')
 if(mode==='cashier')expect(f.calls.at(-1)).toBe('/auth/v1/logout')
})
it('rejects wrong key before transmitting credentials',async()=>{
 const f=fixture();expect(await diagnoseFiscalOwnerClosed({...credentials,publicKey:'sb_secret_forbidden'},f.options)).toContain('reason=PRIVATE_OWNER_INPUT_REJECTED')
 expect(f.calls).toEqual([])
})
