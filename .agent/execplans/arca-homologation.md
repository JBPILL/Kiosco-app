# ARCA — preparación de homologación autorizada

## Objetivo y autorización
El usuario amplió expresamente el alcance a AFIP/ARCA y eligió primero
homologación. Informó que necesita preparar certificado y autorización WSASS.
No incluye emisión fiscal real, Point ni integración del PR #1.

## Diagnóstico
La implementación legacy no es apta para activar: simula CAE ante fallos de
homologación; guarda clave privada en configuración/localStorage; la Edge usa
service_role sin autenticar al actor, y no reserva durablemente numeración ni
reconcilia FECompConsultar. El baseline estricto no tiene las columnas/tablas
fiscales y mantiene bloqueada la emisión. No retirar ese guard como atajo.

## Bloque actual
Preparar herramienta local para clave RSA cifrada y CSR PKCS#10 compatible con
WSASS, sin OpenSSL instalado ni dependencia nueva. PowerShell 7.4+/.NET, RSA
3072, SHA256 y PKCS#8 cifrado AES256/PBKDF2. CUIT del titular WSASS, organización
y alias se ingresan en terminal local; contraseña con Read-Host AsSecureString.
No escribir clave sin cifrar ni enviar credenciales, CSR o claves a un servidor.
Directorio privado fuera del repo, archivos CreateNew y sin sobrescritura.
Probar firma CSR, correspondencia de clave y cifrado con datos sintéticos.

## Gates siguientes
1. Titular ingresa por sí mismo a WSASS, obtiene certificado y autoriza wsfe.
2. Diseñar módulo incremental de homologación separado, credenciales sólo
   server-side, RLS/ACL y JWT Dueño/tenant; no usar la Edge legacy actual.
3. Operación durable por venta/entorno, lock por CUIT/punto/tipo, cuerpo estable,
   FECompConsultar ante incertidumbre y rechazo de reenvíos con otro contenido.
4. Adaptador WSAA/WSFE con XML robusto, expiración, fecha Argentina, importes
   y condición IVA del receptor según contrato vigente. Probar en Staging.
5. Publicar UI de homologación con estados reales y sin CAE simulado; mantener
   separadas vista previa, venta confirmada y autorización fiscal.

## Fuentes y precaución de versión
Consultar documentación oficial en docs/arca-homologacion.md. El enlace actual
de homologación ofreció manual v4.8 con revisión 01/12/2026, posterior a esta
sesión (17/10/2026): no asumir que toda esa revisión ya está vigente. Confirmar
WSDL y contrato del entorno antes de implementar emisión.

## Progreso
- [x] Alcance de homologación y ausencia de certificados confirmados.
- [x] Inspección de legacy y documentación oficial WSASS/WSAA/WSFE.
- [x] Generador local cifrado y pruebas: firma CSR, clave coincidente, cifrado,
      ACL privada, rechazo de contraseña/CUIT/alias/destino y no sobrescritura.
      Dos tests nativos PASS; suite conjunta final 1870 PASS / 1 skipped /
      198 archivos y build 611 módulos PASS. Sin dependencias nuevas ni secretos
      en el repo. El error real de alias se incorporó a la validación local.
- [x] El usuario ingresó a ARCA y autorizó adherir WSASS el 18/10. Se abrió
      TESTING/HOMOLOGACIÓN y se verificó inicialmente que no había certificados.
- [x] CSR real y clave cifrada preparados fuera de Git; contraseña aleatoria
      protegida con DPAPI para el usuario Windows, sin imprimir ni enviar claves.
- [ ] Certificado: bloqueado por WSASS. El usuario autorizó su creación. Tras
      corregir el alias a sólo letras/números, dos solicitudes del mismo CSR y
      alias devolvieron EJBTransactionRolledbackException / Could not send Message.
      Se consultaron certificados y aliases antes de reintentar; la consulta
      final confirmó que no hay certificado ni alias de la solicitud. Sin retries
      adicionales, sin autorización WSFE creada y sin emitir comprobantes.
- [ ] Autorización WSFE posterior al certificado, con confirmación del titular.
- [ ] Backend seguro e idempotencia fiscal.
- [ ] Ensayo de homologación con CAE realmente autorizado.

## Resultado
La preparación local funciona y WSASS está adherido, pero ARCA no está activada
ni acreditada todavía. La creación del certificado quedó bloqueada por el error
interno de mensajería de WSASS, no por un fallo de firma CSR demostrado.
Los archivos privados y metadatos de conciliación se conservan fuera del repo;
no registrar aquí CUIT, DN completo, CSR, PEM ni rutas privadas del titular.

## Pausa solicitada — 18/10/2026
El usuario hará personalmente la certificación y pidió continuar con el resto
del piloto dejando ARCA de lado. Se suspenden las acciones de certificado,
autorización y activación fiscal hasta que solicite retomarlas. El CSR y la clave
cifrada existentes se conservan; no se generan reemplazos ni se reintenta WSASS.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR01, PR02, PR03, PR04, PR06, PR09 y PR10**.

Reanudado por el titular el 20/10. Certificado original/par, autorización WSASS y WSAA homologación reales PASS. Token/Sign sólo en memoria; la consulta WSFE sigue pendiente. La pausa y el error WSASS del 18/10 se conservan como historia, no como bloqueo actual. Siguiente: FEParamGetPtosVenta real sin emitir. CAE y transición productiva permanecen pendientes y sujetos a sus autorizaciones.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.


