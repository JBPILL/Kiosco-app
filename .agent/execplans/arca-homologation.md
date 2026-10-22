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


## Objetivo de continuidad detallado — 20/10/2026

Por pedido del titular se registró un objetivo activo para completar el piloto.
Este ExecPlan desarrolla el bloque fiscal; la matriz PR01–PR11 del plan operativo
sigue siendo la fuente de estados y el plan-completar-piloto conserva el resto
del alcance. No crear otro plan fiscal equivalente. PR01 está PASS; el siguiente
resultado buscado es PR02, cumpliendo primero PR03 y sus controles de seguridad.

### Resultado verificable del bloque

Una venta completada y propia puede solicitar fiscalización de homologación a
través de un backend autorizado. La misma solicitud conserva identidad, cuerpo
y número reservado; un reintento no produce otro comprobante. Una respuesta
incierta queda pendiente de conciliación. Sólo una autorización real y coherente
permite mostrar CAE. Cobro, stock y caja no se ejecutan de nuevo por fiscalizar.
La emisión continuará bloqueada hasta completar los requisitos y autorizaciones.

### Pasos, entregables y salida de cada etapa

| Etapa | Trabajo y entregable concreto | Comprobación para avanzar |
|---|---|---|
| F01 — Inventario | Trazar ventas, checkout confirmado, roles, guard estricto, configuración, importes y Edge legacy. Precisar contrato inicial de factura admitida y restricciones. | Rutas y tablas identificadas; ninguna ruta usa CAE simulado ni claves del browser como solución nueva. |
| F02 — Contrato durable | Especificar estados fiscales, solicitud canónica/versionada, vínculo venta/tenant/emisor/entorno, hash e identidad estable; errores y respuesta pública sin secretos. | Matriz de transiciones válida e inválida y pruebas de cambio de cuerpo, venta ajena/anulada y repetición. |
| F03 — Persistencia y numeración | Preparar SQL aditivo fuera del manifiesto histórico: unicidad por venta/entorno, serie por emisor/entorno/punto/tipo, reserva durable y coordinación de trabajadores. | Dos solicitudes idénticas producen una operación; dos distintas no reciben el mismo número; crash no libera una emisión incierta. Pruebas locales no sustituyen concurrencia PostgreSQL real. |
| F04 — Custodia y permisos | Backend incremental: validar JWT, actor y comercio; separar función del operador y trabajador privado; custodia de certificado/clave y caché TA exclusivamente privada. | Anónimo, tenant ajeno, roles no autorizados y DML directo rechazados; secretos ausentes de respuestas/logs/config pública. Probar renovación y exclusión de renovación de TA. |
| F05 — Adaptador fiscal | XML por parser seguro; tiempo Argentina, importes precisos y sumas coherentes; endpoints fijos por entorno; timeout acotado y errores sanitizados. Contrato y parámetros oficiales vigentes antes de emisión. | Fixtures de autorización, rechazo, SOAP Fault, XML malformado/duplicado, vencimiento y respuesta con identidad/importes distintos; nunca CAE inventado. |
| F06 — Recuperación | Registrar intención antes de red; reconciliar número reservado con FECompConsultar tras timeout/crash; confirmar sólo identidad e importes coincidentes; bloquear reenvío si inconcluso. | Fallos antes/después del envío y de persistir ACK; dos trabajadores; ninguna segunda cobranza, movimiento de stock ni numeración nueva por reintento. |
| F07 — Ensayo hospedado | Preparar respaldo/preflight, instalación acotada y rollback de configuración; pedir autorización nueva para SQL/Edge y pruebas en comercio aislado de Staging. | JWT/RLS/ACL reales, worker concurrente, conciliación DB y auditoría; conservar registros y suspender sólo fixtures creados para ensayo. |
| F08 — CAE de homologación | Acreditar punto de ensayo y contrato fiscal; preparar caso mínimo reproducible con titular/importes/tipo y pedir autorización específica antes de emitir. | CAE real, número/vencimiento/QR coherentes y recuperación por consulta; cero cambios productivos. Cerrar PR02 sólo con evidencia completa. |
| F09 — Contingencias y UI | Mostrar estados comerciales/fiscales separados, pendientes y recuperación; ensayar caída ARCA/Internet y reintentos; eliminar dependencia del legacy para el nuevo flujo. | Operador puede distinguir autorizado/rechazado/pendiente sin recobrar; E2E y dos terminales, regresiones checkout/envases/devoluciones. |

### Inventario inicial ejecutado

- `supabase/bootstrap/001_domain.sql`: ventas con `COMPLETADA`/`ANULADA`,
  total numeric(12,2), detalles, pagos y caja relacionados. El estado comercial
  no debe reutilizarse como estado de autorización fiscal.
- `supabase/bootstrap/steps/008_checkout_core.sql`: contrato transaccional de
  checkout existente; revisar su ACK y reservas antes de enlazar fiscalización.
- `src/stores/afipStore.ts` y `src/lib/kioskPilotScope.ts`: guard estricto de
  emisión existente; mantenerlo hasta disponer del backend y aceptación nuevos.
- `src/lib/afipImportes.ts`: cálculo legacy con defaults/coerciones; no asumir
  que sustituye validación fiscal estricta en servidor ni soporte multi alícuota.
- `supabase/functions/afip-wsfe/index.ts`: legacy ya diagnosticado; no desplegarlo
  como backend nuevo ni utilizar sus rutas de simulación/credenciales públicas.
- `supabase/pilot-backup/001_contacts_restore.sql`: ejemplo actual de validación
  de perfil/comercio y solicitud inmutable; reutilizar convenciones pertinentes,
  sin mezclar el resultado comercial de operaciones_escritura con el diario fiscal.

### Seguimiento y criterio de cierre

- [x] Objetivo activo creado por pedido del titular y vinculado a planes existentes.
- [x] Inventario inicial de superficies; pendientes el trazado completo y contrato fiscal admitido de F01.
- [ ] Completar F01 y F02 con revisión de permisos, estados y solicitud canónica.
- [ ] Implementar y probar F03–F06 localmente; revisar seguridad y datos.
- [ ] Completar F07 tras autorización específica de instalación y ensayo hospedado.
- [ ] Completar F08 tras autorización específica de emisión homologada.
- [ ] Completar F09 y actualizar evidencias de PR04/PR06/PR08/PR09.

Registrar cada avance con versión, entorno, casos ejecutados, resultado y límites.
Ejecutar pruebas dirigidas y build cuando cambie la aplicación; usar suite global
al cerrar un bloque integrado o ante regresiones. Revisar diff y secretos antes
de publicar commits en la rama autorizada del PR #3. No presentar PASS local
como aceptación de RLS, concurrencia, operación fiscal ni piloto comercial.

Después de este bloque, continuar los pendientes canónicos de integridad,
seguridad, backup/restore, recuperación y concurrencia. La restauración integral
seguirá bloqueada hasta instalación y aceptación de los SQL nuevos. Preparar la
transición productiva y el piloto comercial con responsables, conciliación,
soporte y rollback; su ejecución requiere aprobación específica. Impresora/cajón
físicos y Point permanecen diferidos hasta contar con cliente. Master y
Production no se modifican por este objetivo. Conservar datos e historia.


### PR03: primer registro durable implementado localmente — 20/10/2026

Se preparó `supabase/pilot-fiscal/001_fiscal_journal.sql`, aditivo al bootstrap.
Tabla privada `fiscal_operaciones_homologacion` y RPC
`preparar_operacion_fiscal_homologacion`: sólo Dueño ordinario activo del mismo
comercio activo, venta propia COMPLETADA con total positivo. Sin conexión de red,
numeración, CAE, certificados, worker ni activación de frontend. NO instalado.

Contrato inicial versionado: UUID de operación/comercio/venta y contexto cerrado
(version, CUIT emisor propuesto, punto propuesto, tipo 1/6/11 y documento receptor).
No admite importe, entorno, fecha o credenciales suministrados por el cliente.
Deriva total/fecha/detalles desde DB y conserva snapshot estable en UTC. El
contexto es una propuesta, NO configuración fiscal verificada ni cuerpo WSFE
listo para emitir; falta condición IVA, desglose y validación fiscal completa.

Unicidad por comercio/venta/homologación; reintento idéntico con otro UUID devuelve
la operación original, sin fabricar otra identidad. Reutilización de UUID para
otra venta o cambio de contexto/snapshot falla. Bloquea perfil/comercio/venta en
orden consistente con los patrones existentes, sin llamada externa dentro de la
transacción. No acredita concurrencia multiproceso real: ésta sigue en F03/F07.

La tabla no concede SELECT/DML a anon/authenticated/service_role; revoca también
permisos por columna al reaplicar y rechaza privilegios heredados. Sólo la RPC
concede EXECUTE a authenticated y responde identidad/estado y
`emision_habilitada=false`. No expone snapshot ni documentos al llamador. La
anulación fiscal y su coordinación futura requieren contrato separado: preparar
una operación no bloquea actualmente una anulación comercial, y el worker futuro
debe revalidar y coordinar ambas antes de emitir. No habilitar el worker sin ello.

Pruebas locales nuevas: 31 casos con bootstrap completo y reaplicación del SQL;
incluyen DML/lectura, rol/tenant/estado, identidad/cuerpo, cambio de detalles,
fecha estable entre zonas horarias y trigger que omite inserción sin falso ACK.
Con diagnóstico WSAA: 33 PASS / 2 archivos. Suite global posterior: 2208 PASS / 1 skipped / 225 archivos (210,60 s).
Build PASS, 634 módulos; manifiesto histórico 43 SQL PASS; diff PASS. Escaneo
del árbol: 46 candidatos conocidos, sin candidatos nuevos. No hay dependencias
nuevas. Estas comprobaciones locales no acreditan instalación ni JWT hospedados.

