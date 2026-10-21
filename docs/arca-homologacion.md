# Preparar ARCA en homologación

Estado: preparación local disponible; **no hay emisión fiscal activada**.
Actualización 20/10/2026: certificado recibido, par criptográfico comprobado y
WSAA homologación PASS tras la autorización WSASS de `wsfe` por el titular.
WSFE aún no se consultó ni se emitieron comprobantes. Los resultados históricos
inferiores se conservan.
En el ensayo asistido del 18/10 ya se generaron la clave y el CSR del titular;
para retomarlo se conservan esos mismos archivos, sin repetir el paso 1.
Homologación significa conversar con los servicios de prueba de ARCA y recibir
sus respuestas reales. Una simulación local o un CAE aleatorio no la validan.

## 1. Generar la clave cifrada y el CSR

En una terminal PowerShell 7.4+ abierta en este repositorio:

```powershell
pwsh -NoProfile -File .\scripts\preparar-arca-homologacion.ps1
```

Si `pwsh` no está en PATH, en esta instalación de Codex está disponible aquí:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe" -NoProfile -File .\scripts\preparar-arca-homologacion.ps1
```

Ingresar los datos sólo en esa terminal: CUIT del titular que entrará a WSASS,
nombre de organización, alias del sistema y contraseña de cifrado de al menos
12 caracteres, repetida. No se necesitan contraseña fiscal ni acceso a internet
para este paso. La contraseña se ingresa oculta; el programa no la guarda.
El alias de WSASS sólo admite letras y números, por ejemplo
`KioskoPOSHomologacion20261018`; no usar guiones ni espacios.

Los archivos quedan en una carpeta nueva dentro de
`~/KioskoPOS-Privado/ARCA-Homologacion/`, con acceso exclusivo del usuario Windows:

- `solicitud-homologacion.csr`: solicitud pública que se presenta en WSASS.
- `clave-homologacion-cifrada.pem`: clave privada cifrada, conservar localmente.

No pegues ninguno en el chat ni los agregues a Git. La clave y su contraseña
deben conservarse: el certificado de ARCA sólo funcionará con esa misma clave.
El programa rechaza destinos dentro del repositorio y directorios ya existentes;
no sustituye ni rota una clave anterior.

En la preparación asistida del 18/10 se generó la contraseña aleatoriamente y
se conservó en `proteccion-clave.dpapi`, cifrada por Windows para el usuario
actual, dentro del mismo directorio privado. No se imprimió ni se envió a ARCA.
Ese archivo tampoco debe compartirse ni agregarse a Git; su protección depende
de la identidad Windows y del equipo, no sustituye un respaldo portable.

Usa APIs criptográficas de .NET: RSA 3072, CSR PKCS#10 firmado SHA256 y clave
PKCS#8 cifrada AES256/PBKDF2-SHA256. No instala OpenSSL ni genera un certificado
autofirmado para presentarlo como emitido por ARCA.

## 2. Trámite personal en ARCA

El titular inicia sesión por sí mismo con clave fiscal. Si no tiene WSASS,
adhiere el servicio desde el Administrador de Relaciones. En WSASS crea un
certificado nuevo, elige un alias y presenta únicamente el CSR. Su CUIT debe
coincidir con el serialNumber de la solicitud; guarda el certificado devuelto.
Después crea la autorización del alias para `wsfe`, indicando el contribuyente
representado. Este último puede diferir del titular del certificado.

Guías oficiales: [certificados y acceso a WSASS](https://www.afip.gob.ar/ws/documentacion/certificados.asp),
[generación del CSR](https://www.afip.gob.ar/ws/WSASS/html/generarcsr.html),
[obtención del certificado](https://www.afip.gob.ar/ws/WSASS/html/crearcertificado.html)
y [autorización del servicio](https://www.afip.gob.ar/ws/WSASS/html/crearautorizacion.html).

## 3. Qué falta para probar facturación

El certificado y la clave se instalarán por canal seguro sólo del lado servidor,
primero en Staging. No usar localStorage ni las columnas públicas del kiosco.
La integración debe verificar JWT/rol/tenant, persistir una operación estable,
coordinar numeración y consultar el comprobante ante una respuesta incierta.
No desplegar la Edge legacy `afip-wsfe` como solución: requiere ese rediseño.

Los próximos ensayos son WSAA con certificado autorizado, parámetros de WSFE,
emisión de prueba, reintento idéntico y recuperación mediante FECompConsultar.
Hasta superarlos, se mantiene el guard estricto de facturación y no se promete
homologación finalizada. No se emitirán comprobantes de producción ni se usará
una venta real para estos ensayos.

[WSAA y asociación del certificado](https://www.afip.gov.ar/ws/documentacion/wsaa.asp)
y [documentación oficial de homologación](https://www.afip.gob.ar/fe/ayuda/homologacion_externa.asp).
El PDF enlazado actualmente indica una revisión posterior al 17/10/2026;
confirmar contrato y WSDL del entorno antes de asumir esa revisión vigente.

## Ensayo asistido — 18/10/2026

El titular inició sesión y autorizó adherir WSASS y solicitar un certificado.
Se abrió el servicio TESTING/HOMOLOGACIÓN; no había certificados previos.
La clave y el CSR reales se generaron localmente con custodia cifrada fuera
de Git. WSASS exige alias de letras/números: no acepta guiones.

La solicitud con alias válido devolvió error interno de mensajería:
`EJBTransactionRolledbackException: Could not send Message`. Se consultaron
certificados/aliases antes de un único reintento con el mismo CSR y alias;
el error se repitió. La lista final continuó sin certificados. No asumir éxito,
no cambiar de clave/alias para reintentar a ciegas ni usar ese resultado como CAE.
WSFE no fue autorizado y no se emitieron comprobantes de ningún entorno.
Conservar la solicitud para retomar cuando WSASS pueda procesarla.

Herramienta publicada en master en 72839fa junto con la corrección del Excel
(3d1f3e7). Suite final conjunta: 1870 PASS / 1 skipped / 198 archivos; build PASS,
611 módulos. Pruebas nativas de cifrado/CSR/ACL PASS. Audit 0; escaneo de fuentes
sin secretos nuevos. Ambos checks Vercel success. Estos resultados validan el
código y la preparación local, no la emisión de un certificado ni un CAE de ARCA.

## Certificado y ensayo WSAA — 20/10/2026

El titular proporcionó el certificado público emitido por Computadores Test.
Formato X.509 PASS; CN `KioskoPOSHomologacion20261018`, RSA 3072, vigencia
20/10/2026 16:21:18 UTC a 19/10/2028 16:21:18 UTC. Comparación SPKI derivado
de la clave original descifrada sólo en memoria: `CERTIFICATE_PRIVATE_KEY_MATCH=PASS`.
No se regeneró clave ni CSR; el certificado recibido se conservó fuera del checkout.

La herramienta local `scripts/probar-wsaa-homologacion.ps1` usa PowerShell 7.4+
y las APIs criptográficas de .NET ya disponibles, sin dependencias nuevas.
Recibe rutas mediante `-Certificado`, `-ClaveCifrada` y `-ProteccionDpapi`;
`-Servicio` es `wsfe` por defecto. No requiere variables de entorno nuevas.
Sin `-Conectar` sólo valida el par, construye el TRA y verifica la firma CMS.
Con `-Conectar` hace un único POST al endpoint fijo de homologación, sin
redirecciones, sin persistir el ticket ni emitir comprobantes. No ejecutarla con
transcripción, depuración de variables o captura de memoria habilitada.

Con autorización expresa del titular se ejecutó una única llamada. Resultado:

```text
CERT_KEY_MATCH=PASS
TRA_GENERATION=PASS
CMS_SIGNATURE=PASS
WSAA_HOMOLOGACION=FAIL
STAGE=LOGIN_CMS
CODE=WSAA_FAULT:ns1:coe.notAuthorized
TOKEN_RECEIVED=false
SIGN_RECEIVED=false
WSFE_READY=false
```

No interpretar el rechazo como autenticación completada. El diagnóstico apunta
a la autorización del certificado para `wsfe`; comprobar en WSASS **Crear
Autorización a Servicio**, seleccionar el alias existente, el contribuyente
representado y el servicio correspondiente. No cambiar el certificado ni la clave
para resolver un permiso. [Instrucciones oficiales](https://www.afip.gob.ar/ws/WSASS/html/crearautorizacion.html).
No se reintentó tras el rechazo ni se hizo una llamada a WSFE.

La Edge legacy continúa sin desplegarse: no constituye una pasarela fiscal segura.
El diagnóstico local no modifica Supabase, Staging, master ni Production.
No hubo commit, push o deploy de este bloque por restricción expresa del titular.

### Autorización resuelta y autenticación real confirmada
El titular creó la autorización del mismo alias al servicio `ws://wsfe` y confirmó
el contribuyente representado. Se hizo un único reintento tras ese cambio externo:
`WSAA_HOMOLOGACION=PASS`, `TOKEN_RECEIVED=true`, `SIGN_RECEIVED=true`;
`expirationTime=2026-10-21T04:41:57.766Z` (01:41 hora argentina).
El TA sólo existió en memoria del proceso de diagnóstico; no se registró en
Supabase, disco, logs ni Git. No volver a solicitar otro TA a ciegas: WSAA puede
rechazar solicitudes mientras haya un ticket vigente.

