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

### F08 — preparación explícita + pantalla (en implementación)

Mantener prohibida la instalación remota. Primero definir DTO sin número/CUIT/punto/
total editables, ligado al contexto de venta y parámetros del servidor. Condición
fiscal del emisor, receptor, concepto/fechas y desglose requieren selección explícita;
ningún default del afipStore heredado. Validar A/B/C contra condición declarada y
catálogo versionado de condiciones/alícuotas antes de TA. El catálogo no se presume
acreditado por la tabla antigua de IVA global. Las consultas de parámetros reales
conservan autorización específica. Construir cuerpo sólo después de consultar el
último número por el circuito privado habilitado; persistir/reintentar el mismo
cuerpo antes de revisión. La pantalla reutiliza Modal/HistorialTickets y separa
preparación, revisión y aprobación de emisión/CAE. Recepción de envases en factura:
se preguntó por el criterio contable, pendiente; no inventar su tratamiento.
Fuentes oficiales reabiertas: página ARCA y manual enlazado v4.7 de 203 páginas;
no se adopta un supuesto v4.8 desde resultados secundarios.

### 22/10/2026 — F08: preparación explícita y revisión visual, integración aún abierta

Decisión confirmada por el titular: el tratamiento fiscal de envases vacíos descontados del ticket está pendiente de definir con su contador. Esas ventas se bloquean en la preparación; no se inventa un descuento gravado/exento ni se altera su total. Este bloqueo no se extiende a las ventas sin recepción de envases.

Primer incremento local: contrato público de preparación sin CUIT/punto/total/número editables; validación cerrada de datos explícitos, compatibilidad de clase/condición y catálogo versionado suministrado por servidor. El hash de preparación no es el hash final ni una autorización; el número provisional usado para validación estructural se elimina y nunca se reserva/emite. No se cargó catálogo real ni se acreditaron alícuotas desde fixtures.

Componentes FiscalPreparationForm y FiscalOwnerReviewPanel preparados, con controles del tema existente. Fechas dd/mm/aaaa, selección explícita de receptor/emisor/concepto/moneda, importes obligatorios y detalle IVA/tributos. Revisión muestra cuerpo completo; aprobación exige acción humana y ACK del cuerpo/revisión exactos. Respuesta tardía no aprueba otro cuerpo, la aprobación vence en pantalla y no se muestra como CAE. Sin errores privados en mensajes del formulario.

Validación local dirigida: 203 PASS en 6 archivos, incluidas 43 pruebas nuevas de este incremento; oxlint dirigido PASS. Hubo un inicio de Vitest impedido por spawn EPERM y tres fallas iniciales de matchers no instalados; se corrigieron usando comprobaciones DOM existentes y se volvió a ejecutar. Build inicial PASS anterior al formulario; compilación posterior debe acreditarse por separado.

Estado deliberadamente PARCIAL: componentes aún no conectados a HistorialTicketsModal; faltan contexto fiscal autenticado/catálogo acreditado, persistencia de preparación vinculada a snapshot/actor/emisor, resolución de operación desde venta, identificadores durables antes del POST, consulta privada de último número y enlace al cuerpo SQL 003/011. Clasificación del emisor es declarada por Dueño, no verificación de padrón. El catálogo sintético no acredita compatibilidad fiscal real ni cálculo de alícuotas. No cerrar preparación/UI ni aceptación E2E con estas pruebas aisladas. La suite global 2703 PASS corresponde al HEAD f50c974, no a este trabajo local.

Sin SQL fiscal nuevo instalado, Edge desplegado/habilitado, provisión de claves, llamadas autenticadas a ARCA, emisión, merge ni cambios en master/Production. Mantener primer CAE y aceptación hospedada pendientes. Impresora/cajón y Point continúan diferidos. Próximo paso: completar persistencia y adaptación autenticada antes de conectar/activar la pantalla.
Cierre local de este incremento F08: build posterior al formulario PASS (634 módulos), oxlint dirigido PASS, manifiesto histórico 43 SQL PASS y escaneo 1220 archivos/47 candidatos, delta 0 respecto a F07. Evidencias: pilot-fiscal-explicit-preparation-ui-targeted.log, pilot-fiscal-explicit-preparation-ui-final-build.log y pilot-fiscal-explicit-preparation-ui-scan-verified.log fuera de Git. No se ejecutó nuevamente la suite global; 203 PASS es la selección dirigida actual. No se desplegaron los componentes ni se integraron al flujo operativo.

F08 continuación local: preparar SQL 012 sin instalación, con catálogo privado versionado/vigente (sin filas habilitadas ni valores fiscales sembrados), contexto desde venta y Auth verificado, preparación canónica/SHA inmutable ligada a snapshot/actor/emisor y replay exacto. Reutilizar validador SQL 003 mediante número estructural que no se reserva/persiste. Separar futuras consultas de numeración de esta escritura sin red; negar recepción de envases hasta criterio contable. Probar permisos, identidad ajena, cambios de snapshot/emisor/parámetros, ACK perdido y rollback, antes de adaptar HTTP/UI. No cambiar los contratos antiguos ni simular un JWT de usuario en service_role.
### 22/10/2026 — F08: guardado durable explícito preparado (sin instalación)

SQL 012 agrega catálogo privado versionado/vigente y preparación inmutable. No siembra filas ni habilita catálogos. Fuente/fechas/revisión son metadatos de aprovisionamiento pendiente, no prueba automática de parámetros ARCA reales. El servicio verifica Auth una sola vez y conserva ese actor hasta contexto y escritura. DB revalida actor/pertenencia, comercio, venta con artículos, emisor y parámetros bajo locks; toma total y snapshot desde servidor. No simula auth.uid() de usuario con service_role.

La escritura conserva el UUID/canónico/hash original y se repite con el mismo ACK. Rechaza otra identidad, cuerpo, Auth, emisor o snapshot. El wrapper de cuerpo final exige datos exactos preparados (excepto el número observado), parámetros vigentes y actor/emisor originales antes de llamar a SQL 003. La preparación sola no reserva número ni toca TA, stock/caja o red fiscal. Se mantiene tratamiento de envases bloqueado por decisión contable pendiente. La validación estructural reutiliza SQL 003 con un número que no se guarda ni reserva; no se muestra como numeración autorizada.