Pendientes del bloque: completar F01/F02 (contrato fiscal final), hash/estados y
reserva de numeración F03; custodia/caché privada F04; adaptador/reconciliación
F05/F06; ensayos PostgreSQL/JWT/RLS hospedados y autorización de instalación.
PR03 sigue PARCIAL, sin afirmar que este registro ya sea una pasarela fiscal.


### PR03/F03 — reservas y registro previo de intención (20/10/2026)

Módulo aditivo `supabase/pilot-fiscal/002_fiscal_reservations.sql`, NO instalado:
serie global por CUIT/punto/tipo (entorno fijo homologación), reserva única
pendiente y registro privado de intento. RPC sólo service_role con comprobación
adicional de auth.role(); helpers, tablas, columnas y triggers sin EXECUTE/DML
para roles de API. No se incorporó worker ni se habilitó emisión/red.

El trabajador futuro debe aportar una observación real validada de
FECompUltimoAutorizado para el mismo emisor/punto/tipo. La RPC sólo admite un
valor en rango y ventana local de frescura (2 minutos, tolerancia futura de 30 s);
esto es una política interna, no una regla tributaria. Inicializa el próximo
número observado + 1; observación divergente o reserva de otra operación bloquea
la serie para conciliación. No confundir una reserva sintética local con un
número autorizado por ARCA. Rango 1–99999999 contrastado con manual oficial:
https://www.afip.gov.ar/fe/documentos/manualDesarrolladorCOMPGv21.pdf

Antes de reservar/registrar intento se revalidan actor original, comercio,
venta y snapshot; se toman locks de DB sin mantener llamada de red dentro de la
transacción. El primer intento cambia a ENVIO_INCIERTO antes de cualquier envío
futuro; repetir su UUID devuelve nuevo_intento=false y exige conciliación.
Otro UUID no sustituye al intento anterior. No hay vencimiento automático,
liberación de serie ni toma de control que habilite duplicar una emisión incierta.
Toda respuesta sigue incluyendo emision_habilitada=false: falta contrato fiscal
final y autorización/custodia/adaptador. El diario inicial es un ancla inmutable
PREPARADA; el estado de reserva vive en su tabla privada. Faltan consulta de
estado pública e integración UI antes de habilitar el flujo.

Los triggers serializan modificaciones de detalle con la venta y bloquean
importe/fecha/estado e inserción/modificación/eliminación de detalles después de
reservar. La anulación atómica se rechaza y revierte sus efectos si hay reserva;
si anulación ganó primero, la reserva debe fallar. Los actores existentes fuera
de una venta reservada mantienen su comportamiento.

Pruebas SQL locales ampliadas a 57 casos PASS. Incluyen series entre comercios,
ACK perdido, intento único, permisos, rollback de anulación, triggers que omiten
escrituras sin falsa confirmación y decimales JSON equivalentes. El test WSAA
agotó tiempo en paralelo durante inicio de Docker y pasó aislado (2 PASS).
La suite global posterior a este módulo está pendiente de ejecución/cierre.

Se preparó runner reproducible `scripts/fiscal/test-concurrency.mjs --run-local`:
usa sólo imagen postgres:17-alpine ya instalada, puerto 127.0.0.1, fixtures
sintéticas y transacciones distintas observadas por pg_stat_activity. No lee .env
ni usa credenciales Supabase/ARCA. Conserva contenedor de ensayo detenido y
registra evidencia JSON fuera de Git; no modifica contenedores existentes.
El primer preflight no esperó suficiente inicialización; se corrigió la espera.
La siguiente ejecución perdió el motor Docker/ECONNRESET antes de completar
las carreras: NO PASS. Se reforzó manejo de eventos de conexión y evidencia de
limpieza no confirmada si Docker desaparece. Comprobar estado antes de repetir;
no reiniciar un proceso de ensayo que siga vivo ni dar por detenido su contenedor.

Pendientes: resolución/conciliación y desbloqueo seguro de series, cuerpo WSFE
completo y hash, binding de emisor/credenciales, worker, caché TA y permisos,
PostgreSQL concurrente real y aceptación JWT/RLS hospedada. PR03 sigue PARCIAL.


#### Resultado PostgreSQL real local — 20/10/2026

Tras comprobar que Docker completó su actualización (motor 29.9.1) y que los
intentos anteriores estaban detenidos, se ejecutó el runner corregido: PASS en
PostgreSQL 17.11, imagen local postgres:17-alpine, seis casos con dos conexiones
y espera de Lock comprobada mediante pg_stat_activity (no sólo temporizadores):

1. Dos UUID de preparación simultáneos para la misma venta: una operación.
2. Dos comercios, mismo emisor/punto/tipo: una reserva; la otra bloqueada.
3. Dos trabajadores: un intento; ACK perdido exige conciliación, no segundo envío.
4. Reserva gana a anulación: venta COMPLETADA y auditoría de anulación revertida.
5. Anulación gana a reserva: venta ANULADA y ninguna numeración reservada.
6. Rollback antes de ACK: siguiente reserva conserva número y no deja hueco.

Evidencia sanitizada conservada fuera de Git en
`../fiscal-concurrency-local-result.json` (UTC 21/10, noche local del 20/10).
Contenedor propio detenido al finalizar; datos sintéticos conservados; ningún
contenedor previo modificado. No hubo conexión a Supabase/ARCA ni emisión.
Runner valida ownership/puerto localhost, no descarga imágenes, no lee .env,
registra fallos de conexión y no permite sobrescribir una evidencia previa.
El guard de sobrescritura se comprobó por separado (PASS, sin crear contenedor).

Esto acredita carreras concretas PostgreSQL locales; no acredita JWT hospedado,
RLS multi comercio de Staging, custodia del emisor ni respuestas reales de emisión.
Resolución de incertidumbre y liberación de la serie siguen pendientes; no activar
ni instalar todavía una pasarela de emisión con estos módulos preparatorios.


#### Verificación final del bloque de reservas — 20/10/2026

- Suite integrada: 2234 PASS / 1 skipped / 225 archivos, 269,67 s.
- Seis carreras PostgreSQL 17.11 reales locales PASS; ningún acceso hospedado.
- El build inicial detectó inferencia UUID demasiado estricta en dos helpers de
  pruebas. Se corrigieron sólo anotaciones; luego 57 casos SQL PASS y build PASS
  (634 módulos). La suite integrada antecede a esa corrección de tipos sin cambio
  de lógica; no se presenta como reejecutada después de ella.
- Manifiesto histórico: 43 SQL PASS; diff PASS; escaneo del árbol conserva 46
  candidatos conocidos, sin nuevos candidatos; historial no reescaneado.
- Runner: sintaxis y rechazo de sobrescritura de evidencia PASS. Datos y evidencia
  locales conservados; contenedor creado por el ensayo detenido correctamente.
- Ninguna dependencia nueva, cambio de .env.local, instalación SQL/Edge, emisión,
  modificación de master o Production. No hace falta redeploy de frontend: sólo
  se agregó preparación backend local, pruebas, runner y documentación.

Continuar con F02/F05/F06: contrato fiscal completo, hash/estados finales,
conciliación de la reserva con FECompConsultar y liberación controlada; después
custodia/worker y gate de instalación/ensayo hospedado. Mantener emisión bloqueada
mientras falte cualquiera de esos requisitos. PR03 continúa PARCIAL.


## Reconciliación F02/F05/F06 — avance local 21/10/2026

Se implementaron helpers de servidor, sin conectarlos todavía a UI, SQL ni worker:
`fiscalReconciliation.ts` congela el contrato v1 y calcula SHA-256; compara todos
sus datos con un DTO validado de FECompConsultar. `fiscalVoucherXml.ts` construye
la consulta homologada, valida SOAP/XML y ejecuta una sola consulta mediante
transporte obligatorio inyectado. No genera CAE, emite, reenvía ni altera venta,
stock o caja. Toda salida conserva puedeReenviar=false.

Contrato v1: emisor/entorno/punto/tipo/número, concepto, documento, condición IVA,
fecha/servicio/vencimiento, moneda PES/cotización 1, seis importes, alícuotas y
tributos. Tipos 1/6/11. Importes como cadenas decimales exactas, sin double ni
redondeo implícito; sumas en enteros BigInt. Arrays normalizados con orden estable
independiente del idioma del sistema; copia profunda congelada y verificación del
hash antes de consultar/comparar. No acepta campos desconocidos ni omite datos
fiscales fuera del contrato. No es validación tributaria integral: falta catálogo
vigente de parámetros/regímenes y derivación/binding con venta/configuración
privada. No habilitar un tipo/moneda/campo adicional descartándolo silenciosamente.

La coincidencia se llama AUTORIZACION_COINCIDENTE y es sólo candidata a persistir,
no estado final de DB. Exige CAE/resultado A, identidad, cuerpo completo, sumas,
fecha y vencimiento coherentes; una autorización histórica no se rechaza sólo
porque hoy pasó su vencimiento. Ausencia de resultado, errores incluso junto a
un resultado aparente, rechazo, CAEA o diferencia mantienen CONCILIAR. Mensajes,
XML y excepciones remotos nunca se devuelven ni se imprimen.