`PrepareWsfeDiagnostic` prepara una consulta `FEParamGetPtosVenta` usando el TA
en memoria y un CUIT representado con dígito verificador válido; rechaza TA
vencido/próximo a vencer. El endpoint y SOAPAction están fijados a homologación.
No ejecuta la consulta ni puede emitir comprobantes. Su contrato se verificó contra
la [operación oficial](https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetPtosVenta).
Falta probar WSFE real y diseñar custodia/caché servidor, autorización por comercio,
numeración y recuperación antes de activar facturación en el sistema.

Validación local: suite completa 2106 PASS / 1 skipped / 220 archivos (224,91 s),
build PASS (632 módulos), manifiesto histórico 43 SQL PASS, diff PASS y escaneo
sin candidatos nuevos. Esa suite precede a la preparación posterior del diagnóstico
WSFE; las pruebas dirigidas se vuelven a ejecutar para ese agregado.
Pruebas dirigidas finales: 4 PASS / 2 archivos, incluidas 17 comprobaciones
criptográficas/protocolo con datos sintéticos y el contrato de no emisión.

### Informe del bloque local
- Inspeccionados: package.json, .gitignore, preparación criptográfica PowerShell,
  documentación ARCA, Edge legacy afip-wsfe, tipos/store AFIP, pruebas existentes,
  índice e historial de extensiones criptográficas (sin archivos privados encontrados).