SDK privado amplía la lista cerrada de 13 a 16 RPC: contexto, guardado y enlace final; no expone tablas ni la entrada SQL 003 sin preparación. Los nuevos métodos aún no están conectados a acciones HTTP/UI. No habilita ninguna emisión ni consulta ARCA por agregar RPC. Clasificación del emisor sigue declarada por Dueño y el cálculo/compatibilidad de alícuotas reales depende de catálogo acreditado/provisión pendiente.

Evidencia dirigida actual: 130 PASS / 4 archivos, incluidas 33 nuevas de SQL/servicio. PostgreSQL 17.11 local: 28 escenarios PASS, incluidos doble guardado, reasignación Auth, cambio de venta y vencimiento de catálogo después de esperar lock (fiscal-durable-preparation-concurrency-20261022.json). Contenedor propio detenido, datos conservados, externos/emisiones 0. Se conservan el fallo inicial de fixture con columna incorrecta y una regresión SQL roja por condiciónEmisor null; corregida comprobando tipo string antes de guardar. No quedaron pruebas omitidas en el pase dirigido. Oxlint dirigido salida 0, con advertencia no-unsafe-finally preexistente en cleanup del runner; manifiesto histórico 43 SQL y diff PASS. Build previo al último ajuste del SDK PASS; cierre de build/suite final todavía pendiente.

PR03/F08 continúa PARCIAL. Faltan acciones HTTP anidadas con control de duplicados/límites, recuperación por venta, UUID durable en cliente, consulta privada de último número con gate propio y unión de los componentes a HistorialTicketsModal. SQL 001–012/Edge sin instalar; no provisión, llamadas fiscales autenticadas, CAE ni deploy nuevo. No modificar master/Production, ni integrar PR #3. Rechazos/NC y aceptación hospedada siguen abiertos; impresora/cajón y Point diferidos.
Control previo a integrar/activar la pantalla: el bootstrap estricto no declara afip_cae en ventas, pero anulación 029 detecta esa columna heredada mediante to_jsonb(v). El nuevo contexto de preparación todavía debe incorporar ese control y recuperar una factura/operación ya existente desde la venta, evitando ofrecer otra preparación. No confundir replay de DATOS_PREPARADOS con estado fiscal actual. Este pendiente queda dentro de F08 antes de HTTP/UI y aceptación, no como excepción de publicación. La suite global en curso corresponde al incremento actual anterior a ese refuerzo.
Cierre integrado de este incremento de persistencia F08: 2779 PASS / 1 skipped / 243 archivos, salida 0 (pilot-fiscal-durable-preparation-suite-results.json). La única omitida sigue siendo la fixture F6 no configurada; ninguna fiscal nueva omitida. 130 dirigidas, 28 escenarios PostgreSQL y build final de 634 módulos PASS. Oxlint de archivos finales sin hallazgos; se conserva advertencia preexistente de finally en el runner. Manifiesto histórico 43 SQL PASS, diff sin errores, escaneo 1224 archivos/47 candidatos/delta 0. Backend privado ausente del bundle público. Este cierre reemplaza los estados de build/suite pendientes anteriores para este incremento, sin cerrar F08 ni las limitaciones de integración/heredados identificadas. SQL 001–012 y Edge siguen sin instalar/activar; cero emisiones, nuevas consultas ARCA autenticadas o deploy frontend.
F08 siguiente integración: extraer gate privado de acceso a venta (Auth→perfil→comercio→venta) para reutilizarlo en contexto y resolución por venta. Detectar cualquier afip_cae heredado no vacío mediante to_jsonb, sin depender de una columna ausente en bootstrap; no inferir validez fiscal de ese registro. Resolver estado/id originales desde venta, sin requerir emisor/catálogo habilitado para saber que ya existe una preparación o autorización. No atribuir operaciones sin vínculo Auth probado a una cuenta reasignada. Servicio/HTTP deben devolver DTO cerrado sin binding/custodia; UI recuperará el mismo flujo antes de proponer datos nuevos.
### 22/10/2026 — F08: HTTP, recuperación por venta e integración visual detrás de flag

Se extrae gate privado Auth→perfil→comercio→venta para reutilizarlo en contexto y resolución. SQL 012 detecta registro afip_cae heredado no vacío vía to_jsonb, incluso cuando el bootstrap estricto no tiene esa columna; bloquea nueva preparación sin afirmar validez de ese registro. Resolver devuelve estado/id originales sin exigir catálogo/emisor activos. Auth reasignado o snapshot cambiado requiere revisión sin exponer id previo. No se vuelve a inferir identidad desde perfil para atribuir el intento a otra cuenta.

Acciones HTTP nuevas RESOLVER_VENTA, DATOS_FISCALES_VENTA y GUARDAR_DATOS_FISCALES. JSON con claves duplicadas (también escapadas/anidadas) y profundidad >12 se rechaza antes de Auth. Guardado tiene máximo 64KiB; consultas/revisión conservan 2KiB; timeout de cuerpo 3s y CORS/origen/host/flag privados conservados. SDK privado amplía allowlist a 17 RPC, sólo agregando resolución. Sin acción EMITIR, TA ni consulta ARCA desde estas acciones.

Cliente conserva UUID y datos exactos antes del POST; almacenamiento fallido impide envío, ACK perdido permite mismo intento, otro cuerpo no reemplaza pendiente. Scope por Auth/comercio/venta; los datos del receptor se retiran tras ACK o GET que recupera ese mismo UUID, conservando sólo identidad local. Aprobación conserva UUID/hash/revisión y vigencia para replay. Verificación de sesión en navegador evita usar la cuenta anterior; no sustituye Auth.getUser/SQL en servidor. Respuestas tardías no cambian otra venta seleccionada.

HistorialTicketsModal integra FiscalDocumentModal para Dueño activo ordinario con flag VITE_KIOSKO_ARCA_REVISION_HOMO=true y piloto estricto. Flag nuevo NO configurado/habilitado. Emisión heredada no es fallback del flujo nuevo. Modal reutiliza estilos/componentes existentes: carga explícita, guardado pendiente, preparación guardada, revisión exacta y aprobación separada de emisión/CAE. Registro heredado o contexto dudoso no ofrece datos nuevos. Si se recupera AUTORIZADA y falla el detalle, se conserva ese estado sin proponer otro comprobante. Se asigna useId al título de Modal para distinguir diálogos anidados; sin cambio de colores/tema.