Adaptador: namespace SOAP 1.1/WSFE y jerarquía directa; rechaza elementos
ambiguos/duplicados, DTD/entidades, nil contradictorio, campos no soportados,
UTF8 inválido y tamaño/profundidad excesivos. Parser @xmldom/xmldom 0.9.12 fijado,
con onError que interrumpe cualquier warning/error sin logs. Dependencia de
pruebas Node e import map propio del futuro runtime arca-homologacion; no se
importa en frontend ni se creó un endpoint fiscal desplegable. Consulta fija al
endpoint de homologación, XML escapado, TA vigente con margen, sin redirecciones.
El límite incluye fetch y lectura del cuerpo; flujo sin fin o exceso de tamaño
queda pendiente y se cancela. No reintentar automáticamente tras error/timeout.

Contrato contrastado con WSDL público real guardado fuera de Git y documentación
oficial: FEDetRequest -> FECAEDetRequest -> FECompConsResponse; esto evita comparar
sólo los campos adicionales mostrados en el ejemplo superficial del método.
Fuentes: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL y
https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECompConsultar . No se ejecutaron
consultas autenticadas nuevas ni se utilizaron Token/Sign reales en este bloque.

Validación posterior del árbol:
- 90 casos dirigidos PASS en dos archivos: tipo A/B/C, receptor, IVA/tributos,
  identidad, hash, fechas, error/ausencia/CAEA, copia inmutable, XML adversario,
  cuerpo detenido, fetch detenido, límites, no logs y una única consulta mock.
- Suite integrada: 2324 PASS / 1 skipped / 227 archivos, 245,56 s.
- Build PASS (634 módulos), Vite parcheado; manifiesto histórico 43 SQL PASS.
- Empaquetado y ejecución real en Edge Runtime local v1.77.4: dos casos sintéticos
  PASS (coincidencia y rechazo de XML duplicado), sin red fiscal ni SQL. Sólo se
  montaron copias de helpers/fixtures, no .env; contenedor propio detenido.
  Evidencia fuera de Git en fiscal-edge-runtime-result.json y carpeta de probe.
- Primera invocación de bundle con import-map flag devolvió advertencia y ningún
  artefacto; no se dio por PASS. Se usó deno.json, se comprobó eszip y después HTTP
  local confirmó ejecución. Un error de fixture de prefijos y el ajuste de tipos
  nullable del DOM se corrigieron antes de la suite integrada final.

### Siguiente paso concreto de persistencia (todavía pendiente)

1. SQL privado aditivo para ligar la solicitud final/hash a operación, snapshot,
   contexto y número. Persistir cuerpo+reserva de forma atómica antes de registrar
   intención/enviar; si el número candidato cambió, abortar, no modificar cuerpo.
2. CAS de reconciliación ligado a intento/solicitud/serie: persistir sólo un CAE
   coincidente, conservar evidencia mínima y no repetir efectos comerciales.
   Una respuesta ausente/inconclusa no libera automáticamente la numeración.
3. Conservar reservas/historia al cerrar una autorización; permitir la siguiente
   reserva sólo después de resolver de manera duradera la pendiente anterior.
   Probar dos conciliadores, ACK perdido y numeración contra resolución.
4. Integrar worker con custodia/caché y validación real de actor/tenant/emisor;
   prueba hospedada e instalación con sus autorizaciones; luego punto de ensayo
   y emisión homologada expresamente autorizada. UI de estados después de contar
   con esos contratos. PR03/PR02 continúan abiertos.


Escaneo final del 21/10: 1174 archivos / 1160 de texto / 14 binarios omitidos;
46 candidatos iguales al escaneo anterior (cero agregados o retirados), sin
valores sensibles impresos; historial no reescaneado. Auditoría npm final:
0 info/low/moderate/high/critical. Contenedor Edge confirmado exited después del
ensayo. Ningún .env modificado, ningún SQL/Edge instalado, ningún comprobante
emitido. Cambios listos para commits temáticos en la rama autorizada.

### Persistencia del cuerpo fiscal — 21/10/2026 (avance local)

- Nuevo módulo aditivo 003_fiscal_requests.sql: cuerpo/hash, reserva y vínculo
  atómicos; SHA-256 nativo verificado contra el contrato TypeScript. El número
  candidato discrepante revierte la transacción completa. Misma operación no
  admite otro cuerpo. No se tocan cobro, venta, stock ni caja.
- Intención exige cuerpo durable ligado a la reserva; repetir la identidad
  retorna necesidad de conciliación, sin segundo envío. Se corrigió un CHECK
  para rechazar NULL explícitamente y se validan tipos textuales del contrato.
- Funciones privadas sin lectura/DML directo para roles API; dos barreras para
  ejecución: privilegio SQL de servicio y claim de servicio. No implica que
  la futura entrada Edge tenga autenticación/tenant/custodia ya resueltos.
- Pruebas fiscales enfocadas: 168 PASS / 4 archivos; build PASS, 634 módulos.
  Cubren rollback ante escritura omitida, sustitución del cuerpo/hash, errores
  de número/fecha/importes/contexto, falta de cuerpo, replay con ACK perdido y
  continuidad tras commit. PGlite es monoconexión: no acredita reconexión real.
- Runner PostgreSQL actualizado para ejecutar carreras con cuerpo durable.
  Primer intento no arrancó: Docker engine detenido, cero casos ejecutados.
  Se solicitó iniciar Docker; resultado posterior debe registrarse antes de
  afirmar PASS. Suite integrada en ejecución, aún sin resultado nuevo.
- Sigue pendiente el paso 2 (CAS y persistencia final de reconciliación), estados
  finales/historia, custodia y worker, instalación/aceptación hospedada y emisión
  homologada con sus gates. SQL 003 no instalado en Staging ni Production.

Cierre de verificación de este incremento (21/10): suite integrada 2345 PASS /
1 skipped / 228 archivos, 220,10 s; build PASS. Ensayo PostgreSQL 17.11 real
PASS en las seis carreras con SQL 001–003 y cuerpos durables, incluyendo ACK
perdido y conflicto con anulación. Evidencia fuera de Git:
fiscal-persistence-concurrency-20261021-retry.json. Contenedor propio detenido,
datos conservados; cero operaciones externas y cero emisiones. El primer
intento fallido por Docker detenido se conserva como evidencia separada.
Escaneo 1176 archivos, 1162 texto, 14 binarios omitidos, 46 candidatos: cero
cambios de candidatos respecto del escaneo previo, historial no reescaneado.
No se modificó .env ni se instaló SQL/Edge remoto. El siguiente incremento sigue
siendo CAS de reconciliación y estados finales, antes de conectar el worker.

### Cierre atómico y recuperación de conciliación — 21/10/2026

- SQL 004 preparado: autorización coincidente, estado AUTORIZADA, revisión 2 y
  avance único de serie se confirman en la misma transacción. Se conserva cada
  reserva histórica y se permite otra pendiente después del cierre durable.
  Resultado inconcluso persiste PENDIENTE_CONCILIACION sin liberar numeración.
- ID de observación inmutable: replay devuelve su ACK histórico; ID reutilizado
  con contenido distinto se rechaza. Un nuevo ID puede consultar de nuevo una
  pendiente, pero no habilita reenvío de FECAESolicitar. CAE contradictorio se
  rechaza y observación tardía negativa no degrada una autorización confirmada.
- Getters y RPC sólo de servicio, sin lectura/DML directo de tablas. Orquestador
  privado integra recuperación, FECompConsultar limitado, comparación completa
  y CAS. No es un endpoint; no autentica actor/tenant ni administra certificados.
  Una coincidencia en SQL proviene del trabajador confiable: SQL no demuestra
  por sí solo autenticidad de una respuesta de ARCA.
- Prueba integrada SOAP mock→comparación→SQL cubre ACK perdido después de guardar:
  replay y operación ya autorizada no hacen otra consulta. Falla de transporte
  queda pendiente; no existen efectos comerciales ni envío de comprobantes.
- 196 pruebas fiscales enfocadas PASS (49 en persistencia/recuperación). Build
  PASS, 634 módulos. Nueve carreras PostgreSQL 17.11 PASS con SQL 001–004 finales:
  dos conciliadores, CAE contradictorio, cierre contra próxima reserva, además
  de las seis carreras anteriores. Evidencia local fuera de Git:
  fiscal-reconciliation-cas-final-20261021.json; contenedor propio detenido.
- Pruebas incluyen escrituras omitidas o alteradas por triggers: no se acepta
  una confirmación que no corresponde al dato efectivamente persistido.
- Manifiesto histórico 43 SQL PASS; escaneo 1178 archivos/1164 texto/14 binarios,
  mismos 46 candidatos (delta 0). Suite integrada nueva en ejecución.
- Sigue abierto PR03: falta custodia privada/caché de TA y worker con autorización
  real de actor/comercio/emisor; emisión de homologación no implementada ni
  autorizada por este bloque. No se instalaron SQL 001–004 ni Edge remotos.
  PR02 requiere además acreditar punto de ensayo y autorizar emisión.

Verificación final de cierre (21/10): suite integrada 2373 PASS / 1 skipped /
228 archivos, 195,50 s. Build PASS; manifiesto histórico 43 SQL PASS. Edge Runtime
local v1.77.4 empaquetó y ejecutó dos aserciones sintéticas PASS: autorización y
replay con una sola consulta mock, cero SQL y cero llamadas fiscales. Evidencia
fuera de Git en fiscal-cas-edge-result.json; contenedor propio confirmado exited.
No se usaron certificados ni Token/Sign reales. Este bloque no cierra F04/F07:
continúa custodia/caché de TA y autorización del trabajador antes de Staging.

### F04 — autorización privada y caché TA local — 21/10/2026

- Inventario: checkout actual verifica Auth con getUser; la propuesta de CUIT/PV
  del navegador no acredita autoridad sobre certificado/emisor. Nuevo SQL 005
  prepara metadatos privados de emisor por comercio, sin claves/certificados/TA,
  sin filas ni habilitación automática y sin API de configuración pública.
