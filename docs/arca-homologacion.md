# Preparar ARCA en homologación

Estado: preparación local disponible; **no hay emisión fiscal activada**.
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