- Modificados: .gitignore, este documento y DECISIONS.md. Agregados:
  scripts/arca/WsaaHomologacion.cs, scripts/probar-wsaa-homologacion.ps1 y
  src/test/wsaaHomologacion.test.ts. El plan general del piloto se agregó aparte.
- Dependencias nuevas: ninguna. Variables de entorno nuevas: ninguna.
- Riesgos pendientes: WSFE aún no validado en red; no existe todavía una pasarela
  fiscal nueva con caché privada, permisos por comercio e idempotencia de emisión.
- Próximo paso: ensayo de consulta WSFE no transaccional con un TA vigente dentro
  del mismo proceso autorizado; no generar comprobantes como prueba de conectividad.

| Gate | Resultado |
|---|---|
| CERT_KEY_MATCH | PASS |
| SECRET_SAFETY | PASS para archivos/ejecución revisados; no sustituye auditoría integral del historial |
| TRA_GENERATION | PASS |
| CMS_SIGNATURE | PASS |
| WSAA_LOGIN_CMS | PASS real, homologación |
| TOKEN_RECEIVED | PASS |
| SIGN_RECEIVED | PASS |
| WSFE_READY | PENDIENTE: solicitud preparada, ejecución no realizada |
| TESTS | PASS con el alcance y orden indicados arriba |