- RPC privada verifica un único Dueño ordinario activo, actor original de la
  operación, mismo comercio activo, snapshot y coincidencia con emisor privado.
  El gate no acredita disponibilidad del punto ante ARCA ni autoriza emisión.
- Fachada usa getUser de Auth antes de resolver actor en DB; no decodifica claims
  del token ni acepta actor/CUIT/PV del request como autoridad. Su cliente real
  debe configurarse en servidor; las pruebas usan Auth simulado, no JWT hospedado.
- Composición conecta gate → recuperación → caché privada perezosa → consulta
  limitada/comparación → cierre SQL. Recuperar ACK no solicita TA ni consulta WSFE.
- Caché sólo en memoria por comercio/credencial/huella/revisión/emisor/servicio,
  con renovación anticipada y exclusión por proceso. Caducado no se usa como
  fallback; fallos/metadata ajena se rechazan. Timeout aborta fuente y no permite
  otra renovación solapada si la fuente no terminó. Capacidad acotada.
- Token/Sign no enumerables y objeto inmutable: stringify/spread habituales no
  los muestran. Esto no sustituye custodia ni habilita devolverlos al browser;
  nunca se registran errores originales de Auth/custodia ni esos valores.
- 192 pruebas enfocadas PASS; diez casos PostgreSQL 17.11 con SQL 001–005 PASS,
  contenedor propio detenido, cero operaciones externas. Evidencia local fuera
  de Git: fiscal-worker-gate-20261021.json. Suite integrada aún en ejecución.
- Compilación detectó readonly en fixture que muta credenciales; corrección de
  tipos pendiente al terminar suite activa. No presentar build previo como PASS.
- F04 sigue PARCIAL: faltan fuente real de custodia/CMS/WSAA, coordinación de TA
  entre procesos y endpoint con límites/cors/configuración privada. No se copiaron
  claves ni certificados a frontend ni se usaron los reales en este incremento.
  SQL 001–005 y nuevo worker NO instalados remotamente. F07/F08 siguen gated.

Cierre local F04 de este incremento: suite integrada 2426 PASS / 1 skipped /
230 archivos, 198,24 s. Después se corrigió únicamente el fixture mutable del
caso de TA inválido (copia de un envelope readonly); las 102 pruebas afectadas
se repitieron PASS y la compilación final PASS (634 módulos). No se repitió la
suite completa después de ese cambio de fixture; la lógica de servidor ya era
la de la suite integrada. Edge Runtime local v1.77.4 PASS en composición/replay:
una carga simulada de TA y una consulta simulada; cero SQL ni red fiscal.
Evidencia fuera de Git: fiscal-worker-edge-result.json; contenedor confirmado
exited. Diez casos PostgreSQL reales PASS, manifiesto 43 SQL PASS. Escaneo:
1184 archivos/1170 texto/14 binarios, mismos 46 candidatos (sin nuevos); no se
reescaneó historial. La revisión de permisos/caché es local: no acredita Auth
JWT/RLS hospedados ni proveedor real de certificado/TA. Próximo paso F04:
custodia/CMS/WSAA y renovación coordinada entre procesos, antes del endpoint.

### F04 — coordinación TA compartida y sobre cifrado — 21/10/2026

La especificación oficial WSAA exige usar el TA mientras siga vigente (12 horas
según esa versión). Se corrigió la renovación anticipada local: en el margen
final de 60 segundos no se envía a WSFE ni se pide otro TA; se espera vencimiento.
No se aplicó este cambio contra ARCA, sólo fixtures. Fuente primaria:
https://www.afip.gov.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf (p. 9–10).

- SQL 006 aditivo preparado: coordinación global por huella de certificado,
  entorno homologación y servicio wsfe, incluso entre comercios/aliases distintos.
  El gate privado de emisor se revalida en cada RPC. No concede SELECT/DML API.
- La intención durable precede red; un único trabajador obtiene nuevo_intento.
  Repetir/solicitar con otro ID ante estado incierto no concede nueva renovación.
  No hay liberación por timeout ni vencimiento automático del trabajador. Queda
  pendiente un procedimiento autorizado de recuperación del estado incierto,
  incluso si el fallo ocurrió antes de red o se perdió el ACK de adquisición.
- Para compartir TA se preparó un sobre AES-256-GCM mediante WebCrypto: nonce
  aleatorio de 96 bits, tag 128 bits y AAD de proyecto Staging/entorno/servicio/
  certificado/ID de clave/vencimiento. Clave CryptoKey no exportable suministrada
  sólo por un proveedor privado; no se crea ni almacena una clave real aquí.
  Referencia del algoritmo: https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#aes-gcm .
- Sólo el sobre cifrado puede llegar al SQL nuevo. Token/Sign planos continúan
  únicamente en memoria del proceso. Esto amplía la propuesta de caché compartida:
  antes de activarla se requiere autorización de instalación y provisión/custodia
  de la clave privada de cifrado; no se habilita por este commit.
- Composición de loader recupera/descifra el sobre o renueva una sola vez; clave
  de cifrado se valida antes de llamar al proveedor WSAA. Un TA válido que llega
  después del abort se conserva cifrado para no perderlo. ACK perdido al confirmar
  se recupera sin otra renovación. No hay ruta para hacer CMS ni WSAA reales aún.
- Claves antiguas de cifrado deben conservarse durante la vigencia de sobres que
  las usan. No colocar claves de descifrado en la misma DB/backup. Tras restore,
  mantener worker detenido hasta revalidar coordinación/TA y numeración; no
  restaurar una caché como prueba de autorización fiscal. Gate DR sigue abierto.
- Pruebas enfocadas 105 PASS; build PASS previo al último guard de abort (misma
  API). Doce carreras/casos PostgreSQL 17.11 PASS; dos comercios comparten una
  sola intención y el sobre confirmado. Fixture de carrera es opaco sintético;
  cifrado real y recuperación se prueban aparte con WebCrypto+PGlite. Evidencia:
  fiscal-shared-tickets-concurrency-20261021.json, fuera de Git. Contenedor propio
  detenido; cero consultas/emisiones externas.
- Suite integrada y ejecución Edge finales todavía pendientes/en curso. Fuente
  de certificado/CMS/WSAA, endpoint, instalación y aceptación hospedada siguen
  abiertos. SQL 001–006 no instalados remotamente; no credenciales reales usadas.

Verificación final compartida (21/10): suite integrada 2447 PASS / 1 skipped /
231 archivos, 211,77 s; build final PASS (634 módulos). Edge Runtime v1.77.4
local ejecutó tres aserciones con cifrado/descifrado reales y claves efímeras:
una carga WSAA simulada, una consulta fiscal simulada y recuperación en otra
caché sin renovación adicional. RPC/Auth fueron mocks, cero SQL/red fiscal.
Evidencia: fiscal-shared-edge-result.json; contenedor propio confirmado exited.
Doce casos PostgreSQL reales PASS, incluyendo exclusión entre comercios para un
mismo certificado y lectura del sobre tras commit. Escaneo 1188 archivos/1174
texto/14 binarios omitidos, mismos 46 candidatos, delta 0; historial no escaneado.
Manifiesto histórico de 43 SQL intacto. No se usaron certificados, claves o TA
reales, no se instalaron SQL/Edge ni se modificó .env. Siguiente trabajo F04:
proveedor real de custodia/CMS/WSAA y recuperación operativa de intención incierta;
activación de persistencia cifrada requiere autorización específica junto al
provisionamiento privado de claves. PR03, F04 y gates hospedados siguen abiertos.

### F04/F05 — proveedor WSAA y CMS preparados — 21/10/2026

- Nuevo proveedor privado prepara TRA de wsfe, firma CMS SignedData RSA/SHA-256
  con CryptoKey no exportable y verifica la firma contra el certificado incluido.
  Exige huella y referencia privadas, vigencia y emisor Test antes de red. No
  exporta la clave ni utiliza el certificado/clave originales en las pruebas.
- PKI.js 3.4.3 y asn1js 3.1.0 fijados; instalación sin scripts, audit npm 0 alertas.
  Deno importa esas versiones. Son dependencias de backend/pruebas, no importadas
  por el frontend; build conserva los mismos 634 módulos/artefactos de aplicación.
  Se usó motor WebCrypto explícito, sin sustituir el motor global de la librería.
- Comprobación independiente: .NET System.Security.Cryptography.Pkcs verificó
  el CMS sintético generado por el nuevo código y rechazó firma alterada. Clave
  privada nunca exportada. Evidencia fuera de Git: fiscal-wsaa-cms-dotnet-result.json.
- Transporte sólo a LoginCms de homologación, POST, redirect:error, SOAPAction
  vacío, máximo 40 s configurable hasta ese límite, 1 MiB y UTF-8 estricto. Timeout
  cubre fetch y lectura del cuerpo; sin reintento. fetcher obligatorio e inyectado.
- Parser SOAP/TA reutiliza límites XML seguros del lector fiscal; verifica raíz,
  namespace, campos directos únicos, uniqueId, DN destinatario ligado al certificado,
  DN WSAA de homologación documentado, generación/vencimiento y credenciales.
  Fault/error remoto no se refleja ni registra. Token/Sign sólo en memoria y
  no enumerables. DN soporta subconjunto ASCII simple; escapes/RDN multivaluados
  u otros atributos se rechazan. No relajar esto sin caso real y pruebas.
