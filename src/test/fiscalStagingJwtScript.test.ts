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
const password = 'SYNTHETIC_ACCOUNT_PASSWORD'
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
      Add-Type @'
using System; using System.Net; using System.IO; using System.Text;
public class MockResponse : WebResponse {
 public HttpStatusCode StatusCode {get;set;}
 public override Stream GetResponseStream(){return new MemoryStream(Encoding.UTF8.GetBytes("{\\"codigo\\":\\"HOMOLOGACION_NO_HABILITADA\\"}"));}
}
public class MockHttpException : Exception {
 public MockResponse Response {get;set;}
 public MockHttpException(int status){Response=new MockResponse{StatusCode=(HttpStatusCode)status};}
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
        if($Uri -notlike '*/token?grant_type=password' -or ($Body|ConvertFrom-Json).password -cne ${quote(password)}){throw 'Invalid login'}
        return @{access_token=${quote(token)};refresh_token='SYNTHETIC_REFRESH'}
      }
      function global:Invoke-WebRequest {
        param([switch]$UseBasicParsing,$Method,$Uri,$Headers,$ContentType,$Body,$MaximumRedirection,$TimeoutSec)
        $global:events.Add(@{kind='gateway';correct_url=($Uri -ceq 'https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion');body_empty=($Body -ceq '{}');bearer_ok=($Headers.Authorization -ceq ('Bearer '+${quote(token)}));redirects=$MaximumRedirection})
        if(${quote(mode)} -eq 'network-fail'){throw ${quote(password)}}
        if(${quote(mode)} -eq 'unclosed'){return @{StatusCode=400;Content='{"codigo":"SOLICITUD_INVALIDA"}'}}
        throw (New-Object MockHttpException($(if(${quote(mode)} -eq 'jwt401'){401}else{503})))
      }
      & ${quote(script)} ${mode === 'prepare' ? '-Preparar' : ''}
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
