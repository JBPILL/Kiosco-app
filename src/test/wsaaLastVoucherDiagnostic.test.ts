// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
function cleanup(root: string): void {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('kiosko-last-read-test-')) throw Error('Unexpected temporary target')
  rmSync(target, { recursive: true, force: true })
}

it.skipIf(process.platform !== 'win32')('construye sólo la lectura exacta y valida identidad, números, SOAP y errores sin red', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-last-read-test-'))
  try {
    const runner = join(root, 'native.ps1')
    writeFileSync(runner, `
$ErrorActionPreference='Stop'
$references=@((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName)
$references+=Join-Path $PSHOME 'System.Security.Cryptography.Pkcs.dll'
Add-Type -Path ${quote(resolve('scripts/arca/WsaaHomologacion.cs'))} -ReferencedAssemblies $references
$now=[DateTimeOffset]::Parse('2026-10-27T03:00:00Z')
$ticketXml='<loginTicketResponse><expirationTime>2026-10-27T04:00:00Z</expirationTime><token>SYNTHETIC_TOKEN</token><sign>SYNTHETIC_SIGN</sign></loginTicketResponse>'
$ticket=[WsaaHomologacion]::ParseResponse('<Envelope><loginCmsReturn>'+[Security.SecurityElement]::Escape($ticketXml)+'</loginCmsReturn></Envelope>',$now)
$checks=[ordered]@{}
$request=[WsaaHomologacion]::PrepareLastVoucherDiagnostic($ticket,'20123456786',$now,2,11)
[xml]$body=$request.Content.ReadAsStringAsync().GetAwaiter().GetResult()
$checks.fixedEndpoint=$request.RequestUri.AbsoluteUri -ceq 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'
$checks.fixedAction=$request.Headers.GetValues('SOAPAction').Contains('"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"')
$checks.explicitScope=$body.SelectSingleNode('//*[local-name()="PtoVta"]').InnerText -ceq '2' -and $body.SelectSingleNode('//*[local-name()="CbteTipo"]').InnerText -ceq '11'
$checks.auth=$body.SelectSingleNode('//*[local-name()="Token"]').InnerText -ceq 'SYNTHETIC_TOKEN'
$request.Dispose()
$prefix='<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult>'
$suffix='</FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>'
$fields='<PtoVta>2</PtoVta><CbteTipo>11</CbteTipo><CbteNro>0</CbteNro>'
$xml=$prefix+$fields+'<Errors/><Events><Evt><Code>1</Code><Msg>SYNTHETIC_PRIVATE_EVENT</Msg></Evt></Events>'+$suffix
$parsed=[WsaaHomologacion]::ParseLastVoucherDiagnostic($xml,2,11)
$checks.zeroObserved=$parsed.Point -eq 2 -and $parsed.VoucherType -eq 11 -and $parsed.LastNumber -eq 0
$checks.sourceHash=$parsed.SourceSha256 -cmatch '^[0-9a-f]{64}$'
$checks.upperBound=[WsaaHomologacion]::ParseLastVoucherDiagnostic($xml.Replace('<CbteNro>0</CbteNro>','<CbteNro>99999999</CbteNro>'),2,11).LastNumber -eq 99999999
$invalid=@{
 point=$xml.Replace('<PtoVta>2</PtoVta>','<PtoVta>3</PtoVta>');type=$xml.Replace('<CbteTipo>11</CbteTipo>','<CbteTipo>6</CbteTipo>');
 negative=$xml.Replace('<CbteNro>0</CbteNro>','<CbteNro>-1</CbteNro>');fraction=$xml.Replace('<CbteNro>0</CbteNro>','<CbteNro>0.1</CbteNro>');
 overflow=$xml.Replace('<CbteNro>0</CbteNro>','<CbteNro>100000000</CbteNro>');missing=$xml.Replace('<CbteNro>0</CbteNro>','');
 duplicate=$xml.Replace('<CbteNro>0</CbteNro>','<CbteNro>0</CbteNro><CbteNro>0</CbteNro>');nested=$xml.Replace('<CbteNro>0</CbteNro>','<CbteNro><n>0</n></CbteNro>');
 attribute=$xml.Replace('<CbteNro>','<CbteNro x="1">');foreign=$xml.Replace('http://ar.gov.afip.dif.FEV1/','https://example.test/');
 wrongMethod=$xml.Replace('FECompUltimoAutorizado','FEParamGetPtosVenta');extra=$xml.Replace('<Errors/>','<Unknown>1</Unknown>');
 badErrors=$xml.Replace('<Errors/>','<Errors><Unknown>1</Unknown></Errors>');duplicateErrors=$xml.Replace('<Errors/>','<Errors/><Errors/>');
 ambiguous=$xml.Replace('</s:Body>','<Other/></s:Body>')
}
foreach($name in $invalid.Keys){$checks[$name]=$false;try{[WsaaHomologacion]::ParseLastVoucherDiagnostic($invalid[$name],2,11)|Out-Null}catch{$checks[$name]=$true}}
$checks.business=$false
try{[WsaaHomologacion]::ParseLastVoucherDiagnostic($xml.Replace('<Errors/>','<Errors><Err><Code>602</Code><Msg>SYNTHETIC_PRIVATE</Msg></Err></Errors>'),2,11)|Out-Null}catch{$checks.business=$_.Exception.InnerException.Message -ceq 'WSFE_BUSINESS:602'}
$checks.fault=$false
try{[WsaaHomologacion]::ParseLastVoucherDiagnostic('<Envelope><Fault><faultcode>soap:Server</faultcode><faultstring>SYNTHETIC_PRIVATE</faultstring></Fault></Envelope>',2,11)|Out-Null}catch{$checks.fault=$_.Exception.InnerException.Message -ceq 'WSFE_FAULT:soap:Server'}
$checks.dtd=$false
try{[WsaaHomologacion]::ParseLastVoucherDiagnostic('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///none">]><a>&x;</a>',2,11)|Out-Null}catch{$checks.dtd=$true}
$checks.expired=$false
try{[WsaaHomologacion]::PrepareLastVoucherDiagnostic($ticket,'20123456786',$now.AddHours(2),2,11)|Out-Null}catch{$checks.expired=$true}
$checks.wrongCuit=$false
try{[WsaaHomologacion]::PrepareLastVoucherDiagnostic($ticket,'20123456780',$now,2,11)|Out-Null}catch{$checks.wrongCuit=$true}
$checks.scope=$true
foreach($scope in @(@(0,11),@(99999,11),@(2,13),@(2,0))){try{[WsaaHomologacion]::ValidateLastVoucherScope($scope[0],$scope[1]);$checks.scope=$false}catch{}}
$checks.genericCannotInvokeLast=$false
try{[WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456786',$now,'FECompUltimoAutorizado')|Out-Null}catch{$checks.genericCannotInvokeLast=$true}
$checks|ConvertTo-Json -Compress
`)
    const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', runner], { encoding: 'utf8', timeout: 30000 })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const checks = JSON.parse(result.stdout.trim()) as Record<string, boolean>
    expect(Object.keys(checks)).toHaveLength(29)
    expect(Object.entries(checks).filter(([, passed]) => !passed)).toEqual([])
  } finally { cleanup(root) }
}, 40000)