Pruebas dirigidas actuales: 162 PASS / 8 archivos, con guard de sesión/proyecto, replay tras reinicio, almacenamiento fallido, privacidad tras ACK, historial por roles, carga/guardado/revisión y selección cambiada. PostgreSQL 17.11 local: 30 escenarios PASS, incluidos resolver que espera guardado y CAE heredado confirmado mientras contexto espera venta; contenedor propio detenido y datos conservados. Evidencia fiscal-sale-resolution-concurrency-20261022.json. Build inicial identificó unión discriminada HTTP y literal boolean de fixture; corregidos sin casts de producción. Compilación posterior PASS; último cierre del mensaje de recuperación aún requiere build/suite final. No interpretar suite global 2779 anterior como cierre de estos cambios.

F08 sigue PARCIAL: falta gate privado de consulta de último número y orquestador preparación→cuerpo/reserva→revisión para la primera solicitud, recuperación de constancia fiscal completa, rechazo/cancelación/NC y aceptación hospedada/visual real. Estado DATOS_PREPARADOS se muestra como tal, no como revisión ni factura. Catálogo real/punto de venta/custodia aún sin acreditar/provisionar. Envases descontados del ticket continúan pendientes de contador. SQL 001–012 y Edge siguen sin instalar/activar; frontend nuevo no desplegado. No tráfico ARCA autenticado, CAE, merge ni modificación de master/Production. No activar flag antes de completar esos gates; impresora/cajón y Point siguen diferidos.
Auditoría durante la suite: resolver oculta una preparación cuyo Auth original fue reasignado, pero el getter SQL 011 todavía autoriza por perfil actual y puede recibir un UUID conocido por fuera del historial. Antes de publicar este incremento, añadir validación de actor_auth_id de preparación también en el getter/aprobación del servidor. Conservar compatibilidad de SQL 011 anterior a tabla 012 mediante comprobación explícita de existencia (no inferir Auth desde perfil para preparaciones 012). Probar petición directa de nuevo Auth a cuerpo reservado, sin depender de la UI. La suite en curso precede este refuerzo y no podrá presentarse como su cierre.
Refuerzo F08 posterior a la auditoría de permisos: getter/aprobación SQL 011 y wrapper/trigger de consumo exigen Auth original cuando existe preparación 012. No basta el filtro del historial. Helper privado revocado a todos los roles externos; compatibilidad 011 antes de tabla 012 comprobada tanto en PGlite como PostgreSQL. Petición directa con UUID conocido y Auth reasignado rechazada. Una revisión histórica sintética del Auth ajeno tampoco habilita consumo. Vigencia se evalúa después de los locks y del nuevo guard.

Cliente fija Authorization al token de la sesión que comprobó, en vez de permitir que el SDK seleccione otra cuenta entre getSession e invoke. Token sólo en memoria: no entra a almacenamiento, UI ni logs. Se verificó en el código instalado de FunctionsClient la precedencia de headers explícitos. Sin token de esa sesión no se envía la petición.

Evidencia posterior: 203 PASS dirigidas / 9 archivos; PostgreSQL 32 escenarios PASS (fiscal-sale-resolution-original-actor-concurrency-20261022.json), contenedor propio detenido con datos conservados. Suite global anterior a este guard: 2847 PASS / 1 skipped / 247 archivos (pilot-fiscal-sale-resolution-suite-results.json), no es el cierre del refuerzo. Se conservan la regresión roja de acceso directo y un pase intermedio fallido por referencia de trigger situada en otra función; corregida su ubicación y repetidas las pruebas. Build final del token y suite posterior aún pendientes de cierre.

Escaneo final: 1233 archivos, 48 candidatos; único delta frente a 47 es src/test/fiscalBrowserClient.test.ts:9, asignación explícita de token SINTÉTICO de fixture, revisada como no real. No se ocultó ni ofuscó el candidato. Ninguna credencial real nueva incorporada; claves/certificados originales no usados. Gates remotos/primera emisión permanecen cerrados y F08 continúa parcial por numeración/cuerpo/constancia/rechazos y aceptación.
Pendiente de corrección antes de activar F08: cliente conserva datos antes de POST y trata el error de servidor como incierto. Si los importes tienen formato válido pero no suman el total, la validación servidor rechaza antes de guardar y el pendiente local impide corregir el cuerpo. Añadir validación fiscal pública previa al almacenamiento (reutilizando reglas puras sin importar transporte/TA/custodia al frontend) y definir recuperación/edición tras rechazo definitivo sin descartar una escritura incierta. Mantener prueba de repro de ese caso y no borrar/cambiar UUID a ciegas. Este caso y la consulta privada de numeración bloquean la activación; el flag sigue inicialmente apagado y el incremento no se despliega en este bloque.
Cierre integrado posterior a todos los refuerzos de este incremento: 2850 PASS / 1 skipped / 247 archivos, salida 0 (pilot-fiscal-sale-resolution-original-actor-suite-results.json). La única omitida sigue siendo fixture F6 no configurada; ninguna fiscal nueva omitida. 203 dirigidas / 9 archivos, 32 escenarios PostgreSQL y build final 642 módulos PASS. Manifiesto histórico 43 SQL y diff PASS; oxlint de archivos nuevos/fiscales dirigido sin hallazgos, advertencias preexistentes en efectos de Modal/Historial y finally del runner conservadas. Escaneo 1233 archivos/48 candidatos: único delta es token explícitamente sintético de fixture, no credencial real. Entradas privadas SQL/worker ausentes del bundle. Este cierre reemplaza resultados previos/en curso para el incremento, sin cerrar F08: corrección de datos rechazados, numeración privada/orquestación, constancia, rechazos/NC y aceptación siguen pendientes antes de activar. No deploy frontend ni instalación SQL/Edge; no llamadas ARCA autenticadas, CAE, merge ni cambios en master/Production.
F08 continuación: separar validación de contrato fiscal de transporte SOAP (sin red/TA/custodia en navegador). Reutilizar exactamente preparación pura en formulario y frontera cliente antes de persistir el primer UUID/cuerpo. Rechazo local debe permitir corregir campos sin pendiente ni POST. Un pendiente ya enviado conserva cuerpo/UUID; no se valida contra catálogo cambiado para reemplazarlo ni se borra automáticamente. Resolver aún cancelación/rechazo definitivo de intentos persistidos mediante contrato auditable, no mediante borrado local. Probar suma/IVA/documento/período incorrectos y corrección posterior, además de ACK perdido y bundle sin transporte privado.
F08 siguiente bloque autorizado sólo para desarrollo/pruebas: SQL 013 carga preparación privada por operación con Auth original, snapshot, emisor y catálogo vigentes; si ya existe cuerpo, recuperarlo antes de TA/red. Worker privado de reserva construye cuerpo sólo tras FECompUltimoAutorizado, con gate independiente ARCA_HOMO_PREPARATION_ENABLED inicialmente cerrado. Revalidar antes de consultar y persistir con wrapper 012; reintento/ACK perdido recupera mismo cuerpo, sin FECAESolicitar ni aprobación automática. HTTP/UI nuevo paso PREPARAR_COMPROBANTE sólo devuelve revisión pública. Cualquier consulta WSAA/WSFE real conserva autorización específica pendiente; no instalar/habilitar para probar. Verificar flag/cuenta/metadatos, dos trabajadores, último número/overflow, ACK perdido y ausencia de envío fiscal.
### 22/10/2026 — F08: validación previa y primera preparación de cuerpo, sólo local

