// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
function cleanCatalogTest(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('kiosko-wsaa-test-')) throw new Error('Destino temporal inesperado')
  rmSync(target,{recursive:true,force:true})
}

it.skipIf(process.platform !== 'win32')('valida TRA, CMS y parsing sin red ni credenciales reales', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-wsaa-test-'))
  try {
    const runner = join(root, 'test.ps1')
    writeFileSync(runner, `
      $ErrorActionPreference='Stop'
      $references = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName)
      $references += Join-Path $PSHOME 'System.Security.Cryptography.Pkcs.dll'
      Add-Type -Path ${quote(resolve('scripts/arca/WsaaHomologacion.cs'))} -ReferencedAssemblies $references
      $now = [DateTimeOffset]::Parse('2026-10-20T16:00:00Z')
      [xml]$tra = [WsaaHomologacion]::BuildTra($now,'wsfe',4294967295)
      $checks = [ordered]@{}
      $checks.uniqueId = $tra.loginTicketRequest.header.uniqueId -eq '4294967295'
      $checks.generation = $tra.loginTicketRequest.header.generationTime -eq '2026-10-20T15:55:00Z'
      $checks.expiration = $tra.loginTicketRequest.header.expirationTime -eq '2026-10-20T16:10:00Z'
      $checks.service = $tra.loginTicketRequest.service -eq 'wsfe'
      $checks.badService = $false
      try { [WsaaHomologacion]::BuildTra($now,'<wsfe/>',1) | Out-Null } catch { $checks.badService=$true }
      $ticketXml = '<loginTicketResponse><header><expirationTime>2026-10-20T17:00:00Z</expirationTime></header><credentials><token>SYNTHETIC_TOKEN</token><sign>SYNTHETIC_SIGN</sign></credentials></loginTicketResponse>'
      $soap = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><loginCmsResponse><loginCmsReturn>' + [Security.SecurityElement]::Escape($ticketXml) + '</loginCmsReturn></loginCmsResponse></s:Body></s:Envelope>'
      $ticket = [WsaaHomologacion]::ParseResponse($soap,$now)
      $checks.parse = $ticket.Token -eq 'SYNTHETIC_TOKEN' -and $ticket.Sign -eq 'SYNTHETIC_SIGN' -and $ticket.Expiration -gt $now
      $diagnostic = [WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456786',$now)
      [xml]$diagnosticBody = $diagnostic.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $auth = $diagnosticBody.SelectSingleNode('//*[local-name()="Auth"]')
      $checks.wsfe = $diagnostic.RequestUri.AbsoluteUri -eq 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' -and $auth.Token -eq 'SYNTHETIC_TOKEN' -and $auth.Sign -eq 'SYNTHETIC_SIGN' -and $auth.Cuit -eq '20123456786'
      $diagnostic.Dispose()
      $checks.wsfeExpired = $false
      try { [WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456786',$now.AddHours(2)) | Out-Null } catch { $checks.wsfeExpired=$true }
      $checks.wsfeCuit = $false
      try { [WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456780',$now) | Out-Null } catch { $checks.wsfeCuit=$true }
      $checks.display = -not $ticket.ToString().Contains('SYNTHETIC')
      $checks.expired = $false
      try { [WsaaHomologacion]::ParseResponse($soap,$now.AddHours(2)) | Out-Null } catch { $checks.expired=$true }
      $checks.duplicate = $false
      try { [WsaaHomologacion]::ParseResponse($soap.Replace('&lt;token&gt;', '&lt;token&gt;other&lt;/token&gt;&lt;token&gt;'),$now) | Out-Null } catch { $checks.duplicate=$true }
      $checks.dtd = $false
      try { [WsaaHomologacion]::ParseResponse('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///nonexistent">]><a>&x;</a>',$now) | Out-Null } catch { $checks.dtd=$true }
      $checks.fault = $false
      try { [WsaaHomologacion]::ParseResponse('<Envelope><Fault><faultcode>ns1:coe.notAuthorized</faultcode><faultstring>SYNTHETIC_SECRET</faultstring></Fault></Envelope>',$now) | Out-Null } catch { $checks.fault=$_.Exception.InnerException.Message -eq 'WSAA_FAULT:ns1:coe.notAuthorized' }
      $wsfePrefix = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult>'
      $wsfeSuffix = '</FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></s:Body></s:Envelope>'
      $points = '<PtoVenta><Nro>1</Nro><Bloqueado>N</Bloqueado></PtoVenta><PtoVenta><Nro>2</Nro><Bloqueado>S</Bloqueado></PtoVenta>'
      $wsfeResult = [WsaaHomologacion]::ParseWsfeDiagnostic($wsfePrefix+'<ResultGet>'+$points+'</ResultGet>'+$wsfeSuffix)
      $checks.wsfeResponse = $wsfeResult.Points -eq 2 -and $wsfeResult.BlockedPoints -eq 1
      $checks.wsfeEmpty = [WsaaHomologacion]::ParseWsfeDiagnostic($wsfePrefix+'<ResultGet/>'+$wsfeSuffix).Points -eq 0
      $checks.wsfeBusiness = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($wsfePrefix+'<Errors><Err><Code>600</Code><Msg>SYNTHETIC_SECRET</Msg></Err></Errors>'+$wsfeSuffix) | Out-Null } catch { $checks.wsfeBusiness=$_.Exception.InnerException.Message -eq 'WSFE_BUSINESS:600' }
      $checks.wsfeFault = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic('<Envelope><Fault><faultcode>soap:Server</faultcode><faultstring>SYNTHETIC_SECRET</faultstring></Fault></Envelope>') | Out-Null } catch { $checks.wsfeFault=$_.Exception.InnerException.Message -eq 'WSFE_FAULT:soap:Server' }
      $checks.wsfeDuplicate = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($wsfePrefix+'<ResultGet>'+$points.Replace('<Nro>2</Nro>','<Nro>1</Nro>')+'</ResultGet>'+$wsfeSuffix) | Out-Null } catch { $checks.wsfeDuplicate=$true }
      $checks.wsfeMissingResult = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($wsfePrefix+$wsfeSuffix) | Out-Null } catch { $checks.wsfeMissingResult=$true }
      $checks.wsfeWrongNamespace = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic(($wsfePrefix+'<ResultGet/>'+$wsfeSuffix).Replace('http://ar.gov.afip.dif.FEV1/','http://example.test/')) | Out-Null } catch { $checks.wsfeWrongNamespace=$true }
      $typesOperation = 'FEParamGetTiposCbte'
      $typesRequest = [WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456786',$now,$typesOperation)
      [xml]$typesBody = $typesRequest.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $checks.typesRequest = $typesRequest.RequestUri.Host -eq 'wswhomo.afip.gov.ar' -and $typesRequest.Headers.GetValues('SOAPAction')[0] -eq '"http://ar.gov.afip.dif.FEV1/FEParamGetTiposCbte"' -and $null -ne $typesBody.SelectSingleNode('//*[local-name()="FEParamGetTiposCbte"]')
      $typesRequest.Dispose()
      $typesPrefix = $wsfePrefix.Replace('FEParamGetPtosVenta','FEParamGetTiposCbte')
      $typesSuffix = $wsfeSuffix.Replace('FEParamGetPtosVenta','FEParamGetTiposCbte')
      $type = '<CbteTipo><Id>11</Id><Desc>Factura C</Desc><FchDesde>20100101</FchDesde><FchHasta>NULL</FchHasta></CbteTipo>'
      $typesXml = $typesPrefix+'<ResultGet>'+$type+'</ResultGet>'+$typesSuffix
      $checks.typesResponse = [WsaaHomologacion]::ParseWsfeDiagnostic($typesXml,$typesOperation).VoucherTypes -eq 1
      $checks.typesDuplicate = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($typesXml.Replace($type,$type+$type),$typesOperation) | Out-Null } catch { $checks.typesDuplicate=$_.Exception.InnerException.Message -eq 'WSFE_TYPES' }
      $checks.typesEmpty = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($typesPrefix+'<ResultGet/>'+$typesSuffix,$typesOperation) | Out-Null } catch { $checks.typesEmpty=$_.Exception.InnerException.Message -eq 'WSFE_TYPES' }
      $checks.typesMalformed = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($typesXml.Replace('<Id>11</Id>','<Id>invalid</Id>'),$typesOperation) | Out-Null } catch { $checks.typesMalformed=$_.Exception.InnerException.Message -eq 'WSFE_TYPES' }
      $checks.typesWrongMethod = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($typesXml) | Out-Null } catch { $checks.typesWrongMethod=$_.Exception.InnerException.Message -eq 'WSFE_RESULT' }
      $checks.typesBusiness = $false
      try { [WsaaHomologacion]::ParseWsfeDiagnostic($typesPrefix+'<Errors><Err><Code>601</Code><Msg>SYNTHETIC_SECRET</Msg></Err></Errors>'+$typesSuffix,$typesOperation) | Out-Null } catch { $checks.typesBusiness=$_.Exception.InnerException.Message -eq 'WSFE_BUSINESS:601' }
      $checks.operationDenied = $false
      try { [WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456786',$now,'UNSUPPORTED') | Out-Null } catch { $checks.operationDenied=$_.Exception.InnerException.Message -eq 'WSFE_OPERATION' }
      $checks.parametersRequest=$true
      foreach($op in @('FEParamGetTiposIva','FEParamGetCondicionIvaReceptor')){
        $req=[WsaaHomologacion]::PrepareWsfeDiagnostic($ticket,'20123456786',$now,$op)
        [xml]$payload=$req.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $checks.parametersRequest=$checks.parametersRequest -and $req.RequestUri.AbsoluteUri -eq 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' -and $payload.SelectSingleNode('//*[local-name()="'+$op+'"]') -ne $null -and $req.Headers.GetValues('SOAPAction').Contains('"http://ar.gov.afip.dif.FEV1/'+$op+'"') -and $payload.SelectNodes('//*[local-name()="ClaseCmp"]').Count -eq 0
        $req.Dispose()
      }
      $ivaOperation='FEParamGetTiposIva';$conditionOperation='FEParamGetCondicionIvaReceptor'
      $ivaRow='<IvaTipo><Id>5</Id><Desc>21%</Desc><FchDesde>20100917</FchDesde><FchHasta>NULL</FchHasta></IvaTipo>'
      $ivaPrefix=$typesPrefix.Replace($typesOperation,$ivaOperation);$ivaSuffix=$typesSuffix.Replace($typesOperation,$ivaOperation)
      $ivaXml=$ivaPrefix+'<ResultGet>'+$ivaRow+'</ResultGet>'+$ivaSuffix
      $iva=[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml,$ivaOperation)
      $checks.ivaParameters=$iva.Parameters.Length -eq 1 -and $iva.Parameters[0].Id -eq 5 -and $iva.Parameters[0].ValidFrom -eq '20100917' -and $iva.SourceSha256 -match '^[0-9a-f]{64}$'
      $conditionRow='<CondicionIvaReceptor><Id>5</Id><Desc>Consumidor Final</Desc><Cmp_Clase>B/C</Cmp_Clase></CondicionIvaReceptor>'
      $conditionXml=$typesPrefix.Replace($typesOperation,$conditionOperation)+'<ResultGet>'+$conditionRow+'</ResultGet>'+$typesSuffix.Replace($typesOperation,$conditionOperation)
      $condition=[WsaaHomologacion]::ParseWsfeDiagnostic($conditionXml,$conditionOperation)
      $checks.conditionsParameters=$condition.Parameters.Length -eq 1 -and $condition.Parameters[0].VoucherClasses -ceq 'B/C'
      $checks.parametersDuplicate=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml.Replace($ivaRow,$ivaRow+$ivaRow),$ivaOperation)|Out-Null}catch{$checks.parametersDuplicate=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $checks.parametersDate=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml.Replace('20100917','20260230'),$ivaOperation)|Out-Null}catch{$checks.parametersDate=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $checks.parametersNested=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml.Replace('21%','<Injected>21</Injected>'),$ivaOperation)|Out-Null}catch{$checks.parametersNested=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $checks.parametersExtra=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml.Replace('</IvaTipo>','<Unexpected>1</Unexpected></IvaTipo>'),$ivaOperation)|Out-Null}catch{$checks.parametersExtra=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $checks.parametersEmpty=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml.Replace($ivaRow,''),$ivaOperation)|Out-Null}catch{$checks.parametersEmpty=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $checks.parametersWrongMethod=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml,$conditionOperation)|Out-Null}catch{$checks.parametersWrongMethod=$_.Exception.InnerException.Message -eq 'WSFE_RESULT'}
      $checks.parametersBusiness=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($ivaPrefix+'<Errors><Err><Code>601</Code><Msg>SYNTHETIC_SECRET</Msg></Err></Errors>'+$ivaSuffix,$ivaOperation)|Out-Null}catch{$checks.parametersBusiness=$_.Exception.InnerException.Message -eq 'WSFE_BUSINESS:601'}
      $outFile=${quote(join(root, 'parameters.json'))}
      [WsaaHomologacion]::WriteParameterEvidence($iva,$ticket,$ivaOperation,$now,$outFile)
      $export=[IO.File]::ReadAllText($outFile);$evidence=$export|ConvertFrom-Json
      $checks.parametersExport=$evidence.entorno -ceq 'HOMOLOGACION' -and $evidence.parametros[0].Id -eq 5 -and $evidence.respuesta_sha256 -eq $iva.SourceSha256 -and $evidence.emision_habilitada -ceq $false -and $export -notmatch 'SYNTHETIC_|Token|Sign|Auth|<Envelope'
      $checks.parametersNoOverwrite=$false
      try{[WsaaHomologacion]::WriteParameterEvidence($iva,$ticket,$ivaOperation,$now,$outFile)}catch{$checks.parametersNoOverwrite=[IO.File]::ReadAllText($outFile) -ceq $export}
      $checks.parametersNoSecrets=$false
      $poison=[WsaaHomologacion]::ParseWsfeDiagnostic($ivaXml.Replace('21%','SYNTHETIC_TOKEN'),$ivaOperation)
      try{[WsaaHomologacion]::WriteParameterEvidence($poison,$ticket,$ivaOperation,$now,${quote(join(root, 'poison.json'))})}catch{$checks.parametersNoSecrets=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS' -and -not (Test-Path ${quote(join(root, 'poison.json'))})}
      $checks.parametersNoWrongOperation=$false
      try{[WsaaHomologacion]::WriteParameterEvidence($iva,$ticket,$typesOperation,$now,${quote(join(root, 'wrong.json'))})}catch{$checks.parametersNoWrongOperation=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $checks.parametersNoWrongExtension=$false
      try{[WsaaHomologacion]::WriteParameterEvidence($iva,$ticket,$ivaOperation,$now,${quote(join(root, 'wrong.txt'))})}catch{$checks.parametersNoWrongExtension=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETER_DESTINATION'}
      $checks.parametersSafeClass=$false
      try{[WsaaHomologacion]::ParseWsfeDiagnostic($conditionXml.Replace('B/C','&lt;unsafe&gt;'),$conditionOperation)|Out-Null}catch{$checks.parametersSafeClass=$_.Exception.InnerException.Message -eq 'WSFE_PARAMETERS'}
      $key = [Security.Cryptography.RSA]::Create(2048)
      $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Computadores Test',$key,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
      $cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddHours(1))
      $certPath = ${quote(join(root, 'fixture.crt'))}
      $keyPath = ${quote(join(root, 'fixture.pem'))}
      $phrase = 'SYNTHETIC_PASSWORD_FOR_TEST_ONLY'
      $password = ConvertTo-SecureString $phrase -AsPlainText -Force
      [IO.File]::WriteAllText($certPath,$cert.ExportCertificatePem())
      $pbe = [Security.Cryptography.PbeParameters]::new([Security.Cryptography.PbeEncryptionAlgorithm]::Aes256Cbc,[Security.Cryptography.HashAlgorithmName]::SHA256,1000)
      [IO.File]::WriteAllText($keyPath,$key.ExportEncryptedPkcs8PrivateKeyPem($phrase,$pbe))
      $cmsBytes = [WsaaHomologacion]::SignTra($certPath,$keyPath,$password,$tra.OuterXml)
      $cms = [Security.Cryptography.Pkcs.SignedCms]::new()
      $cms.Decode($cmsBytes)
      $cms.CheckSignature($true)
      $checks.cms = -not $cms.Detached -and [Text.Encoding]::UTF8.GetString($cms.ContentInfo.Content) -eq $tra.OuterXml
      $checks.digest = $cms.SignerInfos[0].DigestAlgorithm.Value -eq '2.16.840.1.101.3.4.2.1'
      $wrongKey = [Security.Cryptography.RSA]::Create(2048)
      [IO.File]::WriteAllText($keyPath,$wrongKey.ExportEncryptedPkcs8PrivateKeyPem($phrase,$pbe))
      $checks.mismatch = $false
      try { [WsaaHomologacion]::SignTra($certPath,$keyPath,$password,$tra.OuterXml) | Out-Null } catch { $checks.mismatch=$_.Exception.InnerException.Message -eq 'CERT_KEY_MISMATCH' }
      $password.Dispose(); $key.Dispose(); $wrongKey.Dispose(); $cert.Dispose()
      $checks | ConvertTo-Json -Compress
    `)
    const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', runner], { encoding: 'utf8', timeout: 30_000 })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const checks: Record<string, boolean> = JSON.parse(result.stdout.trim())
    expect(Object.keys(checks)).toHaveLength(48)
    expect(Object.entries(checks).filter(([, passed]) => !passed)).toEqual([])
    expect(result.stdout + result.stderr).not.toMatch(/SYNTHETIC_|PRIVATE KEY|BEGIN CERTIFICATE/)
  } finally {
    if (!root.startsWith(join(tmpdir(), 'kiosko-wsaa-test-'))) throw new Error('Destino temporal inesperado')
    rmSync(root, { recursive: true, force: true })
  }
}, 40_000)

