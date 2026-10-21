// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

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
    expect(Object.keys(checks)).toHaveLength(24)
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