- Pin y emisor Test son gates locales, no una validación de cadena de confianza
  ARCA. TLS y aceptación remota siguen pendientes para esta implementación. No
  interpretar certificados sintéticos como autorización ni como CA de confianza.
- Prueba integrada con DB: Auth mock → gate privado SQL → custodia sintética →
  CMS real → WSAA mock ligado al uniqueId del CMS → TA cifrado → WSFE mock →
  conciliación durable. Replay y otra caché recuperan resultados/TA sin nueva
  custodia ni autenticación. 148 pruebas enfocadas PASS / cuatro archivos.
- Build PASS después de corregir el tipo ArrayBuffer del resultado CMS (no cambió
  lógica). Suite completa y build de release en ejecución. Escaneo 1194 archivos /
  1180 texto / 14 binarios omitidos, mismos 46 candidatos (delta 0); manifiesto
  histórico 43 SQL PASS. No historial reescaneado, ni .env modificado.
- Edge Runtime local v1.77.4: tres aserciones PASS con certificado efímero, CMS
  y cifrado reales, Auth/SQL/WSAA/WSFE mock; una carga, una autenticación simulada,
  una consulta simulada y recuperación sin repetir. Contenedor confirmado exited.
  Evidencia fuera de Git: fiscal-wsaa-edge-result.json. Ninguna red fiscal real.
- Próximo trabajo: implementar lector concreto de custodia privada (material
  cifrado y claves), recuperación operativa de intención TA incierta y endpoint
  autorizado. Luego gate de instalación/ensayo hospedado. No hay index.ts nuevo
  activado ni instalación SQL/Edge; nueva autenticación real requiere autorización.

Fuentes primarias consultadas para el contrato: documentación oficial WSAA y
su WSDL, y API SignedData/Certificate de PKI.js:
https://www.afip.gov.ar/ws/documentacion/wsaa.asp
https://www.afip.gov.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf
https://pkijs.org/docs/api/classes/SignedData/
https://pkijs.org/docs/api/classes/Certificate/
La descarga WSDL por web tool no admitió text/xml; se usó el contrato oficial
publicado y los namespaces del diagnóstico existente, sin llamada autenticada.

Verificación final del proveedor (21/10): suite integrada 2492 PASS / 1 skipped /
233 archivos, 208,75 s; compilación release PASS (634 módulos). Sin cambios de
lógica después de la suite. CMS firmado en WebCrypto/PKI.js verificado por .NET
PASS y firma alterada rechazada; Edge Runtime v1.77.4 PASS en tres aserciones
con CMS/cifrado reales y servicios mock. Contenedor confirmado exited. Audit
npm 0 alertas, seis paquetes nuevos CMS y cero versiones existentes cambiadas.
Escaneo: mismos 46 candidatos, sin nuevos. Manifiesto histórico 43 SQL PASS.
No se usaron certificados/secretos reales, no hubo red fiscal ni instalación.
Próximo paso concreto: lector de material privado cifrado y keyring (ambos sólo
servidor), distinguir fallo previo a red de intención WSAA incierta y preparar
su recuperación auditable; endpoint después. F04/PR03 continúan parciales.

### F04 — lector de custodia cifrada y keyring preparados — 21/10/2026

- Nuevo adaptador recibe un lector de secretos del servidor, sin filesystem,
  .env, VITE ni fallback. Verifica primero SUPABASE_URL de Staging exacto; un
  proyecto distinto (incluido Production) falla antes de leer material privado.
- Nombres privados derivados del UUID autorizado: revisión, certificado PEM,
  PKCS8 ENCRYPTED PRIVATE KEY y passphrase. No acepta nombres/rutas del request.
  Exige revisión y huella coincidentes antes de descifrar. PBES2/PBKDF2-HMAC-SHA256/
  AES256-CBC compatibles con el preparador .NET existente; 200000–1000000
  iteraciones, límites ASN.1/tamaños y parámetros explícitos antes de derivación.
- Importa RSA/SHA256 como CryptoKey no exportable; buffers propios de passphrase
  y PKCS8 plano se sobrescriben al finalizar. No afirmar borrado de strings
  inmutables ni de buffers internos del runtime/biblioteca. Material de retorno
  no enumera clave/certificado y source CMS vuelve a verificar pin/issuer/fechas.
- Keyring AES privado importa 256 bits no exportables por UUID; mantiene lectura
  de IDs anteriores tras rotación. Clave faltante no se reemplaza por la activa.
  No se provisionaron valores reales ni se modificó ningún secreto remoto.
- 93 pruebas enfocadas PASS (20 nuevas de custodia/keyring), incluido recorrido
  Auth mock/SQL/PKCS8 cifrado/keyring/CMS/WSAA mock/conciliación. Sólo la clave
  generadora sintética se exporta en RAM para fabricar el fixture cifrado; el
  proveedor reimporta no exportable. Ningún archivo de clave de ensayo generado.
- Interoperabilidad independiente .NET PASS: clave sintética cifrada con el
  mismo PBE/200000 del preparador, contraseña UTF-8 y certificado emitido por CA
  sintética Test; importación no exportable y firma CMS válidas. Fixture pasó
  por stdout capturado únicamente en memoria, sin imprimir ni escribir material.
  Evidencia fuera de Git: fiscal-custody-dotnet-result.json; script de prueba sin
  valores de material generado en fiscal-custody-dotnet-probe.mjs.
- Build PASS (634 módulos) después de ajustar IV explícito del tipo del fixture y
  retirar import reemplazado. Verificación de artefactos: prefijos de secretos
  del lector/keyring ausentes del frontend. Manifiesto histórico 43 SQL PASS.
  Escaneo 1197 archivos/1183 texto/14 binarios, mismos 46 candidatos (delta 0).
- Edge Runtime v1.77.4 local PASS, tres aserciones: custodia PKCS8 cifrada y
  keyring reales del código, firma/cifrado reales con secretos sintéticos,
  Auth/SQL/ARCA mock. Una carga/renovación y consulta simuladas; replay/otra caché
  no duplican. Evidencia: fiscal-custody-edge-result.json; contenedor exited.
- Fuente técnica: API CryptoEngine/PKCS8 de PKI.js fijada y formato del preparador
  existente (scripts/preparar-arca-homologacion.ps1). No se leyeron el certificado,
  clave ni DPAPI reales. Suite integrada en ejecución, no afirmar PASS todavía.
- Pendientes antes de habilitar: provisión/custodia real autorizada y gate de
  instalación, recuperación auditable que distinga fallos previos a red de
  renovación incierta, endpoint y JWT/RLS/E2E hospedados. Sigue sin index.ts
  activado ni instalación SQL/Edge nueva. No se ejecutó WSAA autenticado real.

La primera suite completa de custodia terminó con 2511 PASS / 1 FAIL / 1 skipped:
falló el conteo de Envases (nuevoStock 5 en lugar de 4). No se descartó como
intermitencia: una regresión adicional confirmó la inicialización tardía del
formulario. Corrección y dos regresiones documentadas en pilot-envases-returns.md.
Pase enfocado conjunto: 123 PASS. Se repite la suite final con salida JSON durable
porque el proceso anterior perdió el registro de terminación; no se considera PASS.

La repetición con salida JSON durable concluyó con 2432 PASS, dos tests fallidos
y cinco archivos con hook de arranque agotado (81 pendientes en total). Los dos
fallos fueron timeout del preparador PowerShell y preflight PGlite; las regresiones
nuevas de Envases pasaron. No es PASS integrado. Se repite sin build concurrente,
con dos trabajadores, sin relajar timeouts ni modificar las pruebas.

Siguiente incremento F04: separar la reserva de renovación TA de su intención de
red durable. Antes de enviar, una reserva preparada puede cancelarse únicamente
con comparación de intento/revisión y registro auditable; después de registrar
intención, un timeout conserva incertidumbre y no habilita otro WSAA. Probar ACK
perdido en cada frontera, carrera cancelar/enviar, revisión obsoleta y llegada
tardía de TA válido. Mantener el bloqueo entre procesos y la recuperación del
sobre confirmado. Este criterio está preparado; aún no implementado ni habilitado.

Cierre verificado del incremento (21/10): repetición con dos trabajadores y sin
build concurrente PASS, 2514 pruebas / 1 skipped / 234 archivos, exit 0. No se
modificaron timeouts ni se excluyeron tests para obtener el resultado. Informe
JSON durable fuera de Git: pilot-custody-envases-limited-results.json; se conserva
el informe previo fallido. Build final PASS, 634 módulos; lint enfocado sin
errores, cinco avisos react(refs) previos. Manifiesto histórico 43 SQL PASS;
escaneo 1197 archivos, 46 candidatos, delta 0. Este PASS local no cierra PR03
hospedado ni habilita la emisión. Código de recuperación TA aún pendiente.

### F04 — recuperación de preparación TA e intención de red — 21/10/2026

Se implementó SQL 007 incremental (preparado, sin instalación remota). La reserva
comienza PREPARADA; sólo iniciar_envio_ta_homologacion, por CAS de intento y
revisión, pasa a ENVIO_INCIERTO y concede nuevo_envio una vez. Repetir su ACK no
concede transporte. El proveedor firma primero y exige ese permiso antes de red.
Si falla keyring/custodia/firma sin solicitar intención, se intenta cancelar la
preparación; si hubo intención o ACK de intención perdido, no se cancela/reintenta.
Consulta privada sin secretos permite recuperar metadata tras ACK de reserva
perdido y cancelar explícitamente por CAS. Intentos cancelados quedan auditados
con fecha, nunca se reutilizan; su replay no altera generaciones posteriores.
Migrar conserva los intentos inciertos del contrato anterior como enviados.

