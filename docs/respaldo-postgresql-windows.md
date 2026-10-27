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

## Respaldo privado previo al SQL fiscal — 26/10/2026

El titular autorizó preparar la copia privada de Staging `acoyfwwmhaeruciyedri`.
El proyecto Free informa que no incluye respaldos del proveedor. No hay aún
una copia real confirmada: SQL001–053 conserva su GO, pero SQL001 espera este
prerrequisito del gate aprobado.

Desde una terminal local de Windows, ejecutar:

```powershell
powershell -NoProfile -File "C:\Users\jonat\Documents\Codex\2026-10-16\referenced-chatgpt-conversation-this-is-an\work\commercial-subscription-backend\scripts\respaldar-staging-privado.ps1"
```

Ingresar únicamente allí la contraseña PostgreSQL de Staging, distinta de la
contraseña de la cuenta web de Supabase. No enviarla por chat, no guardarla en
el repositorio y no restablecerla para este ensayo. Si se desconoce, detenerse.
Docker debe estar abierto y `postgres:17-alpine` previamente disponible; el
asistente no descarga imágenes. `-Preparar` sólo comprueba el cliente local.

El destino está fijado al session pooler de Staging, puerto 5432, con TLS
`verify-full`. La carpeta única queda en
`%USERPROFILE%\KioskoPOS-Privado\Backups\Staging`, fuera del repositorio,
con permisos comprobados para el usuario actual. La contraseña viaja al cliente
por stdin y un pgpass efímero dentro del contenedor, nunca como argumento ni
como variable de entorno de Docker. Se reutiliza el exportador existente para
el archivo custom de esquema/datos y se exportan roles sin passwords por separado.
Se comprueban el índice, siete tablas críticas, SHA256 y permisos de archivos.
El contexto privado registra `BACKUP_ARCHIVE_VERIFIED_NOT_RESTORED` sólo al final.

La copia contiene información sensible y no está cifrada. El índice y los hashes
no prueban una restauración completa ni equivalen a aceptación de PR07. Storage
físico, copia externa protegida, retención y restore aislado siguen pendientes.
No ejecutar una restauración ni instalar SQL si el asistente no confirma éxito.
Ante un fallo, conservar los archivos protegidos para diagnóstico sin compartir
su contenido. Comunicar sólo el paso y tipo de error, sin credenciales.

Validación local: 15 pruebas Windows PASS (6 del asistente y 9 del exportador),
con Docker y credenciales ficticios. Cliente real PostgreSQL17 de Docker comprobado
sin red mediante `-Preparar`; ninguna conexión ni copia real se realizó en esas pruebas.

### Fallo del primer respaldo real — 26/10/2026

El titular ejecutó el asistente e ingresó su contraseña sólo en terminal. Falló
antes de confirmar el archivo, con RuntimeException en esquema/datos. No hay
respaldo confirmado ni SQL instalado. La causa real todavía no está acreditada.
Se añadió captura privada en memoria del error del cliente y clasificación
cerrada (TLS, autenticación, DNS, conexión, versión o permisos); la respuesta
externa completa nunca se imprime. Windows PowerShell no debe convertir stderr
nativo en una excepción antes de clasificarlo. Mantener verify-full: no degradar
TLS para sortear un fallo. El siguiente intento humano debe comunicar sólo la
categoría segura. Este diagnóstico no equivale a una copia real exitosa.

### Certificado raíz explícito — 26/10/2026

El titular descargó `Downloads/prod-ca-2021.crt` desde Supabase. Se verificó como
certificado público Supabase Root2021CA, sin clave privada, vigente hasta2031.
El asistente exige esa raíz (huella SHA1 de identificación
A4518A0933AF6949482CCA3014C007C369DF9F6F), PEM y vigencia antes del prompt.
La monta como archivo de sólo lectura en `/supabase-root.crt` y configura
PGSSLROOTCERT sin reducir `sslmode=verify-full`. No instala una CA en Windows
ni cambia SSL del servidor. El comando humano permanece igual; opcionalmente
`-CertificadoRaiz` permite indicar otra ubicación del mismo certificado público.

19 pruebas Windows PASS: incluye raíz ausente/inválida y montaje readonly;
lint PASS y `-Preparar` con certificado y Docker reales PASS sin conexión DB.
La fixture de pruebas es únicamente el certificado CA público, no material ARCA.
El respaldo real sigue pendiente: el fallo TLS anterior no queda cerrado sólo
por estas pruebas. No se instaló SQL fiscal.

### Respaldo con SQL001–053 instalado, antes de SQL054 — 27/10/2026

Para una copia nueva del estado fiscal actual, reutilizar el asistente con
`-FiscalInstalado053`. El modo anterior se conserva para su fase histórica.
```powershell
powershell -NoProfile -File ".\scripts\respaldar-staging-privado.ps1" -FiscalInstalado053
```
Ejecutar desde el repositorio. Para comprobar sólo cliente/CA sin contraseña,
exportación ni conexión DB, agregar `-Preparar`.

El nuevo modo crea una carpeta privada única `pre-sql054-*`; no sobrescribe el
respaldo previo. Además de las siete tablas comerciales, exige en el índice
TABLE DATA de las41tablas fiscales de001–053, la función heredada exacta y su
entrada ACL. El manifiesto registra etapa BEFORE_SQL054, lista de tablas y
comprobación de esas entradas. Su existencia en TOC no prueba equivalencia de
todo el esquema, integridad referencial ni restauración: el manifiesto conserva
fiscal_schema_equivalence_proven=false y restore_executed=false. No exporta
objetos físicos de Storage ni acredita una copia externa/cifrada.

La contraseña PostgreSQL se ingresa sólo en el prompt local. No enviarla ni
copiar respuestas externas; compartir únicamente la línea de confirmación/ruta
o la categoría segura del fallo. TLS verify-full, CA pública fija, cliente
existente sin descargas, roles sin passwords y ACL privadas se mantienen.
Preparar esta herramienta no crea un respaldo real ni autoriza SQL054/Edge.

Corrección del índice real (27/10): pg_restore imprime la firma FUNCTION con
tipos, pero su entrada ACL puede incluir nombres de argumentos. El patrón acepta
ambas formas de la firma exacta uuid/uuid/uuid/jsonb; otra sobrecarga continúa
rechazada. Las categorías INDICE_FISCAL_TABLA/FUNCION/ACL identifican el control
fallido sin publicar respuestas externas. El primer archivo parcial conserva
las41tablas y función/ACL verificadas por lectura local, pero no completó roles
ni manifiesto final. No promoverlo manualmente a confirmado. Ejecutar el mismo
comando corregido crea otra carpeta y conserva los archivos anteriores.