Se separa fiscalEmissionContract (reglas puras de cuerpo) del transporte fiscalWsfeEmission. Formulario y cliente reutilizan prepareFiscalData antes de crear primer UUID/cuerpo local. Suma/documento/período/desglose inválidos pueden corregirse sin pendiente ni POST; otro envío simultáneo reusa identidad después de la validación asíncrona y una mutación del llamador no altera la copia validada. Pendiente incierto ya existente mantiene cuerpo/UUID y no se sustituye ni borra. Rechazo definitivo posterior al envío aún requiere contrato auditable de resolución/cancelación.

SQL 013 carga fuente privada vinculada a Auth original, snapshot, emisor y catálogo; cuerpo existente se recupera antes de TA/red, incluso con gate de preparación cerrado. Sin body sólo lee datos explícitos guardados. Worker prepareFiscalVoucher valida canónico/hash/contexto, exige ARCA_HOMO_PREPARATION_ENABLED=true (no configurado/habilitado), carga TA mediante custodia/caché existentes y sólo consulta FECompUltimoAutorizado. Revalida origen justo antes de red, agrega número observado+1 y persiste mediante wrapper 012. Éxito exige leer cuerpo durable; ACK falso/sin commit no confirma. ACK perdido/concurrencia recupera mismo cuerpo; no FECAESolicitar, aprobación, permiso privado ni movimiento venta/stock/caja. Overflow y cambios de actor/emisor se rechazan.

Contexto 012 rechaza devolución previa antes de cargar TA/consultar numeración (guard 010 en reserva sigue vigente). Se observa también devolución que gana el lock mientras fuente espera. HTTP/UI PREPARAR_COMPROBANTE conduce de datos guardados a revisión del cuerpo reservado; fuente privada/custodia nunca se retornan al cliente. Frontend tiene timeout acotado de 40s para ese paso, conserva sesión fijada y recupera por operación ante respuesta incierta. Flag frontend y gate privado siguen apagados; no se usaron claves originales ni se consultó ARCA realmente.

Pase dirigido actual: 264 PASS / 9 archivos. PostgreSQL 17.11 local: 34 escenarios PASS en fiscal-body-preparation-concurrency-final-20261022.json; contenedor propio detenido, datos conservados. Primer intento no arrancó por Docker detenido, preservado como FAIL/cero casos; motor per-user reabierto Hidden y ensayos posteriores separados. Se conservan fallo inicial TypeScript por import de tipo removido y fixture de devolución sin Auth; corregidos sin debilitar permisos. Build final PASS 644 módulos, manifiesto histórico 43 SQL y diff PASS, oxlint dirigido sin hallazgos. Escaneo 1236 archivos/48 candidatos, delta cero frente al cierre anterior (token sintético ya documentado). Consulta/transporte/entradas privadas ausentes del bundle; sólo validación pura se comparte.

Estado: la unión local datos→fuente→consulta simulada→cuerpo durable→revisión está preparada y probada; no acredita gateway Edge nuevo ni JWT/RLS/ARCA hospedados. SQL 001–013 y Edge sin instalar/activar; cero nuevas consultas autenticadas/emisiones reales o deploy frontend. F08/PR03 aún parcial: cancelación/rechazos posteriores a envío, constancia completa/NC, catálogo/punto/custodia reales y aceptación hospedada/visual permanecen gates. Envases descontados siguen pendientes del contador. Production/master intactos, sin merge; impresora/cajón y Point diferidos. La suite global 2850 anterior no es cierre de este incremento: falta el pase global actual.
Cierre integrado de este incremento F08: 2876 PASS / 1 skipped / 247 archivos, salida 0 (pilot-fiscal-body-preparation-suite-results.json). La única omitida sigue siendo fixture F6 no configurada; ninguna fiscal nueva omitida. 264 dirigidas / 9 archivos, 34 escenarios PostgreSQL y build final 644 módulos PASS. Oxlint dirigido sin hallazgos, manifiesto histórico 43 SQL y diff PASS. Escaneo 1236 archivos/48 candidatos, delta cero; candidato sintético previo conservado. Consulta, gate y transporte privados ausentes del bundle. Sustituye los estados de suite en curso/2850 previo para este incremento. No se desplegó frontend ni se instaló SQL/Edge; no TA real, consulta ARCA autenticada, emisión ni merge. F08/PR03 no se da por completado: quedan resolución auditable de rechazos/incertidumbre, constancia/NC, provisión y aceptación hospedadas con sus autorizaciones, además de los gates comerciales/Production.
### 22/10/2026 — F08: constancia fiscal recuperable, siguiente incremento

