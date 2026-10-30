// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createRestoreHttpClient, loginRestoreHttpClient } from '../../scripts/backup/restore-acceptance-http.mjs'
import { loadRestorePlan, PLAN_HASH } from '../../scripts/backup/restore-acceptance-engine.mjs'
import type { RestoreRole } from '../../scripts/backup/restore-acceptance-engine.mjs'
const target='https://acoyfwwmhaeruciyedri.supabase.co',plan=loadRestorePlan()
const auth='11111111-1111-4111-8111-111111111111',profileId='22222222-2222-4222-8222-222222222222'
const secret='SYNTHETIC_EXTERNAL_PRIVATE_BODY'
const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url')
const jwt=(data:object={})=>encode({alg:'ES256'})+'.'+encode({role:'authenticated',sub:auth,iss:target+'/auth/v1',...data})+'.SYNTHETIC'
const config=(role:RestoreRole='OWNER')=>({publicKey:'sb_publishable_SYNTHETIC_PUBLIC_KEY',jwt:jwt(),authId:auth,role})
function mock(role:RestoreRole='OWNER',mode='ok') {
  return vi.fn<typeof fetch>(async(input,init)=>{
    const url=String(input)
    if(!url.startsWith(target+'/'))throw Error('Unexpected destination')
    if(url.endsWith('/auth/v1/user'))return Response.json({id:mode==='wrong-auth'?profileId:auth,role:'authenticated'},{status:mode==='auth401'?401:200})
    if(url.includes('/rest/v1/usuarios?')){
      const row={id:profileId,auth_user_id:auth,kiosco_id:mode==='foreign'?profileId:plan.kioskId,rol:role==='OWNER'?'DUEÑO':'CAJERO',activo:mode!=='inactive',es_superadmin:mode==='superadmin'}
      if(mode==='wrong-role')row.rol=role==='OWNER'?'CAJERO':'DUEÑO'
      return Response.json(mode==='duplicate'?[row,row]:mode==='missing-superadmin'?[{...row,es_superadmin:undefined}]:[row])
    }
    if(url.endsWith('/auth/v1/logout?scope=local')){
      if(mode==='logout-network')throw Error(secret)
      return mode==='logout-fail'?Response.json({message:secret},{status:503}):new Response(null,{status:204})
    }
    if(url.includes('/rest/v1/rpc/')){
      if(mode==='network')throw Error(secret)
      if(mode==='large')return new Response('é'.repeat(2049),{status:403})
      if(mode==='invalid-utf8')return new Response(new Uint8Array([255]),{status:403})
      if(mode==='stream-fail')return new Response(new ReadableStream({start(controller){controller.error(Error(secret))}}),{status:403})
      if(mode==='invalid')return new Response(secret,{status:403})
      return Response.json({code:'42501',private:secret},{status:403})
    }
    throw Error('Unexpected route '+String(init?.method))
  })
}
it.each<RestoreRole>(['OWNER','CASHIER'])('pins verified %s identity and limits RPC to the reviewed role-specific plan',async role=>{
  const request=mock(role),client=createRestoreHttpClient({...config(role),allowMutations:true,reviewedPlanHash:PLAN_HASH},request)
  await expect(client.requestPlannedRpc(plan.steps[0].rpc,plan.steps[0].params)).rejects.toThrow('RESTORE_HTTP_IDENTITY_REQUIRED')
  expect(request).not.toHaveBeenCalled()
  expect(await client.verifyIdentity()).toEqual({role,authId:auth,kioskId:plan.kioskId,profileId})
  const step=role==='OWNER'?plan.steps[0]:plan.cashierDeniedCalls[0]
  expect(await client.requestPlannedRpc(step.rpc,step.params)).toMatchObject({status:403,data:{code:'42501'}})
  expect(await client.logoutLocal()).toEqual({logoutLocalConfirmed:true})
  expect(request).toHaveBeenCalledTimes(4)
  for(const [input,init] of request.mock.calls){
    expect(String(input)).toMatch(/^https:\/\/acoyfwwmhaeruciyedri\.supabase\.co\//)
    expect(init).toMatchObject({redirect:'error',credentials:'omit'})
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer '+config().jwt)
    expect(String(input)).not.toContain(config().jwt)
    expect(String(input)).not.toContain('operaciones_escritura')
    expect(String(input)).not.toContain('/functions/')
  }
  await expect(client.verifyIdentity()).rejects.toThrow('RESTORE_HTTP_SESSION_CLOSED')
  expect(Object.keys(client).sort()).toEqual(['logoutLocal','requestPlannedRpc','verifyIdentity'])
})
it('mutation authority is closed by default even for a verified owner',async()=>{
  const request=mock(),client=createRestoreHttpClient(config(),request)
  await client.verifyIdentity()
  await expect(client.requestPlannedRpc(plan.steps[0].rpc,plan.steps[0].params)).rejects.toThrow('RESTORE_HTTP_MUTATIONS_CLOSED')
  expect(request).toHaveBeenCalledTimes(2)
})
it.each(['foreign','inactive','superadmin','missing-superadmin','duplicate','wrong-role','wrong-auth','auth401'])('rejects %s server context without any RPC',async mode=>{
  const request=mock('OWNER',mode),client=createRestoreHttpClient(config(),request)
  await expect(client.verifyIdentity()).rejects.toThrow(/RESTORE_HTTP_(IDENTITY|PROFILE)_NOT_CONFIRMED/)
  expect(request.mock.calls.some(([input])=>String(input).includes('/rpc/'))).toBe(false)
})
it.each(['rpc','body','operation','kiosk'])('rejects request drift %s before dispatch',async mode=>{
  const request=mock(),client=createRestoreHttpClient({...config(),allowMutations:true,reviewedPlanHash:PLAN_HASH},request)
  await client.verifyIdentity()
  const params=structuredClone(plan.steps[0].params)
  if(mode==='body')params.p_datos={nombre:'different'}
  if(mode==='operation')params.p_operacion_id=profileId
  if(mode==='kiosk')params.p_kiosco_id=profileId
  await expect(client.requestPlannedRpc(mode==='rpc'?'arbitrary_rpc':plan.steps[0].rpc,params)).rejects.toThrow('RESTORE_HTTP_REQUEST_NOT_IN_PLAN')
  expect(request).toHaveBeenCalledTimes(2)
})
it.each(['network','large','invalid','invalid-utf8','stream-fail'])('safe %s failure does not expose external response',async mode=>{
  const request=mock('OWNER',mode),client=createRestoreHttpClient({...config(),allowMutations:true,reviewedPlanHash:PLAN_HASH},request)
  await client.verifyIdentity()
  const category=mode==='network'?'RESTORE_HTTP_UNAVAILABLE':mode==='large'?'RESTORE_HTTP_BODY_TOO_LARGE':mode==='invalid-utf8'?'RESTORE_HTTP_BODY_INVALID':mode==='stream-fail'?'RESTORE_HTTP_BODY_UNAVAILABLE':'RESTORE_HTTP_JSON_INVALID'
  await expect(client.requestPlannedRpc(plan.steps[0].rpc,plan.steps[0].params)).rejects.toMatchObject({message:category})
  expect(request).toHaveBeenCalledTimes(3)
})
it.each(['logout-fail','logout-network'])('logout %s cannot become global or be retried',async mode=>{
  const request=mock('OWNER',mode),client=createRestoreHttpClient(config(),request)
  await client.verifyIdentity()
  await expect(client.logoutLocal()).rejects.toThrow(mode==='logout-fail'?'RESTORE_HTTP_LOGOUT_NOT_CONFIRMED':'RESTORE_HTTP_UNAVAILABLE')
  await expect(client.logoutLocal()).rejects.toThrow('RESTORE_HTTP_SESSION_CLOSED')
  expect(request).toHaveBeenCalledTimes(3)
})
it.each(['service-key','wrong-issuer','wrong-sub','service-jwt','wrong-plan'])('rejects %s configuration before network',mode=>{
  const request=mock(),cfg={...config(),allowMutations:true,reviewedPlanHash:PLAN_HASH}
  if(mode==='service-key')cfg.publicKey=encode({alg:'HS256'})+'.'+encode({role:'service_role',ref:'acoyfwwmhaeruciyedri'})+'.SYNTHETIC'
  if(mode==='wrong-issuer')cfg.jwt=jwt({iss:'https://other-project.supabase.co/auth/v1'})
  if(mode==='wrong-sub')cfg.jwt=jwt({sub:profileId})
  if(mode==='service-jwt')cfg.jwt=jwt({role:'service_role'})
  if(mode==='wrong-plan')cfg.reviewedPlanHash='0'.repeat(64)
  expect(()=>createRestoreHttpClient(cfg,request)).toThrow('RESTORE_HTTP_CONFIG_INVALID')
  expect(request).not.toHaveBeenCalled()
})

it('accepts exactly4096 UTF8 bytes without widening the response bound',async()=>{
  const base='{"code":"42501","pad":"',tail='"}'
  const text=base+'é'.repeat(2000)+'x'.repeat(4096-Buffer.byteLength(base+tail)-4000)+tail
  expect(Buffer.byteLength(text)).toBe(4096)
  const fallback=mock(),request=vi.fn<typeof fetch>(async(input,init)=>String(input).includes('/rpc/')?new Response(text,{status:403}):fallback(input,init))
  const client=createRestoreHttpClient({...config(),allowMutations:true,reviewedPlanHash:PLAN_HASH},request)
  await client.verifyIdentity()
  expect(await client.requestPlannedRpc(plan.steps[0].rpc,plan.steps[0].params)).toMatchObject({status:403,data:{code:'42501'}})
})

function loginConfig(role:RestoreRole='OWNER') {
  const {jwt:_jwt,...base}=config(role)
  return {...base,email:role==='OWNER'?'owner@example.invalid':'cashier@example.invalid',password:secret}
}
function loginMock(role:RestoreRole='OWNER',mode='ok') {
  const downstream=mock(role,mode==='logout-bad'?'foreign':mode)
  return vi.fn<typeof fetch>(async(input,init)=>{
    const url=String(input)
    if(url===target+'/auth/v1/token?grant_type=password'){
      if(mode==='login-network')throw Error(secret)
      if(mode==='login-large')return new Response('x'.repeat(4097))
      if(mode==='login-invalid')return new Response(secret)
      if(mode==='login401')return Response.json({message:secret},{status:401})
      return Response.json({access_token:jwt(mode==='login-subject'?{sub:profileId}:{}),token_type:mode==='login-type'?'other':'bearer',user:{id:auth},refresh_token:secret})
    }
    if(mode==='logout-bad'&&url.endsWith('/logout?scope=local'))return Response.json({message:secret},{status:500})
    return downstream(input,init)
  })
}
it.each<RestoreRole>(['OWNER','CASHIER'])('private %s login verifies Auth/profile without exposing refresh or authorizing mutations by default',async role=>{
  const request=loginMock(role),client=await loginRestoreHttpClient(loginConfig(role),request)
  await client.verifyIdentity()
  await expect(client.requestPlannedRpc(plan.steps[0].rpc,plan.steps[0].params)).rejects.toThrow('RESTORE_HTTP_MUTATIONS_CLOSED')
  expect(Object.keys(client).sort()).toEqual(['logoutLocal','requestPlannedRpc','verifyIdentity'])
  expect(JSON.stringify(client)).not.toContain(secret)
  expect(await client.logoutLocal()).toEqual({logoutLocalConfirmed:true})
  expect(request.mock.calls.filter(([url])=>String(url).includes('/token?'))).toHaveLength(1)
  for(const [url,init] of request.mock.calls){
    expect(String(url).startsWith(target+'/')).toBe(true)
    expect(init).toMatchObject({redirect:'error',credentials:'omit'})
    expect(String(url)).not.toContain(secret)
  }
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({email:loginConfig(role).email,password:secret})
  expect(new Headers(request.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
})
it.each(['foreign','wrong-role','inactive','superadmin','wrong-auth','login-subject','login-type','logout-bad'])('login %s revokes the returned session once or reports failed logout',async mode=>{
  const request=loginMock('OWNER',mode)
  await expect(loginRestoreHttpClient(loginConfig(),request)).rejects.toMatchObject({message:mode==='logout-bad'?'RESTORE_LOGIN_LOGOUT_NOT_CONFIRMED':'RESTORE_LOGIN_REJECTED_LOGOUT_CONFIRMED'})
  expect(request.mock.calls.filter(([url])=>String(url).endsWith('/logout?scope=local'))).toHaveLength(1)
  expect(request.mock.calls.some(([url])=>String(url).includes('/rpc/'))).toBe(false)
})
it.each(['login-network','login-large','login-invalid','login401'])('unknown %s is never retried or converted to success',async mode=>{
  const request=loginMock('OWNER',mode)
  await expect(loginRestoreHttpClient(loginConfig(),request)).rejects.toMatchObject({message:'RESTORE_LOGIN_NOT_CONFIRMED'})
  expect(request).toHaveBeenCalledTimes(1)
})
it.each(['key','password','email','hash'])('login rejects %s before sending credentials',async mode=>{
  const request=loginMock(),input={...loginConfig(),allowMutations:true,reviewedPlanHash:PLAN_HASH}
  if(mode==='key')input.publicKey='service_role_SYNTHETIC'
  if(mode==='password')input.password='x'.repeat(1025)
  if(mode==='email')input.email='invalid'+String.fromCharCode(10)+'email'
  if(mode==='hash')input.reviewedPlanHash='0'.repeat(64)
  await expect(loginRestoreHttpClient(input,request)).rejects.toMatchObject({message:'RESTORE_LOGIN_INPUT_REJECTED'})
  expect(request).not.toHaveBeenCalled()
})
