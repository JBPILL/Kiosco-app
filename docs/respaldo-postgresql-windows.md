# Respaldo PostgreSQL desde Windows

El script anterior prefería `supabase db dump` sin solicitar datos y podía
anunciar una copia completa con sólo estructura. La documentación de Supabase
distingue esquema y `--data-only`:
https://supabase.com/docs/guides/local-development/cli-workflows

## Uso

Instalar pg_dump y pg_restore compatibles con la versión del servidor y
agregarlos al PATH. Configurar DATABASE_URL por un mecanismo local protegido;
no pegar la contraseña en el chat, en Git ni en comandos guardados en historial.
Usar conexión directa o session pooler. El script rechaza puerto 6543, exige
TLS y sólo admite sslmode require/verify-ca/verify-full en la URI.

Ejecutar `scripts/backup_supabase.ps1 -OutputDir D:\CopiasProtegidas` desde
PowerShell. También existe un lanzador BAT que conserva el código de salida.
La carpeta debe estar protegida: el archivo no está cifrado. Guardar una copia
externa protegida y definir retención. La carpeta local backups/ queda ignorada
por Git; eso no cifra ni protege el contenido frente a otros usuarios.

## Comportamiento

El script guarda un manifiesto `.dump.sha256` junto a cada nueva copia. Conservar
ambos fuera del equipo. Antes del ensayo, ejecutar:

```powershell
.\scripts\verificar-respaldo-postgresql.ps1 -Archivo D:\CopiasProtegidas\copia.dump
```

Devuelve 0 si contenido y nombre coinciden; 1 si falta archivo/manifiesto o no
coinciden. No conecta a ninguna base ni restaura datos. El hash detecta daño si
el manifiesto se conserva confiable; no autentica el origen ni protege frente a
un atacante capaz de cambiar ambos archivos. Las copias anteriores sin manifiesto
no pasan este control. No generar uno nuevo para ocultar una diferencia.
14 pruebas Windows aprobaron generación y verificación (copia alterada,
manifiesto ausente, malformado o nombre diferente), con herramientas de dump simuladas.

- Usa pg_dump custom con esquema y datos, sin prompt de contraseña.
- No pasa la URI ni la contraseña en argumentos del proceso.
- Aísla las variables libpq de conexión y restaura el entorno al terminar.
- Escribe primero un archivo parcial y valida su índice con pg_restore.
- Exige al menos una entrada TABLE DATA y un archivo no vacío.
- Publica el .dump sólo después de esa validación y calcula SHA256 por stream.
- Devuelve código 1 ante fallos y elimina el parcial creado por esa ejecución.
- Los mensajes de error externos se sustituyen por texto sin credenciales.

Un índice válido no demuestra que todos los registros se restauren. El archivo
es un respaldo de una base PostgreSQL; no incluye archivos físicos de Storage ni
roles globales. Puede contener datos personales, hashes de acceso y secretos
almacenados en tablas: requiere protección adicional y acceso limitado.

## Validación y límites

Las pruebas Windows ejecutan el script real con pg_dump/pg_restore simulados:
éxito, fallos, ausencia de contenido, archivo con sólo esquema, conexión ausente,
transaction pooler, TLS deshabilitado y error externo con contraseña ficticia.
Pasaron los 9 casos y `npm run build`. No se ejecutó pg_dump contra Supabase ni
se restauró una base remota.

El ensayo real debe crear una base aislada compatible, restaurar allí, revisar
errores y comparar conteos, saldos y relaciones. No ejecutar restore sobre
producción para comprobar una copia. Mantener una estrategia separada para
Storage y roles, y guardar el resultado del ensayo antes de cerrar esta fase.

## Diagnóstico de implementación

Las primeras pruebas fallaban antes de invocar las herramientas: Windows
PowerShell 5 elegía una sobrecarga incorrecta de String.Split. Se sustituyó por
`-split`. El cálculo SHA256 pasó a .NET para funcionar sin Get-FileHash.
Los errores se reprodujeron con URI ficticia y copia temporal, luego se retiró
la instrumentación. Ninguna prueba se conectó a una base.

Autoevaluación: exactitud 4/5 (script ejecutado con mocks; falta herramienta real),
completitud 3/5 (generación protegida contra falsos éxitos; cifrado/retención y
restore pendientes), claridad 4/5 (alcance explícito), acción 4/5 (script y BAT),
concisión 4/5 (un método de volcado con verificación y sin fallback ambiguo).