Validación parcial: 118 pruebas enfocadas PASS (persistencia y WSAA). Quince
carreras PostgreSQL 17.11 locales PASS, incluidas enviar/cancelar en ambos órdenes
y dos trabajadores solicitando permiso de envío. Contenedor propio detenido;
datos conservados y contenedores existentes intactos. Evidencia fuera de Git:
fiscal-ta-recovery-concurrency-20261021.json. Build final PASS, 634 módulos;
el primer intento había fallado por tipos de fixtures y se corrigió usando el
validador real de binding, sin casts. Lint enfocado sin errores, un aviso previo
de control-regex del parser. Suite completa en ejecución: no afirmar PASS aún.

Límite: ENVIO_INCIERTO posterior a intención permanece bloqueado sin liberación
por timeout. La nueva recuperación sólo acredita la frontera previa al envío;
no inventa consulta de TA a ARCA ni prueba la no emisión de una respuesta perdida.
Endpoint operativo, instalación/provisión y aceptación hospedada siguen pendientes.

Edge Runtime local v1.77.4 PASS, cuatro aserciones: recorrido con custodia PKCS8,
firma y AES-GCM reales sobre fixture sintético, un permiso durable simulado y una
llamada WSAA mock, replay sin nueva renovación; permiso rechazado impide red.
SQL/Auth/ARCA se simulan en ese recorrido; carreras SQL se acreditan separadas.
Evidencia: fiscal-ta-recovery-edge-result.json. Primer acceso al contenedor recién
arrancado terminó prematuramente; se verificó detenido, se reinició sólo ese
contenedor y el recorrido terminó PASS. Contenedor propio confirmado exited.
Docker había cerrado el motor y se reabrió para este ensayo; ningún SQL remoto.
Escaneo 1198 archivos, 46 candidatos, delta 0; manifiesto histórico 43 SQL PASS.

Cierre del incremento de recuperación TA (21/10): suite completa 2532 PASS /
1 skipped / 234 archivos, exit 0, dos trabajadores y sin relajar timeouts.
Informe durable fuera de Git: pilot-ta-recovery-suite-results.json. Build final
PASS (634 módulos), 118 casos enfocados, quince carreras PostgreSQL y cuatro
aserciones Edge local PASS. Escaneo sin candidatos nuevos y manifiesto 43 SQL
intacto. No hay cambios de código posteriores a esas comprobaciones. SQL 001–007
siguen preparados, no instalados; sin credenciales reales ni llamada fiscal nueva.
Próximo gate de implementación: endpoint privado de consulta/recuperación con
Auth real, CORS y cuerpo acotados, configuración Staging cerrada y salida sin
secretos. Instalar/provisionar y ejecutar aceptación hospedada requieren su gate.

### F04 — endpoint HTTP de consulta/recuperación preparado — 21/10/2026

Nuevo arca-homologacion/index.ts y composición privada HTTP. El servidor sólo
acepta Origin del frontend Staging y POST JSON de hasta 2048 bytes (incluye
stream y límite de lectura de tres segundos). Contrato cerrado, UUID normalizados,
propiedades duplicadas/extra y solicitudes de emisión rechazadas. Flag privado
ARCA_HOMO_BACKEND_ENABLED distinto de true o proyecto distinto de Staging devuelve
503 antes de crear cliente/custodia. Gateway verify_jwt=true conservado; además
Auth.getUser verifica el JWT y SQL verifica actor original Dueño, tenant y emisor
antes de leer claves/TA. No se confía en claims decodificados por el browser.

SDK @supabase/supabase-js fijado a 2.116.0 en import map Edge. Adaptador permite
sólo GET /auth/v1/user y nueve RPC fiscales explícitas del host Staging; rechaza
tablas/funciones/destinos alternativos y redirecciones. Desactiva reintentos en
configuración y RPC; quince segundos incluyen fetch/cuerpo, máximo dos MiB de
respuesta. Auth usa JWT del caller, RPC mantiene credencial del servidor: pruebas
con dos JWT distintos acreditan que no se reutiliza una sesión local para RPC.

Acciones preparadas: CONCILIAR (operación/observación existentes), ESTADO_TA y
CANCELAR_PREPARACION_TA con intento/revisión originales. Resultados cerrados,
sin Token/Sign/certificado/clave; emision_habilitada=false. Un rechazo SQL o ACK
incierto no se presenta como éxito ni dispara reenvío automático.

Evidencia local: 146 pruebas enfocadas PASS (HTTP, SDK real con red simulada y
SQL/PGlite). Incluye custodia PKCS8, CMS, cifrado y cierre reales sobre fixture
sintético; replay HTTP no duplica WSAA ni consulta ni CAE. Recuperación/cancelación
por HTTP conserva generación posterior y rechaza intento ya enviado. Build PASS,
634 módulos; lint enfocado sin errores. Suite completa en ejecución, no PASS aún.

Edge Runtime v1.77.4 local: entrypoint real compilado/ejecutado deshabilitado por
defecto PASS (tres aserciones); integración HTTP/SDK PASS (cinco), dos llamadas
Auth mock, un permiso, un WSAA y un WSFE mock, replay/cifrado privados. Contenedores
propios confirmados exited. Evidencia fuera de Git: fiscal-http-edge-entry-result.json
y fiscal-http-edge-integration-result.json. No se acredita JWT/RLS hospedado.
Escaneo 1203 archivos/47 candidatos: único delta es literal explícito de secreto
sintético en fiscalSupabaseAdmin.test.ts:5, sin material real. Manifiesto 43 SQL
históricos intacto; módulos privados ausentes del frontend compilado.

Pendientes: instalación de SQL 001–007 y nueva Edge (primero deshabilitada),
provisión privada, pruebas hospedadas JWT/RLS/E2E y autorización distinta para
consultas fiscales reales. El flag no debe activarse sólo por autorizar deploy.
No se desplegó función fiscal, cambió configuración remota ni consultó ARCA real.
PR03 sigue PARCIAL; PR02 y emisión continúan bloqueados por sus gates.

El alcance de este endpoint es consulta/recuperación, no completa por sí solo el
backend PR03. Antes de CAE real faltan también el adaptador de último autorizado,
serialización/envío FECAESolicitar con intención durable y reconciliación, y su
integración UI. Son implementación local pendiente; luego se revisan instalación,
provisión y aceptación hospedadas. No convertir el éxito de consulta en emisión
aceptada ni omitir esos componentes para cerrar PR02/PR03.

Revisión previa a publicar: la coordinación global por certificado permite a un
worker de otro comercio autorizado compartir TA, pero el nuevo HTTP de cancelación
no debe trasladar esa capacidad al Dueño de otro tenant. Falta ligar el intento a
su operación de origen y ocultar metadata ajena antes de publicar el endpoint.
Se conserva la suite en curso como evidencia del estado previo; no editar código
mientras corre ni presentar ese pase como aceptación de la corrección pendiente.

Corrección de aislamiento antes de publicar: SQL 008 liga nuevos intentos TA a
operacion_origen_id (FK privada). Sólo esa operación puede registrar intención,
confirmar el sobre o cancelar preparación; la consulta de otra operación devuelve
COMPARTIDA sin intento ni revisión ajenos. El TA confirmado se sigue compartiendo
privadamente por certificado; no se duplica renovación por separar comercios.
No se inventa origen de historia anterior (NULL): queda no cancelable/enviable;
requiere revisión privada, no redondeo ni asignación automática. Timestamp y FK
hacen trazable el origen sin ampliar lecturas públicas de la tabla/columna nueva.

Primera suite completa del endpoint previo al guard: 2589 PASS / 1 skipped /
236 archivos; se conserva pilot-fiscal-http-suite-results.json. La revisión de
seguridad encontró luego el riesgo de cancelación cruzada, por lo que ese pase
no se usa como aceptación final. Después del guard: 150 casos enfocados PASS,
dieciséis carreras PostgreSQL 17.11 PASS, incluidas metadata/acción ajenas
rechazadas y reutilización TA conservada. Build final PASS; Edge real deshabilitado
(3) e integración HTTP/SDK sintética (5) repetidos con código final PASS. Evidencia
pre-ownership conservada por separado; contenedores propios exited y datos locales
conservados. Lint/diff/manifiesto 43 SQL PASS. Escaneo 1204 archivos/47 candidatos,
sólo el literal sintético identificado antes. Suite completa final en ejecución.
SQL 001–008 y nueva Edge continúan sin instalación ni habilitación remotas.