Contexto verificado: HEAD 3a3cfd3 conserva estado AUTORIZADA y revisión del cuerpo, pero no ofrece constancia completa. Plan incremental: (1) contrato público cerrado de constancia vinculado a operación, venta y hash del cuerpo, validando CAE/vencimiento sin interpretar aprobación como autorización; (2) getter privado con Auth original y registro durable, sin TA/red ni dependencia de catálogo vigente para lectura histórica; (3) servicio/HTTP/cliente y presentación en modal; (4) pruebas de aislamiento, datos alterados, recuperación histórica y respuestas tardías. Reutilizar reglas puras de conciliación, sin importar transporte/custodia en navegador. No construir constancia desde campos heredados ni desde un ACK de aprobación. No instalar SQL/Edge ni habilitar flags. Esta entrada inicia el trabajo: no acredita getter, UI, autenticidad remota ni CAE real. Envases descontados siguen pendientes de definición del contador.

Avance local del contrato de constancia (sin conectar todavía al getter/HTTP/UI): fiscalReceipt valida DTO cerrado HOMOLOGACION/AUTORIZADA, operación y venta esperadas, hash del cuerpo, CAE no nulo y fechas mediante las reglas puras de conciliación existentes. Copia/congela datos y captura identidad/valores antes de awaits; rechaza metadatos privados, aprobación sola, estado incierto, cuerpo alterado y fechas imposibles. Recuperación histórica no exige vigencia actual del CAE ni inventa fecha de proceso. La validez estructural del DTO NO autentica ARCA: el getter futuro debe obtener estos campos del ledger privado y aplicar Auth original. No se generó una constancia desde una respuesta candidata ni desde campos heredados.

Validación de este paso: 88 PASS dirigidas / 2 archivos (pilot-fiscal-receipt-contract-targeted-final.log), build PASS, oxlint dirigido sin hallazgos y diff sin errores. Escaneo 1238 archivos/48 candidatos, sin aumento frente al cierre 3a3cfd3. No suite global nueva ni escenarios PostgreSQL nuevos porque aún no hay cambio SQL ni integración de ejecución; 2876/34 previos siguen siendo evidencia del incremento anterior. Pendientes del mismo plan: getter privado, enlace HTTP/cliente/modal y sus pruebas; no dar constancia completa por implementada ni activar flags. Sin deploy, instalación, tráfico ARCA, CAE real o cambios master/Production.

### 22/10/2026 — F08: recuperación privada de constancia e integración en modal

SQL 014 agrega cargar_constancia_fiscal_homologacion, sólo service_role: gate activo de Dueño/comercio/venta, operación vinculada y Auth original explícito en preparación 012. Lectura exige cuerpo/reserva/ledger autorizados, intento/hash/revisión y ACK exactos coherentes. No usa custodia, TA, catálogo ni emisor vigente para recuperar autorización histórica; no atribuye operaciones heredadas sin Auth original probado. Mantiene orden de locks perfil→comercio→venta→operación. No toca venta, stock, caja, permisos ni numeración. Reutiliza las tablas privadas existentes sin nuevos grants de lectura de tablas.

Servicio obtiene Auth.getUser una vez y conserva ese actor hasta getter; valida DTO cerrado y hash/CAE/fechas antes de responder. CONSTANCIA_COMPROBANTE exige venta y operación (2KiB), conserva origen/host/flag cerrados y no llama red fiscal. SDK privado limita acceso a Auth y 19 RPC explícitas. Cliente coteja venta/operación y no persiste constancia ni datos del receptor. AUTORIZADA en modal carga constancia separada de aprobación/revisión; muestra CAE, vencimiento, emisor/número/receptor/importes/desglose y aviso de homologación sin validez fiscal. Si falla lectura, conserva estado autorizado y permite consulta, sin preparar otra factura. Respuestas tardías no aparecen en otra venta. No se integra todavía con representación fiscal final/PDF/QR ni se completan datos legales del emisor desde defaults actuales: esa constancia es una vista del ledger de homologación, no acredita un comprobante real.

Pruebas dirigidas: 249 PASS / 8 archivos (pilot-fiscal-receipt-integration-targeted-final.log). PostgreSQL 17.11: 36 escenarios PASS (fiscal-receipt-integration-concurrency-20261022.json), incluidos lectura mientras cierre atómico espera commit y Auth reasignado durante espera; contenedor propio detenido, datos conservados, externos/emisiones cero. Ensayo inicial tuvo dos fixtures inválidas (intento de modificar venta protegida y SuperAdmin con comercio), corregidas respetando guards, sin relajar producción; el log fallido se conserva. Build final PASS 646 módulos, manifiesto 43 SQL y diff PASS. Oxlint dirigido sin nuevos hallazgos; warning no-unsafe-finally preexistente del runner conservado. Escaneo 1241 archivos/48 candidatos, delta cero. Entradas SQL/consulta/custodia privadas ausentes del bundle público. Suite global actual en curso; todavía no atribuir 2876 anterior al cierre nuevo.

PR03/F08 sigue PARCIAL: quedan resolución auditable de rechazos definitivos/incertidumbre tras envío, cancelación/NC, representación fiscal final cuando proceda, parámetros/PV/custodia reales y aceptación hospedada/visual con JWT/RLS/E2E. SQL 001–014 y Edge preparados, NO instalados ni habilitados; flags apagados, sin deploy frontend ni consultas ARCA autenticadas/emisión real. PR02 sin CAE real. Envases descontados del ticket pendientes del contador; impresora/cajón y Point diferidos. Master/Production intactos, sin merge. Recuperación integral de respaldo continúa bloqueada hasta instalación/aceptación autorizadas.