it('limita el diagnóstico a homologación sin emisión, secretos ni redirecciones', () => {
  const source = readFileSync('scripts/arca/WsaaHomologacion.cs', 'utf8')
  const script = readFileSync('scripts/probar-wsaa-homologacion.ps1', 'utf8')
  expect(source).toContain('https://wsaahomo.afip.gov.ar/ws/services/LoginCms')
  expect(source).toContain('AllowAutoRedirect = false')
  expect(source).not.toMatch(/https:\/\/wsaa\.afip|FECAESolicitar|Console\.(Write|Error)/)
  expect(script).not.toMatch(/Write-(?:Output|Host|Error).*\$(?:ticket|cms|password|tra)\b(?!\.Expiration)/)
})

it.skipIf(process.platform !== 'win32')('clasifica excepciones tipadas anidadas sin mensajes privados y distingue IO local', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-wsaa-test-'))
  try {
    const runner = join(root,'failure-codes.ps1')
    writeFileSync(runner, `
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(resolve('scripts/probar-wsaa-homologacion.ps1'))},[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PARSE'}
$function=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Get-ArcaDiagnosticFailureCode'},$true)
. ([ScriptBlock]::Create($function.Extent.Text))
$secret='SYNTHETIC_PRIVATE_TOKEN <Envelope> C:/private/key.pem'
$cases=@(
 @{failure=[Exception]::new($secret,[Net.Http.HttpRequestException]::new([Net.Http.HttpRequestError]::NameResolutionError,$secret));stage='WSFE_CONSULTA';expected='TRANSPORT_DNS'},
 @{failure=[Net.Http.HttpRequestException]::new($secret,[OperationCanceledException]::new($secret));stage='LOGIN_CMS';expected='TRANSPORT_TIMEOUT'},
 @{failure=[Net.Http.HttpRequestException]::new([Net.Http.HttpRequestError]::SecureConnectionError,$secret);stage='WSFE_CONSULTA';expected='TRANSPORT_TLS'},
 @{failure=[Net.Sockets.SocketException]::new([int][Net.Sockets.SocketError]::HostNotFound);stage='WSFE_CONSULTA';expected='TRANSPORT_DNS'},
 @{failure=[Net.Sockets.SocketException]::new([int][Net.Sockets.SocketError]::TimedOut);stage='WSFE_CONSULTA';expected='TRANSPORT_TIMEOUT'},
 @{failure=[Net.Sockets.SocketException]::new([int][Net.Sockets.SocketError]::ConnectionRefused);stage='WSFE_CONSULTA';expected='TRANSPORT_SOCKET'},
 @{failure=[Net.Http.HttpRequestException]::new([Net.Http.HttpRequestError]::HttpProtocolError,$secret);stage='WSFE_CONSULTA';expected='TRANSPORT_PROTOCOL'},
 @{failure=[Net.Http.HttpRequestException]::new([Net.Http.HttpRequestError]::ResponseEnded,$secret);stage='WSFE_CONSULTA';expected='TRANSPORT_RESPONSE_ENDED'},
 @{failure=[Net.Http.HttpRequestException]::new([Net.Http.HttpRequestError]::ProxyTunnelError,$secret);stage='WSFE_CONSULTA';expected='TRANSPORT_PROXY'},
 @{failure=[Net.Http.HttpRequestException]::new($secret);stage='WSFE_CONSULTA';expected='TRANSPORT_HTTP'},
 @{failure=[IO.IOException]::new($secret);stage='WSFE_CONSULTA';expected='TRANSPORT_IO'},
 @{failure=[IO.IOException]::new($secret);stage='EXPORTACION_PARAMETROS';expected='LOCAL_OR_TRANSPORT_ERROR'},
 @{failure=[TimeoutException]::new($secret);stage='DPAPI';expected='LOCAL_OR_TRANSPORT_ERROR'},
 @{failure=[Exception]::new($secret,[IO.InvalidDataException]::new('WSFE_BUSINESS:601'));stage='WSFE_CONSULTA';expected='WSFE_BUSINESS:601'},
 @{failure=[Exception]::new($secret);stage='WSFE_CONSULTA';expected='LOCAL_OR_TRANSPORT_ERROR'}
)
$codes=@(foreach($case in $cases){$value=Get-ArcaDiagnosticFailureCode -Failure $case.failure -Stage $case.stage;if($value -cne $case.expected){throw 'CLASSIFICATION'};$value})
@{checks=$cases.Count;codes=$codes}|ConvertTo-Json -Compress
`)
    const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',timeout:30000})
    expect(result.status,result.stdout+result.stderr).toBe(0)
    expect(result.stdout+result.stderr).not.toMatch(/SYNTHETIC_PRIVATE|Envelope|private\/key/)
    expect(JSON.parse(result.stdout).checks).toBe(15)
  } finally { cleanCatalogTest(root) }
},40000)