Fuentes para el siguiente componente: la página oficial de WebService consultada
el 21/10 anuncia manual WSFEv1 V4.7 (https://www.afip.gob.ar/fe/ayuda/webservice.asp).
El enlace actual apunta a /ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf;
su lectura por la herramienta agotó tiempo, por lo que no se afirma haber revisado
el PDF completo. Se pudo leer la documentación SOAP pública de FECAESolicitar
(https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FECAESolicitar); la de último
autorizado agotó tiempo. Fueron GET de documentación sin autenticación ni emisión.
Verificar manual/WSDL vigentes al implementar envío; no tomar el manual histórico
v2.1 mencionado antes como especificación suficiente para esa etapa.

Cierre final del endpoint con aislamiento (21/10): 2593 PASS / 1 skipped /
236 archivos, exit 0, dos trabajadores y mismos timeouts. Informe durable:
pilot-fiscal-http-ownership-suite-results.json. La única omisión preexistente es
la comparación del set F6 revisado de 942 candidatos, condicionada a configurar
F6_C3A_CANDIDATES_PATH; no se omiten pruebas fiscales nuevas. Build final PASS,
150 enfocadas PASS, 16 carreras PostgreSQL PASS y Edge final 3+5 aserciones PASS.
No hubo cambios de código posteriores. El frontend compilado conserva 634 módulos
y no incluye el backend privado. Instalar SQL 001–008, desplegar Edge y provisionar
secretos siguen pendientes de autorización; no se activó el flag ni se emitió.

### F05/F06 — último autorizado y trabajador de envío preparado — 21/10/2026

Fuentes actuales obtenidas por GET público (sin autenticación): WSDL de homologación
77307 bytes y manual oficial v4.7, 203 páginas, revisión 01/09/2026. La extracción
local sí permitió leer el PDF cuyo acceso web había agotado tiempo. Orígenes y
SHA-256 se conservan fuera de Git en arca-wsfe-official-sources-20261021.json.
Manual: https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
WSDL: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?wsdl

Adaptador preparado para FECompUltimoAutorizado y un FECAESolicitar por cuerpo.
Verifica serie, admite cero como último real, rechaza errores/identidad distinta,
XML ambiguo, redirecciones y respuestas fuera de límites. PES/cotización 1 y
condición IVA explícitos; no infiere tasas ni redondea importes. Conserva IVA,
tributos y fechas del cuerpo canónico. Valida restricciones wire del manual
(punto hasta 99998, descripción hasta 80, alícuota de tributo sin redondear) antes
de pedir TA en el worker. Escape XML preserva CR y rechaza UTF-16 no válido.
Una aprobación recibida, incluso con observaciones, no se convierte en cierre:
FECompConsultar debe coincidir con cuerpo completo y el CAS existente guarda CAE.

SQL 009 preparado: permiso privado exacto de operación/hash/credencial/huella/
revisión, sin filas habilitadas por defecto, vigencia máxima una hora. No hay
DML directo ni para service_role. Callback del transporte sólo recibe permiso
nuevo tras registrar intención y consumir autorización en la misma transacción.
El vencimiento se revalida al consumir; omitir escritura o vencer durante el
registro revierte también la intención. ACK repetido no concede otro envío.
Worker requiere proyecto Staging/backend habilitado y flag privado de emisión
separado para un primer intento; recupera estados inciertos/autorizados sin
reenviar ni alterar venta, stock o caja. Numeración ya ocupada sin intento local
no se atribuye como propia ni se repara silenciosamente.

Validación local parcial: 152 enfocadas PASS, build final PASS 634 módulos;
18 carreras PostgreSQL 17.11 PASS (v3 final). El primer agregado chocó con el
pendiente que otro escenario conserva y falló 55000; se preservó ese fixture y
se probaron las nuevas carreras en series sintéticas 81/82, sin liberar datos.
Contenedores propios detenidos y datos conservados. Evidencias v1/v2/v3 fuera
Git; fiscal-emission-permit-concurrency-20261021-v3.json es el cierre final.
Primer test de timeout falló por avanzar fake timers antes de acabar la validación/
hash: corregido esperando entrar en el guard antes de avanzar, sin relajar plazo.
Lint sin errores; tres avisos control-regex (dos existentes y uno intencional
nuevo para rechazar caracteres XML prohibidos), no se deshabilitaron reglas.

Edge Runtime local: entrypoint público sigue deshabilitado (3 checks PASS).
Recorrido privado con SDK/CMS/custodia/cifrado reales y Auth/SQL/ARCA simulados
PASS: dos Auth, un WSAA, una consulta de número, un envío mock, una consulta
completa y un permiso de emisión; replay recupera el mismo resultado. No hubo
emisión real ni acceso a credenciales originales. Un error de etiqueta del
runner impidió su primer cleanup: se verificó ID/nombre/etiqueta del contenedor
propio, se lo detuvo y se repitió con etiqueta consistente. Ambos contenedores
finales confirmados exited. Evidencia: fiscal-emission-edge-*-result.json.
Escaneo 1210 archivos/47 candidatos, delta 0 respecto al anterior; manifiesto
histórico 43 SQL intacto. Backend de emisión ausente del frontend. Suite completa
en ejecución: este bloque todavía no tiene PASS integrado final.

Pendientes de integración antes de habilitar: preparación desde datos fiscales
reales/IVA de catálogo sin defaults inferidos, revisión en UI, API de emisión
controlada, resolución de rechazos/cancelación y sincronización del nuevo ledger
con bloqueos de devoluciones. El guard actual de devolución consulta afip_cae
(bootstrap/returns/002_owner_envases_return.sql:104); no reconoce todavía el CAE
privado nuevo. Auditar y reforzar antes de permitir emisión a usuarios. Notas de
crédito conservan la decisión fiscal externa pendiente documentada; no implementarla
por inferencia. El worker no modifica afip_cae ni habilita botón/endpoint de emisión.
Instalación SQL 001–009, provisión, JWT/RLS/E2E hospedados, punto verificado y primera
emisión requieren sus gates y permisos. PR03/PR02 siguen PARCIAL/PENDIENTE.

La allowlist del SDK privado incorpora dos RPC específicas para este worker
(cargar preparación y registrar envío): once en total, sin API genérica de tablas
o emisión SOAP directa. El endpoint HTTP de consulta sigue rechazando EMITIR y
el nuevo flag de emisión no está activado. La aprobación privada por cuerpo es
el gate del ensayo controlado inicial; falta diseñar su revisión/otorgamiento en
UI bajo las reglas fiscales reales antes de considerar listo el piloto comercial.

### Cierre adicional del permiso temporal — 21/10/2026

Una regresión nueva demostró que un permiso creado en el futuro podía aceptarse
antes de su vigencia. Se corrigió la comprobación de inicio tanto al cargar como
al consumir el permiso, conservando la validación de vencimiento después de los
bloqueos y el rollback íntegro. Regresión roja conservada como evidencia local;
resultado dirigido posterior: 153 PASS. PostgreSQL 17.11: 18 carreras PASS en
fiscal-emission-permit-concurrency-20261021-v4.json, contenedor propio detenido y
datos conservados. Build posterior PASS (634 módulos). La suite anterior cerró
2655 PASS / 1 skipped / 238 archivos; precede esta última regresión y no se usa
como cierre de la corrección. Suite completa posterior en ejecución. Sin llamadas
ARCA, emisión real, instalación SQL, cambios remotos ni acceso a claves originales.

### Siguiente incremento PR03 — exclusión devolución/fiscalización

Antes de activar emisión, agregar una migración fiscal incremental (sin editar
el manifiesto histórico) que serialice las devoluciones y la reserva fiscal por
la misma fila de venta. Cubrir ambas direcciones: una reserva existente impide
registrar una devolución común; una devolución existente impide reservar el cuerpo
original completo. Mantener recuperables los ACK históricos y no cambiar ventas
no fiscales. Revisar todas las inserciones en devoluciones_venta y el registro
atómico, incluidos caminos heredados; no basta con el campo afip_cae. Validar
ambos órdenes de carrera en PostgreSQL, rollback sin stock/caja y ACL/roles.
No supone resolver notas de crédito ni autoriza instalar el backend. El contrato
de notas de crédito conserva su decisión fiscal externa pendiente. Este diseño
continúa pendiente de implementación y no acredita aceptación hospedada.

Cierre integrado posterior al guard de vigencia: 2656 PASS / 1 skipped /
238 archivos, salida 0 (pilot-fiscal-emission-permission-suite-results.json).
La única omitida sigue siendo la fixture F6 de candidatos no configurada;
ninguna prueba fiscal nueva omitida. Build posterior PASS, 634 módulos;
153 enfocadas y 18 carreras PostgreSQL v4 PASS, Edge sintético 3+7 PASS.
Manifiesto 43 SQL PASS; diff sin errores; escaneo 1210 archivos, 47 candidatos,
delta 0. Este cierre reemplaza el estado de suite en ejecución anterior para
este incremento. SQL 001–009 y Edge fiscal continúan sin instalar/activar.

### PR03 — exclusión devolución/reserva preparada, 21/10/2026

SQL 010 agrega guards privados en devoluciones_venta (incluido el camino heredado)
y fiscal_reservas_homologacion. Ambos bloquean las mismas filas de ventas antes
de comprobar el otro registro. Una devolución previa impide reservar el total
original; cualquier reserva, incierta o autorizada, impide una devolución común.
La mera preparación sin reserva permite devolver y recuperar el ACK. No hay
reescritura de afip_cae, notas de crédito, importes, stock ni caja por estos guards.
Las devoluciones atómicas v1/v2 registran primero el mismo padre, por lo que el
rechazo revierte su transacción. Los permisos existentes no se amplían.

La protección exige READ COMMITTED, aislamiento de las RPC actuales. Se rechazan
REPEATABLE READ/SERIALIZABLE antes de escribir: una snapshot fija no permite
apoyarse en una consulta posterior al lock para ver un commit concurrente. No se
baja el aislamiento silenciosamente ni se actualiza comercialmente la venta para
forzar conflictos. Helpers SECURITY DEFINER con search_path fijo y EXECUTE revocado.

195 pruebas enfocadas PASS (diario/persistencia/worker/devolución real), incluida
falta de efectos de stock/lote/caja en los tres estados fiscales, reserva después
de devolución sin consumir número, replay y aislamiento/ACL. 20 carreras PostgreSQL
17.11 PASS: los dos nuevos órdenes observaron el lock real antes de liberar el
competidor. Primera ejecución falló 42501 por identidad ausente en el fixture
heredado; se agregó la identidad correcta sin eliminar el control. Evidencia
final: fiscal-return-exclusion-concurrency-20261021-v3.json; contenedores propios
detenidos, datos preservados y cero conexiones remotas. La primera compilación
marcó dos accesos unknown en pruebas; corregidos con tipos explícitos. Build final
y suite integrada en ejecución, sin declarar aún cierre integrado de SQL 010.

SQL 001–010 siguen sin instalar; los conflictos históricos, si aparecen en el
preflight de instalación, requieren conciliación y no se borran. Falta resolver
preparación fiscal/revisión UI, rechazos, aceptación hospedada y decisión externa
de notas de crédito. PR03 continúa PARCIAL y PR02 sin CAE real.

Revisión de estilo: el primer comando usó ESLint por error y no encontró su
configuración. El proyecto usa oxlint (package.json); se repitió correctamente
con npm run lint -- src/test/pilotCashReturnSql.test.ts y pasó, salida 0. Sin
cambios en package.json/lock. Build final PASS (634 módulos); escaneo 1211 archivos,
47 candidatos, delta 0; manifiesto histórico 43 SQL PASS y diff sin errores.

Cierre integrado SQL 010: 2666 PASS / 1 skipped / 238 archivos, salida 0,
registrado en pilot-fiscal-return-exclusion-suite-results.json. La omitida sigue
siendo la fixture F6 sin configurar; ninguna prueba fiscal nueva omitida. 195
casos enfocados, 20 carreras PostgreSQL v3, build 634 módulos, oxlint dirigido,
manifest 43 y diff PASS. Escaneo 1211 archivos/47 candidatos/delta 0. Este cierre
sustituye el estado anterior de suite en curso. Sin instalación SQL/Edge, sin
emisión real, sin frontend/deploy nuevo ni cambios en master/Production. Próximo:
preparación fiscal explícita y revisión UI, con resolución de rechazos y los
gates hospedados pendientes; no reutilizar defaults de punto/IVA del legado.

### Próximo incremento PR03 — revisión humana del cuerpo durable

Preparar revisión/confirmación del cuerpo exacto por el Dueño original, con Auth
real antes de SQL, sin leer custodia ni llamar a ARCA. La aprobación conserva
hash, revisión, actor y binding privado del emisor, expira y tiene identidad
idempotente/auditoría inmutable. No sustituye el permiso privado de emisión de
SQL 009 ni habilita el flag. El worker debe exigir revisión vigente antes de TA,
y DB revalidarla al consumir permiso para cerrar carreras/ACK perdido. La UI
recibirá sólo cuerpo validado, estado y recibo de revisión, nunca credenciales.
Agregar acciones cerradas de consulta/aprobación al endpoint aún deshabilitado;
EMITIR sigue fuera del contrato HTTP. Probar roles/tenant, hash/revisión alterados,
replay, expiración/rotación y ausencia de tráfico ARCA. Mantener historia y planes.

### PR03 F07 — revisión humana ligada al cuerpo, preparada (22/10/2026 UTC)

SQL 011 guarda aprobación inmutable por UUID, operación, usuario/Auth originales,
hash/revisión del cuerpo y binding privado del emisor. Vence en diez minutos; el
mismo UUID devuelve el recibo original sin extenderlo. Cambiar hash, revisión,
Auth o emisor no reinterpreta un recibo anterior. Perfil/tenant se revalidan por
el gate privado antes de leer el cuerpo. No hay filas ni flags activos por defecto.
Tablas privadas/RLS, ACL por tabla/columna revocadas y verificación de herencia.

El endpoint preparado incorpora REVISAR_COMPROBANTE/APROBAR_REVISION, con JSON
cerrado de 2 KiB, Auth.getUser y DTO validado/canónico. No devuelve credencial,
certificado, TA, permiso privado ni errores crudos. La revisión no solicita TA,
no toca custodia y no llama a ARCA. EMITIR permanece rechazado. El SDK privado
permite ahora trece RPC concretas, manteniendo host fijo, sin retries/redirecciones.

El worker exige revisión vigente antes de TA. Consumo de permiso/intención vuelve
a comprobarla en DB y enlaza revision_aprobada_id, sin sustituir el permiso exacto
privado de SQL 009. Una consulta/replay de una emisión previa sigue recuperable
sin renovar revisión ni reenviar. Preparación fiscal/IVA y UI aún pendientes; la
aprobación humana del cuerpo no acredita corrección tributaria ni punto disponible.

Regresión real en PostgreSQL local: una revisión vencida durante espera de FOR
SHARE podía consumirse. La prueba roja preservada (fiscal-owner-review-expiry-red-
20261022.json) detectó ACK habilitado en vez de 42501. Se corrigió revalidando tanto
revisión como permiso con clock_timestamp DESPUÉS del lock; ambos vencimientos
ahora revierten intención/consumo. 24 escenarios PostgreSQL 17.11 PASS, incluyendo
los dos órdenes devolución/reserva y replay concurrente de revisión. Evidencia
final: fiscal-owner-review-concurrency-final-20261022.json. Contenedores propios
detenidos, datos conservados, cero conexiones remotas y cero comprobantes reales.

131 pruebas enfocadas PASS. Edge local 3+9 checks PASS (fiscal-owner-review-edge-v2-
*-result.json), con SDK/CMS/cifrado reales y Auth/SQL/ARCA simulados: consulta,
aprobación, mismo recibo, un envío mock y una conciliación mock; ninguna lectura de
credenciales originales. El primer arnés declaró dos workerSafe por una sustitución
de nombres; se preservó su journal y se corrigió sólo el arnés. Después Docker
estaba cerrado; se inició la instalación por usuario y se repitió correctamente.
Build final/suite integrada en curso; no usar todavía un cierre integrado previo
para aceptar SQL 011. Instalación SQL 001–011/Edge, provisión privada, JWT/RLS/E2E
hospedados y emisión real conservan sus gates. PR03 PARCIAL; PR02 sin CAE real.

Revisión adicional pendiente antes de cerrar F07: transportar la identidad Auth
verificada entre las RPC de revisión/consumo. Recibir sólo usuario_id y volver a
resolver Auth desde el perfil podría atribuir a una cuenta reasignada una petición
iniciada por la anterior. Preparar getter/aprobación con actor_auth_id verificado y
wrapper transaccional del consumo que llame al gate con esa identidad, revocando
la entrada de envío sin actor para service_role. Probar reasignación entre Auth y
consulta y entre revisión y envío. No modificar fuentes hasta terminar la suite
actual; su resultado será evidencia previa a este refuerzo, no cierre final.

F07 — refuerzo de identidad completado localmente (22/10/2026 UTC): el servidor
conserva actorAuthId de Auth.getUser, separado del binding privado. Getter y
aprobación reciben esa identidad verificada, sin resolverla otra vez desde un
perfil reasignable. registrar_envio_revisado_homologacion toma el gate y consume
permiso en la misma transacción, manteniendo el lock del perfil/venta. Se revocó
registrar_envio_fiscal_homologacion a service_role y se reemplazó en la allowlist
(trece RPC en total); sólo el wrapper privado lo invoca. Consumidores anteriores
de authorizeFiscalWorker conservan su contrato. Pruebas de cambio de Auth entre
autenticación/revisión y entre revisión/envío rechazan la petición anterior,
incluso con aprobación válida de la cuenta nueva, sin POST fiscal ni consumo.

La suite integrada previa pasó 2697 / 1 skipped / 238 archivos ANTES del refuerzo;
no es su cierre. Final local dirigido: 155 PASS. PostgreSQL: 24 PASS en
fiscal-owner-review-actor-concurrency-final-20261022.json. El primer ensayo de este
refuerzo marcó 23514 en el fixture de plazo máximo por usar dos clock_timestamp;
se corrigió con una única referencia materializada, sin ampliar diez minutos.
Se preservan ambos resultados y datos. Edge final v3: 3+9 PASS, contenedores propios
exited, sin red fiscal real. Build/suite final del actor en curso. Instalación,
provisión, emisión, aceptación hospedada y UI continúan pendientes con sus gates.

Siguiente integración UI: reutilizar HistorialTicketsModal y ui/Modal, conservando
estética/tema. Consultar desde la venta seleccionada mediante resolución de la
operación en servidor, sin pedir UUID técnicos al cajero. Mostrar receptor,
fecha/concepto, desglose/importes y estado; conservar identidad de aprobación antes
del POST y recuperar el mismo recibo ante ACK perdido. Confirmar revisión no debe
mostrarse como factura emitida ni crear otro cobro. Preparación del cuerpo debe
usar datos fiscales explícitos/snapshot, sin defaults heredados de punto/IVA; no
habilitar el antiguo afip-wsfe como fallback. Mantener pendientes integración de
catálogo/tributos/envases, rechazos/NC y gates hospedados; el componente de revisión
backend preparado no acredita por sí solo esos contratos.

Cierre integrado F07 posterior al refuerzo de identidad: 2703 PASS / 1 skipped /
238 archivos, salida 0 (pilot-fiscal-owner-review-actor-suite-results.json). La
omitida sigue siendo la fixture F6 no configurada; ninguna fiscal nueva omitida.
155 enfocadas, 24 carreras PostgreSQL, Edge final v3 3+9, build 634 módulos,
oxlint dirigido y manifiesto histórico 43 SQL PASS. Escaneo 1213 archivos/47
candidatos/delta 0 respecto al cierre SQL 010; backend privado ausente del bundle
público. Este resultado reemplaza la suite anterior a Auth y los estados en curso
para este incremento. Sin nuevas dependencias, instalación SQL/Edge, provisión de
claves, tráfico ARCA autenticado, emisión real ni frontend/deploy nuevo. PR03 sigue
PARCIAL: faltan preparación fiscal y UI, rechazos/NC y aceptación hospedada. No
cambia master/Production; impresora/cajón y Point permanecen diferidos.
