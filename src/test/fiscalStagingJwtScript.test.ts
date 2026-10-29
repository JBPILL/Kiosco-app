// @vitest-environment node
import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve('scripts/comprobar-jwt-fiscal-staging.ps1')
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'"
const jwt = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url')
const token = jwt({ alg: 'ES256' }) + '.' + jwt({ sub: 'synthetic-user' }) + '.SYNTHETIC'
const password = 'SYNTHETIC_ACCOUNT_PASSWORD_ñ_✓'
function clean(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('kiosko-jwt-test-')) throw Error('Unsafe cleanup')
  rmSync(target, { recursive: true, force: true })
}
function run(mode: string) {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-jwt-test-'))
  const key = mode === 'publishable' ? 'sb_publishable_SYNTHETIC_PUBLIC_KEY' : jwt({ alg: 'HS256' }) + '.' + jwt({ role: mode === 'service-key' ? 'service_role' : 'anon', ref: mode === 'wrong-ref' ? 'wrong-project' : 'acoyfwwmhaeruciyedri' }) + '.SYNTHETIC'
  try {
    const record = join(root, 'record.json'), runner = join(root, 'runner.ps1')
    writeFileSync(runner, '\uFEFF' + `
      $global:events=New-Object Collections.Generic.List[object]
      $global:prompts=0
      $global:polls=0
      function global:Start-Sleep { param($Seconds) $global:events.Add(@{kind='wait';seconds=$Seconds}) }
      Add-Type @'
using System; using System.Net; using System.IO; using System.Text;
public class MockResponse : WebResponse {
 public HttpStatusCode StatusCode {get;set;}
 public string Body = "{\\"codigo\\":\\"HOMOLOGACION_NO_HABILITADA\\"}";
 public override Stream GetResponseStream(){return new MemoryStream(Encoding.UTF8.GetBytes(Body));}
}
public class MockHttpException : Exception {
 public MockResponse Response {get;set;}
 public MockHttpException(int status){Response=new MockResponse{StatusCode=(HttpStatusCode)status};}
 public MockHttpException(int status,string body){Response=new MockResponse{StatusCode=(HttpStatusCode)status,Body=body};}
}
'@
      function global:Read-Host {
        param($Prompt,[switch]$AsSecureString)
        $global:prompts++
        if(-not $AsSecureString){return 'synthetic@example.invalid'}
        $value=if($Prompt -like 'Clave publica*'){${quote(key)}}else{${quote(password)}}
        $secure=New-Object Security.SecureString;foreach($c in $value.ToCharArray()){$secure.AppendChar($c)};$secure
      }
      function global:Invoke-RestMethod {
        param($Method,$Uri,$Headers,$ContentType,$Body,$MaximumRedirection,$TimeoutSec)
        if($Uri -notlike 'https://acoyfwwmhaeruciyedri.supabase.co/*'){throw 'Unexpected host'}
        $logout=$Uri -like '*/logout?scope=local'
        $global:events.Add(@{kind=$(if($logout){'logout'}else{'login'});redirects=$MaximumRedirection;local_scope=$logout;bearer_ok=($Headers.Authorization -ceq ('Bearer '+${quote(token)}))})
        if($logout){if(${quote(mode)} -eq 'logout-fail'){throw ${quote(password)}};return}
        if(${quote(mode)} -eq 'auth-fail'){throw ${quote(password)}}
        $authCases=@{
          'auth-invalid'=@(400,'{"error_code":"invalid_credentials"}');
          'auth-v2'=@(400,'{"code":"invalid_credentials"}');
          'auth-key'=@(401,'{"message":"Invalid API key"}');
          'auth-unconfirmed'=@(400,'{"error_code":"email_not_confirmed"}');
          'auth-rate'=@(429,'{}');
          'auth-unavailable'=@(503,${quote(password)});
          'auth-unknown'=@(400,'{"error_code":"SYNTHETIC_ACCOUNT_PASSWORD","message":"SYNTHETIC_ACCOUNT_PASSWORD"}')
        }
        if($authCases.ContainsKey(${quote(mode)})){$failure=$authCases[${quote(mode)}];throw (New-Object MockHttpException($failure[0],$failure[1]))}
        if(${quote(mode)} -eq 'auth-timeout'){throw (New-Object Net.WebException(${quote(password)},[Net.WebExceptionStatus]::Timeout))}
        if($Uri -notlike '*/token?grant_type=password' -or $ContentType -cne 'application/json; charset=utf-8' -or ([Text.Encoding]::UTF8.GetString($Body)|ConvertFrom-Json).password -cne ${quote(password)}){throw 'Invalid login'}
        return @{access_token=${quote(token)};refresh_token='SYNTHETIC_REFRESH'}
      }
      function global:Invoke-WebRequest {
        param([switch]$UseBasicParsing,$Method,$Uri,$Headers,$ContentType,$Body,$MaximumRedirection,$TimeoutSec)
        if(${quote(mode)} -like 'access-*' -or ${quote(mode)} -like 'isolation-*'){
          if($Uri -notlike 'https://acoyfwwmhaeruciyedri.supabase.co/*' -or $MaximumRedirection -ne 0 -or $Headers.Authorization -cne ('Bearer '+${quote(token)})){throw 'Unsafe access probe'}
          $global:events.Add(@{kind='access';method=$Method;uri=$Uri;body=$Body;redirects=$MaximumRedirection})
          if($Uri -like '*/auth/v1/user'){
            return @{StatusCode=200;Content=$(if(${quote(mode)} -in @('access-identity','isolation-viewer-identity')){'{"id":"bad"}'}else{'{"id":"11111111-1111-1111-1111-111111111111"}'})}
          }
          if($Uri -like '*/rest/v1/usuarios?*'){
            $role=if(${quote(mode)} -in @('access-cashier','isolation-cashier','isolation-viewer-cashier')){'CAJERO'}elseif(${quote(mode)} -eq 'access-viewer' -or (${quote(mode)} -like 'isolation-viewer-*' -and ${quote(mode)} -ne 'isolation-viewer-owner')){'VISOR'}else{'DUE'+[char]0xD1+'O'}
            $active=${quote(mode)} -notin @('access-inactive','isolation-viewer-inactive')
            $super=${quote(mode)} -in @('access-superadmin','isolation-viewer-superadmin')
            $kiosk=if(${quote(mode)} -like 'isolation-*' -and ${quote(mode)} -notlike '*wrong-scope'){'b7254826-c767-4098-94b8-71013c12021d'}else{'22222222-2222-2222-2222-222222222222'}
            return @{StatusCode=200;Content=(@(@{rol=$role;activo=$active;es_superadmin=$super;kiosco_id=$kiosk})|ConvertTo-Json -Compress)}
          }
          if(${quote(mode)} -like 'isolation-*'){
            if($Method -ne 'GET'){throw 'Isolation cannot POST'}
            $own='[{"id":"33333333-3333-3333-3333-333333333333","kiosco_id":"b7254826-c767-4098-94b8-71013c12021d"}]'
            if($Uri -ceq 'https://acoyfwwmhaeruciyedri.supabase.co/rest/v1/ventas?select=id,kiosco_id&kiosco_id=eq.b7254826-c767-4098-94b8-71013c12021d&estado=eq.COMPLETADA&order=fecha_hora.desc&limit=1'){
              if(${quote(mode)} -like '*-own-empty'){$own='[]'}
              if(${quote(mode)} -like '*-own-wrong'){$own=$own.Replace('b7254826-c767-4098-94b8-71013c12021d','22222222-2222-2222-2222-222222222222')}
              return @{StatusCode=200;Content=$own}
            }
            if($Uri -ceq 'https://acoyfwwmhaeruciyedri.supabase.co/rest/v1/ventas?select=id,kiosco_id&id=eq.00418e7b-eca6-487c-bffe-b85b405cd9cb&limit=1'){
              if(${quote(mode)} -like '*-network'){throw ${quote(password)}}
              if(${quote(mode)} -like '*-foreign-denied'){throw (New-Object MockHttpException(403,'{}'))}
              $foreign=if(${quote(mode)} -like '*-foreign-visible'){$own}elseif(${quote(mode)} -like '*-malformed'){'{}'}else{'[]'}
              return @{StatusCode=200;Content=$foreign}
            }
            if($Uri -ceq 'https://acoyfwwmhaeruciyedri.supabase.co/rest/v1/ventas?select=id,kiosco_id&id=eq.33333333-3333-3333-3333-333333333333&limit=1'){
              return @{StatusCode=200;Content=$(if(${quote(mode)} -like '*-recheck-empty'){'[]'}else{$own})}
            }
            throw 'Unexpected isolation route'
          }
          if($Uri -like '*/rest/v1/fiscal_operaciones_homologacion?select=*&limit=0'){
            if(${quote(mode)} -eq 'access-exposed'){return @{StatusCode=200;Content='[]'}}
            throw (New-Object MockHttpException(403,'{}'))
          }
          if($Method -ne 'POST' -or $Uri -notlike '*/functions/v1/arca-homologacion' -or $Body -cne '{"accion":"DATOS_FISCALES_VENTA","venta_id":"00000000-0000-0000-0000-000000000000"}'){throw 'Unexpected access request'}
          $global:polls++
          if(${quote(mode)} -eq 'access-timeout' -or $global:polls -eq 1){throw (New-Object MockHttpException(503))}
          if(${quote(mode)} -eq 'access-network'){throw ${quote(password)}}
          if(${quote(mode)} -eq 'access-unexpected'){return @{StatusCode=200;Content='{}'}}
          throw (New-Object MockHttpException(409,'{"codigo":"OPERACION_NO_CONFIRMADA"}'))
        }
        $global:events.Add(@{kind='gateway';correct_url=($Uri -ceq 'https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion');body_empty=($Body -ceq '{}');bearer_ok=($Headers.Authorization -ceq ('Bearer '+${quote(token)}));redirects=$MaximumRedirection})
        if(${quote(mode)} -eq 'network-fail'){throw ${quote(password)}}
        if(${quote(mode)} -eq 'unclosed'){return @{StatusCode=400;Content='{"codigo":"SOLICITUD_INVALIDA"}'}}
        throw (New-Object MockHttpException($(if(${quote(mode)} -eq 'jwt401'){401}else{503})))
      }
      & ${quote(script)} ${mode === 'prepare' ? '-Preparar' : mode === 'isolation-viewer-conflict' ? '-ComprobarAislamientoVisor -ComprobarAccesos' : mode.startsWith('access-') ? '-ComprobarAccesos' : mode.startsWith('isolation-viewer-') ? '-ComprobarAislamientoVisor' : mode.startsWith('isolation-') ? '-ComprobarAislamiento' : ''}
      $code=$LASTEXITCODE
      [IO.File]::WriteAllText(${quote(record)},(@{prompts=$global:prompts;events=@($global:events.ToArray())}|ConvertTo-Json -Depth 5))
      exit $code
    `, 'utf8')
    const result = spawnSync('powershell', ['-NoProfile', '-File', runner], { encoding: 'utf8', timeout: 60000 })
    return { status: result.status, output: result.stdout + result.stderr, report: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null, key }
  } finally { clean(root) }
}
it.skipIf(process.platform !== 'win32')('preparación no pide secretos ni conecta', () => {
  const r = run('prepare'); expect(r.status, r.output).toBe(0); expect(r.report).toEqual({ events: [], prompts: 0 })
}, 60000)
it.skipIf(process.platform !== 'win32').each(['ok', 'cashier', 'wrong-scope', 'own-empty', 'own-wrong', 'foreign-visible', 'foreign-denied', 'recheck-empty', 'network', 'malformed'])('sales isolation helper %s requires positive controls and makes no fiscal calls', suffix => {
  const r = run('isolation-' + suffix)
  expect(r.status, r.output).toBe(['ok', 'cashier'].includes(suffix) ? 0 : 1)
  for (const secret of [password, token, r.key, 'SYNTHETIC_REFRESH', '33333333-3333-3333-3333-333333333333']) expect(r.output).not.toContain(secret)
  const events = r.report.events as {kind: string; method?: string; uri?: string}[]
  expect(events[0].kind).toBe('login'); expect(events.at(-1)?.kind).toBe('logout')
  const reads = events.filter(e => e.kind === 'access')
  expect(reads.every(e => e.method === 'GET')).toBe(true)
  expect(reads.some(e => e.uri?.includes('/functions/'))).toBe(false)
  expect(reads.some(e => e.uri?.includes('/rpc/'))).toBe(false)
  expect(events.some(e => ['wait','gateway'].includes(e.kind))).toBe(false)
  if (['ok', 'cashier'].includes(suffix)) {
    expect(reads).toHaveLength(5)
    expect(r.output).toContain('RLS_SALES_READ_ISOLATION_OBSERVED role=' + (suffix === 'cashier' ? 'CASHIER' : 'OWNER'))
    expect(reads[3].uri).not.toContain('kiosco_id=eq.')
  } else expect(r.output).not.toContain('RLS_SALES_READ_ISOLATION_OBSERVED')
}, 60000)
it.skipIf(process.platform !== 'win32').each(['ok','owner','cashier','inactive','superadmin','wrong-scope','identity','own-empty','own-wrong','foreign-visible','foreign-denied','malformed','network','recheck-empty'])('viewer isolation %s is read-only and never accepts a different actor role', suffix=>{
  const r=run('isolation-viewer-'+suffix)
  expect(r.status,r.output).toBe(suffix==='ok'?0:1)
  expect(r.output).toContain('TEST_SESSION_LOGOUT_LOCAL_CONFIRMED')
  for(const secret of [password,token,r.key,'SYNTHETIC_REFRESH'])expect(r.output).not.toContain(secret)
  const events=r.report.events as {kind:string;method?:string;uri?:string}[]
  expect(events[0].kind).toBe('login');expect(events.at(-1)?.kind).toBe('logout')
  const reads=events.filter(e=>e.kind==='access')
  expect(reads.every(e=>e.method==='GET'&&!e.uri?.includes('/functions/')&&!e.uri?.includes('/rpc/'))).toBe(true)
  expect(events.some(e=>['wait','gateway'].includes(e.kind))).toBe(false)
  if(suffix==='ok'){
    expect(reads).toHaveLength(5)
    expect(r.output).toContain('RLS_SALES_READ_ISOLATION_OBSERVED role=VIEWER')
    expect(reads[3].uri).not.toContain('kiosco_id=eq.')
  }else expect(r.output).not.toContain('RLS_SALES_READ_ISOLATION_OBSERVED')
},60000)
it.skipIf(process.platform !== 'win32')('viewer mode cannot be combined with fiscal access before any credentials are requested',()=>{
  const r=run('isolation-viewer-conflict')
  expect(r.status,r.output).toBe(1)
  expect(r.report.prompts).toBe(0)
  expect(r.report.events).toEqual([])
})
it.skipIf(process.platform !== 'win32').each(['ok', 'cashier', 'viewer', 'identity', 'inactive', 'superadmin', 'exposed', 'timeout', 'network', 'unexpected'])('read-only access helper %s is bounded and never mutates fiscal data', suffix => {
  const r = run('access-' + suffix)
  expect(r.status, r.output).toBe(['ok', 'cashier'].includes(suffix) ? 0 : 1)
  for (const secret of [password, token, r.key, 'SYNTHETIC_REFRESH', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']) expect(r.output).not.toContain(secret)
  const events = r.report.events as {kind: string; method?: string; uri?: string; body?: string}[]
  expect(events[0].kind).toBe('login'); expect(events.at(-1)?.kind).toBe('logout')
  const posts = events.filter(e => e.kind === 'access' && e.method === 'POST')
  expect(posts.length).toBeLessThanOrEqual(120)
  for (const post of posts) {
    expect(post.uri).toBe('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion')
    expect(JSON.parse(post.body!)).toEqual({accion:'DATOS_FISCALES_VENTA',venta_id:'00000000-0000-0000-0000-000000000000'})
  }
  if (['identity', 'inactive', 'superadmin', 'exposed', 'viewer'].includes(suffix)) expect(posts).toHaveLength(0)
  if (['ok', 'cashier'].includes(suffix)) {
    expect(r.output).toContain('ACCESS_PROBE_READY')
    expect(r.output).toContain('BASE_READ_NEGATIVE_OBSERVED')
    expect(r.output).toContain('role=' + (suffix === 'cashier' ? 'CASHIER' : 'OWNER'))
  }
  if (suffix === 'timeout') expect(posts).toHaveLength(120)
}, 60000)
it.skipIf(process.platform !== 'win32').each([
  ['auth-invalid', 'CREDENCIALES_RECHAZADAS', 400], ['auth-v2', 'CREDENCIALES_RECHAZADAS', 400],
  ['auth-key', 'CLAVE_PUBLICA_RECHAZADA', 401], ['auth-unconfirmed', 'CORREO_NO_CONFIRMADO', 400],
  ['auth-rate', 'LIMITE_DE_INTENTOS', 429], ['auth-unavailable', 'SERVICIO_AUTH_NO_DISPONIBLE', 503],
  ['auth-unknown', 'AUTH_NO_CLASIFICADO', 400], ['auth-timeout', 'TIEMPO_AGOTADO', 0],
] as const)('Auth %s sólo publica categoría cerrada y status', (mode, category, status) => {
  const r = run(mode)
  expect(r.status, r.output).toBe(1)
  expect(r.output).toContain('[' + category + '] status=' + status)
  for (const secret of [password, 'SYNTHETIC_ACCOUNT_PASSWORD', token, r.key]) expect(r.output).not.toContain(secret)
  expect(r.report.events.map((e: { kind: string }) => e.kind)).toEqual(['login'])
}, 60000)
it.skipIf(process.platform !== 'win32').each(['ok', 'publishable', 'jwt401', 'unclosed', 'auth-fail', 'logout-fail', 'network-fail', 'service-key', 'wrong-ref'])('JWT helper %s no expone credenciales ni cierra otras sesiones', mode => {
  const r = run(mode)
  expect(r.status, r.output).toBe(['ok', 'publishable'].includes(mode) ? 0 : mode === 'jwt401' ? 2 : 1)
  for (const secret of [password, token, r.key, 'SYNTHETIC_REFRESH']) expect(r.output).not.toContain(secret)
  const events = r.report.events as { kind: string; local_scope?: boolean; bearer_ok?: boolean; redirects: number; correct_url?: boolean; body_empty?: boolean }[]
  expect(events.every(e => e.redirects === 0)).toBe(true)
  if (mode === 'service-key' || mode === 'wrong-ref') expect(events).toEqual([])
  else if (mode === 'auth-fail') expect(events.map(e => e.kind)).toEqual(['login'])
  else {
    expect(events.map(e => e.kind)).toEqual(['login', 'gateway', 'logout'])
    expect(events[1]).toMatchObject({ bearer_ok: true, correct_url: true, body_empty: true })
    expect(events[2]).toMatchObject({ bearer_ok: true, local_scope: true })
  }
  if (mode === 'ok') expect(r.output).toContain('JWT_GATEWAY_PASS_BACKEND_CLOSED alg=ES256')
  if (mode === 'jwt401') expect(r.output).toContain('JWT_GATEWAY_REJECTED alg=ES256')
}, 60000)
