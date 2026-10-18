// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const script = resolve('scripts/preparar-arca-homologacion.ps1')

function ejecutar(cuerpo: string) {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-arca-test-'))
  try {
    const runner = join(root, 'runner.ps1')
    writeFileSync(runner, `$ErrorActionPreference='Stop'
      . ${quote(script)}
      $destino = ${quote(join(root, 'privado'))}
      $texto = 'frase-sintetica-exclusiva-de-test'
      $clave = ConvertTo-SecureString $texto -AsPlainText -Force
      ${cuerpo}
    `)
    return spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', runner], { encoding: 'utf8', timeout: 30_000 })
  } finally {
    const target = resolve(root)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('kiosko-arca-test-')) throw new Error('Directorio temporal inesperado')
    rmSync(target, { recursive: true, force: true })
  }
}

it.skipIf(process.platform !== 'win32')('genera CSR firmado y clave cifrada coincidente, sin sobrescribir ni mostrar secretos', () => {
  const result = ejecutar(`
    $resultado = New-ArcaHomologationRequest -Cuit '20123456786' -Organizacion 'Empresa, de ensayo' -Alias 'KioskoPOSHomologacion' -Clave $clave -Confirmacion $clave -Directorio $destino
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
public static class VerifyArcaFixture {
  public static bool Check(string csrPath, string keyPath, string phrase) {
    var request = CertificateRequest.LoadSigningRequestPem(File.ReadAllText(csrPath), HashAlgorithmName.SHA256,
      CertificateRequestLoadOptions.Default, RSASignaturePadding.Pkcs1);
    using (RSA key = RSA.Create()) {
      string encrypted = File.ReadAllText(keyPath);
      if (!encrypted.Contains("ENCRYPTED PRIVATE KEY")) return false;
      key.ImportFromEncryptedPem(encrypted, phrase);
      if (key.KeySize != 3072 || !Convert.ToBase64String(key.ExportSubjectPublicKeyInfo()).Equals(
        Convert.ToBase64String(request.PublicKey.ExportSubjectPublicKeyInfo()))) return false;
      if (!request.SubjectName.Name.Contains("CUIT 20123456786") || !request.SubjectName.Name.Contains("KioskoPOSHomologacion")) return false;
      try { using (RSA other = RSA.Create()) { other.ImportFromEncryptedPem(encrypted, "incorrecta"); } return false; }
      catch (CryptographicException) { return true; }
    }
  }
}
'@
    $comprobado = [VerifyArcaFixture]::Check($resultado.Solicitud, $resultado.ClaveCifrada, $texto)
    $hashAnterior = (Get-FileHash -LiteralPath $resultado.ClaveCifrada).Hash
    $rechazo = $false
    try { New-ArcaHomologationRequest -Cuit '20123456786' -Organizacion 'Ensayo' -Alias 'Otro' -Clave $clave -Confirmacion $clave -Directorio $destino | Out-Null } catch { $rechazo=$true }
    $acl = Get-Acl -LiteralPath $destino
    $reglas = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    [pscustomobject]@{
      CryptographyVerified=$comprobado; NoOverwrite=$rechazo -and $hashAnterior -eq (Get-FileHash -LiteralPath $resultado.ClaveCifrada).Hash
      PrivateAcl=$acl.AreAccessRulesProtected -and $reglas.Count -eq 1 -and $reglas[0].IdentityReference.Value -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      FileCount=@(Get-ChildItem -LiteralPath $destino -File).Count
    } | ConvertTo-Json -Compress
  `)
  expect(result.status, result.stdout + result.stderr).toBe(0)
  expect(JSON.parse(result.stdout.trim())).toEqual({ CryptographyVerified: true, NoOverwrite: true, PrivateAcl: true, FileCount: 2 })
  expect(result.stdout).not.toContain('frase-sintetica')
  expect(result.stdout).not.toContain('20123456786')
  expect(result.stdout).not.toContain('PRIVATE KEY')
}, 30_000)

it.skipIf(process.platform !== 'win32')('rechaza CUIT, contraseña o destino inválidos antes de escribir archivos', () => {
  const result = ejecutar(`
    $corta = ConvertTo-SecureString 'corta' -AsPlainText -Force
    $otra = ConvertTo-SecureString 'otra-frase-de-ensayo' -AsPlainText -Force
    $casos = @(
      @{ Cuit='20123456789'; Organizacion='Ensayo'; Alias='Sistema'; Clave=$clave; Confirmacion=$clave },
      @{ Cuit='00000000000'; Organizacion='Ensayo'; Alias='Sistema'; Clave=$clave; Confirmacion=$clave },
      @{ Cuit='20123456786'; Organizacion='Ensayo'; Alias='Sistema-con-guiones'; Clave=$clave; Confirmacion=$clave },
      @{ Cuit='20123456786'; Organizacion='Ensayo'; Alias='Sistema'; Clave=$corta; Confirmacion=$corta },
      @{ Cuit='20123456786'; Organizacion='Ensayo'; Alias='Sistema'; Clave=$clave; Confirmacion=$otra }
    )
    $rechazados=0
    foreach ($caso in $casos) { try { New-ArcaHomologationRequest @caso -Directorio $destino | Out-Null } catch { $rechazados++ } }
    try { New-ArcaHomologationRequest -Cuit '20123456786' -Organizacion 'Ensayo' -Alias 'Sistema' -Clave $clave -Confirmacion $clave -Directorio ${quote(resolve('arca-private-test-forbidden'))} | Out-Null } catch { $rechazados++ }
    [pscustomobject]@{ Rejected=$rechazados; NoFiles= -not (Test-Path -LiteralPath $destino) } | ConvertTo-Json -Compress
  `)
  expect(result.status, result.stdout + result.stderr).toBe(0)
  expect(JSON.parse(result.stdout.trim())).toEqual({ Rejected: 6, NoFiles: true })
}, 30_000)