Cierre integrado de este incremento F08: 2926 PASS / 1 skipped / 248 archivos, salida 0 (pilot-fiscal-receipt-integration-suite-results.json). La única omitida sigue siendo f6-2d-c3c2-enrichment por fixture de candidatos no configurada; ninguna fiscal nueva omitida. 249 dirigidas / 8 archivos y 36 escenarios PostgreSQL PASS, build final 646 módulos PASS. Manifiesto histórico 43 SQL, diff y revisión de bundle PASS; oxlint sin nuevos hallazgos, warning de finally preexistente documentado. Escaneo 1241 archivos/48 candidatos, delta cero. Este cierre sustituye las referencias anteriores a suite en curso para este incremento; no convierte evidencia sintética local en aceptación JWT/RLS/ARCA hospedada. Flags siguen apagados y SQL 001–014/Edge sin instalar/activar. Sin nuevas consultas ARCA autenticadas, emisión, deploy frontend, merge ni cambios master/Production. Próximo gate local: registrar y resolver rechazos/incertidumbre de manera auditable conservando cuerpo/intento y sin liberar reservas por una respuesta aislada; después cancelación/NC y demás dependencias de aceptación.

### 22/10/2026 — F08: auditoría durable de respuesta de emisión, inicio

Situación: sendFiscalEmission clasifica aprobación/rechazo/códigos, pero el worker descarta esa recepción y sólo concilia. Próximo incremento: contrato puro cerrado y ledger privado append-only por operación/intento/hash/Auth original de la revisión consumida; escritura idempotente más lectura durable para recuperar ACK perdido. Registrar sólo la clasificación/códigos validados, nunca SOAP, TA ni un CAE candidato como autorización. Un resultado distinto para la misma identidad se rechaza sin sobrescribir. El registro puede completar la evidencia tras revocación/expiración posterior al envío ya concedido, usando vínculos históricos del permiso/revisión (no habilita otra emisión ni acceso de otra cuenta). Conciliar sigue obligatorio; fallo de auditoría no debe impedir la consulta de reconciliación ni mostrarse como éxito completo. Sin respuesta recibida por timeout no inventar un rechazo. Probar permisos, identidad original/reasignación, ACK perdido/falso, concurrencia y conservación de reserva/stock/caja. La resolución/corrección definitiva y cancelación/NC continúan después: registrar un rechazo aislado no libera número. SQL/Edge/flags no se instalan/activan ni se llama ARCA real.

### 22/10/2026 — F08: recepción de emisión privada e inmutable, implementación local

SQL 015 agrega fiscal_respuestas_emision_homologacion, tabla privada RLS sin grants de tabla/columnas y trigger que rechaza UPDATE/DELETE. Clave operación/intento; respuesta cerrada contiene sólo clasificación, hasta 200 códigos enteros (errores + observaciones) y puedeReenviar=false. No almacena SOAP, mensajes libres, TA, CAE candidato ni credenciales. Helper privado exige intento durable, hash exacto, permiso consumido y revisión de Auth original; también guard de preparación 012 cuando existe. No deriva Auth del perfil actual. Cambios posteriores del perfil/emisor, revocación o expiración no conceden otro envío ni impiden conservar evidencia de uno ya autorizado. Este getter de evidencia es sólo para trabajador privado: NO reutilizar como ruta pública sin gate activo de Dueño/comercio/venta.

Escritura idempotente devuelve el mismo registro; respuesta distinta para el mismo intento falla cerrada sin sobrescribir. Persistencia siempre relee DB después del intento de escritura: ACK perdido se recupera, ACK falso/sin commit no confirma. SDK amplía allowlist a 21 RPC, sin acceso genérico a tablas. Worker conserva la clasificación válida de sendFiscalEmission y registra antes de reconciliar; si registrar no se confirma, igual intenta consulta íntegra y luego informa FISCAL_RESPUESTA_NO_CONFIRMADA. Un CAE real guardado por la conciliación no se deshace por ese fallo; la evidencia faltante sigue siendo deuda auditable. Reintento de operación ya enviada sólo concilia, no repite POST para reconstruir recepción perdida. Timeout/parseo fallido sin recepción válida no inventa rechazo. Una respuesta R y una autorización posterior por consulta íntegra quedan como evidencias separadas, sin sobrescribir la recepción anterior.

Pruebas dirigidas actuales: 202 PASS / 5 archivos (pilot-fiscal-emission-audit-targeted-final.log). SQL 001–015 aplicado dos veces en fixtures embebidas. PostgreSQL 17.11 local: 38 escenarios PASS (fiscal-emission-audit-concurrency-20261022.json), incluidos dos auditores/replay tras ACK perdido y recepción contradictoria después de esperar lock. Contenedor propio detenido con datos conservados, sin externos/emisiones. Build PASS 646 módulos; manifiesto histórico 43 SQL y diff PASS. Oxlint sin nuevos hallazgos; warning no-unsafe-finally preexistente del runner conservado. Escaneo 1245 archivos/48 candidatos, delta cero frente al cierre anterior. Suite global de este incremento en curso: 2926 anterior no es cierre nuevo.

PR03/F08 sigue PARCIAL. Registrar recepción no resuelve un rechazo definitivo, no corrige cuerpo, no libera número y no concede reenvío/cancelación. Falta diagnóstico público con gate activo, resolución auditable de rechazos/incertidumbre, corrección/cancelación/NC y representación fiscal final, además de parámetros/PV/custodia y aceptación hospedados. SQL 001–015 y Edge sin instalar/habilitar; ninguna acción HTTP de emisión, flags apagados, sin consultas ARCA autenticadas, CAE real ni deploy frontend. Master/Production sin cambios, sin merge. Envases descontados pendientes del contador, restauración integral bloqueada e impresora/cajón/Point diferidos.

Cierre integrado de auditoría de recepción F08: 2979 PASS / 1 skipped / 249 archivos, salida 0 (pilot-fiscal-emission-audit-suite-results.json). Única omitida f6-2d-c3c2-enrichment por fixture no configurada; ninguna fiscal nueva omitida. 202 pruebas dirigidas / 5 archivos y 38 escenarios PostgreSQL PASS; build final de código de producción 646 módulos PASS. Oxlint sin nuevos hallazgos, warning de finally preexistente conservado; manifiesto histórico 43 SQL, diff y bundle privado PASS. Escaneo 1245 archivos/48 candidatos, delta cero. Este cierre reemplaza referencias de suite en curso para este incremento; no atribuye pruebas locales sintéticas a JWT/RLS/ARCA hospedados. El nuevo registro sólo cierra auditoría local de recepción, no el gate de resolución/corrección/cancelación/NC. Próximo bloque: diagnóstico público protegido por Dueño activo/comercio/venta y resolución auditable que no acepte una respuesta aislada para liberar/reemitir. SQL 001–015/Edge sin instalar/activar en remoto, sin nuevas consultas ARCA autenticadas ni CAE real, deploy frontend, merge o cambios master/Production. Permanecen los diferidos y dependencias documentados.