it.skipIf(process.platform !== 'win32').each(['ok', 'business', 'mixed', 'missing-point', 'missing-type', 'unsupported-type', 'orphan-scope', 'fraction-point', 'fraction-type', 'reserved-point', 'no-connect', 'export', 'catalog', 'generic-query'])('modo último %s no reintenta ni accede a secretos ante preflight inválido', mode => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-last-read-test-'))
  try {
    const runner = join(root, 'wrapper.ps1'), report = join(root, 'report.json')
    const point = mode === 'fraction-point' ? '1.5' : mode === 'reserved-point' ? '99999' : '2'
    const voucherType = mode === 'fraction-type' ? '10.5' : mode === 'unsupported-type' ? '13' : '11'
    const extra = mode === 'mixed' ? '-ConsultarWsfe' : mode === 'export' ? '-SalidaParametros ignored.json' : mode === 'catalog' ? '-CatalogosPreparacion -DirectorioCatalogos ignored' : mode === 'generic-query' ? '-ConsultaWsfe FEParamGetPtosVenta' : ''
    const flags = mode === 'orphan-scope' ? '-PuntoVenta 2 -TipoComprobante 11' : `-ConsultarUltimo ${mode === 'missing-point' ? '' : `-PuntoVenta ${point}`} ${mode === 'missing-type' ? '' : `-TipoComprobante ${voucherType}`} ${extra}`
    writeFileSync(runner, `
$ErrorActionPreference='Stop'
Add-Type @'
using System;using System.IO;using System.Security;using System.Collections.Generic;
public static class WsaaHomologacion {
 public static List<string> Calls=new List<string>(); public static byte[] Cms; public static bool Fail=${mode === 'business' ? 'true' : 'false'};
 public sealed class Ticket {public DateTimeOffset Expiration=DateTimeOffset.UtcNow.AddHours(1);}
 public sealed class Diagnostic {public int Point=2;public int VoucherType=11;public int LastNumber=0;public string SourceSha256=new string('a',64);}
 public static void ValidateRepresentedCuit(string c){Calls.Add("validate");}
 public static string BuildTra(DateTimeOffset n,string s,uint i){Calls.Add("tra");return "SYNTHETIC_TRA";}
 public static byte[] SignTra(string c,string k,SecureString p,string t){Calls.Add("sign");Cms=new byte[]{1,2};return Cms;}
 public static Ticket Login(byte[] b){Calls.Add("login");return new Ticket();}
 public static Diagnostic ConsultLastVoucher(Ticket t,string c,int p,int v){Calls.Add("last:"+p+":"+v);if(Fail) throw new InvalidDataException("WSFE_BUSINESS:602");return new Diagnostic();}
}
'@
function global:Add-Type {param($Path,$ReferencedAssemblies)}
function global:Get-Content {param($LiteralPath,[switch]$Raw);[WsaaHomologacion]::Calls.Add('dpapi');return 'SYNTHETIC_DPAPI'}
function global:ConvertTo-SecureString {param([Parameter(ValueFromPipeline)]$Value);return [Security.SecureString]::new()}
& ${quote(resolve('scripts/probar-wsaa-homologacion.ps1'))} -Certificado SYNTHETIC_CERT -ClaveCifrada SYNTHETIC_KEY -ProteccionDpapi SYNTHETIC_PATH ${mode === 'no-connect' ? '' : '-Conectar'} -CuitRepresentado 20123456786 ${flags}
$code=if($LASTEXITCODE){$LASTEXITCODE}else{0}
[IO.File]::WriteAllText(${quote(report)},(@{calls=@([WsaaHomologacion]::Calls.ToArray());cms_cleared=([WsaaHomologacion]::Cms -eq $null -or [WsaaHomologacion]::Cms[0] -eq 0)}|ConvertTo-Json -Compress))
exit $code
`)
    const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', runner], { encoding: 'utf8', timeout: 30000 })
    expect(result.status, result.stdout + result.stderr).toBe(mode === 'ok' ? 0 : 1)
    expect(existsSync(report), result.stdout + result.stderr).toBe(true)
    const evidence = JSON.parse(readFileSync(report, 'utf8')) as { calls: string[]; cms_cleared: boolean }
    expect(evidence.cms_cleared).toBe(true)
    expect(result.stdout + result.stderr).not.toContain('SYNTHETIC_')
    if (['ok', 'business'].includes(mode)) {
      expect(evidence.calls).toEqual(['validate', 'dpapi', 'tra', 'sign', 'login', 'last:2:11'])
    } else expect(evidence.calls).toEqual([])
    expect(result.stdout.includes('WSFE_LAST_READ=PASS')).toBe(mode === 'ok')
    if (mode === 'ok') {
      expect(result.stdout).toContain('PUNTO_HABILITADO=NOT_PROVEN')
      expect(result.stdout).toContain('NUMERACION_RESERVADA=false')
      expect(result.stdout).toContain('COMPROBANTES_EMITIDOS=0')
    }
    if (mode === 'business') expect(result.stdout).toContain('CODE=WSFE_BUSINESS:602')
  } finally { cleanup(root) }
}, 40000)
