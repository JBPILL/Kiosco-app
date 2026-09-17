# ==============================================================================
# SCRIPT DE COPIA DE SEGURIDAD (BACKUP) - KIOSKOPOS (SUPABASE)
# ==============================================================================
# Este script realiza un volcado completo de la base de datos PostgreSQL de Supabase
# y lo guarda con fecha y hora en la carpeta de respaldos (backups/).
#
# Requisitos:
# - Disponer de 'pg_dump' (instalado con PostgreSQL o disponible en PATH)
#   O disponer de Supabase CLI instalada ('supabase db dump').
# ==============================================================================

param(
    [string]$DbUrl = $env:DATABASE_URL,
    [string]$OutputDir = "$PSScriptRoot\..\backups"
)

# Crear directorio de destino si no existe
if (-not (Test-Path -Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$fecha = Get-Date -Format "yyyyMMdd_HHmmss"
$archivoDestino = Join-Path -Path $OutputDir -ChildPath "kioskopos_backup_$fecha.sql"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   KIOSKOPOS - RESPALDO DE BASE DE DATOS SUPABASE     " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Destino: $archivoDestino" -ForegroundColor Yellow

# 1. Intentar con Supabase CLI si está disponible
$hasSupabaseCli = Get-Command supabase -ErrorAction SilentlyContinue
if ($hasSupabaseCli) {
    Write-Host "Utilizando Supabase CLI..." -ForegroundColor Green
    supabase db dump -f $archivoDestino
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Respaldo completado exitosamente con Supabase CLI." -ForegroundColor Green
        exit 0
    }
}

# 2. Intentar con pg_dump si se pasó la cadena de conexión
if ($DbUrl) {
    $hasPgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($hasPgDump) {
        Write-Host "Utilizando pg_dump con DATABASE_URL..." -ForegroundColor Green
        pg_dump --clean --if-exists --no-owner --no-privileges -d $DbUrl -f $archivoDestino
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Respaldo completado exitosamente con pg_dump." -ForegroundColor Green
            exit 0
        }
    } else {
        Write-Host "Aviso: pg_dump no encontrado en PATH." -ForegroundColor Yellow
    }
}

# 3. Instrucción de guía en caso de requerir configuración
Write-Host ""
Write-Host "INFORMACION:" -ForegroundColor Yellow
Write-Host "Para respaldar directamente con pg_dump:"
Write-Host "1. En tu panel de Supabase: Project Settings > Database > Connection string (URI)"
Write-Host "2. Copia la URL (ej: postgresql://postgres.xxxx:password@aws-0-sa-east-1.pooler.supabase.com:6543/postgres)"
Write-Host "3. Ejecuta este script pasando el parametro -DbUrl 'TU_URL_DE_CONEXION'"
Write-Host "   Ejemplo: .\backup_supabase.ps1 -DbUrl 'postgresql://...'"
Write-Host ""