### 22/10/2026 — F08: diagnóstico público protegido, inicio

Próximo incremento: SQL 016 getter específico para Dueño activo ordinario/comercio/venta y Auth original de preparación 012, sin reutilizar el getter histórico de trabajador 015 como permiso de UI. DTO cerrado por venta/operación/hash/estado con recepción clasificada y última decisión de conciliación, sin TA, binding, permiso, mensajes libres ni CAE candidato. HTTP/cliente/modal mostrarán evidencia disponible, distinguirán recepción de autorización y ausencia de respuesta de rechazo. Consulta sólo DB, sin renovar TA ni llamar ARCA; no habilitar botón de reenvío/cancelación. AUTORIZADA exige ledger/constancia coherentes, conserva estado si falla diagnóstico y no se degrada por respuesta antigua. Preservar selección/cierre ante respuestas tardías. Probar aislamiento de Auth/comercio/roles, estado mutable durante espera, DTO/correlación, fallos parciales y presentación. Resolución/corrección/cancelación/NC siguen después; flags y gates remotos permanecen cerrados.

### 22/10/2026 — F08: diagnóstico del Dueño integrado, sólo local

SQL 016 incorpora cargar_diagnostico_fiscal_homologacion con gate activo ordinario de Dueño/comercio/venta y Auth original de preparación 012. No reutiliza el permiso histórico del worker 015 para exponer evidencia a UI. Coteja cuerpo/reserva/preparación y, para AUTORIZADA, exige la constancia durable coherente de 014. Devuelve DTO cerrado con venta/operación/hash/estado, recepción clasificada y última decisión de conciliación; no incluye intento privado, permisos, binding, TA, CAE candidato ni mensajes libres. Última consulta se ordena por timestamp/id; su decisión no degrada el estado autorizado del ledger. Sin catálogo/emisor habilitados puede recuperar diagnóstico histórico, pero comercio suspendido, perfil inactivo/ajeno/reasignado no acceden.

DIAGNOSTICO_COMPROBANTE comparte límites de consulta 2KiB, CORS/host/flag privados y Auth.getUser verificado una vez. Servicio reutiliza lectura cerrada de documentos con dos RPC explícitas (constancia/diagnóstico), sin acceso genérico. Allowlist SDK privado ahora 22 RPC. Cliente coteja venta/operación y no persiste el diagnóstico. Frontend sólo importa contratos/validadores puros, sin transporte/custodia.

Modal muestra recepción y última consulta por separado: ausencia de recepción no afirma rechazo; aprobación recibida no equivale a CAE conciliado. Códigos se muestran como números sin inventar descripciones ARCA. Si durante diagnóstico se confirma AUTORIZADA, carga constancia en vez de abrir revisión. Un resultado atrasado no degrada AUTORIZADA; revisión reservada obsoleta o hash diferente no abre aprobación. Fallo de diagnóstico se informa sin ocultar una constancia válida, y cambio/cierre de venta descarta respuestas tardías. Se reutilizan Modal/estilos existentes, sin nuevos botones de reenvío/cancelación ni cambios de tema.

Evidencia dirigida actual: 295 PASS / 8 archivos (pilot-fiscal-diagnosis-targeted-final.log). Primera ejecución SQL falló por CASE sin agrupar dentro de IF; se conserva log con suite SQL que no pudo inicializar. Se corrigió sintaxis y el pase posterior ejecutó todos los casos, sin omisiones fiscales. PostgreSQL 17.11 local: 40 escenarios PASS (fiscal-diagnosis-concurrency-20261022.json), incluidos diagnóstico durante cierre y Auth reasignado mientras lectura espera. Contenedor propio detenido y datos conservados; cero externos/emisiones. Build final PASS 649 módulos; manifiesto histórico 43 SQL y diff PASS. Oxlint sin nuevos hallazgos, warning de finally preexistente del runner documentado. Escaneo 1249 archivos/48 candidatos, delta cero. Getters SQL, transporte/numeración y gates privados ausentes del bundle. Suite global actual en curso: 2979 previo no es cierre de este incremento.

PR03/F08 sigue PARCIAL: el diagnóstico hace visible la evidencia, pero no resuelve ni corrige rechazo definitivo, cancela operación o libera numeración. Siguientes gates: resolución/corrección/cancelación/NC con historial y protección frente a peticiones tardías, representación fiscal final, provisión/PV/parámetros reales y aceptación hospedada/visual JWT/RLS/E2E. SQL 001–016/Edge sólo preparados para instalación remota autorizada; flags apagados, sin deploy frontend ni nuevas consultas ARCA autenticadas, CAE real, merge o cambios master/Production. Envases descontados pendientes del contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre integrado de diagnóstico F08: 3031 PASS / 1 skipped / 250 archivos, salida 0 (pilot-fiscal-diagnosis-suite-results.json). Única omitida f6-2d-c3c2-enrichment por fixture no configurada; ninguna fiscal nueva omitida. 295 dirigidas / 8 archivos, 40 escenarios PostgreSQL y build final 649 módulos PASS. Manifiesto histórico 43 SQL, diff y bundle privado PASS; oxlint sin nuevos hallazgos, warning preexistente de finally conservado. Escaneo 1249 archivos/48 candidatos, delta cero. Sustituye las referencias de suite en curso de este incremento sin dar por acreditados JWT/RLS/ARCA/visual hospedados. Diagnóstico local cerrado, PR03/PR02 siguen parciales por resolución/corrección/cancelación/NC, representación fiscal final, provisión/PV y aceptación. SQL 001–016/Edge sin instalar/activar remotamente; sin deploy frontend, nueva consulta ARCA autenticada, CAE real, merge ni cambios master/Production. Próxima implementación debe conservar identidad/historia y bloquear peticiones tardías al resolver intentos, sin liberar números a partir de recepción aislada.

### 22/10/2026 — F08: cancelación previa a numeración y corrección, inicio