it.skipIf(process.platform !== 'win32').each(['ok','second-fail','export-fail','missing-directory','mixed-mode','login-timeout','first-timeout','first-dns','first-tls','first-connect'])('catálogos %s reutiliza un TA y nunca reintenta ni instala datos', mode => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-wsaa-test-'))
  try {
    const runner = join(root, 'catalog.ps1'), report = join(root, 'report.json')
    writeFileSync(runner, `
      $ErrorActionPreference='Stop'
      Add-Type @'
using System; using System.IO; using System.Security; using System.Collections.Generic;
public static class WsaaHomologacion {
 public static string Mode="${mode}";
 public static List<string> Calls=new List<string>(); public static byte[] Cms;
 public sealed class Ticket { public string Token="SYNTHETIC_TOKEN"; public string Sign="SYNTHETIC_SIGN"; public DateTimeOffset Expiration=DateTimeOffset.UtcNow.AddHours(1); }
 public sealed class Diagnostic { public object[] Parameters=new object[]{new object()}; }
 public static void ValidateRepresentedCuit(string c){Calls.Add("validate");}
 public static string BuildTra(DateTimeOffset t,string s,uint id){Calls.Add("tra");return "SYNTHETIC_TRA";}
 public static byte[] SignTra(string c,string k,SecureString p,string tra){Calls.Add("sign");Cms=new byte[]{1,2};return Cms;}
 public static Ticket Login(byte[] c){Calls.Add("login");if(Mode=="login-timeout")throw new TimeoutException("SYNTHETIC_PRIVATE_UNEXPECTED");return new Ticket();}
 public static Diagnostic ConsultWsfe(Ticket t,string c,string op){Calls.Add(op);
 if(Mode=="first-timeout")throw new OperationCanceledException("SYNTHETIC_PRIVATE_UNEXPECTED");
 if(Mode=="first-dns")throw new System.Net.Http.HttpRequestException(System.Net.Http.HttpRequestError.NameResolutionError,"SYNTHETIC_PRIVATE_UNEXPECTED");
 if(Mode=="first-tls")throw new System.Security.Authentication.AuthenticationException("SYNTHETIC_PRIVATE_UNEXPECTED");
 if(Mode=="first-connect")throw new System.Net.Http.HttpRequestException(System.Net.Http.HttpRequestError.ConnectionError,"SYNTHETIC_PRIVATE_UNEXPECTED");
 if(Mode=="second-fail"&&op=="FEParamGetCondicionIvaReceptor")throw new InvalidDataException("SYNTHETIC_PRIVATE_UNEXPECTED");return new Diagnostic();}
 public static void WriteParameterEvidence(Diagnostic d,Ticket t,string op,DateTimeOffset now,string path){Calls.Add("export:"+op);if(Mode=="export-fail")throw new IOException("SYNTHETIC_PRIVATE_UNEXPECTED");File.WriteAllText(path,"PUBLIC_PARAMETERS_ONLY");}
}
'@
      function global:Add-Type {param($Path,$ReferencedAssemblies)}
      function global:Get-Content {param($LiteralPath,[switch]$Raw);[WsaaHomologacion]::Calls.Add('dpapi');return 'SYNTHETIC_DPAPI'}
      function global:ConvertTo-SecureString {param([Parameter(ValueFromPipeline)]$Value);return [Security.SecureString]::new()}
      & ${quote(resolve('scripts/probar-wsaa-homologacion.ps1'))} -Certificado SYNTHETIC_CERT -ClaveCifrada SYNTHETIC_KEY -ProteccionDpapi SYNTHETIC_PATH -Conectar -CatalogosPreparacion -CuitRepresentado 20123456786 -DirectorioCatalogos ${quote(mode === 'missing-directory' ? join(root, 'absent') : root)} ${mode === 'mixed-mode' ? '-ConsultaWsfe FEParamGetPtosVenta' : ''}
      $code=if($LASTEXITCODE){$LASTEXITCODE}else{0}
      [IO.File]::WriteAllText(${quote(report)},(@{calls=@([WsaaHomologacion]::Calls.ToArray());cms_cleared=([WsaaHomologacion]::Cms -eq $null -or [WsaaHomologacion]::Cms[0] -eq 0);exports=@(Get-ChildItem -LiteralPath ${quote(root)} -Filter '*FEParam*.json').Count}|ConvertTo-Json -Compress))
      exit $code
    `)
    const result = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',runner], {encoding:'utf8',timeout:30000})
    expect(result.status, result.stdout + result.stderr).toBe(mode === 'ok' ? 0 : 1)
    expect(existsSync(report), result.stdout + result.stderr).toBe(true)
    const evidence = JSON.parse(readFileSync(report,'utf8')) as {calls:string[];cms_cleared:boolean;exports:number}
    expect(evidence.cms_cleared).toBe(true)
    expect(result.stdout + result.stderr).not.toMatch(/SYNTHETIC_|PUBLIC_PARAMETERS_ONLY/)
    if (['missing-directory','mixed-mode'].includes(mode)) expect(evidence.calls).toEqual([])
    else {
      expect(evidence.calls.filter(c=>c==='login')).toHaveLength(1)
      expect(evidence.calls.filter(c=>c==='FEParamGetTiposIva')).toHaveLength(mode==='login-timeout'?0:1)
      expect(evidence.calls.filter(c=>c==='FEParamGetCondicionIvaReceptor')).toHaveLength(mode==='export-fail'||mode.startsWith('first-')||mode==='login-timeout'?0:1)
    }
    expect(evidence.exports).toBe(mode==='ok'?2:mode==='second-fail'?1:0)
    expect(result.stdout.includes('CATALOGOS_PREPARACION_EXPORTADOS=true')).toBe(mode==='ok')
    if (mode.endsWith('timeout')) expect(result.stdout).toContain('CODE=TRANSPORT_TIMEOUT')
    if (mode==='first-dns') expect(result.stdout).toContain('CODE=TRANSPORT_DNS')
    if (mode==='first-tls') expect(result.stdout).toContain('CODE=TRANSPORT_TLS')
    if (mode==='first-connect') expect(result.stdout).toContain('CODE=TRANSPORT_CONNECT')
  } finally {
    cleanCatalogTest(root)
  }
},40000)
