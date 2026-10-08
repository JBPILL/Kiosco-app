@echo off
REM ==============================================================================
REM KIOSKOPOS - LANZADOR DE RESPALDO DE BASE DE DATOS SUPABASE (WINDOWS)
REM ==============================================================================
echo ======================================================
echo    Iniciando proceso de backup de KioskoPOS...
echo ======================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup_supabase.ps1"
set "backup_result=%ERRORLEVEL%"

echo.
echo Presione cualquier tecla para cerrar esta ventana...
pause >nul
exit /b %backup_result%
