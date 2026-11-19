#requires -Version 7.4
[CmdletBinding()]
param([string]$Destino)

function New-ArcaHomologationRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Cuit,
        [Parameter(Mandatory)][string]$Organizacion,
        [Parameter(Mandatory)][string]$Alias,
        [Parameter(Mandatory)][Security.SecureString]$Clave,
        [Parameter(Mandatory)][Security.SecureString]$Confirmacion,
        [Parameter(Mandatory)][string]$Directorio
    )
    $ErrorActionPreference = 'Stop'
    if (-not $IsWindows) { throw 'Esta herramienta requiere Windows y PowerShell 7.4 o superior.' }
    $ruta = [IO.Path]::GetFullPath($Directorio)
    $repo = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
    if ($ruta.Equals($repo, [StringComparison]::OrdinalIgnoreCase) -or
        $ruta.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'El directorio privado debe quedar fuera del repositorio.'
    }
    if (Test-Path -LiteralPath $ruta) { throw 'El directorio ya existe; elegí uno nuevo. No se sobrescribe ninguna clave.' }
    if (-not ('ArcaHomologationLocal' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public static class ArcaHomologationLocal {
    private static char[] ReadSecret(SecureString value) {
        IntPtr pointer = Marshal.SecureStringToBSTR(value);
        try {
            char[] chars = new char[value.Length];
            Marshal.Copy(pointer, chars, 0, chars.Length);
            return chars;
        } finally { Marshal.ZeroFreeBSTR(pointer); }
    }
    public static string[] Generate(string cuit, string organization, string alias,
                                    SecureString pass, SecureString confirmation) {
        if (!Regex.IsMatch(cuit, "^(20|23|24|27|30|33|34)[0-9]{9}$")) throw new ArgumentException("CUIT inválido.");
        int[] weights = {5,4,3,2,7,6,5,4,3,2};
        int sum = 0;
        for (int i = 0; i < 10; i++) sum += (cuit[i] - '0') * weights[i];
        int digit = 11 - sum % 11;
        digit = digit == 11 ? 0 : digit == 10 ? 9 : digit;
        if (digit != cuit[10] - '0') throw new ArgumentException("CUIT inválido.");
        if (String.IsNullOrWhiteSpace(organization) || organization.Length > 150 ||
            !Regex.IsMatch(alias, "^[A-Za-z0-9]{1,64}$") ||
            Regex.IsMatch(organization + alias, @"[\r\n\x00]"))
            throw new ArgumentException("Organización o alias inválido.");
        char[] phrase = null, repeated = null;
        try {
            phrase = ReadSecret(pass);
            repeated = ReadSecret(confirmation);
            if (phrase.Length < 16) throw new ArgumentException("La contraseña debe tener al menos 16 caracteres para la custodia privada.");
            if (!CryptographicOperations.FixedTimeEquals(MemoryMarshal.AsBytes(phrase.AsSpan()),
                                                         MemoryMarshal.AsBytes(repeated.AsSpan())))
                throw new ArgumentException("Las contraseñas no coinciden.");
            var subject = new X500DistinguishedNameBuilder();
            subject.AddCountryOrRegion("AR");
            subject.AddOrganizationName(organization.Trim());
            subject.AddCommonName(alias.Trim());
            subject.Add("2.5.4.5", "CUIT " + cuit, System.Formats.Asn1.UniversalTagNumber.PrintableString);
            using (RSA rsa = RSA.Create(3072)) {
                var request = new CertificateRequest(subject.Build(), rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                string csr = request.CreateSigningRequestPem();
                string key = rsa.ExportEncryptedPkcs8PrivateKeyPem(phrase.AsSpan(),
                    new PbeParameters(PbeEncryptionAlgorithm.Aes256Cbc, HashAlgorithmName.SHA256, 200000));
                return new [] {csr, key};
            }
        } finally {
            if (phrase != null) Array.Clear(phrase, 0, phrase.Length);
            if (repeated != null) Array.Clear(repeated, 0, repeated.Length);
        }
    }
    public static void WriteNew(string path, string content) {
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new StreamWriter(stream, new UTF8Encoding(false))) writer.Write(content);
    }
}
'@
    }
    # Los PEM no se escriben al pipeline. Sólo la clave cifrada llega al disco.
    $artefactos = [ArcaHomologationLocal]::Generate($Cuit, $Organizacion, $Alias, $Clave, $Confirmacion)
    $carpeta = [IO.Directory]::CreateDirectory($ruta)
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($identidad)
    $acl.SetAccessRuleProtection($true, $false)
    $regla = [Security.AccessControl.FileSystemAccessRule]::new($identidad, 'FullControl',
        'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($regla)
    [IO.FileSystemAclExtensions]::SetAccessControl($carpeta, $acl)
    $csr = Join-Path $ruta 'solicitud-homologacion.csr'
    $key = Join-Path $ruta 'clave-homologacion-cifrada.pem'
    [ArcaHomologationLocal]::WriteNew($key, $artefactos[1])
    [ArcaHomologationLocal]::WriteNew($csr, $artefactos[0])
    return [pscustomobject]@{ Solicitud = $csr; ClaveCifrada = $key }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        if ([Console]::IsInputRedirected) { throw 'Ejecutá esta herramienta en una terminal interactiva local.' }
        if (-not $Destino) {
            $Destino = Join-Path $HOME ('KioskoPOS-Privado/ARCA-Homologacion/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        }
        Write-Host 'Sólo prepara archivos locales para homologación. No conecta con ARCA ni emite comprobantes.'
        $titular = (Read-Host 'CUIT del titular que ingresará a WSASS (11 dígitos)').Trim()
        $organizacion = Read-Host 'Nombre de la empresa u organización'
        $aliasSistema = Read-Host 'Alias del sistema, sólo letras y números (por ejemplo KioskoPOSHomologacion)'
        $frase = Read-Host 'Contraseña para cifrar la clave (mínimo 16 caracteres)' -AsSecureString
        $repetida = Read-Host 'Repetir contraseña' -AsSecureString
        try {
            $resultado = New-ArcaHomologationRequest -Cuit $titular -Organizacion $organizacion -Alias $aliasSistema `
                -Clave $frase -Confirmacion $repetida -Directorio $Destino
            Write-Host ('CSR para WSASS: ' + $resultado.Solicitud)
            Write-Host ('Clave privada cifrada, conservar localmente: ' + $resultado.ClaveCifrada)
            Write-Host 'Pegá sólo el CSR en WSASS. No compartas la clave ni su contraseña en el chat.'
        } finally { if ($frase) { $frase.Dispose() }; if ($repetida) { $repetida.Dispose() } }
    } catch {
        Write-Error 'No se pudo preparar la solicitud. Verificá datos, contraseñas, permisos y que el destino sea nuevo y externo al repositorio.'
        exit 1
    }
}