### Adenda: consulta real y aclaración del punto de venta (20/10/2026)

Con autorización específica del titular se ejecutó una autenticación WSAA y una
única consulta FEParamGetPtosVenta, exclusivamente en homologación. Par de claves,
TRA y CMS PASS; WSAA PASS real. WSFE respondió `WSFE_BUSINESS:602` (sin datos).
No se emitió ningún comprobante, no se obtuvo CAE y no se persistieron Token/Sign.
No se reintentó la consulta después de ese resultado.

El titular confirmó que el punto 2 sólo se ingresó en KioskoPOS. Esa configuración
no acredita su registro en ARCA. El código 602 no demuestra por sí solo un fallo
del certificado ni permite afirmar que haga falta crear un punto en Producción.
PR01 sigue PARCIAL: comprobar las reglas específicas de homologación y preparar
el siguiente diagnóstico no transaccional antes de solicitar su autorización.

Validación del diagnóstico ampliado: 4 pruebas PASS en 2 archivos, con 24
comprobaciones sintéticas de protocolo/criptografía. La suite completa de 2177
PASS / 1 skipped y el build de 634 módulos preceden a esta ampliación WSFE.
Referencia oficial del método y alcance de su consulta:
https://www.afip.gov.ar/fe/documentos/manualDesarrolladorCOMPGv21.pdf


### Preparación del siguiente diagnóstico PR01 (20/10/2026)

Se agregó la opción explícita `-ConsultaWsfe FEParamGetTiposCbte` al diagnóstico
local. El valor predeterminado sigue siendo FEParamGetPtosVenta; una ejecución
consulta sólo el método seleccionado, sin reintentos automáticos. Ambos métodos
están en una lista cerrada; no admite operaciones de emisión ni URL configurable.
La consulta de tipos no depende de informar un punto de venta. Su resultado no
acredita que el punto 2 esté disponible ni habilita una emisión con CAE.

Validación local posterior: 4 pruebas PASS en 2 archivos, incluidas 32
comprobaciones sintéticas (solicitud y acción SOAP, lista válida, lista vacía,
duplicados, identificador inválido, método incorrecto, error de negocio y
operación no permitida). PR01 sigue PARCIAL. La ejecución real adicional está
pendiente de autorización específica; no se reutiliza el permiso de la consulta
anterior ni se crean puntos de venta en Producción.

Contrato oficial consultado el 20/10/2026:
https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetTiposCbte


### Cierre de diagnóstico PR01 y siguiente dependencia (20/10/2026)

Tras autorización específica del titular se ejecutó con el diagnóstico
`cc199d5` una única autenticación WSAA y una única consulta FEParamGetTiposCbte,
ambas en homologación, con certificado original y CUIT representado autorizado.
Resultados sanitizados: CERT_KEY_MATCH, TRA_GENERATION, CMS_SIGNATURE y
WSAA_HOMOLOGACION PASS; WSFE_HOMOLOGACION PASS; TIPOS_COMPROBANTE=36;
COMPROBANTES_EMITIDOS=0. Token/Sign sólo en memoria; proceso finalizado sin
persistencia de credenciales. No se modificaron configuración ni datos fiscales
del comercio, master o Production.

PR01 queda PASS para autenticación y consulta de parámetros; se conservan arriba
el 602 de la consulta de puntos y los estados históricos previos. Este cierre
no acredita disponibilidad del punto 2, habilitación productiva, CAE ni robustez
fiscal. PR02 sigue pendiente y exige primero su dependencia PR03.

#### Bloque siguiente: PR03 previo al CAE

- Usar módulo incremental separado del legacy. Autenticar al actor, comprobar
  rol/comercio activo y venta confirmada propia antes de acceder a material fiscal.
  Ninguna clave o TA en configuración pública, browser o respuesta al cliente.
- Registrar operación fiscal durable por venta/entorno y hash de la solicitud
  canónica. Un reintento idéntico devuelve el resultado; un cuerpo distinto para
  la misma operación se rechaza. No generar otra identidad ante timeout.
- Serializar por emisor/entorno/punto/tipo. Reservar numeración en DB y persistir
  intención antes de contactar a WSFE. Nunca mantener una transacción abierta
  durante una llamada externa ni usar sólo un lock del proceso Edge.
- Ante incertidumbre o crash, conservar estado pendiente y consultar el número
  reservado mediante FECompConsultar; comparar identidad/importes y confirmar
  CAE únicamente con respuesta real coherente. Un resultado inconcluso no libera
  la secuencia ni habilita un nuevo envío automático.
- Separar estado comercial y fiscal: ninguna recuperación vuelve a cobrar,
  descuenta stock otra vez o fabrica CAE. Probar rechazo definitivo, timeout,
  ACK perdido, dos trabajadores y colisión de numeración.
- Preparar esquema/RPC y pruebas locales usando los patrones transaccionales del
  repositorio; instalación y ensayos hospedados requieren su gate correspondiente.
  No emitir hasta disponer de backend seguro, disponibilidad del punto de ensayo
  comprobada y autorización específica de emisión.

Validación del código usado: 4 pruebas dirigidas PASS / 2 archivos, con 32
comprobaciones sintéticas; diff PASS. La suite global/build anteriores no se
reclasifican como ejecución posterior a este agregado. No hay nueva dependencia.