Problema: un guardado incierto o datos preparados inválidos por cambios de contexto pueden impedir corregir. Diseño completo: conservar cancelación durable por UUID original (incluso si el guardado aún no llegó), retirar únicamente la operación activa sin cuerpo/reserva y permitir nueva preparación con otra identidad; cualquier petición tardía del UUID cancelado debe fallar antes de crear/reservar. Preservar snapshot/factos/auditoría anteriores, no borrar ni reutilizar UUID. Cambiar unicidad de operación por venta a única activa PREPARADA, con CANCELADA auditada y transición irreversible; resolver por venta sólo ve activa. Gate de Dueño activo/comercio/venta/Auth original y ausencia absoluta de solicitud/reserva. Cancelación no requiere emisor/catálogo vigente y no cancela número, envío, venta ni dinero. Auditar también entrada heredada 001 y helper de reserva 002 para no reactivar por otros caminos.

Primer incremento: SQL 017, guards y pruebas reales de ambos órdenes guardado/cancelación y reserva/cancelación, replay/ACK perdido, Auth/roles, historial y nueva preparación. Luego integración HTTP/cliente/modal, confirmación explícita y recuperación tras ACK perdido antes de descartar pendiente local; esa integración forma parte del alcance y no se dará por terminada con sólo SQL. Intentos con reserva/envío/CAE, corrección fiscal posterior, notas de crédito y autorización/aceptación remotas mantienen sus gates independientes. Sin instalar SQL/Edge ni habilitar flags/consultas ARCA.

### 22/10/2026 — F08: base de cancelación sin número, implementación local

SQL 017 agrega auditoría privada inmutable por UUID, venta/comercio/usuario/Auth y origen SIN_GUARDADO o DATOS_PREPARADOS. Puede cerrar una identidad antes de que llegue el POST original; el trigger de creación rechaza el UUID cancelado incluso por entrada heredada. Operaciones preparadas sin cuerpo/reserva pasan irreversiblemente a CANCELADA y conservan snapshot/contexto/hechos. Un índice parcial garantiza una sola PREPARADA por venta/entorno sin borrar las canceladas. Las funciones actualizadas 001/012 sólo seleccionan activa, y helper 002 exige PREPARADA tras obtener locks para impedir que un worker tardío reserve. 001/012/017 usan lock transaccional por UUID global antes de bloquear operación, también entre ventas/comercios diferentes. No cambia numeración ni toca venta/stock/caja. Si ya existe solicitud o reserva, se rechaza cancelación aun sin envío/CAE.

Cancelación/consulta requieren Dueño activo ordinario y comercio/venta. Con preparación persistida se exige Auth original; operación heredada sin hechos 012 no se atribuye ni cancela automáticamente. Replay devuelve el mismo ACK aun si después hay otra operación activa de esa venta. La lectura confirma coherencia de auditoría/estado/hechos y ausencia de cuerpo/reserva; actualización RETURNING y lectura posterior impiden ACK falso si otro trigger omite/revierte cambio. Contexto/emisor/catálogo vencido no impiden cancelar una preparación legítima sin número. Reactivar, alterar snapshot/identidad o borrar historial se rechazan. Sin filas/flags de provisión ni cambios de permisos de emisión.

Dependencia de instalación: SQL 017 requiere las funciones 001,002,012 actualizadas de esta misma revisión; no aplicar 017 aislado sobre las versiones previas. La familia fiscal sigue sin instalar en remoto y su futuro gate debe verificar versiones/hashes y autorización antes de aplicar el conjunto. Reaplicación 017 sobre cancelación + nueva preparación preservó datos/índice activo en el ensayo.

Evidencia dirigida actual: 289 PASS / 4 archivos (pilot-fiscal-preparation-cancel-targeted-final.log). Primera regresión por columna estado ambigua en resolver 012 se conserva y quedó corregida calificando columna, sin relajar permisos. PostgreSQL 17.11 local: 47 escenarios PASS finales (fiscal-preparation-cancel-concurrency-final-20261022.json), incluidos ambos órdenes cancelación/guardado/reserva, UUID global entre ventas en ambos órdenes y dos cancelaciones mismo ACK. Primer pase 47 también PASS; el final incorpora confirmación reforzada de estado/lectura. Contenedores propios detenidos, datos conservados, externos/emisiones cero. Build PASS 649 módulos, manifiesto histórico 43 SQL y diff PASS. Oxlint sin nuevos hallazgos; warning preexistente de finally del runner conservado. Escaneo 1250 archivos/48 candidatos, delta cero. Suite global actual en curso: 3031 anterior no es cierre nuevo.

Alcance aún pendiente: conectar estas RPC a servicio/HTTP/cliente/modal con confirmación humana, recuperación durable tras ACK perdido y retiro seguro del pendiente local; sólo SQL no cierra el flujo de cancelación/corrección. UI/SDK actuales no llaman las RPC nuevas. Cancelación de cuerpo/número, envío incierto, rechazo definitivo posterior a emisión y notas de crédito conservan sus gates. PR03/F08 parcial, PR02 sin CAE real. SQL 001–017/Edge sin instalar/activar remotamente, sin deploy frontend ni nuevas consultas ARCA autenticadas, merge o cambios master/Production. Envases descontados pendientes del contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre recuperado del incremento SQL de cancelación: informe completo 3048 PASS / 1 skipped / 250 archivos y success=true (pilot-fiscal-preparation-cancel-suite-results.json). Única omitida fixture F6 no configurada, ninguna fiscal nueva omitida. La aprobación automática falló temporalmente por límite de uso después de arrancar la suite; no se ejecutó la comprobación rechazada ni se eludió el gate. Al continuar, el handle 98929 ya no existía: se recuperó el informe escrito y el log final, sin reiniciar la suite ni inventar código de salida del handle perdido. 289 dirigidas y 47 PostgreSQL finales PASS, build 649 PASS, manifiesto/diff y escaneo 1250/48 sin delta. Sustituye referencias a suite en curso para este incremento, no el estado parcial de integración. SQL/Edge sin instalar remotamente, ningún tráfico ARCA real ni deploy. Falta integrar servicio/HTTP/cliente/modal y retiro seguro de pendiente antes de considerar completo el flujo de cancelación previa a número.
