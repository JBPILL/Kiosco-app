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

### 22/10/2026 — F08: integrar cancelación confirmada y retiro seguro del pendiente

Continuación del flujo completo: servicio y HTTP con Auth original verificado una sola vez por acción y lectura durable tras escritura (ACK perdido/falso), cliente que conserva UUID ante incertidumbre y sólo retira el pendiente local después de leer cancelación confirmada. Serializar escrituras de preparación/resolución/cancelación por Auth/comercio/venta: Web Locks en navegador y cola por almacenamiento/scope para tests; no borrar una identidad nueva de otra pestaña ni dejar datos del receptor después de confirmar retiro. Navegador sin soporte de lock falla antes de mutar/enviar este flujo fiscal, sin bloquear POS. Confirmación explícita en modal sólo para datos sin cuerpo/número o guardado local pendiente; revisión/envío/CAE no ofrecen esa acción. Probar pérdida de ACK, fallo de almacenamiento, dos instancias, respuesta tardía y corrección con UUID nuevo. Activación hospedada incluye compatibilidad de pestañas/versiones y Web Locks; flags siguen cerrados. La integración no cancela reservas/envíos ni resuelve rechazos fiscales posteriores.

### 22/10/2026 — F08: cancelación/corrección sin número integrada, validación local

Contrato público cerrado de cancelación (venta/operación/CANCELADA/emisión false) compartido por servidor y cliente, sin imports de custodia/transporte al navegador. Servicio valida Auth.getUser una vez por acción y conserva ese actor en escritura + lectura durable; ACK perdido se recupera y ACK falso/sin registro no confirma. Si Auth se reasigna entre ambos pasos, la lectura no adopta al perfil nuevo. Acciones CANCELAR_PREPARACION_FISCAL y CANCELACION_PREPARACION_FISCAL limitadas a 2KiB con gate existente de host/origen/flag. SDK privado ahora 24 RPC explícitas. No se carga TA, custodia ni red fiscal para cancelar o consultar cancelación.

Cliente serializa guardar, resolver, preparar cuerpo y cancelar por Auth/comercio/venta. Adaptador navegador exige Web Locks y revalida flag antes de ejecutar tarea; sin soporte falla antes de mutar/enviar esos métodos, POS general permanece separado. Cola por almacenamiento/scope en runtime de pruebas valida dos instancias. Input/contexto se copian antes de esperar; identidad Auth inicial de navegador queda capturada por valor para no adoptar otra cuenta si el objeto scope se muta. La sesión comprobada sigue fijada por header y no se almacena. Guardados simultáneos coordinados no envían POST paralelo ni crean identidad nueva después de confirmar la primera; un intento incierto conserva UUID y datos para replay.

Tras cancelar, se relee cierre durable antes de retirar sólo el pendiente local cuyo UUID coincide, bajo el mismo lock. Navegador usa removeItem con verificación de ausencia; adaptadores de prueba sin removeItem admiten marcador null. Conserva otras claves/preparaciones y retira datos del receptor. ACK perdido o error de almacenamiento no habilita identidad nueva. Resolver al reabrir recupera cancelación del pendiente original antes de volver a formulario; corrección crea UUID diferente. Una cancelación tardía de UUID anterior no borra el de la preparación nueva de otra instancia. No se descartan pendientes a ciegas.

Modal reutiliza componentes/estilos existentes. Confirmación explícita de cerrar intento sólo para DATOS_PREPARADOS o guardado local pendiente sin preparación recuperada; no ofrece acción en revisión con cuerpo/número, envío incierto o autorización. Explica que historial/venta/cobro se conservan, deshabilita acciones incompatibles y descarta respuestas tardías al cambiar/cerrar venta. Tras cierre confirmado consulta estado y carga datos explícitos de nuevo; incertidumbre conserva intento y permite consulta. Se mantiene validación fiscal sin defaults heredados de IVA/PV/fecha. Snapshot cambiado o identidad sin probar siguen requiriendo revisión manual, no cancelación inferida.

Evidencia actual: 322 PASS dirigidas / 8 archivos (pilot-fiscal-cancellation-ui-targeted-final.log), incluidos servicio+SQL con ACK perdido/reasignación, HTTP, cliente, navegador y modal. Backend SQL sin cambios desde e19537e: evidencia PostgreSQL final de 47 escenarios conservada, no se presenta como nueva ejecución Web Locks hospedada. Build final PASS 651 módulos, manifiesto histórico 43 SQL y diff PASS, oxlint dirigido sin hallazgos. Bundle público no contiene entradas SQL/custodia/gates de emisión privados. Escaneo 1254 archivos/49 candidatos: delta único en src/test/fiscalBrowserClient.test.ts:65, access_token explícitamente SINTÉTICO de fixture de mutación de scope; revisado no real y no se ocultó/ofuscó para cambiar el escaneo. Candidato previo está ahora en línea 10 por cambio de fixture. Suite global de este incremento en curso: 3048 previo no es cierre de integración.

Aceptación pendiente: navegador compatible con Web Locks y versiones/pestañas actualizadas, prueba real de dos ventanas/perfil, JWT/RLS/gateway y visual en comercio aislado de Staging antes de activar flag. SQL 001–017 (con 001/002/012 de esta revisión) y Edge sin instalar/activar remotamente, ningún deploy frontend, nueva consulta ARCA autenticada, CAE real, merge o cambio master/Production. PR03/F08 sigue parcial por resolución/corrección posterior a cuerpo/numeración/envío, rechazo definitivo/NC, representación fiscal final, provisión/PV/parámetros y aceptación hospedada. Envases descontados pendientes del contador, impresora/cajón/Point diferidos y restauración integral bloqueada.

Cierre integrado de cancelación/corrección sin número: 3086 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-fiscal-cancellation-ui-suite-results.json). Única omitida fixture F6 no configurada, ninguna fiscal nueva omitida. 322 dirigidas / 8 archivos y build final 651 módulos PASS. La evidencia SQL nativa final de 47 escenarios sigue aplicable al backend e19537e sin cambios en este incremento; no se declara una ejecución real de Web Locks/ventanas hospedadas. Manifiesto histórico 43 SQL, diff y bundle privado PASS; oxlint sin nuevos hallazgos. Escaneo 1254 archivos/49 candidatos, único delta fixture sintética documentada. Sustituye las referencias a suite en curso para la integración; no modifica la nota honesta de código de salida no recuperado de la suite SQL anterior.

El flujo local anterior a cuerpo/número queda integrado: cerrar UUID original, impedir petición tardía, conservar historial, recuperar cierre/retirar datos locales bajo exclusión y cargar otra preparación con identidad nueva. Gate remoto sigue pendiente de autorización, versiones/pestañas compatibles con Web Locks, JWT/RLS/visual/E2E aislado y acreditación PV/custodia/parámetros. Corrección/cancelación con cuerpo/número, rechazo definitivo tras envío y NC continúan pendientes; PR03/PR02 no se dan por cerrados. No instalación/activación fiscal remota, deploy frontend, consulta ARCA autenticada nueva, CAE real, merge o cambios master/Production. Se mantienen dependencias del contador, restauración integral bloqueada e impresora/cajón/Point diferidos.

### 22/10/2026 — F08: sustitución de cuerpo reservado, anterior a intención de envío

Incremento local pendiente: permitir corregir datos explícitos de un cuerpo RESERVADA sin intento ni permiso consumido. Crear otra operación/preparación/cuerpo y conservar inmutables los originales; registrar enlace auditado original→sucesora con ambos hashes. Transferir la reserva en la misma transacción manteniendo CUIT/PV/tipo/número y fecha original: no liberar número, no fabricar una consulta FECompUltimoAutorizado ni avanzar la serie. Exigir Auth original activo, venta/snapshot vigente, hash anterior esperado, parámetros/emisor vigentes y tipo de comprobante idéntico. Una modificación de serie, ENVIO_INCIERTO, AUTORIZADA, respuesta de emisión o conciliación queda fuera de esta transición; rechazar sin cambios. Invalidar el permiso anterior sin eliminar auditoría; sucesora sin permiso/revisión heredados. Estado original SUSTITUIDA y resolver apunta sólo a la sucesora activa. Replay idéntico devuelve lectura durable; datos diferentes o sucesora ajena fallan. Orden de locks: venta, UUIDs ordenados, operación, serie, reserva/permiso. Verificar rollback integral, identidad, snapshot, reintento, sustitución encadenada, trabajador tardío y carreras nativas antes de conectar servicio/HTTP/UI. SQL 018 no se instala remotamente ni habilita emisión. Este incremento no declara resueltos rechazos/NC ni aceptación hospedada.

### 22/10/2026 — F08: reserva corregible sólo antes del envío, backend local

SQL 018 prepara una sustitución atómica con nueva identidad y cuerpos históricos conservados; transfiere el mismo número/serie y revoca el permiso antiguo sin heredarlo. Replay recuperable; intención previa, respuesta fiscal, conciliación, autorización, serie diferente o Auth ajeno bloquean la transición. El runner nativo agrega los dos órdenes sustitución/intención revisada, duplicación con ACK idéntico y rollback. Primer pase 51 escenarios PostgreSQL 17.11 PASS, incluido el pase final con intención revisada (fiscal-reserved-replacement-reviewed-concurrency-20261022.json), cero solicitudes externas/emisiones. Falta integrar servicio/HTTP/cliente/UI y su recuperación; no equivale a cancelación de número ni a resolver rechazos/NC. SQL fiscal 001–018/Edge sin instalar o activar remotamente; ninguna emisión/CAE real, despliegue, merge o modificación de master/Production. La suite completa del incremento está en curso; build detectó tipado pendiente en fixtures nuevas y todavía no es PASS. Envases descontados pendientes de contador; restauración integral bloqueada e impresora/cajón/Point diferidos.

Cierre de validación local de SQL 018: 3103 PASS / 1 skipped / 251 archivos, salida 0 observada (pilot-reserved-replacement-suite-results.json). Única omitida fixture F6_C3A_CANDIDATES_PATH sin configurar; ninguna fiscal nueva omitida. Después de esa suite sólo se corrigieron anotaciones TypeScript de filas de fixtures: 160 dirigidas / 4 archivos PASS posteriores y build final PASS 651 módulos (pilot-reserved-replacement-build-typed-final.log). Los primeros errores de ambigüedad SQL y de fixtures/tipado quedaron corregidos; el build anterior fallido no cuenta como PASS. 51 escenarios PostgreSQL 17.11 PASS finales con intención revisada y contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL y diff PASS; oxlint sin nuevos hallazgos, conserva warning preexistente no-unsafe-finally del runner. Escaneo 1255 archivos/49 candidatos, sin nuevos candidatos frente al cierre anterior. El incremento cierra sólo la transacción SQL local; siguen pendientes servicio/HTTP/cliente/UI con recuperación durable y revisión de la sucesora, resolución posterior a intención/rechazo/NC, representación fiscal final y gates hospedados. No instalación remota SQL 001–018/Edge, activación, deploy, nuevas consultas ARCA autenticadas, CAE real, merge o cambio master/Production. Restauración integral bloqueada; contador/envases y diferidos físicos conservados.

### 22/10/2026 — F08: integrar sustitución reservada y recuperación de propuesta

Plan del incremento: contrato público cerrado de sustitución (IDs/hashes/número/estado, sin custodia), propuesta canónica/hash validada sin defaults y persistida localmente ANTES del POST. SQL 018 sigue siendo autoridad de snapshot/serie/parámetros/emisor/Auth; el servicio conserva un Auth.getUser por acción y sólo confirma leyendo el registro durable, incluso tras ACK perdido. Dos acciones HTTP con límites separados, allowlist privada explícita y sin TA/ARCA. Cliente bajo el mismo Web Lock de venta: identidad sucesora/propuesta fijas, reintento exacto, lectura al reabrir, retiro de datos sólo tras confirmación y sin pisar otra preparación. Resolver reconoce enlaces históricos de sustitución sin tratarlos como cancelación de número. Modal ofrece corrección sólo para RESERVADA, confirmación explícita, datos nuevos sin defaults heredados y nueva revisión; mientras hay propuesta incierta oculta aprobación anterior y conserva intento. Probar cuotas/ACK falso/tardío/reinicio/dos instancias, actor reasignado y respuesta ajena, cuerpo/serie inválidos y no exposición de secretos; luego regresión/build antes de publicar. No instalar SQL/Edge, activar flags ni consultar/emitir contra ARCA; rechazos posteriores a intención y NC siguen pendientes.

Ampliación necesaria de recuperación: una propuesta válida localmente puede quedar rechazada por parámetros/emisor que cambiaron antes del POST. No dejar al Dueño atrapado en ese pendiente. Reutilizar SQL 017 para cerrar sólo el UUID sucesor aún no creado; el cierre impide un POST tardío de SQL 018. Si la sustitución ganó primero, el descarte falla y se recupera el cierre de sustitución: nunca cancelar una reserva/cuerpo existente. Confirmación humana separada y lectura durable antes de retirar propuesta local; la operación/número original se conserva. Probar ambos órdenes y reinicio tras ACK perdido. Este flujo no amplía cancelación de números ni emisión.

### 22/10/2026 — F08: circuito de sustitución, recuperación y compatibilidad canónica

Contrato público cerrado y propuesta canónica/hash validados en cliente y servicio. Dos acciones HTTP (sustituir/consultar) con DTO/tamaño/JSON estrictos, origen/proyecto/flags existentes y Auth.getUser una sola vez por acción; SDK pasa de 24 a 26 RPC explícitas, sin acción de emisión. Tras escritura se exige getter durable del mismo Auth/venta/operación/sucesora/hashes, no ACK de escritura. No TA, custodia o tráfico ARCA en estas acciones.

Cliente persiste propuesta y UUID antes de POST bajo Web Lock por venta, verifica límite real de bytes, rechaza cambio de serie local antes de guardar y conserva exactamente el intento tras pérdida de respuesta. Resuelve enlaces durables y relee estado antes de mostrar la sucesora; retira datos sólo tras cierre confirmado, con comparación del registro local para no borrar otro intento. Aprobar/guardar/preparar/cancelar quedan coordinados con la corrección; una propuesta incierta bloquea acciones sobre el cuerpo anterior. Descarte explícito cierra sólo UUID sucesor no creado por SQL 017, nunca un cuerpo/número; si la sustitución ganó se recupera ese cierre. Reabrir recupera cualquiera de los dos resultados.

Modal usa componentes/estética existentes y permite corregir sólo RESERVADA, con confirmación humana y datos expresos nuevamente, sin IVA/fechas heredados ni permiso automático. Mientras la propuesta es incierta oculta aprobación/formulario anterior y permite recuperación o descarte confirmado. Cambiar venta/cerrar descarta respuestas tardías. Pruebas de adaptador Web Locks son sintéticas; visual real/dos ventanas/JWT/RLS hospedados siguen pendientes.

Corrección importante respecto al incremento 76ff310: JSONB::text no coincide con el canónico compacto/ordenado de revisión TypeScript. La prueba nueva cliente→HTTP→SQL→revisión con hash real detectó y cerró ese enlace; SQL 018 usa helper canónico privado y rechaza al instalar cuerpos históricos incompatibles, sin reescribirlos. Se probó Unicode/escapes, propuesta duplicada, Auth reasignado, ACK perdido/falso, cuotas, dos instancias, descarte/transferencia y respuestas tardías. SQL 018 sigue sin instalar remotamente; evidencia previa sólo transaccional no acreditaba ese enlace de revisión.

Validación dirigida actual: 338 PASS / 8 archivos (pilot-fiscal-replacement-integration-targeted-final.log). 53 escenarios PostgreSQL 17.11 PASS del primer pase integrado; pase final de SQL con preflight canónico en curso. Suite global y build final en curso, no se usan 3103/51 anteriores como cierre nuevo. Scan actual 1258 archivos/49 candidatos, sin nuevos candidatos. PR03/F08 parcial por rechazos/incertidumbre posteriores a intención, NC, representación fiscal final y gates hospedados/provisión/PV/parámetros. No instalación/activación remota SQL 001–018/Edge, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Envases pendientes del contador, restauración integral bloqueada e impresora/cajón/Point diferidos.

Revisión de concurrencia entre equipos: además de dos instancias con almacenamiento compartido, cubrir dos terminales con propuestas distintas para la misma operación. Si otra terminal ganó, no atribuir su ACK a la propuesta local ni borrar ésta por hash ajeno. Resolver debe conservar acceso al panel de recuperación; el descarte cierra sólo el UUID local aún no creado y después recupera la preparación ganadora, sin tocar su cuerpo/número. Caso adicional pendiente antes de cerrar esta integración; suite ya iniciada se deja terminar sin editar fuentes y luego se verificará la corrección con evidencia propia.

Actualización de validación integrada: suite anterior 3163 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-integration-suite-results.json). Se dejó terminar antes de cambiar fuentes. Después se reforzó la recuperación cuando otra terminal ganó y el panel pendiente ante fallo de resolución. Cierre dirigido posterior: 341 PASS / 8 archivos (pilot-fiscal-replacement-two-terminals-targeted-final.log). PostgreSQL 17.11: 54 escenarios finales PASS (fiscal-replacement-two-terminals-concurrency-20261022.json), incluido perdedor con propuesta distinta sin cuerpo parcial; contenedor propio detenido y datos conservados, cero solicitudes externas/emisiones. Build posterior PASS 653 módulos; manifiesto histórico 43 SQL, diff, bundle privado (cero coincidencias) y oxlint sin nuevos hallazgos. Se conserva warning preexistente no-unsafe-finally del runner. Escaneo 1258 archivos/49 candidatos, sin delta de candidatos. Suite global definitiva de dos terminales en curso, por lo que 3163 anterior aún no es cierre de esas últimas guardas. No cambios remotos ni activación de flags.

Cierre integrado de sustitución reservada y recuperación entre equipos: 3166 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-replacement-two-terminals-suite-results.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 341 dirigidas / 8 archivos PASS y 54 escenarios PostgreSQL 17.11 PASS finales (fiscal-replacement-two-terminals-concurrency-20261022.json), incluidos propuestas distintas, ambos órdenes sustitución/intención y descarte/sustitución, rollback y ACK recuperable. Dos almacenes independientes cliente→HTTP→SQL recuperan la ganadora sin cancelar su cuerpo/número. Build final PASS 653 módulos, manifiesto histórico 43 SQL, diff y bundle privado (cero coincidencias) PASS; oxlint sin nuevos hallazgos, warning preexistente del finally del runner conservado. Escaneo 1258 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos, datos conservados, cero solicitudes ARCA autenticadas o emisiones reales. Sustituye las notas de suite en curso para esta integración; el pase previo 3163 se conserva con su alcance anterior.

El flujo reservado anterior a intención queda integrado localmente, incluida la corrección de canónico y el rechazo de instalación sobre historia incompatible. No acredita navegador/visual/Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados. SQL fiscal 001–018 y Edge sin instalar/habilitar remotamente; flag nuevo sin activar, ningún deploy, CAE real, merge o modificación de master/Production. Siguiente bloque local: resolución/corrección posterior a intención/rechazo definitivo y notas de crédito, junto con representación fiscal final. Provisión privada, punto de venta y parámetros reales, aceptación aislada/hospedada y primera emisión homologada expresamente autorizada conservan sus gates. Envases descontados bloqueados hasta criterio del contador; restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales, sin declarar Production Readiness.

### 22/10/2026 — F08: corrección posterior a rechazo recibido, sin borrar intento

Plan incremental local, según manual WSFEv1 v4.7 vigente (https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf, sección FECAESolicitar/errores de comunicación; no usar la sección CAEA como contrato CAE). Un timeout/SIN_CONFIRMACION no acredita rechazo ni habilita reenviar. Para corregir un R recibido ligado al intento/hash/Auth/revisión/permiso consumidos, exigir además FECompConsultar negativo estricto 602 sin ResultGet contradictorio y consulta posterior de último autorizado igual a N−1, ambas frescas al tomar locks. Parámetros/emisor/snapshot actuales y datos explícitos nuevos, misma serie/número. Sin CAE candidato, sin inferir tratamiento de envases y sin permiso/revisión heredados.

Diseño SQL 019: conservar la reserva original y sus FKs/observaciones/recepción, marcarla RECHAZO_CORREGIDO sólo con auditoría inmutable y crear sucesora RESERVADA en la misma transacción. Nunca transferir ni borrar la fila de intento ya enviado. Unicidad global del número para filas no archivadas; transición archivada irreversible y sólo junto a sucesora auditada de la misma venta/serie/número. La serie no avanza ni queda libre entre operaciones. FK del historial se conserva; lectores de recepción histórica admiten el estado archivado, sin conceder otro envío. Original/cuerpo/permiso consumido/revisión/consultas siguen vinculados e inmutables. Intentos sin R, aprobación/CAE o evidencia contradictoria quedan pendientes de conciliación/manual, no se convierten en rechazo corregible.

Componentes y validación: parser/transporte privado de ausencia (rechazar mezcla 602+ResultGet, SOAP Fault, errores distintos, timeout/redirección/XML inesperado; no registrar XML/Token/Sign), SQL 019 y getters con Auth original, propuesta canónica/hash nuevos, rollback/ACK perdido y concurrencia frente a conciliación/sustitución/descarte/otro comercio. Gate privado de recuperación y orquestador con revalidación antes de consultas/commit, deshabilitado por defecto; servicio/HTTP/UI deberán integrarse después de probar este contrato. No ejecutar consultas ARCA autenticadas, instalar SQL/Edge ni habilitar emisión. Credenciales, PV real, aceptación hospedada, NC, representación fiscal final y restauración conservan sus gates. Esta clase R no sustituye recuperación de incertidumbre ni habilita un reenvío automático.

### 22/10/2026 — F08: contrato privado de rechazo corregible preparado localmente

SQL 019 agrega auditoría inmutable de corrección, fuente privada y cierre recuperable. Preserva reserva/intento/recepción/consultas originales y FKs, archiva sólo con transición validada y crea sucesora con el mismo número/serie. Índice global vigente excluye únicamente archivo auditado; trigger impide reactivar/borrar el intento archivado. Aprobación/CAE o evidencia contradictoria, snapshot/emisor/actor cambiados, falta de R o prueba fuera de orden/vencida fallan sin efectos. La prueba se verifica de nuevo después de locks del catálogo y escrituras. Reaplicar SQL conserva el historial; una inserción omitida por trigger no produce ACK y revierte el archivo.

Consulta privada de ausencia: parser acepta sólo 602 de FECompConsultar con ResultGet ausente/nil y sin contradicción; rechaza otros errores, dato positivo, Fault, XML/MIME/HTTP no soportados o timeout. Transporte común conserva la clasificación previa de consultas y revalida antes de fetch. El trabajador correctRejectedFiscalVoucher no tiene ruta HTTP: gate privado nuevo cerrado por defecto, Auth real capturado una vez, fuente/serie/hash originales comprobados antes de TA y consultas, dos lecturas WSFE simuladas, revalidación antes del commit, cierre confirmado sólo por getter. ACK perdido se recupera sin reconsultar si ya está cerrado, aun con gate/emisor deshabilitados. SDK privado ahora 29 RPC; ninguna credencial/TA/XML o mensaje libre se devuelve al cliente.

Evidencia dirigida actual: 280 PASS / 5 archivos (pilot-fiscal-rejected-correction-targeted-final.log), incluidos worker+SQL con ACK perdido y Auth reasignado, sin adoptar otra cuenta, fuente/serie ajena antes de TA, y errores privados saneados. PostgreSQL 17.11: 61 escenarios PASS (fiscal-rejected-correction-final-v2-concurrency-20261022.json), dos correctores, ambos órdenes con conciliador/CAE, rollback, vencimiento al esperar venta y catálogo, y otro comercio sin capturar la serie. Contenedor propio detenido/datos conservados, externos/emisiones cero. Primer pase 59 PASS retenido; segundo intento falló por nombre de variable duplicado en runner antes de crear contenedor, corregido con evidencia nueva sin borrar log. Build final y suite global en curso; 3166 anterior no es cierre del incremento. Manifiesto histórico 43 SQL PASS, oxlint sin nuevos hallazgos y warning preexistente del runner; scan 1260 archivos/49 candidatos, sin nuevos candidatos.

Pendiente antes de activar: integrar acción/recuperación HTTP/cliente/modal de rechazo con confirmación y nueva revisión, manejar incertidumbre sin R y categorías no soportadas, NC, representación final y aceptación hospedada/visual/JWT/RLS/Edge. SQL 001–019/Edge sin instalación/habilitación remota por nosotros, sin consultas ARCA autenticadas nuevas, emisión/CAE real, deploy, merge o cambio master/Production. Credenciales/PV/parámetros, contador/envases y restauración integral mantienen sus gates; impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales.

### 23/10/2026 — Cierre recuperado del incremento privado de rechazo

Suite completa 3227 PASS / 1 skipped / 252 archivos, salida 0 observada al recuperar el mismo handle (pilot-fiscal-rejected-correction-suite-results.json). No se reinició por el cambio de turno/fecha. Única omitida fixture histórica F6_C3A_CANDIDATES_PATH sin configurar, ninguna fiscal nueva omitida. 280 dirigidas / 5 archivos PASS y 61 escenarios PostgreSQL 17.11 PASS finales (fiscal-rejected-correction-final-v2-concurrency-20261022.json). Build final PASS 653 módulos; manifiesto histórico 43 SQL, diff y bundle privado PASS (cero coincidencias de trabajador/gate/RPC privados). SDK limitado a 29 RPC. Oxlint sin nuevos hallazgos; warning preexistente del finally del runner conservado. Scan 1260 archivos/49 candidatos, sin nuevos candidatos. Contenedores propios detenidos/datos conservados; cero solicitudes externas/emisiones reales. El fallo de sintaxis inicial del runner quedó corregido y su log conservado; no produjo un contenedor ni se contó como PASS.

El contrato SQL 019 y trabajador privado de R con detalle quedan preparados localmente; no se cierra el flujo de usuario de esa clase todavía. Siguiente: integrar elegibilidad/confirmación/recuperación HTTP–cliente–modal, sin permitir R automático desde timeout/Errors sin detalle, y exigir nueva revisión/permiso para la sucesora. Incertidumbre sin R, notas de crédito, representación fiscal final, provisión/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual continúan pendientes. SQL 001–019 y Edge sin instalación/activación remota por nosotros; no activación de flags, deploy, consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. Se conservan contador/envases, restauración integral bloqueada e impresora/cajón/Point diferidos. PR03/F08 y PR02 siguen parciales; este cierre no acredita Production Readiness.

### 23/10/2026 — F08: recuperación pública de corrección R, antes del formulario

Incremento local: separar el DTO cerrado de corrección rechazada del trabajador privado y exponer sólo su consulta durable por venta/operación con Auth original. La lectura no crea sucesoras ni carga TA/custodia ni consulta ARCA; no depende del gate de nuevas consultas. Validar respuestas cerradas, estado y pertenencia; errores saneados sin filtrar respuestas privadas. Mantener intactos SQL 001–019, permisos y flags. Probar contrato, HTTP, sesión inválida, respuesta ajena y ausencia durable. Después integrar propuesta persistente y formulario con confirmación explícita y nueva revisión; ese flujo aún no queda cerrado por esta lectura. Contador/envases pendiente confirmado por el titular; conservar el bloqueo y las ventas comerciales.

Progreso: implementación y verificaciones de este incremento pendientes.

Progreso del incremento de lectura: contrato público separado del worker privado, servicio de consulta con Auth una sola vez, acción HTTP CORRECCION_RECHAZO_FISCAL sólo lectura y método rejectedCorrection del cliente. Sin cambios de almacenamiento, propuesta/UUID/permiso ni consultas WSFE al abrir/leer; null sólo ante ausencia durable confirmada. Respuesta ajena, campos privados, estado distinto o error de Auth/SQL fallan cerrados y saneados. Compatibilidad de exportaciones del worker conservada. 338 PASS / 5 archivos dirigidos (pilot-fiscal-rejected-read-targeted-final-20261023.log); 244 PASS previas / 2 archivos retenidas. No se repitió suite global ni PostgreSQL nativo porque este incremento no altera SQL ni transacciones; 3227/1 skipped y 61 escenarios son evidencia histórica del HEAD anterior, no del nuevo incremento. Build final y controles de publicación pendientes de cierre. Formulario/modal de corrección R y persistencia de su propuesta aún pendientes; no se habilitó la escritura HTTP ni emisión.

Cierre local de lectura: build final PASS 654 módulos (pilot-fiscal-rejected-read-build-final-20261023.log), manifiesto histórico 43 SQL PASS, oxlint dirigido y diff PASS. Bundle sin coincidencias de worker/gate/RPC de fuente/custodia privados. Escáner final 1262 archivos / 49 candidatos, sin nuevos pares ruta/tipo frente al cierre e5cbecf; no se muestran valores. 338 dirigidas PASS posteriores al último cambio funcional. Sin solicitudes ARCA autenticadas, emisión/CAE real, instalación SQL/Edge, activación de flags, deploy, merge o cambios master/Production. Siguiente: persistencia diferenciada de propuesta R y confirmación/formulario, manteniendo nueva revisión y bloqueo de envases pendiente del contador.

### 23/10/2026 — F08: integración de propuesta R y confirmación del Dueño

Plan previo al código: extender el pendiente de sustitución con una variante versionada explícita para RECHAZO, preservando íntegros los pendientes v1 de reserva. Ambos comparten el lock y bloquean acciones incompatibles. Ruta de escritura independiente CORREGIR_RECHAZO_FISCAL llama al worker privado 019; sólo él consulta WSFE bajo gate cerrado y confirma por lectura durable. Consulta/reapertura no inicia consultas ARCA. Conservación de UUID/propuesta tras errores, getters diferenciados para recuperación/descarte y cadena durable. UI permite entrar sólo con diagnóstico R del mismo cuerpo, sin evidencia contradictoria; confirmación explícita antes de preparar propuesta, sin datos heredados y con aviso de consultas de recuperación/nueva revisión. SQL sigue siendo autoridad y no hereda aprobación ni permiso. El reintento guardado requiere acción explícita y recuperación previa; ningún efecto automático al abrir. Validar HTTP gate cerrado/ACK, cliente reinicio/rutas/tamaño/errores/descartes/multiterminal, modal confirmación/R vs incertidumbre/otra venta, build y regresiones. Sin instalación SQL/Edge, ARCA real ni emisión. Contador/envases bloqueado, impresora/Point diferidos. Progreso: pendiente.

### 23/10/2026 — F08: corrección R integrada localmente; cierre de regresión en curso

HTTP incorpora CORREGIR_RECHAZO_FISCAL detrás del gate privado cerrado, sin acción de emisión. Cliente conserva propuesta diferenciada v2/RECHAZO con compatibilidad estricta de v1; recovery/descarte usan getter de su clase y siguen enlaces durables de ambas. Modal exige diagnóstico R del mismo cuerpo, sin evidencia contradictoria, confirmación explícita y datos nuevos. Reintentar propuesta R también requiere confirmación; abrir/resolver/descartar no consulta WSFE. La sucesora vuelve a revisión sin heredar aprobación/permiso. Dos almacenes cliente→HTTP→SQL conservan la ganadora y cierran sólo la sucesora local perdedora.

361 pruebas dirigidas PASS / 5 archivos (pilot-fiscal-rejection-ui-targeted-final-20261023.log), build v2 PASS 654 módulos, oxlint/diff/manifiesto histórico 43 SQL PASS, scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo, backend privado ausente del bundle. Primer pase tuvo un fallo de selección de múltiples alertas en una prueba nueva; segundo pase, una inspección del fixture con rol sin permiso. Corregidos sólo los tests, sin ampliar permisos. Primer build falló por unión HTTP sin discriminación individual; contrato corregido, build posterior PASS. Logs conservados, fallos no contados como PASS. Suite global en curso, no se presenta evidencia antigua como cierre nuevo. SQL/transacciones nativas no cambiaron; 61 escenarios PostgreSQL son evidencia histórica, no nuevo pase. Aceptación visual/JWT/RLS/Edge/Web Locks entre ventanas reales sigue pendiente.

Se conserva la decisión del contador pendiente para envases descontados. Sin consultas ARCA autenticadas, instalación/habilitación SQL 001–019/Edge, flags, deploy o emisión/CAE real; master/Production intactos. Siguiente tras cerrar pruebas: contingencias/incertidumbre sin R, notas de crédito y representación fiscal final; provisión privada/PV/parámetros y aceptación hospedada requieren sus gates. PR03/F08 y PR02 siguen parciales; restauración integral bloqueada e impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre local de propuesta y formulario R

Suite completa 3271 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-rejection-ui-suite-results-20261023.json); única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada, ninguna fiscal nueva omitida. 361 dirigidas PASS / 5 archivos, build final PASS 654 módulos (pilot-fiscal-rejection-ui-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS; scan 1262 archivos/49 candidatos sin nuevos pares ruta/tipo y backend privado ausente del bundle. El aviso de sourcemap html5-qrcode y el tamaño de chunks no son errores de prueba/build. SQL 001–019 y transacciones no cambiaron: no se repitió PostgreSQL nativo; los 61 escenarios anteriores son historia, no una aceptación nueva. La propuesta R, confirmación, recuperación/descarte y vuelta a revisión quedan integradas localmente. Falta aceptación real visual/JWT/RLS/Edge/Web Locks y comportamiento externo con custodia/PV/parámetros acreditados; no hay CAE real ni Production Readiness. Continúan incertidumbre sin R, NC y representación fiscal final. Sin consultas ARCA autenticadas, instalación/habilitación fiscal remota, flags, deploy, merge o cambio master/Production. Contador/envases bloqueado, restauración integral bloqueada y físicos/Point diferidos.

### 23/10/2026 — F08: endurecer conciliación incierta antes de exponer la acción en UI

Situación: CONCILIAR ya existe como consulta privada, pero el orquestador toma el ACK de escritura y sólo recupera al volver a invocarlo; la autorización se captura una vez antes de esperar TA y no se revalida antes de fetch/registro. Plan: confirmar únicamente por getter durable del mismo ID tras intentar guardar (también ACK perdido/falso), conservar lectura temprana sin TA/red, revalidar contexto Auth original/binding después de TA y justo antes de transporte/registro, sin volver a obtener/inferir Auth. Gate privado nuevo de consultas de conciliación cerrado por defecto en HTTP, comprobado sólo antes de red; replay confirmado debe funcionar sin ese gate/custodia. No cambiar SQL ni numeración, no reenviar FECAESolicitar, no convertir ausencia/error en rechazo ni liberar operación. Validar pérdida/falsedad de ACK, error de getter, actor/emisor reasignados durante TA y después de consulta, gate revocado durante espera, replay HTTP y transporte. Conectar después observación persistente/confirmación/modal con los contratos acreditados; esa UI sigue pendiente. Sin ARCA real/instalación/deploy. Contador/envases y demás gates permanecen.

Ampliación por revisión de autoridad: revalidar por HTTP antes de guardar no cierra por sí solo la ventana entre esa lectura y la transacción mutadora. Agregar SQL 020 con autorización de conciliación ligada a Auth original de preparación cuando existe y wrapper de registro que obtiene/retiene locks de perfil/venta/operación/emisor y compara binding esperado en la misma transacción que SQL 004. Dos RPC privadas nuevas, sin tablas ni modificación de historial. Preparación heredada sin hechos 012 conserva su contrato privado anterior; las preparaciones 012 exigen Auth original. Revalidaciones previas siguen evitando red con identidad cambiada. Validar rollback/no delegación, revisión/certificado rotados y replays antes de exponer UI. SQL 020 se prepara localmente; su instalación queda sujeta al gate fiscal de la familia completa. No afirmar cierre TOCTOU sólo con la lectura anterior.

### 23/10/2026 — F08: conciliación ligada al actor y confirmación durable, local

SQL 020 agrega autorización propia y wrapper de registro: Auth original de hechos 012 cuando existen, binding exacto y locks de perfil/venta/operación/emisor retenidos durante el registro SQL 004. Revalidación final revierte si un trigger/acción interna alterara ese binding. Legacy privado sin tabla 012 conserva el gate anterior, sin inferir hechos inexistentes; no habilita carga UI heredada. Servicio captura Auth una vez y comprueba el mismo binding antes de TA/fetch/registro. Gate HTTP ARCA_HOMO_RECONCILIATION_ENABLED cerrado por defecto; replay confirmado se recupera antes de TA/gate/red. El ACK de registrar se ignora: sólo getter durable del mismo ID confirma, incluido ACK perdido. Falso ACK/getter fallido no autorizan.

479 dirigidas PASS / 6 archivos (pilot-fiscal-reconciliation-bound-targeted-final-20261023.log), build PASS 654 módulos, oxlint sin nuevos hallazgos (warning preexistente no-unsafe-finally del runner), manifiesto 43 SQL/diff PASS, SDK limitado a 31 RPC. Escáner 1263 archivos/49 candidatos, sin nuevos pares ruta/tipo; símbolos privados nuevos ausentes del bundle. PostgreSQL 17.11: 64 escenarios PASS (fiscal-reconciliation-bound-concurrency-v2-20261023.json), incluidos Auth reasignado primero, conciliación primero bloquea reasignación hasta commit y emisor rotado mientras espera; contenedor propio detenido/datos conservados, externos/emisiones cero. Primer intento falló en step 0 por Docker apagado y no creó contenedor: log/JSON conservados; motor iniciado y verificado antes del nuevo pase, sin sobrescribir evidencia. Primer pase de pruebas esperaba el gate nuevo habilitado en un fixture sintético; corregido sólo ese fixture, sin activar gate real. Suite completa en curso, no cierre global aún.

Alcance actual: ruta privada CONCILIAR y confirmación durable compartida. Falta observación persistente/confirmación/modal; revisar la conciliación interna del worker de emisión para usar también la autoridad ligada antes de aceptación hospedada. No se declara cerrada toda incertidumbre. Continúan NC, representación final, custodia/PV/parámetros y JWT/RLS/Edge/visual/E2E hospedados. SQL 001–020/Edge sin instalación/habilitación por nosotros, flags sin activar, cero consultas ARCA autenticadas, CAE real, deploy, merge o cambio master/Production. Envases/contador y restauración integral bloqueados, físicos/Point diferidos; PR03/F08 y PR02 parciales.

### 23/10/2026 — Cierre local del endurecimiento de conciliación

Suite completa 3281 PASS / 1 skipped / 252 archivos, salida 0 observada (pilot-fiscal-reconciliation-bound-suite-results-20261023.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal nueva omitida. 479 dirigidas PASS / 6 archivos y 64 escenarios PostgreSQL 17.11 PASS finales; contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Build 654 módulos PASS, oxlint sin nuevos hallazgos y warning preexistente del runner, manifiesto 43 SQL/diff PASS. Escáner final 1263 archivos/49 candidatos, sin nuevos pares ruta/tipo; símbolos privados SQL 020/gate/custodia ausentes del bundle. SDK cerrado a 31 RPC.

Quedan preparados SQL 020 y la conciliación privada con Auth/binding transaccionales, revalidación tras espera y ACK durable. La autorización original de hechos existentes no se infiere desde una cuenta nueva. No cierra la UI/observación persistente ni el encadenamiento ligado en la conciliación interna del worker de emisión; son el siguiente trabajo local antes de aceptación hospedada. NC/representación final y gates custodia/PV/parámetros/JWT/RLS/Edge/visual/E2E/primera emisión/CAE siguen pendientes. SQL 001–020/Edge sin instalar/habilitar, flags sin activar, ningún deploy, consulta ARCA autenticada nueva, emisión/CAE real, merge o cambio master/Production. Restauración integral bloqueada, contador/envases pendiente y físicos/Point diferidos; PR03/F08 y PR02 permanecen parciales. El primer intento nativo step 0 por Docker apagado y el fixture inicial sin gate sintético quedan documentados como fallos corregidos, no PASS.

### 23/10/2026 — F08: misma autoridad en la conciliación interna de emisión

Plan: extraer composición de conciliación ligada que recibe únicamente la identidad Auth/binding ya verificados por el servidor; no volver a llamar getUser ni atribuir desde perfil. La ruta HTTP mantiene su autenticación actual; worker privado usa la misma función SQL 020 para recuperaciones de ENVIO_INCIERTO/AUTORIZADA y cierre posterior al envío. Revalidación ligada antes del getter, TA/fetch/registro y wrapper transaccional para escritura; replay no necesita gate/TA/red. Una emisión nueva requiere además gate de conciliación activo antes de TA/envío, evitando emitir sin circuito de recuperación habilitado. Si identidad/emisor cambia después de envío, conservar auditoría original y dejar incierto, sin consultar ni adjudicar a otra cuenta. Probar ambos caminos, cambio durante TA y después del POST, gate deshabilitado, ACK perdido/falso y replays. No SQL nuevo ni activación/ARCA real. Tras este contrato continuar observación persistente/confirmación/modal; no declarar esa UI resuelta por este cambio del servidor.

Preparación del siguiente incremento UI (todavía no implementado): contrato público puro de ACK sin importar transporte/custodia al navegador; SQL 021 de lectura por Auth original + venta + operación + observación, sin emisor/TA/red, con vínculo a cuerpo/intento y constancia de ledger para resultado autorizado. Debe permitir recuperar observaciones pendientes históricas de una operación archivada sin confundirlas con autorización actual. HTTP sólo lectura de esa observación y DTO cerrado, no aceptar cuerpo/binding/actor del navegador.

Cliente: registro local de observación sin PII por Auth/comercio/venta, mismo Web Lock que preparación/corrección/aprobación; UUID/hash/número guardados antes de POST CONCILIAR. GET durable antes y después, sin atribuir otro UUID/cuerpo; reiniciar/abrir sólo consulta el getter, nunca WSFE. Getter incierto conserva registro; nueva consulta sólo con confirmación humana explícita y mismo UUID. No borrar por ausencia sola. Resolver una transición durable que bloquea escrituras del cuerpo viejo o una constancia autorizada exacta puede cerrar el pendiente local obsoleto sin fingir que aquella observación se ejecutó; distinguir ese caso en UX y probarlo. Evitar que un ACK atrasado elimine otra observación. Bloquear acciones fiscales incompatibles mientras exista registro incierto; conservar operación comercial/POS. No ofrecer un descarte a ciegas de observación en vuelo.

Modal: mostrar consulta guardada y confirmación de sólo recuperar/consultar homologación sin reenviar ni cobrar; no presentar ACK de consulta como factura emitida. Después del cierre recargar resolución/diagnóstico/constancia y nunca degradar AUTORIZADA por un ACK histórico pendiente. Rechazar respuestas de venta cambiada. Ensayar pérdida de respuesta, cuotas, dos terminales, R corregido por otra terminal, cuenta cambiada y gate cerrado. SQL/Edge/flags siguen sin activar; aceptación real/JWT/RLS/visual y primeras consultas/emisión requieren los gates actuales.

### 23/10/2026 — Conciliación ligada compartida por HTTP y trabajador (local)

Se completa el encadenamiento de autoridad pendiente de 7386fcc: worker de emisión usa la misma composición ligada a Auth/binding/SQL 020 para ENVIO_INCIERTO/AUTORIZADA y cierre después del envío. Auth se verifica una sola vez por invocación; no se adopta otra cuenta tras reasignación. Nueva emisión exige gate de conciliación activo antes de TA; replay confirmado no necesita emisión/consulta habilitadas ni red. Cambio de identidad después de POST conserva auditoría de recepción original y deja incierto, sin consultar con otra cuenta ni registrar un CAE candidato.

533 pruebas fiscales dirigidas PASS / 7 archivos, salida 0 observada (pilot-fiscal-worker-bound-targeted-typed-final-20261023.log), build final PASS 654 módulos (pilot-fiscal-worker-bound-build-final-20261023.log), oxlint/diff/manifiesto 43 SQL PASS. Escáner 1263 archivos/49 candidatos sin nuevos pares ruta/tipo; símbolos privados ausentes del bundle. Primer build falló por argumento AbortSignal omitido sólo en una prueba nueva; corregido y verificado, log conservado. No se repitió suite global ni PostgreSQL nativo: 3281 PASS/1 skipped y 64 escenarios son evidencia histórica de 7386fcc, no cierre global de este incremento. SQL 001–020 no cambió.

Siguiente pendiente concreto: observación guardada/lectura durable/confirmación/modal, detallado en ExecPlan. NC/representación final, custodia/PV/parámetros y aceptación hospedada/JWT/RLS/Edge/visual/E2E/CAE siguen pendientes; PR03/F08 y PR02 parciales. No consultas ARCA autenticadas nuevas, instalación/habilitación SQL/Edge, flags, deploy, emisión/CAE real, merge o cambios master/Production. Restauración integral bloqueada, contador/envases pendiente y físicos/Point diferidos.

### 23/10/2026 — F08: ejecución del contrato de observación y modal

Implementar ahora el plan de observación definido arriba: SQL 021 sólo lectura de ACK histórico ligado a Auth/venta/cuerpo/intento, contrato público separado del transporte, servicio/HTTP getter y registro local coordinado. Confirmación UI para consulta explícita, recuperación al abrir sólo por lectura, cierre por observación durable o transición/constancia exacta que vuelva obsoleto el intento local, sin fingir ejecución de esa consulta. Añadir pruebas de ambos cierres y no degradar AUTORIZADA. Se mantiene el gate de consultas reales cerrado y no se emiten comprobantes. PR03/F08/PR02 continúan parciales hasta aceptación hospedada y pendientes restantes.

### 23/10/2026 — F08: observación persistente y modal integrados localmente

Implementados SQL 021 sólo lectura histórica y servicio/HTTP CONSULTAR_CONCILIACION con Auth original/venta/cuerpo/intento, contrato público puro de ACK con fechas válidas y SDK limitado a 32 RPC. Cliente conserva ID/hash/número sin PII antes de POST y exige getter durable; reapertura no consulta ARCA. Estado incierto comparte lock y bloquea acciones fiscales incompatibles; no se descarta por ausencia sola. Constancia autorizada exacta o transición durable del cuerpo viejo puede cerrar un pendiente obsoleto sin atribuirle ejecución. Modal exige confirmación, conserva acceso al pendiente si falla resolver, oculta revisión anterior mientras hay consulta y no degrada autorización por ACK histórico. Respuesta de otra venta se ignora.

601 dirigidas PASS / 9 archivos (pilot-fiscal-observation-ui-targeted-v2-20261023.log), build final PASS 655 módulos (pilot-fiscal-observation-ui-build-final-20261023.log), 66 escenarios PostgreSQL 17.11 PASS (fiscal-observation-ui-concurrency-20261023.json), contenedor propio detenido/datos conservados y cero solicitudes externas/emisiones. Incluye consulta con gate cerrado→registro SQL ligado sintético→reinicio y lectura sin emisor, R corregido por otra terminal sin inventar que se ejecutó la observación, lectura histórica después de archivo y Auth reasignado esperando lock. Oxlint sin nuevos hallazgos (warning preexistente finally del runner), manifiesto histórico 43 SQL/diff PASS; escáner 1267 archivos/49 candidatos sin nuevos pares ruta/tipo, símbolos privados de lector/gate/custodia ausentes del bundle. Primeros tests antiguos suponían ausencia de cualquier checkbox en estado incierto: ahora distinguen la aprobación prohibida de la confirmación de sólo consulta. Un test nuevo inspeccionaba ID privado con rol sin permiso; corregido sólo el fixture sin ampliar permisos, fallo conservado. Suite global en curso; no es todavía cierre global.

Alcance: recuperación/consulta de incertidumbre en UI preparada localmente. Si una consulta no confirma autorización se conserva la operación original: no reenvío, cancelación de número ni rechazo inferido. Aceptación hospedada visual/JWT/RLS/gateway/Edge/Web Locks reales, custodia/PV/parámetros y primera emisión/CAE siguen pendientes; también NC y representación fiscal final. SQL 001–021/Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy, consulta ARCA autenticada nueva, emisión/CAE real, merge o cambio master/Production. PR03/F08 y PR02 parciales. Contador/envases y restauración integral bloqueados, impresora/cajón/Point diferidos.

### 23/10/2026 — Cierre local de observación recuperable y modal

Suite completa 3331 PASS / 1 skipped / 253 archivos, salida 0 observada (pilot-fiscal-observation-ui-suite-results-20261023.json). Única omitida fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal nueva omitida. 601 dirigidas PASS / 9 archivos, build final PASS 655 módulos, 66 escenarios PostgreSQL 17.11 PASS; contenedor propio detenido/datos conservados y cero solicitudes externas/emisiones. Oxlint sin nuevos hallazgos, warning preexistente finally del runner; manifiesto histórico 43 SQL y diff PASS, SDK 32 RPC, escáner 1267 archivos/49 candidatos sin nuevos pares ruta/tipo y símbolos privados ausentes del bundle. Avisos de sourcemap/chunks conservados, no errores.

El flujo local de observar/recuperar/confirmar consulta queda integrado con SQL 021 y mismo ID, sin PII local, sin consulta ARCA al abrir y sin atribuir el cierre de otra terminal a una observación no ejecutada. Datos/estado de la constancia actual prevalecen sobre ACK histórico. No se libera número ni se reenvía factura ante falta de autorización. Este cierre no acredita consultas ARCA/JWT/RLS/Web Locks/Edge/visual/E2E hospedados ni CAE real. Siguientes bloques locales: notas de crédito y representación fiscal final, manteniendo preparación de aceptación hospedada y gates de custodia/PV/parámetros. SQL 001–021 y Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy, consultas ARCA autenticadas nuevas, emisión/CAE real, merge o cambio master/Production. PR03/F08 y PR02 siguen parciales; contador/envases y restauración integral bloqueados, impresora/cajón/Point diferidos.

### 23/10/2026 — F08: representación fiscal, hechos de impresión antes del PDF

Fuentes oficiales revisadas: especificación QR https://arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf (URL actual arca.gob.ar, JSON numérico/base64, CAE tipo E); requisitos de comprobantes https://www.afip.gov.ar/fe/emision-autorizacion/datos-comprobantes.asp y RG 5614 vigente https://biblioteca.afip.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5614%7Co%3A9%7Ca%3A2024%7Cf%3A12%2F12%2F2024 (representación gráfica/transparencia). No usar el PDF histórico de RG1415 con umbrales viejos como regla actual.

Situación: constancia 014 conserva cuerpo/CAE pero no razón social, domicilio comercial/IIBB/inicio, nombre/domicilio receptor ni descripciones impresas; snapshot de líneas conserva IDs/importes, no nombres de catálogo. El generador heredado admite defaults/parseInt/toFixed y configuración mutable; no sirve como fuente histórica de este circuito. Plan del incremento: contrato puro cerrado y SQL 022 privado para registrar una sola vez esos datos explícitos por operación/hash/Auth original, descripciones por IDs exactos del snapshot y otros impuestos nacionales indirectos declarados (sin inferir clasificación desde tributos). Fechas canónicas y decimal monetario, sin defaults; el cuerpo aporta CUIT/PV/IVA/condición y los importes reales. Guardado sólo antes de intención/recepción, con fuente/body vigentes y lectura durable tras ACK; getter histórico sin emisor/catálogo vigentes, metadatos/actor/cuerpo coherentes y sin credenciales. Tabla inmutable y sin permisos públicos. Corregir hechos requiere sucesora reservada con historial conservado, no reescribir presentación.

Después: integrar captura/confirmación y hash de presentación en revisión/permiso de emisión, fuente pública de representación con datos comerciales inmutables y constancia, QR y PDF multipágina sin configuración actual. No declarar representación final ni habilitar emisión por sólo preparar SQL 022. El gate de aceptación debe comprobar explícitamente el vínculo presentación→revisión→envío; sigue pendiente hasta implementarlo. Prueba visual/PDF digital posterior, sin impresora física. Verificar errores/Unicode/fecha/IDs, ACK perdido/falso, Auth reasignado/emisor cambiado, historial y locks nativos. Sin ARCA autenticada, claves, SQL remoto, flags, deploy ni emisión.

Continuación local: 17 pruebas del contrato de representación PASS y 149 regresiones de preparación SQL PASS (incluye carga de SQL 022). Esto no sustituye pruebas dedicadas de permisos, persistencia, concurrencia nativa ni integración revisión/permiso. La primera captura debe preceder también a cualquier revisión humana; replay exacto posterior conserva el historial. Tratamiento fiscal de envases descontados confirmado pendiente de contador; bloqueo conservado. Sin instalación remota ni emisión.

### 23/10/2026 — Representación: contrato histórico privado, integración pendiente
SQL 022 y servicio privado guardan una sola vez hechos explícitos de emisor/receptor y descripciones por IDs exactos del snapshot, ligados al cuerpo/hash y Auth original. Fecha canónica e importe decimal obligatorio, sin defaults de configuración mutable. Guardado inicial anterior a cualquier revisión o intención; replay exacto permite recuperación histórica tras revocación/sustitución. Tabla inmutable sin acceso directo para anon/authenticated/service_role. Sólo lectura durable confirma éxito ante ACK perdido/falso; no se agrega ruta HTTP ni emisión.

Evidencia local: 221 pruebas dirigidas PASS / 4 archivos (pilot-fiscal-presentation-targeted-20261023.log); 70 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-concurrency-v2-20261023.json), con duplicados, rollback, Auth reasignado y emisor revocado esperando lock. Contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Primer ensayo no inició por Docker apagado; evidencia fallida conservada. Aserción histórica sobre campos privados corregida porque la secuencia cae de un UUID aleatorio causaba falso positivo; control ahora identifica claves JSON. Oxlint sin nuevos hallazgos; warning finally preexistente del runner conservado. Manifiesto histórico 43 SQL PASS; escáner 1272 archivos/49 candidatos sin nuevos pares ruta/tipo frente al cierre anterior. Suite global 3331/1/253 corresponde al HEAD anterior, no se repitió en este incremento.

Pendiente imprescindible: captura/confirmación en UI y vínculo del hash de presentación a revisión/permiso/envío, fuente final/QR/PDF, notas de crédito y aceptación hospedada. Este contrato aislado NO cierra representación fiscal, PR03/F08 ni PR02. SQL 001–022 y Edge sin instalar/habilitar por nosotros, flags sin activar; sin deploy, claves, ARCA autenticada, emisión real/CAE, merge o cambios master/Production. Envases descontados pendientes del contador, restauración integral bloqueada; impresora/cajón/Point diferidos.

Cierre de comprobaciones del incremento: build final PASS 655 módulos (pilot-fiscal-presentation-build-20261023.log), diff PASS y cero coincidencias de servicio/RPC/gate privados en dist. Escáner comparado por ruta/tipo: delta vacío. No se repitió la suite global; 221 dirigidas y 70 nativas son la evidencia actual.

### 23/10/2026 — F08: aprobación ligada a representación (incremento privado)
Implementar SQL 023 sin instalación: vínculo inmutable revisión/presentación, aprobación con hash esperado explícito y lectura durable. Cuando existen hechos 022, la aprobación antigua debe rechazarse; no atribuir al Dueño datos que no confirmó. Consumo privado con hechos exige la misma revisión/hash/Auth/cuerpo y no debe seleccionar una aprobación antigua distinta. Mantener los contratos históricos sin presentación para no reescribir auditoría; esto no acredita el gate obligatorio para nuevas preparaciones 012, que debe quedar impuesto junto a captura/UI antes de activación. El incremento es parcial y no habilita endpoint/flags/emisión. Probar hash/actor/ACK/permisos/replay y consumo ligado; después integrar DTO/UI y la exigencia de datos para toda preparación nueva. No activar con fallback heredado ni llamar ARCA.

### 23/10/2026 — Revisión ligada a los hechos históricos (parcial)
SQL 023 conserva vínculo inmutable entre revisión y hash de presentación. La aprobación exige hash esperado explícito de cuerpo y presentación, venta/Auth original y misma revisión; la ruta anterior rechaza operaciones con hechos 022. Helper histórico queda privado sin execute externo. El consumo verifica el mismo revision_aprobada_id elegido por 011 y su vínculo/Auth/hash, revirtiendo intención y uso del permiso si falta. Guardado de hechos después de cualquier revisión sigue bloqueado; no se reconstruye aprobación histórica ni se extiende vigencia por replay.

Servicio privado captura Auth una vez y confirma exclusivamente mediante lectura durable del mismo UUID/cuerpo/hash; replay temprano no escribe, ACK perdido/falso no confirma a ciegas. DTO cerrado sin permiso/custodia; SDK 36 RPC. No se agrega ruta HTTP ni acción de emisión. Compatibilidad de historia sin hechos preservada: aún falta exigir presentación para toda preparación nueva 012, captura/confirmación UI y revisión pública ligada antes de activar. Este incremento NO acredita esa obligatoriedad global ni cierra representación final/QR/PDF/NC.

Evidencia: 521 pruebas dirigidas PASS / 8 archivos, salida 0 (pilot-fiscal-presentation-review-targeted-20261023.log), 73 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-review-concurrency-20261023.json), build final PASS 655 módulos. Se probaron hash distinto, ruta antigua/helper bloqueados, inserción del vínculo omitida sin aprobación parcial, selección de revisión más reciente sin vínculo que revierte intención/permiso, replay y dos workers/mismo UUID. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Manifiesto histórico 43 SQL PASS, oxlint sin nuevos hallazgos (finally preexistente del runner), escáner 1276 archivos/49 candidatos. Suite global 3331/1/253 sigue siendo evidencia histórica de 14fccb0, no nuevo pase.

SQL 001–023 y Edge sin instalar/habilitar por nosotros; flags sin activar, sin deploy/claves/ARCA autenticada/emisión real/CAE ni merge/cambios master/Production. PR03/F08 y PR02 parciales. Envases descontados pendientes del contador y bloqueados; restauración integral bloqueada; impresora/cajón/Point diferidos. Siguiente gate local: integrar captura y DTO/confirmación ligada, luego imponer presentación en toda intención nueva de preparación 012 sin fallback histórico; aceptación hospedada y autorización de instalación siguen separadas.

### 23/10/2026 — F08: fuente pública para captura y acciones de representación
La pantalla no dispone de IDs inmutables de detalles; no usar IDs/nombres del catálogo actual para reconstruirlos. Preparar SQL 024/getter acotado de líneas del snapshot (ID, cantidad, precio y subtotal decimales explícitos), con Auth original/venta/operación/cuerpo. Integrar acciones HTTP cerradas para contexto/hechos/guardado/aprobación ligada y su recuperación, usando servicios existentes y límite 64KiB sólo para propuesta. Sin emisor/custodia/TA/ARCA ni nueva emisión. Luego integrar cliente bajo el mismo Web Lock, captura/UI y obligatoriedad para toda intención nueva 012; no activar mientras falte ese guard. Este incremento de transporte/fuente es dependencia concreta de la captura, no cierre de UI ni representación final.

### 23/10/2026 — F08: captura histórica y aprobación ligada integradas localmente
SQL 024 aporta sólo IDs, cantidades y precios/subtotales del snapshot inmutable, con venta/operación/Auth original/cuerpo. No reconstruye nombres ni precios desde catálogo actual. HTTP agrega CONTEXTO_REPRESENTACION, DATOS_REPRESENTACION, GUARDAR_REPRESENTACION, APROBAR_REPRESENTACION y APROBACION_REPRESENTACION: objetos cerrados, 64KiB sólo para propuesta y 2KiB para consultas/aprobación, Auth real único por servicio, sin TA/custodia/ARCA ni acción EMITIR. Respuesta pública de hechos contiene canónico/hash; datos derivados se recomputan después de verificarlos en el cliente. SDK privado 37 RPC.

Cliente captura revisión/fuente/hechos antes del hash asíncrono, comprueba IDs/hash y fecha/impuesto contenido contra cuerpo y comparte Web Lock por venta con las otras mutaciones. Sólo getters durables confirman guardado/aprobación ante ACK perdido/falso. No persiste datos de emisor/receptor/descripciones en navegador; guarda únicamente UUID/vence de aprobación ya existente. Captura de identidad esperada antes del fetch evita atribuir una respuesta a referencias mutadas.

Modal existente integra formulario sin defaults de configuración, fecha dd/mm/aaaa, cantidades/importes con coma decimal, nombres/domicilios/IIBB/inicio/descripciones e impuesto nacional contenido declarado sin sumarlo otra vez. Guarda antes de mostrar aprobación; panel muestra los datos conservados y exige confirmación ligada. Recuperar aprobación vuelve a comprobar vínculo exacto. La pantalla reservada ya no llama APROBAR_REVISION. Sucesoras reservadas/R exigen hechos nuevos, sin heredar datos ni aprobación; revisión antigua sin hechos pide corrección conservando el número. Fallos de lectura/venta cambiada no muestran aprobación o formulario de reemplazo a ciegas. Artefacto visual/hospedado aún no acreditado.

Cierre: suite completa 3421 PASS / 1 skipped / 259 archivos, success=true y salida 0 observada (pilot-fiscal-presentation-ui-suite-results-20261023.json y pilot-fiscal-presentation-ui-suite-run-20261023.log). Única omitida F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal omitida. Selección dirigida 484 PASS /9 archivos; selección adicional cliente/formulario 11 PASS /2 (4 de formulario se superponen, no sumar como pruebas únicas). 75 escenarios PostgreSQL 17.11 PASS (fiscal-presentation-ui-concurrency-v2-20261023.json), incluidos catálogo cambiado y Auth reasignado sin revelar líneas; contenedor propio detenido/datos conservados, cero solicitudes externas/emisiones. Primer ensayo falló en step 0 por Docker apagado, sin crear contenedor; log conservado. Build final PASS 659 módulos, salida 0 (pilot-fiscal-presentation-ui-build-final-20261023.log). Build anterior v2 dejó log incompleto y handle ausente; no se cuenta como PASS. Pase nuevo final posterior a controles/decimal sí observado.

Oxlint sin nuevos hallazgos, warning finally preexistente del runner; manifiesto histórico 43 SQL/diff PASS. Escáner 1283 archivos/49 candidatos y delta ruta/tipo vacío; entradas privadas del nuevo servicio/RPC/custodia ausentes del bundle. Fallos iniciales de unión TypeScript, fixtures de sucesoras que devolvían hash anterior y DTO HTTP con datos derivados extra se corrigieron antes del cierre global; no se contaron como PASS ni se ampliaron contratos/permisos.

PR03/F08 y PR02 siguen parciales. Próximo gate local obligatorio: exigir hechos/revisión ligada en TODA intención nueva desde servidor y antes de TA/envío, sin fallback de preparación heredada; preservar recuperación/historia de intentos ya existentes. Luego fuente final/QR/PDF/NC y aceptación hospedada/visual/Web Locks/JWT/RLS/Edge, custodia/PV/parámetros y primera emisión/CAE expresamente autorizados. SQL 001–024/Edge sin instalar/habilitar por nosotros, flags sin activar, sin deploy ni nuevas consultas fiscales autenticadas/claves/emisión real. Sin merge ni cambios master/Production. Contador/envases descontados bloqueados; restauración integral bloqueada; impresora/cajón/Point diferidos.

### 23/10/2026 — F08: obligación global antes de nueva intención (en implementación)
SQL 025 deberá exigir preparación 012, hechos 022 y revisión 023 del mismo cuerpo/Auth/emisor para toda intención nueva, sin exención para operaciones heredadas. Guard privado antes de TA y guard transaccional de reserva/consumo; revocar execute directo del helper de intención para que sólo el wrapper revisado pueda crearlo. Replay/conciliación de intentos ya existentes conserva historia, sin fabricar hechos/aprobaciones ni otro envío. Migrar fixtures de emisión al flujo explícito real; mantener los ensayos de contratos históricos identificados como tales. En PostgreSQL, comprobar actualización sobre historia previa y escenarios posteriores a 025, distinguiendo ambas fases de evidencia. Probar faltantes, cuerpo/hash/actor, catálogo/emisor, vencimiento durante locks, ACK, rollback y recuperación, antes de publicación. Sin SQL remoto, flags, TA real, ARCA autenticada, emisión/CAE o deploy.

### 23/10/2026 — Retiro local de la ruta fiscal heredada
Hallazgo de revisión: afip-wsfe conserva firma/emisión antigua sin vincular JWT al comercio/revisión nueva; el plan ya prohibía desplegarlo como backend nuevo, pero el archivo seguía ejecutable. Retirarlo localmente con respuesta 410 incondicional y sin acceso a cuerpo, secretos, base o red; Git conserva la implementación histórica. No desplegar ni modificar instalación remota. Además, emitirComprobantePrueba del store aún podía fabricar una demostración CAE desde un caller directo en piloto estricto: agregar el mismo guard temprano que ya tiene emitirFacturaVenta, preservando modo legado false. Probar ausencia de red/lectura/mutaciones y respuesta retirada. Este cierre complementa SQL 025; no presupone estado remoto del endpoint ni autoriza activación.

### 23/10/2026 — F08: obligación global de representación y retiro legado preparados
SQL 025 exige para TODA intención nueva preparación explícita 012, hechos 022 y revisión ligada 023 del mismo Auth/cuerpo/emisor/parámetros. Compara cuerpo sin número con datos preparados, canónico/hash y catálogo vigente; no hay exención para operación heredada. Trabajador usa RPC autorizar_envio_presentado_homologacion antes de TA/numeración; valida DTO cerrado y mismo ID de revisión/cuerpo. Trigger de reserva revalida dentro de la transacción que crea intención y 011/023 conservan consumo/revisión exactos. Execute directo de registrar_intento_fiscal_homologacion queda revocado a anon/authenticated/service_role; wrappers SECURITY DEFINER revisados siguen siendo la entrada. SDK privado 38 RPC, sin nueva acción HTTP/EMITIR.

Vigencia de revisión se comprueba tras el último lock del vínculo; contexto/parámetros se recargan allí para detectar vencimiento durante espera antes de TA. Reasignación de Auth, rotación de emisor, parámetro/cuerpo/revisión ajenos o faltantes fallan cerrados. Getter 023 también rechaza presentar aprobación antigua como vigente tras rotar emisor: debe corregirse preparación, no reinterpretar ACK ni fabricar otra aprobación. Recuperación de intenciones ya existentes no crea hechos/revisiones ni otro intento; historia se conserva.

Fixtures de emisión/devolución migrados a preparación/hechos/aprobación reales en PostgreSQL embebido. No se restauraron permisos antiguos para pasar pruebas. Casos de devolución con factura reservada/incierta/autorizada siguen rechazados sin cambios de stock/caja; autorización sintética se crea por ledger, no UPDATE privilegiado de estado. Aislamiento incompatible ahora rechaza desde el primer gate de preparación, conservando ausencia de reserva/devolución.

Retiro local de afip-wsfe: entrypoint delega a respuesta 410 sin leer cuerpo, secretos, base o red; implementación anterior conservada en Git. No se comprobó ni modificó su instalación remota. Store bloquea emitirComprobantePrueba al inicio en piloto estricto, antes de cargar configuración, fabricar demostración CAE o persistir; false conserva comportamiento legado. El plan ya prohibía ese endpoint como fallback y ahora el código local lo deja retirado. Antes de aceptación hospedada, verificar y retirar/denegar cualquier instalación antigua con autorización específica.

Cierre final: 3436 PASS /1 skipped /260 archivos, success=true y salida 0 observada (pilot-fiscal-required-presentation-suite-v2-results-20261023.json y suite-v2-run). Omitida sólo fixture histórica F6_C3A_CANDIDATES_PATH no configurada; ninguna fiscal omitida. 493 dirigidas PASS /7 archivos; selección retiro/store/devolución 64 PASS /3 con superposición, no sumar como únicas. Primer global 3429 PASS/2 fallidas/1 skipped conservado: fixtures de devolución aún invocaban helper revocado; corregidos sin reabrir grants. Fallos dirigidos de fixtures/emisor/aislamiento conservados, no contados como PASS.

PostgreSQL 17.11: 85 escenarios PASS (fiscal-required-presentation-concurrency-v3-20261023.json). Fases explícitas: 73 casos de compatibilidad previos a instalar 025; instalación repetida preserva reservas; 12 posteriores (10 específicos de 025 +2 de catálogo/CAE heredado). No afirmar que los 85 se ejecutaron con 025 desde el inicio. Nuevos: replay histórico sin crear hechos, nueva operación heredada bloqueada, helper directo denegado, dos workers/un consumo, rollback y vencimientos de revisión/parámetros esperando op/vínculo, Auth/emisor durante espera. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. Pases previos de 83/84 conservados; final v3 añade parámetros después del último lock.

Build final PASS 659 módulos/salida 0 (pilot-fiscal-required-presentation-build-v2-final-20261023.log); manifiesto histórico 43 SQL/diff PASS. Oxlint sin nuevos hallazgos; warnings previos finally del runner y errInvoke del store conservados (éste no modificado). Escáner 1286 archivos/49 candidatos sin nuevos pares ruta/tipo; guard/RPC/retirement/custodia privados ausentes del bundle público. Avisos históricos de sourcemap/chunks no son errores. No se editaron fuentes durante el global final.

El gate LOCAL de obligación de datos/revisión antes de intención queda preparado. PR03/F08 y PR02 siguen parciales: fuente final/QR/PDF/NC, aceptación hospedada JWT/RLS/Edge/Web Locks/visual y retiro remoto legado, custodia/PV/parámetros y primera emisión/CAE siguen pendientes. SQL 001–025/fiscal Edge sin instalar/habilitar por nosotros, flags apagados, sin deploy/claves/ARCA autenticada/emisión real ni merge/cambios master/Production. Envases descontados pendientes del contador; restauración integral bloqueada; impresora/cajón/Point diferidos. Próximo bloque local: fuente íntegra para representación autorizada y QR/PDF, sin reconstrucción desde catálogo/configuración actuales.

Instalación futura: usar familia 001–025 compatible, incluida 023 actualizada para rechazar replay tras rotación de emisor. No instalar 025 aislada sobre versiones incompatibles; aceptación y autorización remotas siguen siendo requisitos.

### 23/10/2026 — F08: fuente íntegra de representación autorizada (en implementación)
SQL 026 deberá unir constancia 014 autorizada, hechos 022, líneas 024 y vínculo 023 de la revisión realmente consumida. Reutilizar prueba histórica 015, sin emisor/catálogo vigente, TA o red; descripción IVA del receptor desde revisión histórica de parámetros y condición del emisor desde preparación explícita. Verificar sumatoria de subtotales contra snapshot/total fiscal, IDs exactos, tiempos de consumo y mismo cuerpo/hash/Auth. El checkout 008 exige suma de detalles=total y manualCheckoutRequest también valida ese reparto; no recalcular descuentos/envases a partir de precio×cantidad ni inventar un ajuste para historia inconsistente. Denegar representación si falta vínculo o coherencia; constancia 014 permanece disponible. DTO cerrado/validador puro/servicio privado y acción de sólo lectura, sin PII local. Después QR/PDF a partir de esa única fuente, sin usar TicketData/configuración actuales. Pruebas de cambios de catálogo/emisor, historia, autorización, campos/hash/IDs/importes y ACK/errores; SQL remoto y emisión siguen gated.

QR: especificación oficial revisada nuevamente (https://arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf): URL actual https://www.arca.gob.ar/fe/qr/, JSON versión 1/Base64, valores numéricos exactos para importe/cotización/documentos/CAE y tipo E. Preparar generador puro que vuelva a validar la representación completa, sin afipQR heredado, defaults, parseInt/toFixed ni conversión de decimales por float. Serializar números desde cadenas canónicas validadas y proteger Base64 como parámetro URL. Salida marcada sólo homologación/sin validez fiscal; no consulta ni acredita ARCA. PDF/imagen y validación visual posteriores.

### 23/10/2026 — Representación fiscal: avance local y decisión del Dueño
El tratamiento fiscal de los envases recibidos que descuentan el ticket sigue pendiente de definir con el contador, confirmado por el Dueño. Mantener bloqueada la preparación fiscal de esas ventas; no inferir su tratamiento ni aplicar defaults.
Fuente histórica SQL 026, servicio/acción de lectura y generador QR puro preparados localmente. Cruzan autorización, revisión consumida, Auth original, cuerpo/hash, líneas e importes sin reconstruir desde catálogo/emisor actuales. No hay PDF ni QR visual exportable todavía. SQL 001–026 y Edge sin instalación/activación remota autorizada.
Validación dirigida: 481 PASS /7 archivos; después de corregir exclusivamente el tipo de una prueba negativa, QR 6 PASS. PostgreSQL 17.11: 87 escenarios PASS, con 73 anteriores a 025 y 14 posteriores a 025+026; cero solicitudes externas/emisiones. La suite global 3436 PASS/1 skipped pertenece al HEAD anterior y no constituye una ejecución global de estos cambios. Compilación final PASS con salida 0 (pilot-fiscal-representation-source-build-v2-20261023.log); manifiesto de 43 SQL y diff sin errores. Revisión local: lint sin hallazgos nuevos (warning finally previo del runner), escáner 1293 archivos/49 candidatos sin nuevos pares ruta/tipo, controles privados ausentes del bundle. Publicación aún pendiente. Continúan pendientes PDF/validación visual, notas de crédito, aceptación hospedada, custodia, PV acreditado y primer CAE autorizado. Impresora y Point diferidos; Production/master intactos.

### 23/10/2026 — F08: PDF local desde representación autorizada
Continuación: generar A4 paginado con marca permanente de homologación/sin validez fiscal en cada página, identificación/cuerpo/CAE/QR de la fuente 026 y detalle comercial histórico, sin consultar stores ni recalcular descuentos. Mostrar campos fiscales explícitos y subtotales finales registrados, distinguiendo precio/cantidad comerciales de la determinación impositiva del cuerpo. No inventar IVA por renglón ni etiquetar aprobación del layout/legal/comercial como completada. Revalidar fuente completa antes de exportar, congelarla ante esperas asíncronas, denegar glifos no soportados antes de producir un PDF ilegible; soporte tipográfico completo y aceptación fiscal del layout seguirán gate si falta evidencia. Probar importes, alteración de cuerpo/fuente, paginación y textos largos, ausencia de red/descarga automática. Generar muestras sintéticas fuera de Git y renderizar/inspeccionarlas; integrar botón sólo después de cerrar modelo/layout y pruebas. No emisión/instalación remota ni cambios en funciones de ticket legado.
### 23/10/2026 — PDF local de homologación preparado; aceptación fiscal pendiente
Fuente/QR publicados en 4f83002 (PR #3 Draft, base remota 03a798f, sin merge). PDF A4 paginado desde fuente 026 revalidada y capturada antes de esperas; muestra datos históricos, detalle comercial con subtotales finales, importes fiscales explícitos, CAE/QR e identificadores/hash. No calcula IVA por renglón ni vuelve a calcular descuentos desde cantidad×precio. No usar este avance como acreditación de un layout fiscal/comercial completo.
Descarga explícita integrada al modal detrás del gate de homologación existente (sin activar): consulta representación autorizada, comprueba venta/operación/cuerpo/CAE y conserva constancia ante fallo. Doble clic excluido; cierre/cambio de comprobante descarta resultados tardíos; no emite, no toca stock/caja ni almacena PII. Generador puro no descarga/imprime ni consulta stores/red. Importación diferida de PDF.
151 PASS dirigidas /6 archivos (PDF, exportador, modal, modelo, QR y cliente), build final v4 PASS/salida 0; lint sin hallazgos en el bloque. Escáner1297 archivos/49 candidatos sin nuevos pares ruta/tipo; controles/custodia privados ausentes del bundle. Evidencia: pilot-fiscal-representation-pdf-ui-targeted-v4-20261023.log y pdf-build-v4. No se repitió suite global ni PostgreSQL por este cambio de representación; 3436/1skip/260 y 87 escenarios corresponden a ejecuciones anteriores documentadas, no sumar a estas151 como pruebas únicas. Fallos iniciales de fixture de201caracteres/matchers no disponibles conservados en logs, corregidos sin cambiar contratos o añadir dependencias. Render/inspección visual de muestras sintéticas de1 y21 páginas; extracción pdfplumber confirma200renglones, total/CAE y marcas en todas las páginas, sin texto fuera de límites. Poppler avisó de fuentes auxiliares Symbol/ArialUnicode no disponibles; Helvetica usada inspeccionada legible. PyMuPDF no instalado; comprobación final realizada con pdfplumber disponible.
Límite explícito: Helvetica admite Latin-1 (tildes/ñ), se bloquean glifos fuera de ese conjunto antes de generar PDF y se informa en UI; falta fuente Unicode adecuada y aceptación del layout/semántica fiscal/comercial. Sólo A/B/C y PES/cotización1 del contrato vigente. No hay validación física del QR/impresora ni emisión real. Muestras fuera de Git, datos/CAE enteramente ficticios; no son comprobantes de ARCA. Sigue pendiente aceptación hospedada JWT/RLS/Edge/visual, instalación autorizada de SQL001–026/Edge, notas de crédito, PV/custodia y primer CAE expresamente autorizado. Envases descontados bloqueados hasta definición del contador; restauración integral bloqueada. Production/master intactos; impresora/cajón/Point diferidos.

### 23/10/2026 — F08/NC: inventario y contrato previo a persistencia
La factura usa raíz única por venta/entorno (001), tipos1/6/11 y cuerpo versión1 cerrado. SQL010 impide devoluciones comerciales de ventas reservadas/autorizadas. No ampliar esos enums ni levantar010 para habilitar NC: necesita identidad/cuerpo/serie/diario propios y vínculo inmutable a factura. Consultado el índice oficial vigente: manual WSFEv1 v4.7 (revisión01/09/2026), https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf; el PDF3.4.2 encontrado por búsqueda es histórico y no la referencia vigente. ARCA indica que el emisor originario debe relacionar la nota a comprobante(s) previo(s); contrato del piloto usará exactamente una factura propia de mismo CUIT, con tipo/punto/número/fecha del cuerpo autorizado, sin período genérico ni MiPyME. Estas son restricciones del piloto, no afirmar que ARCA prohíbe otras variantes.
Primer incremento: propuesta pura no persistida de NC parcial/total de devolución, original026 revalidado, UUID de solicitud, fecha/motivo explícitos, líneas vinculadas por detalle/cantidad/importe/reposición e importes/IVA/tributos explícitos, exactos con enteros. Derivar sólo referencia/tipo3/8/13 desde factura A/B/C; no inventar número/PV actual/IVA proporcional/permiso/envío. Fecha operativa se recibe como contexto explícito futuro del servidor; propuesta no acredita ese origen. Límites por caso contra factura no equivalen a saldo disponible: persistencia futura debe bloquear factura/retornos/casos, reservar cantidades y componentes impositivos acumulados y recalcular importe comercial contra snapshot/receta e historial. Condición IVA receptor deberá declararse explícita y validarse contra catálogo vigente, sin heredarla automáticamente de factura. Antes de trabajador NC: revisión/credenciales actuales/CUIT original, numeración propia y asociación en XML/FECompConsultar/hash/respuesta, cancelación/ACK/crash/concurrencia y aplicación comercial exactamente una vez. Devolución/caja/stock siguen bloqueados por010; este contrato no los libera ni crea una emisión.
### 23/10/2026 — NC: propuesta parcial/total preparada localmente
Se agregó fiscalCreditDraft como contrato puro, separado del cuerpo versión1 de facturas. Revalida original026, captura fuente/propuesta antes de esperas, fija asociación exacta y tipo3/8/13 desde facturaA/B/C, exige fecha/motivo/IVA receptor y cantidades/importes/reposición explícitos. Desglose de impuestos y límites por caso con enteros exactos; no infiere IVA proporcional ni modifica impuestos/identidad de la factura. Descripción de tributos80caracteres y alícuota3+2 del manual oficial WSFEv1 v4.7 (https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf), conservando escala canónica4 sólo con decimales adicionales cero, sin truncar/redondear. Referencia general del emisor/origen: https://www.arca.gob.ar/facturacion/comprobantes/tipos.asp. La fecha no anterior a factura es política del piloto, no una prohibición general atribuida a ARCA.
102 PASS /3 archivos (NC, representación y conciliación), buildv2 PASS/salida0; lint sin hallazgos; manifiesto43 y diff PASS; escáner1299archivos/49candidatos sin nuevos pares ruta/tipo, contrato privado ausente del bundle. Evidencia pilot-fiscal-credit-draft-targeted-v2-20261023.log /credit-draft-build-v2 /credit-draft-scan-v2. No suite global/PostgreSQL nuevos por este contrato puro, ni nueva instalación SQL/Edge, HTTP/worker/flag, red autenticada, numeración, emisión, CAE real o efectos venta/stock/caja. No sumarlas con pruebas históricas como ejecución única.
Estado PROPUESTA_NO_PERSISTIDA/emision_habilitada=false: el hash sólo fija contenido, no acredita permisos, catálogo, fecha/saldo de servidor o devolución válida. El contrato todavía no valida saldo acumulado ni reparto comercial proporcional contra historial y receta; SQL010 conserva bloqueo de devolución fiscal. Próximo: persistencia de caso/identidad y saldos con locks, originalAuth/currentissuer/CUIT/catálogo/revisión, cancelación/replay/ACK/crashes/concurrencia, contrato/XML/conciliación específico NC y aplicación comercial exactamente una vez. Se consultó al titular cuándo entregar efectivo/reponer stock respecto de la confirmación ARCA; decisión pendiente, sin asumir respuesta. NC/PR03/F08/PR02 parciales. Tipografía/aceptación del PDF, pruebas hospedadas JWT/RLS/Edge, PV/custodia y primer CAE con autorización siguen pendientes; contador/envases bloqueado, restauración integral bloqueada, impresora/cajón/Point diferidos. PR #3 Draft, sin merge ni cambios master/Production.

### 23/10/2026 — NC: decisión de reintegro y diseño de reserva durable
El titular confirmó: entregar efectivo y reponer stock solamente DESPUÉS de que ARCA confirme la NC. Respuesta incierta => conciliación, sin efectos comerciales. Preparación/reserva no equivale a autorización; SQL010 sigue intacto hasta integrar el cierre comercial con prueba de CAE NC y aplicación única.
Diseño incremental027: casos NC privados e inmutables por UUID, Auth original y factura026; canónico/hash validados también en SQL, actor/comercio/venta/factura bloqueados en orden existente, emisor actual del mismo CUIT y parámetros vigentes capturados sin crear permiso/envío. Serializar por factura con READ COMMITTED, verificar snapshot vigente y ausencia de devoluciones incompatibles; límites acumulados de cantidades, importes, componentes/IVA/tributos y reparto histórico acumulativo de centavos. Reservar no modifica efectivo/stock ni acredita receta/pagos/catalogación NC para enviar (son gates posteriores obligatorios).
Cancelación previa a envío append-only, mismo Auth/hash, nunca delete/reutilización del UUID. Para conservar reparto de centavos, sólo cancelar el caso activo más reciente de esa factura; revertir sucesores primero. Getter/replay históricos conservan identidad aun si cambian emisor/catálogo; no reactivar cancelados. La futura intención/worker NC debe ampliar este estado y hacer incompatible cancelación después de intención bajo los mismos locks antes de habilitarse; actualmente no existe ruta de emisión NC. Probar ACL/RLS/role, Auth reasignado, saldo/centavos, dos escritores/cancelación/rollback y vencimientos durante locks con PostgreSQL real antes de publicación. Sin instalar SQL/Edge remotamente.
### 23/10/2026 — NC: saldo durable SQL027 preparado y decisión confirmada
El titular confirmó entregar efectivo y reponer stock DESPUÉS de confirmación ARCA de la NC. Incertidumbre => conciliación; preparación o reserva no permiten efectos comerciales. Se conserva SQL010 hasta cerrar el circuito de autorización NC y aplicación exactamente una vez.
SQL027 agrega borradores/cancelaciones privados, canónico/hash, Auth original/factura026, emisor actual del mismo CUIT y parámetros vigentes capturados. Revalida asociación/fecha/textos/decimales/importes/IVA/tributos en SQL; READ COMMITTED y locks por venta/factura serializan cantidades/componentes acumulados y prorrateo histórico de centavos. UUID/cuerpo inmutables, ACK consultable, replay no reactiva cancelados; cancelación append-only sólo del caso activo más reciente para conservar reparto. Todas las respuestas mantienen emision/reintegro/reposicion_habilitada=false. No escribe efectivo/stock/devoluciones ni reserva numeración NC.
245 PASS /3 archivos (SQL202, contratoNC31, representación12), build PASS/salida0; manifiesto43/diff PASS. Oxlint sin hallazgos nuevos (finally previo del runner); escáner1300archivos/49candidatos sin nuevos pares ruta/tipo; funciones privadas ausentes del bundle. Evidencia pilot-fiscal-credit-reservation-targeted-v3-20261023.log /credit-reservation-build-v1 /credit-reservation-scan-v1. La suite global3436/1skip/260 es histórica, no una nueva ejecución de este cambio. Primer ensayo SQL falló por CASE sin paréntesis (186 omitidas por fallo de suite, no PASS); corregido y luego186 PASS. Fixture tributaria ocultaba helperinput, corregida sin debilitar contratos; registros fallidos conservados.
PostgreSQL17.11:95 escenarios PASS/salida0 en fiscal-credit-reservation-concurrency-v2-20261023.json. Fases:73 anteriores a025,14 posteriores a025+026,8 nuevos después de instalar027 dos veces. Casos027: mismoUUID/unACK, UUIDdistintos/saldo único, cancelación/saldo/historia, rollback durante espera, centavos/cancelación inversa, Auth reasignado, emisor revocado y parámetros vencidos esperando lock. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-301893a0 detenido y datos conservados. v1 falló en paso0 por Docker apagado; se inició Desktop en segundo plano, se confirmó motor29.9.2 y se ejecutó v2, sin borrar la evidencia anterior.
Pendiente: servicio/HTTP/cliente/UI del caso, receta/pagos/unidades elegibles y preparación fiscal NC completa con catálogo específico, revisión/credenciales actuales, serie/cuerpo/worker/FECompConsultar propios y exclusión con cancelación DESPUÉS de intención (debe instalarse ese guard en la misma migración que agregue intención NC antes de habilitar worker). SQL027 sólo tiene borradores, no una ruta de envío. Antes de habilitar devolución comercial: CAE NC durable coincidente y aplicación única, caja abierta y políticas de reintegro, E2E/concurrencia. Nueva reserva aún no acredita elegibilidad comercial o fiscal de emisión. SDK/HTTP no ampliados por este incremento. Backup JSON de la app no acredita copia de estas tablas privadas: incluir borradores/cancelaciones NC en dump y aceptación de restore integral autorizado junto al resto del diario fiscal. Restore integral sigue bloqueado.
SQL001–027/Edge no instalados/habilitados remotamente por nosotros; flags apagados, ningún deploy, TA/consulta ARCA autenticada nueva, CAE real, merge o cambio master/Production. NC/PR03/F08/PR02 parciales. Contador/envases, PDFtipografía/aceptación, PV/custodia y aceptación hospedada conservan gates. Impresora/cajón/Point diferidos.

### 23/10/2026 — NC: servicio privado y transporte de borradores
Incremento siguiente: servicio verifica Auth.getUser exactamente una vez y usa ese Auth capturado en fuente026 y RPC027; captura propuesta antes de esperar, fecha Argentina desde reloj servidor (SQL vuelve a comprobarla), prepara canónico/hash sin confiar actor/origen enviados por browser. ACK público cerrado de10campos, mismoUUID/venta/operación/hash y tres habilitacionesfalse. Guardado/cancelación recuperan por getter tras respuesta perdida, sin reenviar escritura automáticamente; ausencia confirmada distinta de error. Nunca retornar fuente/credenciales/datos fiscales privados en ACK.
Agregar3RPC al SDK privado (39→42) y acciones HTTP GUARDAR_BORRADOR_NC/BORRADOR_NC/CANCELAR_BORRADOR_NC con JSON estricto/límites existentes (64KiB escritura,2KiB consultas), no actor externo. Flag privado ARCA_HOMO_CREDIT_DRAFTS_ENABLED apagado por defecto exigido antes de crearAdmin para guardar; consulta/cancelación conservan recuperación bajo gate backend/Auth/SQL, sin requerir abrir guardado. No EMITIR, TA/custodia/WSAA/WSFE, número NC ni efectos comerciales. Probar DTO/ACK alterado, sesión/Auth una vez, reloj Argentina, ACK perdido y SQL real usando el mismo dispatch protegido. Sigue decisión confirmada CAE antes de efectivo/stock; no activar flags ni instalar SQL/Edge remotamente.
### 23/10/2026 — NC: servicio y HTTP privados preparados localmente
Servicio verifica Auth.getUser una vez/captura ese Auth para fuente026 y RPC027, propuesta y scope capturados antes de esperas y fecha operativa Argentina del reloj servidor (SQL la revalida). Guardado/cancelación recuperan ACK mediante getter durable después de respuesta perdida; no reenvían automáticamente escritura. Ausencia confirmada devuelve null, error no equivale a ausencia. ACK cerrado de10campos ligado a venta/factura/UUID/hash, emision/reintegro/reposicion false; sin devolver fuente/canónico/metadatos de custodia. DTO exige strings literales, sin coerción de arrays; se corrigió también esa validación de condición emisor en la fuente compartida y se agregó regresión.
HTTP incorpora GUARDAR_BORRADOR_NC (64KiB), BORRADOR_NC y CANCELAR_BORRADOR_NC (2KiB), JSON estricto/duplicados/raíces cerradas y las protecciones de host/origen/backend/sesión existentes. Guardado exige ARCA_HOMO_CREDIT_DRAFTS_ENABLED exactamente true antes de crear Admin; apagado por defecto/no activado por nosotros. Consulta/cancelación siguen disponibles con gate de guardado apagado bajo backend/Auth/SQL, para recuperar casos; no habilitan emisión ni efectos comerciales. SDK privado39→42RPC explícitas. No acción EMITIR_NC, TA, custodia, WSAA/WSFE ni flags públicos nuevos.
512 PASS /10 archivos, salida0 observada (pilot-fiscal-credit-service-targeted-v5-20261023.log), buildv3 PASS/salida0. Incluye HTTP–servicio–SQL027 con Auth simulado/identidad capturada y PostgreSQL embebido: ACK perdido de guardado/cancelación, gate propio, recuperación sin flag de escritura, Auth reasignado entre fuente y guardado (sin caso creado), DTO/hash y reloj Argentina, más regresiones contrato/fuente/PDF/QR/modal. No acredita JWT/RLS/Edge hospedados. Se conservan fallos previos de paréntesis/alias/factory de fixture y unión de tipos; corregidos sin casts de escape, supresiones ni cambios de permisos. Lint dirigido limpio; manifiesto43/diff PASS; escáner1303archivos/49candidatos sin nuevos pares ruta/tipo; servicio/RPC/flag privado ausentes del bundle. SQL no cambió en este incremento:95 escenarios PostgreSQL17.11 del cierre027 son evidencia anterior, no una nueva ejecución de este servicio; suiteglobal3436/1skip/260 histórica.
Estado: puente backend preparado, no se cierra NC/PR03/F08/PR02. Pendientes cliente durable/UI de caso, elegibilidad comercial/pagos/receta/unidades y catálogo NC, revisión/permiso/cuerpo/serie/worker/conciliación NC, exclusión cancelación–intención y cierre comercial único con CAE NC confirmado, conforme decisión del titular. SQL001–027/Edge sin instalación/activación remota por nosotros, ningún deploy fiscal, consulta autenticada ARCA nueva, emisión/CAE real, merge ni cambio master/Production. Contador/envases, PDFtipografía/aceptación, PV/custodia y aceptación hospedada siguen gates; restauración integral bloqueada e impresora/cajón/Point diferidos.

### 23/10/2026 — NC: prerequisitos de cliente durable sin datos fiscales locales
Al trazar el cliente se identificaron dos requisitos previos: reconstruir casos desde servidor cuando se pierde almacenamiento local y descartar un intento aún no confirmado sin permitir que un envío tardío lo cree después. No implementar borrado local basado sólo en ausencia de lectura.
Preparar028: desistimiento append-only por UUID/factura/Auth/hash para caso no creado, mutuamente excluyente con INSERT de borrador bajo mismo advisory/lock de factura; consultar/cancelar devuelve ACK CANCELADA y SQL bloquea escritura tardía. Caso existente conserva cancelación inversa027. No efectos comerciales/ARCA. Preparar029: historial de casos propios por factura, páginas fijas de10/cursorsecuencia estable, canónico/hash/ACK de cada caso y validación estricta en servicio/cliente; no tablas públicas ni datos de custodia. Cancelados sin caso no consumen saldo y se recuperan por identificador, no requieren aparecer como NC financiera en historial.
Cliente posterior almacenará sólo UUID/factura/hash/intención, sin canónico, motivo, receptor o credenciales; antes de guardar escribe/verifica registro local y coordina WebLocks del mismo Auth/comercio/venta. Tras reinicio consulta mismoUUID; para retry conserva cuerpo sólo en memoria o exige reconstrucción exacta por hash, nunca genera otroUUID silenciosamente. Desistimiento confirmado permite retirar el registro local; pérdida total del browser recupera casos desde historial servidor. UI detrás de flag propio y gate fiscal existente, sin activar. Decisión CAE NC antes de efectivo/stock permanece obligatoria.
### 23/10/2026 — NC: recuperación durable y desistimiento de intentos no confirmados
SQL028 conserva un desistimiento append-only por UUID/factura/Auth/hash para intentos aún sin caso. Guardado y desistimiento son mutuamente excluyentes bajo READ COMMITTED, locks de factura y advisory común; un envío tardío no crea un caso cancelado. Casos existentes conservan cancelación inversa027. SQL029 recupera historial propio paginado (10 casos/cursor secuencia), propuesta canónica/hash y ACK; revalidación estricta de fuente original y de cada propuesta en servicio/cliente. SDK privado42→43 RPC. Lectura no requiere habilitar nuevos guardados; sí backend/Auth y SQL autorizado. Historial no acredita elegibilidad, saldo actual ni CAE.
Cliente integrado en FiscalClient.credits: sólo IDs/hash/intención en almacenamiento aislado por Auth/comercio/venta; sin motivo, canónico, receptor o credenciales locales. Exclusión compartida con cliente fiscal existente, registro previo verificado, UUID explícito estable por intento, lectura antes/después de escritura y recuperación del mismo identificador; ausencia/error no borra pendientes ni genera otro UUID. Cancelación sólo retira pendiente tras ACK CANCELADA durable. Pérdida total del almacenamiento recupera casos confirmados desde historial del servidor. Aún sin pantalla NC ni nuevo flag público activado.
Validación:398 PASS /6 archivos, salida0 (pilot-fiscal-credit-client-targeted-v3-20261023.log); incluye215 comprobaciones SQL embebidas e integración HTTP–servicio–SQL con Auth simulado. Buildv2 PASS, lint dirigido limpio, manifiesto bootstrap43/diff PASS. Escáner1310archivos/49candidatos, sin nuevos pares ruta/tipo frente a cierre anterior; RPC/flag/tablas privados ausentes del bundle. La primera integración tuvo error de separación de líneas en prueba; corregido, registros fallidos conservados. Suite global3436/1skip/260 histórica, no ejecutada nuevamente.
PostgreSQL17.11 local:100 escenarios PASS/salida0, fiscal-credit-recovery-concurrency-v1-20261023.json. Fases:73 antes025,14 después025/026,8 después027 y5 nuevos después instalar028/029 dos veces. Nuevos: desistimiento gana guardado tardío, guardado gana cancelación sin historia contradictoria, desistimiento concurrente idempotente, rollback libera guardado y lectura de historial espera cancelación confirmada. Cero solicitudes externas/emisiones. Contenedor propio kiosko-pr03-local-810e3581 detenido con datos conservados. No acredita Web Locks entre ventanas reales ni JWT/RLS/Edge hospedados.
Decisión del titular preservada: efectivo y reposición sólo DESPUÉS de CAE NC confirmado y aplicación comercial única; incertidumbre exige conciliación. SQL001–029/Edge no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, TA/consulta autenticada ARCA nueva, emisión real, merge ni cambios master/Production. Backup JSON no cubre diario fiscal privado: aceptación de dump/restore debe incluir también desistimientos NC; restore integral sigue bloqueado. NC/PR03/F08/PR02 continúan parciales. Siguiente: pantalla de casos/recuperación y preparación explícita con elegibilidad comercial/pagos/receta/unidades y catálogo NC; después revisión/cuerpo/serie/worker/conciliación y cierre comercial único, siempre bajo gates. Impresora/cajón/Point diferidos; contador/envases pendiente.

### 23/10/2026 — NC: pantalla de casos y recuperación (en curso)
Integrar panel en constancia autorizada existente detrás de VITE_KIOSKO_ARCA_CASOS_NC_HOMO, apagado por defecto y subordinado a revisión fiscal/piloto estricto. Consulta explícita de fuente/historial, páginas sucesivas, estado guardado/cancelado sin presumir CAE, recuperación del pendiente local y cancelación confirmada sólo del caso activo más reciente (SQL conserva autoridad). Misma estética Button/bordes/formularios existentes; limpiar respuestas al cambiar factura/cerrar. Fallos no borran almacenamiento ni habilitan efectivo/stock. Probar paginación, ACK incierto, errores saneados, doble clic, respuestas tardías y gate cerrado. Este panel aún no crea propuestas: sigue preparación con catálogo NC/elegibilidad/pagos/receta y posterior envío/conciliación NC. Sin activación, instalación remota ni ARCA.

### 23/10/2026 — NC: panel de casos, recuperación y cancelación preparado
Constancia autorizada integra FiscalCreditCasesPanel bajo VITE_KIOSKO_ARCA_CASOS_NC_HOMO exactamente true, subordinado a revisión fiscal/piloto estricto y apagado por defecto; no activado por nosotros. Consulta explícita de representación de la misma factura/hash/CAE y páginas validadas de historial. Muestra fecha/motivo/importe/renglones y estado guardado/cancelado, sin convertir reserva en autorización. Cancelación sólo tras confirmación y del caso activo más reciente al terminar paginación (SQL sigue autoridad); pendiente incierto ofrece recuperación/cancelación conservando UUID. Errores no borran datos, respuestas tardías se descartan al cerrar/cambiar factura, doble clic se excluye. Si cancelación confirma pero historial falla se retiran filas anteriores para no mostrar un caso activo obsoleto. Controles compartidos Button/estética existente, sin nuevo modal divergente; aceptación visual hospedada pendiente.
125 PASS /7 archivos, salida0 (pilot-fiscal-credit-cases-ui-targeted-v3-20261023.log); buildv2 PASS/salida0, lint final limpio, manifiesto bootstrap43 y diff PASS. Escáner1312archivos/49candidatos, sin nuevos pares ruta/tipo respecto17e0578; RPC/flag/tablas privados ausentes del bundle. Pruebas incluyen confirmación, almacenamiento corrupto/ajeno, ausencia sin borrar pendiente, ACK incierto, cancelación sin caso, fallo de historial posterior, dos páginas/reintento, doble clic, respuestas tardías y gate modal cerrado/abierto. Primer pase falló por esperar un botón aún deshabilitado en una prueba; corregida la espera sin cambiar contratos. No se repitió SQL/concurrencia:100 PostgreSQL17.11 del cierre17e0578 son evidencia anterior, no del panel. Suiteglobal3436/1skip/260 histórica. No acredita Web Locks entre ventanas/JWT/RLS/Edge hospedados.
Pantalla de consulta/recuperación preparada; creación explícita NC aún pendiente de elegibilidad comercial/pagos/receta/unidades y catálogo específico, seguida de revisión/cuerpo/serie/worker/conciliación y aplicación comercial única. No presentar el módulo NC completo. Efectivo/stock sólo después de CAE NC confirmado, según titular; incertidumbre exige conciliación. SQL001–029/Edge no instalados/habilitados remotamente por nosotros, sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado; contador/envases y PV/custodia/aceptación pendientes, impresora/cajón/Point diferidos.

### 23/10/2026 — NC: fuente comercial histórica previa al formulario (en curso)
Inventario: snapshot fiscal012 congela detalles/total, pero no pagos ni receta. Checkout_manual_entradas.snapshot y checkout_manuales.solicitud contienen pagos/receta; deben coincidir entre sí y con resultado confirmado, venta/detalles/pagos y salidas físicas. No inferir componentes desde combo_items actual. Preparar SQL030 como getter privado con Auth original026, venta completa e importes coherentes, DTO mínimo sin referencias de pago/PII/costos ni acceso directo a tablas. Bloqueos NOWAIT de cierre histórico evitan invertir espera checkout→venta; conflicto exige nueva consulta. No modifica guard010 ni habilita emisión/reintegro/reposición.
La fuente debe conservar restricciones visibles: medio original (efectivo íntegro requerido por decisión del piloto), conceptos libres sin reposición física, combos sólo enteros y fracciones históricas sin redondear. Snapshot de checkout antiguo NO guarda es_pesable/unidad_medida: no atribuirle esa evidencia desde catálogo actual; soporte explícito de unidades para nuevas ventas y conciliación de casos antiguos permanece requisito antes de habilitar el formulario/cierre final. Catálogo fiscal NC específico también sigue pendiente. Probar ACL/Auth, fuentes ausentes/incoherentes, pagos/receta modificados, libre/combo/fraction y locks en PostgreSQL; luego contrato/servicio/transporte y formulario.

### 23/10/2026 — NC: fuente comercial histórica SQL030 preparada
Getter privado cargar_fuente_comercial_nc_homologacion cruza Auth original/factura026, snapshot fiscal012, cierre confirmado checkout_manuales y snapshot de checkout_manual_entradas, identidad/caja/fecha/total/detalles/pagos actuales y receta contra salidas originales. Conserva componentes del cierre (no combo_items/catalogo actual), conceptos libres sin salida física, fracciones históricas exactas y depósitos por renglón; excluye recepción de envases no fiscalizable. Pagos no efectivos se informan sin habilitar reintegro. Caja original puede estar cerrada: lectura histórica no habilita caja de devolución. DTO mínimo sin referencias de pago, PII, costos, credenciales ni snapshots completos; checksum checkout_sha256 es SHA256 del snapshot::text PostgreSQL, NO canónico fiscal ni dato a recomputar desde browser.
Sólo service_role con fuente026/RC/Dueño activo/Auth original. Toma cierre/entrada/caja con FOR SHARE NOWAIT después del lock de venta, evitando invertir la espera checkout→venta; conflicto exige reconsulta. No modifica guard010/guardar027, no crea reservas/casos ni efectos comerciales. SDK permanece43RPC: getter aún no añadido al SDK/servicio/HTTP/cliente; ése es el siguiente enlace. La fuente no acredita elegibilidad final ni autorización de emitir: al diseñar intención/cierre NC revalidar/bindear hechos comerciales bajo locks; no usar una consulta previa como permiso.
Inventario confirmado: cierres antiguos no conservan es_pesable/unidad_medida. Fuente devuelve unidades_historicas=NO_REGISTRADAS; no atribuye metadatos actuales al pasado ni redondea historia. Falta captura durable de unidades para ventas nuevas y conciliación explícita de antiguas, además de catálogo NC/pagos/receta elegibles y formulario. NC/PR03/F08/PR02 siguen parciales. Efectivo/reposición sólo después de CAE NC confirmado según titular, con aplicación comercial única; incertidumbre exige conciliación.
256 PASS /3 archivos (SQL233 +historial/cliente23), salida0: pilot-fiscal-credit-commercial-targeted-v6-20261023.log. Buildv2 PASS/salida0, lint sin nuevos hallazgos (finally previo del runner), manifiesto bootstrap43/diff PASS; escáner1313archivos/49candidatos sin nuevos pares ruta/tipo, entrada privada ausente del bundle. Pases fallidos conservados: fixture leía con rol sin SELECT, checksum intentaba usar helper fiscal que sólo admite números enteros y mutación sintética no conservaba delta_stock; se corrigieron fixtures/checksum comercial sin relajar canónico fiscal/ACL. UUID históricos válidos se normalizan en DTO sin reescribir snapshots. Suiteglobal3436/1skip/260 histórica, no repetida.
PostgreSQL17.11:104 escenarios PASS/salida0, fiscal-credit-commercial-concurrency-v2-20261023.json. Fases73antes025,14después025/026,8después027,5después028/029,4después instalar030 dos veces. Nuevos: cierre bloqueado falla NOWAIT sin deadlock; pago modificado durante espera no acredita fuente; lectores duplicados recuperan mismo DTO sin efectos; Auth reasignado no revela pagos/receta a cuenta original ni nueva. Contenedor propio detenido/datos conservados; cero solicitudes externas/emisiones. v1 también104PASS antes del ajuste de UUID; v2 prueba SQL final. No JWT/RLS/Edge/Web Locks/visual hospedados.
SQL001–030/Edge no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado; contador/envases, PV/custodia y aceptación hospedada pendientes, impresora/cajón/Point diferidos. No nuevas tablas para backup en030; sigue pendiente acreditar dump/restore de todo el diario privado.

### 23/10/2026 — NC: contrato y transporte de fuente comercial (en curso)
Preparar validador cerrado de DTO030 ligado a representación026, sumas con BigInt, renglones/receta/libres/pagos coherentes y tres habilitacionesfalse; NO_REGISTRADAS literal sin inferir unidades. Servicio Auth.getUser una vez, mismo Auth capturado en ambas RPC; acción FUENTE_COMERCIAL_NC sólo lectura (2KiB, campos cerrados), SDK43→44RPC; cliente revalida y no persiste fuente/PII. Sin habilitar flags, emisión, devolución o cambio de SQL030. Probar payloads extra/ajenos/inconsistentes, RPC/Auth fallidos, captura antes de esperas, almacenamiento intacto e integración HTTP–SQL real local. Después UI explicará elegibilidad antes de ofrecer formulario, pendiente de unidades/catálogo NC.

### 23/10/2026 — NC: contrato/transporte de fuente comercial preparado
Validador DTO cerrado de13campos ligado a representación026 validada, venta/operación/hash/total, líneas históricas exactas y receta normalizada sin IDs duplicados/desordenados. Sumas de renglones/pagos con BigInt y decimales canónicos; PRODUCTO exige componente propio1.000, COMBO receta no vacía/unidades completas, LIBRE sin componentes/fracciones. Medios admitidos explícitos y pago_integro_efectivo recomputado, tres habilitacionesfalse y NO_REGISTRADAS literal. Captura antes de esperas y resultado profundamente congelado. Checksum comercial opaco del servidor: no se reconstruye desde navegador ni se usa como permiso.
Servicio Auth.getUser una vez, actor capturado en fuente026 y getter030; no se vuelve a inferir identidad desde perfil reasignado. Acción FUENTE_COMERCIAL_NC sólo lectura, JSON/campos cerrados y2KiB, bajo gates backend/origen/host/sesión existentes sin requerir flag de guardar. SDK43→44RPC explícitas; cliente credits.commercialSource revalida contra la factura capturada y no lee/escribe storage. Sin TA/custodia/ARCA, nueva propuesta, aprobación, emisión, reintegro o reposición. UI/formulario aún no conectado a este nuevo método; no habilitar creación hasta resolver elegibilidad/unidades/catálogo NC.
399 PASS /7 archivos, salida0: pilot-fiscal-credit-commercial-transport-targeted-v3-20261023.log. Incluye HTTP–servicio–SQL030 embebido con Auth simulado, reasignación entre RPC (no expone datos), SDK allowlist, DTO/receta/medios/importes/flags alterados, errores saneados, captura antes de esperas, storage intacto y regresiones de panel/cliente/historial. Buildv2 PASS/salida0, lint dirigido limpio; manifiesto bootstrap43/diff PASS; escáner1316archivos/49candidatos sin nuevos pares ruta/tipo respecto69b2cd7; entradas privadas ausentes del bundle. No cambió SQL:104 escenarios PostgreSQL17.11 de69b2cd7 son evidencia anterior, no una ejecución nueva del transporte. Suiteglobal3436/1skip/260 histórica. Sin JWT/RLS/Edge/E2E/Web Locks/visual hospedados.
Fuente comercial no acredita saldo, unidades históricas, catálogo NC ni autorización final; futuras intención y aplicación comercial deben revalidar/bindear hechos bajo locks. Siguiente: captura durable/conciliación de unidades, catálogo NC y formulario explícito con pagos/receta elegibles, luego revisión/cuerpo/serie/worker/conciliación/aplicación única. Efectivo/reposición sólo después de CAE NC confirmado por decisión del titular, incertidumbre exige conciliación. NC/PR03/F08/PR02 parciales. SQL001–030/Edge no instalados/habilitados remotamente por nosotros, sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. Restore integral bloqueado, contador/envases y PV/custodia/aceptación pendientes; impresora/cajón/Point diferidos.

### 23/10/2026 — NC: captura durable de unidades en checkout (en curso)
Agregar SQL031 opcional con configuración privada por comercio, apagada por defecto; no cambiar snapshot/ACK v1 ni backfill de ventas antiguas. AFTER INSERT de checkout_manual_entradas captura metadata de producto/componentes bajo locks ordenados, ligada a checksum de snapshot y actor original validado. No capturar si la venta/cierre ya existe. Conceptos libres conservan UN/no pesable; combos se registran como completos, componentes desde receta original. Guard de primer cierre compara metadata bajo locks ya tomados por checkout y revierte transacción si cambió; replay confirmado no recotiza catálogo. Config desactivada después de preparar no evita guard de captura existente. Evidencia inmutable/privada y snapshot protegido; flags/custodia remota requieren autorización separada.
Getter NC histórico separado ligado a030 devolverá CAPTURADAS con canónico/hash o NO_REGISTRADAS sin inventar unidades de catálogo actual. Captura no implica saldo, catálogo NC, permiso de emisión ni reposición/reintegro. Probar default apagado, producto/pesable/combo/libre, cierre real y rollback, cambio de metadata, ACK/replay, ACL e instalación repetida; carreras de preparación/cambio/cierre en PostgreSQL real. Luego transporte tipado/formulario y conciliación histórica explícita siguen pendientes.

### 23/10/2026 — NC: evidencia durable de unidades SQL031 preparada
Configuración privada por comercio apagada por defecto (checkout_unidades_config_homologacion) y evidencia inmutable (checkout_unidades_homologacion). AFTER INSERT de entrada comercial nueva captura tipo/es_pesable/unidad de producto/componentes bajo locks ordenados, ligada a actor verificado y checksum del snapshot; no cambia payload/ACK v1 ni captura retroactivamente ventas/cierres existentes. Fuente deriva catálogo al preparar, nunca al devolver. Metadatos se conservan ante replay o cambios posteriores; snapshot/identidad de entrada protegidos, campos de política de supervisor siguen funcionando. Config apagada después de preparar no evade evidencia ya existente.
Primer cierre real compara checksum/metadata bajo locks del checkout; cambio de unidades revierte venta/pagos/stock y conserva intento. Replay confirmado no recotiza ni duplica stock. Se preserva una venta de combo pesable admitida por checkout: capturar hechos no impone la política de devolución de combos completos. La intención inicial del plan de restringir combos al registrar queda sustituida por esta separación, probada con componente físico entero. Guard de devolución/elegibilidad NC sigue aparte; no se declara elegible automáticamente un combo fraccionado.
Getter privado cargar_unidades_nc_homologacion usa fuente030/Auth fiscal original y devuelve CAPTURADAS con canónico/hash o NO_REGISTRADAS/null sin inferir catálogo actual. No agregado aún al SDK/servicio/HTTP/cliente: SDK44RPC permanece. Integración debe consultar031 como evidencia de unidades; DTO comercial v1 no incorpora este registro y no debe usarse solo para decidir si existe. Falta contrato/transporte/UI de unidades, conciliación histórica explícita, catálogo NC y formulario, luego revisión/cuerpo/serie/worker/conciliación/aplicación comercial única. No hay emisión, reintegro o reposición habilitados. Efectivo/stock sólo después de CAE NC confirmado según titular.
300 PASS /3 archivos (SQL252 +contrato comercial29 +envases19), salida0: pilot-checkout-units-targeted-v6-20261023.log. Incluye cierre real producto/pesable/combo/libre, rollback por metadata cambiada, ACK/replay/preparación duplicada, defaultfalse, activación posterior sin backfill, instalación repetida con evidencia, ACL/immutabilidad y Auth reasignado. Buildv2 PASS/salida0, lint sin nuevos hallazgos (finally previo del runner), manifiesto bootstrap43/diff PASS. Escáner1317archivos/49candidatos sin nuevos pares ruta/tipo y unidades privadas ausentes del bundle. Primeras fixtures usaban importe con centavos y ACK sin campos de política: corregidas al checkout real de enteros, sin relajar guards. Prueba de reinstalación corregida para no hacer COMMIT de transacción de fixture; selección reejecutada. Suiteglobal3436/1skip/260 histórica, no repetida.
PostgreSQL17.11:108 escenarios PASS/salida0, checkout-unit-evidence-concurrency-v3-20261023.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030 y4después031 instalado dos veces. Nuevos: dos preparadores/unUUID/una evidencia; unidad cambia durante espera/cierre revierte negocio; rollback de preparación no deja evidencia/libera editor; cierre gana edición posterior y replay conserva unidades sin doble stock. Contenedor propio kiosko-pr03-local-eb24070d detenido/datos conservados, cero solicitudes externas/emisiones. v1 falló paso104 por caja sintética creada después de fecha del ticket; se corrigió cronología fixture sin cambiar controles. v2 pasó108 antes del ajuste de combo pesable; v3 acredita SQL final.
SQL001–031/Edge y configuración de captura no instalados/habilitados remotamente por nosotros; sin flags activados, deploy fiscal, nueva consulta ARCA autenticada, emisión real, merge ni cambios master/Production. NC/PR03/F08/PR02 siguen parciales; aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual pendiente. Backup JSON no acredita nuevas tablas privadas de configuración/evidencia: incluirlas en dump y prueba futura de restore integral autorizado junto al diario fiscal; restauración integral sigue bloqueada. Contador/envases, PV/custodia pendientes; impresora/cajón/Point diferidos.

### 23/10/2026 — NC: contrato/transporte de unidades (en curso)
Integrar getter031 con contrato cerrado ligado a factura026 y fuente comercial030, canónico/hash recomputado, renglones/productos/componentes exactos y metadatos de unidad/pesable literales. Distinguir CAPTURADAS (sin permiso de emitir/devolver) de NO_REGISTRADAS/null. Auth una vez, mismo actor en consultas; acción sólo lectura y cliente sin storage. SDK44→45RPC, sin activar flags ni instalar remotamente.
Al integrar se observa que030 imponía cantidades enteras a la venta original de cualquier combo, mientras031 conserva combos pesables admitidos por checkout. Corregir esa mezcla de hechos y elegibilidad: fuente030 debe conservar cantidades originales verificables, incluso combo pesable fraccionado; LIBRE sigue entero como checkout. Unidades capturadas acreditan metadatos, no permiso de devolver. La política del formulario/NC seleccionada seguirá comprobándose bajo su propio gate y no se infiere del catálogo actual. Probar cadena real local checkout→factura sintética→030→031/transporte, claves/hash/cantidades incoherentes, perfiles reasignados y recuperación de casos antiguos sin metadatos.

### 24/10/2026 — PR03: transporte verificado de unidades históricas NC
Se incorporó por fast-forward c7dbacd (objetivo común de .agent/PLANS.md), preservando cambios locales. Este incremento reduce el blocker de elegibilidad NC de PR #3/PR03 y la dependencia de PR02; no cierra esos gates.
Contrato031 cerrado ligado a factura026 y fuente comercial030: canónico/hash recomputado, IDs/receta/cantidades exactas, unidades literales y metadata profundamente congelada. CAPTURADAS conserva hechos, NO_REGISTRADAS requiere null explícito; errores nunca se convierten en ausencia. Ningún estado concede emisión, reintegro o reposición. Fuente030 conserva combos pesables fraccionados admitidos por checkout; la política de devolución sigue separada. No se infieren unidades del catálogo actual.
Servicio verifica Auth una vez y transmite ese mismo actor a las tres RPC; SQL vuelve a comprobar autorización. HTTP UNIDADES_NC sólo lectura, objeto cerrado/2KiB y gates existentes; SDK44→45RPC. Cliente captura entradas antes de esperar, revalida y no usa storage. Pruebas cruzan checkout real local → factura sintética → SQL030/031 → HTTP, incluidos combo pesable, ausencia y reasignación Auth entre consultas.
Evidencia local: selección432 PASS/7archivos (pilot-credit-units-targeted-v2-20261024.log); buildv2 PASS, oxlint dirigido limpio, manifiesto43/diff PASS. PostgreSQL17.11:108 escenarios PASS (credit-units-transport-concurrency-v1-20261024.json), fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031; cero solicitudes externas/emisiones, contenedor propio detenido/datos conservados. Escáner1320archivos/49candidatos, sin nuevos pares ruta/tipo. Suite global anterior es histórica y no prueba este HEAD. Primer build falló por tipos de fixtures; corregidos y verificados sin relajar validación. Intento ESLint no aplicaba al proyecto (sin configuración); se usó oxlint declarado en package.json.
SQL001–031/Edge/flags no instalados ni activados remotamente; sin secretos, ARCA autenticada nueva, CAE, merge o cambios master/Production. Aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual pendiente; no confundir esta evidencia con Staging. Restauración integral bloqueada; incluir tablas privadas en futuro dump/restore autorizado. Impresora/cajón/Point diferidos.
Siguiente blocker local: elegibilidad explícita y formulario de caso NC usando fuente comercial y unidades acreditadas, sin autorizar automáticamente ventas históricas sin registro ni tratamiento de envases pendiente del contador; después catálogo/cuerpo/revisión/serie/worker/conciliación NC y aplicación única sólo tras CAE NC confirmado. Al cierre técnico definitivo de PR #3 ejecutar suite global y controles sobre ese HEAD antes de aceptación hospedada autorizada.

### 24/10/2026 — NC: consulta visible de hechos originales preparada
Primer paso de la captura/elegibilidad: panel existente integra consulta explícita de fuente comercial030 y unidades031, ambas revalidadas contra factura026. Muestra descripción histórica, cantidades/subtotales, pagos originales, receta sin nombres inferidos del catálogo actual y metadata de unidades/pesable. CAPTURADAS no se presenta como permiso ni saldo; NO_REGISTRADAS exige conciliación explícita. Pagos mixtos no presuponen efectivo, conceptos libres no presuponen stock y envases conservan los gates documentados.
Consulta sin storage/mutaciones: doble clic excluido, fuentes ajenas rechazadas, resultados anteriores retirados al reconsultar, error saneado distinto de ausencia, cambio de comprobante/desmontaje descarta respuestas tardías. Reutiliza Button y gate de panel NC existente, apagado por defecto; no se agrega flag ni se activa remotamente. Revisión React/POS: sólo lectura, no acciones de caja/stock/cobro.
132 PASS/5archivos (pilot-credit-source-ui-targeted-v1-20261024.log), buildv1 PASS/salida0 y oxlint dirigido limpio. Escáner1322archivos/49candidatos sin nuevos pares ruta/tipo; manifiesto43 y diff PASS. No cambió SQL:108 escenarios PostgreSQL del commit5261e69 son evidencia anterior, no una ejecución nueva del panel. No acredita aceptación visual/JWT/RLS/Edge/Web Locks hospedados ni CAE real.
Pendiente inmediato: formulario explícito y guardado de caso con cantidades/importes/impuestos, UUID estable y recuperación; deberá distinguir comprobaciones previas de elegibilidad final bajo locks, conservar pendientes inciertos y no inferir IVA ni unidades antiguas. Luego catálogo NC/revisión/cuerpo/serie/worker/conciliación/aplicación comercial única con CAE NC confirmado. PR03/PR02 siguen parciales. Sin SQL/Edge/flags remotos, secretos, nuevas solicitudes ARCA, emisión, merge o cambios master/Production; restore integral bloqueado y físicos/Point diferidos.

### 24/10/2026 — NC: captura explícita y guardado de caso integrados localmente
Formulario conectado al panel existente después de consultar hechos y terminar historial. Campos iniciales vacíos: fecha dd/mm/aaaa, motivo, código IVA receptor, selección/cantidades/importes por detalle, reposición no preseleccionada, seis totales y detalles IVA/tributos explícitos. No calcula IVA proporcional ni usa configuración fiscal heredada; códigos IVA detallados se eligen entre los de la factura original, sin declarar vigente un catálogo NC. Coma/punto decimal se convierten a escala canónica sin separadores de miles. Confirmación humana obligatoria; guardar sólo reserva un borrador sin emisión/efectos comerciales.
Precomprobación revalida factura026/fuente030/unidades031 capturadas y propuesta; exige cantidades enteras donde corresponde y receta física representable, niega reposición de conceptos libres. NO_REGISTRADAS bloquea captura hasta conciliación. Esto es control previo de UI, no autoridad de saldo ni permiso de emisión: SQL027 conserva reserva acumulada/fecha/parámetros/Auth, pero aún falta ligar/evaluar elegibilidad comercial bajo locks en servidor antes de intención y aplicación NC; no sustituir ese pendiente con este PASS.
Un UUID por formulario/intento; validación local permite corregir antes de envío. Desde primer envío se congela contenido y se usa cliente durable existente (persistencia antes de POST, getter durable, Web Lock). Panel valida ACK exacto de venta/factura/UUID/hash antes de declarar guardado, conserva pendiente recuperable ante incertidumbre y distingue CANCELADA de caso guardado. Fallo de historial posterior a ACK mantiene confirmación, retira filas obsoletas y pide reconsulta sin ofrecer otro envío del mismo formulario. Doble clic/cierre/cambio de factura no producen guardados tardíos desde validación desmontada. Sin nuevo storage fiscal/PII ni flags activados.
413 PASS/8archivos, salida0 (pilot-credit-draft-form-targeted-v4-20261024.log), buildv3 PASS, oxlint dirigido limpio, manifiesto43/diff PASS. Incluye regresiones SQL embebidas y cliente, UI→guardado simulado→ACK/historial, entradas corregibles, fecha imposible, fracción no pesable, receta/combo, libre, ausencia de unidades, ACK ajeno y pendiente incierto. Primeras pruebas fallaron por consultar botón antes del fin de carga y por propiedad disabled local en lugar de estado heredado de fieldset: corregidas las pruebas sin retirar guards; v3 156PASS previo conservado, v4 agrega casos y SQL. Escáner1325archivos/49candidatos sin nuevos pares ruta/tipo, servicios/flag privados ausentes del bundle. SQL no cambió:108 escenarios PostgreSQL17.11 de5261e69 son evidencia anterior, no repetidos para el formulario. No aceptación visual/JWT/RLS/Edge/Web Locks hospedados ni CAE real.
Siguiente bloqueo PR03: ligar/verificar comercialmente casos nuevos bajo locks (unidades/receta/pagos/envases y reserva), sin reinterpretar borradores históricos ni conceder permisos; catálogo específico NC vigente, revisión/cuerpo/serie/worker/FECompConsultar y aplicación comercial única sólo tras CAE NC confirmado. Continúan PR03/PR02 parciales, suite global final pendiente al cerrar bloque técnico. SQL001–031/Edge/flags sin instalación/activación remota por nosotros; sin secretos/ARCA nueva/CAE/merge/master/Production. Contador/envases y aceptación hospedada pendientes; restore integral bloqueado, impresora/cajón/Point diferidos.

### 24/10/2026 — NC: vínculo comercial obligatorio para casos nuevos (SQL032)
AFTER INSERT en borradores027 exige fuente030 íntegra y unidades031 CAPTURADAS para TODO caso nuevo, incluso si se omite el navegador. Tabla privada fiscal_nc_comercial_homologacion guarda factura/actor/propuesta y fuente mínima canónica/hash con unidades originales canónicas/hash; RLS y ACL/columnas cerradas, helper sin EXECUTE y registros inmutables. Inserción/caso/saldo/vínculo comparten transacción: fallo revierte todo, ACK sólo retorna tras triggers. No configura defaults ni infiere catálogo actual; snapshot no expone referencias de pagos/costos/PII.
El guard toma locks existentes de factura/actor/venta y estabiliza filas de pagos/detalles/movimientos con FOR SHARE NOWAIT, sin invertir espera checkout→venta. Valida metadata de línea/componente, cantidades enteras o escala física válida y niega reposición de libres. Pagos mixtos quedan como hechos, no permiso de efectivo. Fuente030 ya bloquea historia incompatible/envases recibidos y devoluciones ordinarias; tratamiento fiscal de envases pendiente del contador no se inventa. Registro acredita hechos comprobados en ese instante, no elegibilidad futura: intención/aplicación NC deberán exigir vínculo y revalidar fuente/políticas bajo sus locks, además de CAE NC confirmado antes de efectivo/stock.
Historia preservada: 032 no recaptura borradores antiguos. Su replay/getter/cancelación siguen recuperando ACK sin backfill; ausencia de vínculo NO acredita elegibilidad. Replay/cancelación de caso ligado conserva evidencia aunque luego cambien pagos/catálogo y no se presenta como permiso actual. Cancelación no borra registros. No cambia contrato HTTP/ACK/SDK45 ni habilita emisión, numeración NC o efectos comerciales.
331 PASS/5archivos, salida0 (pilot-credit-binding-targeted-v4-20261024.log), buildv3 PASS; oxlint sin hallazgos nuevos (warning finally preexistente del runner), manifiesto43/diff PASS. Escáner1326archivos/49candidatos sin nuevos pares ruta/tipo; backend privado ausente del bundle. SQL embebido: escenarios históricos001–031 conservan su fase; pruebas032 instalan dentro de transacción/reaplican dos veces para verificar transición y rollback. Incluye checkout real→factura sintética→caso/vínculo, HTTP/servicio/Auth simulado, ACK perdido sin repetir escritura, ausencia/fraction/libre/mixto, ACL/immutabilidad, rollback y replay/cancelación sin reinterpretar historia. No afirmar que todos los escenarios históricos corrieron bajo032.
PostgreSQL17.11:112 escenarios PASS/salida0, credit-commercial-binding-concurrency-v3-20261024.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031 y4después032 instalado dos veces. Nuevos: dos workers/unUUID/unvínculo, fila de pago bloqueada NOWAIT y pago cambiado tras esperar guard previo, rollback caso/vínculo y worker en espera, Auth reasignado. Fixture032 siembra metadata privada enteramente sintética para aislar carreras; captura real031 se prueba en cuatro escenarios anteriores y en cadena real embebida. Cero solicitudes externas/emisiones, contenedor propio kiosko-pr03-local-264ea52e detenido/datos conservados. v1/v2 fallaron por exigir NOWAIT a toda la RPC: UPDATE de pago primero bloquea venta mediante proteger_lineas_venta_anulada (guard029); se corrigió ensayo para verificar ambos caminos, sin cambiar guards. Evidencia fallida conservada.
SQL001–032/Edge sin instalación/activación remota por nosotros, flags sin activar; sin secretos, ARCA autenticada nueva, CAE, merge o cambios master/Production. Antes de instalación autorizada incluir fiscal_nc_comercial_homologacion en dump/restore privado junto al diario y unidades; JSON app no lo cubre, restore integral bloqueado. Recuperación/rollback de rollout debe mantener guardado NC deshabilitado, preservar evidencia y no quitar trigger para reabrir escritura heredada.
Siguiente gate local: fuente/catálogo específico NC vigente y preparación fiscal NC ligada al caso/vínculo, revisión/permiso/cuerpo/serie/worker/FECompConsultar propios, exclusión cancelación–intención y aplicación comercial única. Intención nueva debe rechazar casos sin vínculo o cancelados; no basta este registro histórico. PR03/PR02 siguen parciales; aceptación hospedada JWT/RLS/Edge/E2E/Web Locks/visual, PV/custodia, contador y primer CAE autorizado pendientes. Suite global definitiva al cierre técnico. Impresora/cajón/Point diferidos.

### 24/10/2026 — NC: catálogo privado y contexto de preparación (SQL033)
Catálogo NC separado de parámetros012 de facturas: fiscal_parametros_nc_homologacion sin filas semilla y habilitado=false por defecto. Valida tipos3/8/13, descripción, vigencias por tipo, condiciones con comprobantes NC explícitos, alícuotas, ausencia de duplicados/coerciones y fechas reales; sólo revocable, corregir exige nueva revisión. RLS/ACL/columnas privadas y helpers sin EXECUTE público. No copia listas de facturas ni presupone que código de condición existente sea válido para NC. Consulta autenticada/provisión real de parámetros sigue pendiente de autorización específica.
Getter cargar_contexto_nc_homologacion verifica Auth fiscal original/factura026, caso activo/UUID/hash, vínculo032, fuente030 actual y evidencia031 contra lo congelado; pagos/detalles/movimientos bajo locks compartidos NOWAIT tras venta/actor/factura. Rechaza caso cancelado, sin vínculo, hechos cambiados o emisor privado que difiere de la revisión/credencial/certificado/PV capturados. Exige catálogo NC habilitado y vigente después de locks, tipo válido para fecha del caso, condición y alícuotas explícitas. No inspecciona claves/TA, no acredita PV ni padrón real, no reserva número NC y no modifica caso/caja/stock.
DTO público cerrado17campos ligado a caso/factura/hash y checksums comercial/unidades, CUIT/PV/revisiones/tipo y listas NC, emision_habilitada=false. Validador puro revalida propuesta histórica exacta/canónico/hash y original, captura antes de esperas, rechaza arrays coercionados/extra/duplicados/textos de control y congela profundamente. Escenarios A/B/C preservan tipoNC3/8/13 y exigen alícuotas acreditadas. Getter aún sin SDK/servicio/HTTP/cliente/UI (SDK45RPC permanece): siguiente integración no debe declararlo permiso, usar defaults o aceptar casos sin vínculo.
358 PASS/4archivos, salida0 (pilot-credit-context-targeted-v2-20261024.log), buildv2 PASS, lint sin hallazgos nuevos (finally preexistente del runner), manifiesto43/diff PASS. Escáner1329archivos/49candidatos sin nuevos pares ruta/tipo; entradas privadas ausentes del bundle. Pruebas SQL conservan escenarios históricos001–031 en su fase; los032/033 instalan explícitamente dentro de cada transacción y reaplican dos veces. Incluyen default sin catálogo, contexto íntegro validado puro, cancelación/Auth/hash/emisor/pagos cambiados, vigencias y clases incompatibles, legacy sin backfill y ACL. No aceptación hospedada.
PostgreSQL17.11:116 escenarios PASS/salida0 (credit-context-concurrency-v1-20261024.json):73antes025,14después025/026,8después027,5después028/029,4después030,4después031,4después032 y4después033 instalado dos veces. Nuevos: lectores recuperan mismo contexto sin efectos, cancelación gana lectura en espera, catálogo revocado durante espera y vencimiento durante último lock; no devuelve contexto obsoleto. Metadata032 sintética para aislar esas carreras, captura031 real cubierta en su fase y cadena embebida. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-62f2ffd9 detenido/datos conservados. Primer chequeo de sintaxis del runner detectó nombre de variable repetido antes de crear contenedor; corregido sin cambiar gates. Warning de regex de control nuevo sustituido por validación de puntos de código, sin supresión ni pérdida de control.
Se revisaron sólo páginas públicas oficiales WSFE (24/10/2026): FEParamGetTiposCbte devuelve tipos/fechas; FEParamGetCondicionIvaReceptor devuelve condición/descr/clase. No se ejecutaron esos métodos con Auth ni se reutilizó una autorización consumida. Fuentes: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetTiposCbte y https://wswhomo.afip.gov.ar/wsfev1/service.asmx?op=FEParamGetCondicionIvaReceptor. Datos sintéticos no prueban que catálogo/punto/emisor estén acreditados por ARCA.
Siguiente: transporte de contexto NC con Auth único/identidad exacta y lectura explícita desde panel; preparación fiscal NC durable con catálogo/revisión/vínculo capturados y cuerpo separado de factura v1. Después serie/permiso/worker/FECompConsultar NC y exclusión cancelación–intención; efectivo/stock sólo tras CAE NC confirmado y aplicación única. No se amplía factura v1 ni se habilita fallback legacy. PR03/PR02 siguen parciales; suite global definitiva y aceptación hospedada pendientes.
SQL001–033/Edge/flags no instalados/habilitados remotamente por nosotros, sin secretos/ARCA autenticada nueva/CAE/merge/master/Production. Incluir catálogo NC en dump/restore privado futuro autorizado junto al diario/unidades/vínculo; JSON app no acredita cobertura, restore integral bloqueado. Contador/envases y PV/custodia pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — NC: contexto integrado con identidad mínima (SQL034/transporte/panel)
CONTEXTO_NC sólo lectura, JSON estricto/cerrado5campos y2KiB: venta/operación/caso/hash, sin actor ni canónico/PII en solicitud. SQL034 recupera contexto033 y canónico/hash del caso durable bajo sus mismos guards/locks, sólo service_role; no tablas nuevas ni escritura. Evita reenviar canónicos de hasta60KiB y sus escapes dentro de un límite de consulta. SDK45→46RPC explícitas (fuente_contexto034;033 sigue interno a ese puente). No amplía límites de otras acciones.
Servicio captura scope antes de esperar, verifica Auth.getUser una vez y transmite ese Auth a fuente026/034; clona respuesta antes de esperas, exige raíz privada cerrada2campos, revalida propuesta/canónico/hash exactos y DTO033 contra factura/caso. Devuelve sólo contexto17campos, nunca el paquete privado/canónico. Error/Auth reasignado/DTO ajeno no se convierten en ausencia o permiso, no hay reintentos ni TA/custodia/ARCA. Lectura funciona con flag de guardar apagado bajo gates backend/origen/host/sesión; no se activó ningún flag.
Cliente credits.context captura fuente/propuesta, revalida antes de consultar y compara contexto recibido con el mismo caso; envía sólo identidad mínima y no lee/escribe storage. Panel existente muestra consulta manual sólo para caso activo sin pendiente/acción competidora, CUIT/PV/tipoNC/condición/revisión y advertencia de nueva comprobación. Doble clic excluido, resultados anteriores retirados al reconsultar, errores saneados; cambio/desmontaje y apertura de cancelación descartan resultado tardío. No ofrece preparar/emitir/obtener CAE/dinero/stock ni presenta contexto como permiso. Reutiliza estética/Button y gate de casos NC existente sin activación.
448 PASS/7archivos, salida0 (pilot-credit-context-ui-targeted-v4-20261024.log), buildv4 PASS, manifiesto43/diff PASS, lint sin nuevos hallazgos (finally preexistente del runner). Escáner1334archivos/49candidatos sin nuevos pares ruta/tipo; backend privado ausente del bundle. Incluye HTTP–servicio–SQL033/034 real embebido con Auth simulado, reasignación entre RPC, ACL, tamaño2KiB con JSON válido, identidad capturada antes de esperas, canónico/contexto alterados, storage intacto y UI integrada/error/factura distinta/cancelación/respuestas tardías. Primera selección/build detectaron una sustitución accidental de fixture de representación ajena: restaurada antes de las verificaciones finales, sin cambiar contrato o permisos. No aceptación visual/JWT/RLS/Edge/Web Locks hospedados.
PostgreSQL17.11:118 escenarios PASS/salida0 (credit-context-source-concurrency-v1-20261024.json):73antes025,14después025/026,8después027,5después028/029,4después030,4después031,4después032,4después033 y2después034 instalado dos veces. Nuevos: lectores recuperan mismo contexto/canónico durable sin escritura y cancelación confirmada durante espera no expone canónico. Metadata032/033/034 sintética para aislar carreras; captura real031 en su fase/cadena embebida. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-ed45a7b3 detenido/datos conservados. No sumar evidencias anteriores como suite global actual.
Siguiente bloqueo: preparación fiscal NC durable ligada a este contexto/caso/vínculo/revisión de catálogo/emisor, cuerpo NC separado de factura v1 y asociación exacta al comprobante original. Luego revisión/permiso/serie/worker/FECompConsultar NC, exclusión cancelación–intención y aplicación única sólo tras CAE NC confirmado. Lectura de contexto no sustituye revalidación final ni autorización. PR03/PR02 siguen parciales, suite global definitiva y aceptación hospedada pendientes.
SQL001–034/Edge/flags sin instalación/activación remota por nosotros; sin secretos, consultas ARCA autenticadas nuevas, emisión/CAE real, merge o cambios master/Production.034 sólo agrega función de lectura; dump/restore integral debe conservar esquema y diario/tablas privadas ya documentadas, JSON app no acredita cobertura y restore integral sigue bloqueado. Contador/envases, PV/custodia/catálogo real pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — NC: preparación fiscal durable sin número (SQL035)
Contrato FiscalCreditPreparation separado de factura v1: clase PREPARACION_NC, caso/propuesta/contexto y hashes de fuente/unidades, revisiones de emisor/catálogo y datos fiscales sin numero. Conserva receptor/concepto/moneda de factura verificada e importes/IVA/tributos explícitos del caso; asociación única exacta tipo/PV/número/CUIT/fecha del comprobante original. NC3/8/13, sin IVA proporcional, valores heredados de configuración o número ficticio. Para conceptos2/3 períodos/vencimiento se ingresan expresamente y validan; no se copian de factura. Para concepto1 se exige null explícito. Reutiliza la regla de períodos del piloto; no declara validación fiscal/ARCA completa ni construye XML emitible.
SQL035 guarda preparación canónica/hash y contexto histórico en fiscal_preparaciones_nc_homologacion, privada/RLS/ACL/columnas e inmutabilidad. Servidor construye datos desde034/caso/factura, compara SHA del contexto declarado con033 actual y revisa vigencia antes del insert; un cambio de revisión no prepara silenciosamente datos distintos. Una preparación por caso, sin reservar serie, crear intención, tocar caja/stock o emitir. Igualdad byte a byte SQL–TypeScript comprobada para facturasA/B/C y conceptos1/2/3.
Getter privado valida Auth fiscal original/caso y recupera canónico/contexto/propuesta durables sin exigir emisor/catálogo actuales. Guardado recupera primero registro existente, exige mismo contexto/períodos y conserva original ante ACK perdido o reintento. Cancelación previa impide preparación tardía; posterior conserva preparación y devuelve CANCELADA sin reactivación/permisos. Corregir contenido requiere cerrar caso y nueva identidad; no sobrescribir preparación. Casos antiguos sin vínculo no obtienen preparación ni backfill. Getters históricos no prueban vigencia actual: futura numeración/revisión/intención debe revalidar caso/vínculo/contexto/políticas.
387 PASS/6archivos, salida0 (pilot-credit-preparation-targeted-v2-20261024.log), buildv2 PASS, manifiesto43/diff PASS, lint sin hallazgos nuevos (finally previo del runner). Escáner1337archivos/49candidatos sin nuevos pares ruta/tipo; persistencia privada ausente del bundle. Pruebas: canónicos/hash idénticos, servicios/mixtos explícitos y períodos inválidos en servidor, contexto cambió, pagos/emisor/cancelación, rollback/ACK recuperable, lectura con catálogo/emisor revocados, Auth reasignado, legacy/ACL/inmutabilidad y ausencia de nuevas series/reservas/movimientos/devoluciones. Fixture común ampliada A/B/C; regresiones cliente/panel/transporte incluidas. Primera selección350PASS/3archivos conservada; final387 no es suite global.
PostgreSQL17.11:123 escenarios PASS/salida0, credit-preparation-concurrency-v1-20261024.json. Fases73antes025,14después025/026,8después027,5después028/029,4después030,4después031,4después032,4después033,2después034 y5después035 instalado dos veces. Nuevos: doble worker/un canónico sin número, cancelación gana preparación, preparación gana y queda cancelada, rollback libera worker y contexto anterior no se reemplaza con revisión nueva. Fixtures nativas de metadata NC sintéticas para aislar carreras; captura real y cadena/canónico independientes en pruebas embebidas. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-43a2123d detenido/datos conservados.
Se revisó sólo documentación pública de FECAESolicitar y manual oficial WSFEv1v4.7 (revisión01/09/2026) para mantener asociación con comprobante original: https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf. GET del WSDL falló en la herramienta; no se ejecutó una solicitud SOAP autenticada ni se asumió aceptación del XML. Preparación sin número no es todavía solicitud WSFE completa ni CAE.
SDK46 y HTTP/cliente/UI aún no ampliados para guardar/leer035: siguiente transporte debe recuperar antes de escritura, validar packet histórico/canónico/hash, conservar identidad/contenido inciertos y diferenciar contexto histórico de actual; captura explícita de períodos y revisión visual pendientes. Después cuerpo NC numerado/revisión/permiso/worker/FECompConsultar y exclusión cancelación–intención. Dinero/reposición sólo tras CAE NC confirmado y aplicación única. PR03/PR02 parciales; suite global definitiva y aceptación hospedada pendientes.
SQL001–035/Edge/flags sin instalación/activación remota por nosotros; sin secretos, ARCA autenticada nueva, emisión/CAE, merge o master/Production. Incluir fiscal_preparaciones_nc_homologacion/contexto histórico en dump/restore privado autorizado junto al diario, catálogo, unidades y vínculo; JSON app no acredita cobertura y restore integral sigue bloqueado. Contador/envases, PV/custodia/catálogo real pendientes; impresora/cajón/Point diferidos.

### 24/10/2026 — Validación histórica de preparación NC035
Se agregó validateFiscalCreditPreparationRecord: packet cerrado de13 campos, identidad venta/operación/caso y propuesta exacta; contexto histórico validado y preparación reconstruida desde factura/caso/períodos explícitos, comparando canónico completo y SHA. Rechaza campos extra, permisos, número propio, contexto o contenido alterados. Conserva CANCELADA como historial sin emisión/reintegro/reposición. No acredita vigencia actual ni reemplaza autorización SQL. Sin cambios SQL/HTTP/SDK/UI o instalación remota.28 pruebas enfocadas PASS; oxlint y diff check PASS. Build PASS (675 módulos; advertencia existente de tamaño de chunks). Siguiente: integrar lectura/guardado recuperable en servicio/transporte/cliente/UI antes de cuerpo numerado y emisión; PR03/PR02 permanecen parciales.

### 24/10/2026 — Servicio privado de recuperación histórica NC035
loadFiscalCreditPreparation verifica Auth una vez y conserva actor/scope capturados; lee factura026 y preparación035 con caso/hash exactos, valida propuesta y evidencia histórica completa. Sólo null durable significa ausencia; error/undefined/hash o caso distinto fallan saneados, sin reintento, escritura, catálogo vigente, TA o red ARCA. SDK permite únicamente nueva lectura035 (47 RPC); guardar035 aún fuera de allowlist y sin HTTP/cliente/UI.39 pruebas PASS/3 archivos y45 SDK PASS; build675 módulos PASS anterior al único agregado de allowlist/fixture SDK; oxlint/diff PASS. No se acredita JWT/RLS hospedado ni aceptación integral. Próximo: guardado con recuperación previa y transporte/cliente/UI; revisión/numeración/worker NC continúan pendientes. SQL/Edge/flags sin instalación remota; cero CAE, secretos, merge o cambios Production. Objetivo común permanece activo.

### 24/10/2026 — Guardado recuperable interno de preparación NC035
saveFiscalCreditPreparation captura scope/períodos antes de Auth, verifica Auth una vez y factura026; recupera035 antes de catálogo/escritura. Registro existente exige contexto/períodos idénticos y conserva cancelación. Ante ausencia confirmada carga034, verifica propuesta/contexto y reconstruye preparación sin número, comparando SHA esperado antes de escribir una vez. Respuesta de guardar no es ACK: consulta035 y compara evidencia completa/canónico/hash. Error o ausencia posterior queda no confirmado; no reintenta ni sustituye identidad. SQL sigue autoridad transaccional frente a carreras. Helper interno aún no expuesto por HTTP ni guardado en allowlist SDK (47 lecturas/operaciones previas); requiere gate de escritura default-off y cliente durable/UI.48 PASS/3archivos, oxlint/diff PASS; build675 módulos PASS (antes de los últimos2 tests, sin cambio de implementación posterior). Cobertura: recuperación activa/cancelada, ACK perdido/error devuelto, fallo de lectura previa, ausencia posterior, cambio de contexto/períodos, campos extra, captura antes de Auth y actor único. No se modificó SQL ni se ejecutó ARCA/red autenticada, instalación remota, CAE, secretos, merge o Production. PR03/PR02 parciales; sigue transporte/cliente/UI, luego numeración/revisión/worker/conciliación NC y aceptación autorizada.

### 24/10/2026 — Transporte HTTP de preparación NC035
PREPARACION_NC lee por venta/operación/caso/hash; GUARDAR_PREPARACION_NC agrega contexto_sha256 y entrada cerrada de3 períodos explícitos. Ambas acciones limitadas a2KiB, parser JSON estricto, UUID/hash y claves exactas; fechas calendario/concepto se validan nuevamente en servicio. Nueva bandera privada ARCA_HOMO_CREDIT_PREPARATION_ENABLED exige true exacto sólo para guardar, default-off; lectura histórica conserva recuperación con escritura apagada bajo gates globales de Staging/origen/backend/Auth. SDK48 incluye guardar035. Servicio devuelve únicamente evidencia normalizada validada, no packet privado de contexto/propuesta. No es permiso, numeración, CAE ni devolución comercial.68 pruebas de transporte/servicio/SDK y121 HTTP existentes PASS; lint/diff PASS. Build675 módulos PASS, advertencia conocida de tamaño de chunks. Pendiente cliente con persistencia mínima/Web Locks/recuperación ante ACK perdido e interfaz explícita, luego revisión/numeración/worker NC y aceptación hospedada. Ninguna bandera fue activada ni SQL/Edge instalado remotamente; sin secretos, ARCA autenticada, CAE, merge o Production.

### 24/10/2026 — Lectura cliente de preparación NC histórica
Record normalizado conserva contexto histórico verificado. HTTP usa fiscalCreditPreparationWire cerrado7 campos, sin duplicación de datos derivados ni propuesta privada; preparación sólo canónico/hash. validateFiscalCreditPreparationWire reconstruye y valida evidencia completa contra factura/caso capturados y contexto histórico. credits.preparation consulta identidad mínima, acepta sólo null confirmado, valida respuesta y no toca storage ni otorga permisos. Activa/cancelada conservan estado. No exige catálogo actual; futura emisión debe revalidarlo. Guardado durable cliente/Web Locks e interfaz todavía pendientes.178 PASS/4archivos más75 paneles PASS; lint/diff PASS. Primera selección falló3 tests por simulador sin sobre HTTP, corregido; build inicial detectó mocks de componentes sin método preparation, corregidos, build final676 módulos PASS, advertencia conocida de tamaño de chunks. Ninguna instalación/activación remota, ARCA autenticada, CAE, secretos, merge o Production. PR03/PR02 permanecen parciales.

### 24/10/2026 — Guardado y recuperación durable en cliente NC
credits.savePreparation valida factura/caso/contexto/períodos, calcula preparación y usa exclusión por venta compartida. Recupera primero; antes de POST guarda/lee metadata mínima6 campos(version,operationId,requestId,proposalSha,preparationSha,contextSha), aislada Auth/comercio/venta. Sin canónico/PII/períodos en storage. Un POST como máximo por llamada; sólo lectura durable con hash/contexto idénticos retira pendiente. credits.recoverPreparation captura factura/caso, valida identidad local y recupera sin POST; ausencia/error conserva pendiente. Reintento explícito exige mismo contenido; nuevas reservas/cancelación bloqueadas mientras preparación incierta. Caso pendiente previo impide nueva preparación. Invariantes SQL035 siguen autoridad contra carreras, no el lock local.120 PASS/5archivos, luego4 pruebas del cliente nuevamente PASS tras endurecer uso de propuesta validada; build676 módulos PASS, lint/diff PASS. Pruebas: ACK perdido, persistencia antes de POST, cuota local, recarga/ausencia posterior, bloqueo de cancelación y dos instancias con exclusión en memoria/un POST. No acredita Web Locks de navegadores ni JWT/RLS hospedados. Primera revisión automática no pudo ejecutarse por límite de uso; al retomar permitió herramientas y se verificó estado antes de continuar. Pendientes: formulario/períodos/revisión visual, recuperación/cierre explícito de pendientes nunca persistidos (no borrar sólo por null), cancelación coordinada, cuerpo numerado/permiso/worker/conciliación/aplicación NC. Sin instalación/activación remota, secretos, ARCA autenticada, CAE, merge o Production. PR03/PR02 parciales y objetivo común activo.

### 24/10/2026 — Cierre coordinado de preparación NC incierta
Se reemplaza el bloqueo absoluto de cancelar con preparación pendiente por cancelación explícita del mismo caso/operación/SHA. Guarda intención CANCELAR antes de consultar/enviar; sólo ACK durable CANCELADA exacto permite retirar metadata de preparación y luego pendiente del caso. Error/null/estado activo conservan ambos. Recover del caso tras recarga también retira preparación del mismo caso al verificar cancelación durable. Identidad distinta sigue bloqueada sin red. No se elimina preparación del servidor ni historia; SQL028/035 serializan cancelación/preparación y la cancelación impide preparación tardía. Depende de la arquitectura actual sin intención NC emitible; futura intención/worker requiere gate SQL de exclusión cancelación–envío antes de habilitarla.17 pruebas cliente PASS inicialmente; build detectó inferencia demasiado estrecha del mock send al agregar ACK de cancelación, corregido mediante Promise<unknown> (sin cast/any), regresión ampliada92 PASS/4archivos, lint/diff y build676 módulos PASS (advertencia conocida de chunks). Pendiente formulario/períodos/revisión, integración de recuperación/cancelación en UI, cuerpo numerado/serie/permiso/worker/conciliación NC y aceptación hospedada. Sin nueva SQL ni instalación remota, flags, secretos, ARCA autenticada, CAE, merge o Production. Objetivo común/PR03/PR02 siguen incompletos.

### 24/10/2026 — Formulario de preparación NC integrado al historial
FiscalCreditPreparationPanel se incorpora a casos activos detrás del gate UI ya existente/default-off. Consulta manual recupera035 antes de catálogo actual; con pendiente usa recoverPreparation sin POST. Si hay preparación histórica valida contexto/canónico/hash nuevamente, muestra estado/NC/PV/total/períodos y no ofrece guardado. Con ausencia confirmada sin pendiente obtiene contexto actual y habilita captura; concepto1 envía null explícitos y conceptos2/3 requieren períodos/vencimiento dd/mm/aaaa sin copiar factura. Confirmación obligatoria antes de guardar; preflight puro verifica calendario/concepto, servidor vuelve a validar. Antes de envío bloquea edición y conserva identidad ante error; consulta/cancelación explícitas, checkbox separado para cancelar y ACK validado completo. Cancelación confirmada actualiza el listado padre; cambio de caso/desmontaje descarta respuestas tardías y running ref impide dobles acciones. No es pantalla de aprobación fiscal numerada ni CAE, no entrega dinero/reposición.
34 PASS/4archivos (panel nuevo5, casos/contexto y cliente), lint/diff PASS. Primera selección falló por matcher toBeDisabled no instalado, corregido a matches(':disabled'); build inicial vio esa misma deuda de test y luego build677 PASS. Build final tras últimos ajustes de texto/fecha677 PASS; símbolos RPC privados/bandera privada/servicio ausentes del bundle público. No se realizó comprobación visual hospedada, JWT/RLS ni Web Locks reales. Próximo: consolidar revisión y aceptación local de la preparación, cuerpo NC numerado/serie/revisión/permiso/worker/FECompConsultar, exclusión cancelación–intención y aplicación única sólo tras CAE NC. Mantener provisión/PV/aceptación hospedada/emisión detrás de autorización. Sin SQL/Edge instalado, flags activados, secretos, ARCA autenticada, CAE, merge o Production. Objetivo común/PR03/PR02 parciales.

### 24/10/2026 — Aceptación local integrada de preparación NC035
Runner SQL embebido amplía dispatch a cargar/guardar_preparacion_nc_homologacion. Nuevos ensayos recorren cliente real → sobre/HTTP real → servicio real/validadores → RPC035/SQL embebido, conservando Auth sintético. FacturasA/B/C y conceptos1/2/3: ausencia, un POST, recuperación tras recrear cliente y canónico/hash idénticos a preparación pura; no nuevas series/reservas/movimientos/devoluciones. ACK HTTP perdido después de confirmar servidor se recupera sin otro POST incluso tras revocar catálogo/emisor; no requiere parámetros actuales para leer historia. Cancelación por HTTP conserva preparación histórica CANCELADA y reintento no reactiva ni escribe otra vez. No se invocan loaders de TA ni fetcher ARCA.
324 PASS/salida0 de archivo completo (pilot-credit-preparation-integrated-v2-20261024.log), incluidos7 casos nuevos; primera ejecución317PASS/7FAIL por typo kiosk en fixture, corregido a kid. Prueba adicional Auth-to-lectura: reasignar perfil entre fuente026 y getter035 conserva actor original y deniega tanto al actor anterior como al reasignado;1PASS/324 filtradas (pilot-credit-preparation-auth-v1-20261024.log). No se presenta filtrado como omisiones de cobertura: las324 pasaron antes de agregar ese test, sin cambio de implementación posterior. Build677 módulos PASS (pilot-credit-preparation-integrated-build-v1-20261024.log, antes del último test Auth), lint/diff PASS. Auth local sintético y SQL embebido no acreditan JWT/RLS/Edge/Web Locks hospedados ni concurrencia PostgreSQL nativa adicional. No se repitieron123 nativas previas: no cambió SQL ni implementación de concurrencia.
Próximo gate local: cuerpo NC numerado/serie/revisión/permiso/worker/FECompConsultar y exclusión cancelación–intención; aplicación comercial única sólo tras CAE NC confirmado. Revisar coherencia/UX integral de preparación, luego aceptación autorizada con PV/catálogos/custodia reales. No instalar fiscal remoto, activar flags, usar secretos ni emitir por estas pruebas. Sin nuevas consultas ARCA autenticadas, CAE, merge o cambios master/Production. PR03/PR02 y objetivo común siguen parciales.

### 24/10/2026 — Contrato puro del cuerpo NC numerado
FiscalCreditRequest separado de FiscalRequestData/factura v1: clase NOTA_CREDITO, identidad venta/operación/caso/propuesta/preparación y reserva_id; solicitud con datos exactos de035, asociación única original y número propio entero1..99999999. Revalida wire035/caso/factura/contexto histórico, rechaza CANCELADA y exige reserva cerrada14 campos con serie/CUIT/tipo/PV/identidades/SHA exactos, estado RESERVADA y emisión false. Captura todo antes de await, canónico ordenado/hash SHA256 y deep freeze. No cambia importe/IVA proporcional ni el número asociado a la factura; A/B/C, servicios/mixtos conservan períodos explícitos. Contrato de reserva valida forma/enlace, NO acredita existencia/exclusividad/vigencia SQL ni origen confiable: siguiente adaptador privado debe obtenerla/revalidarla bajo lock de serie y caso antes de persistir. No se expone al cliente/HTTP/SDK ni se genera XML/permiso.
69 PASS/3archivos, nuevos22 escenarios cuerpo NC, incluyendo límite/tipo entero, otra serie/caso/hash/estado/permisos/extra, cancelación y captura antes de await. Factura v1 sigue rechazando cuerpo NC. Lint/diff y build677 módulos PASS, advertencia conocida de chunks. Pendiente SQL durable de serie/reserva/cuerpo NC y exclusión cancelación–intención antes de worker, revisión temporal del Dueño ligada al cuerpo exacto, FECompConsultar NC y aplicación única sólo tras CAE confirmado. No se ha reservado numeración real ni emitido. Sin instalación fiscal remota, flags activados, secretos, ARCA autenticada nueva, CAE, merge o Production. PR03/PR02 parciales.

### 24/10/2026 — SQL036: reserva/cuerpo NC durables privados
Preparado fiscal_nc_series_homologacion(CUIT/PV/tipo3/8/13) y fiscal_nc_reservas_homologacion por caso/UUID, checksum/canónico, número/último y consulta observada. RLS/tabla/columnas/helpers revocados; sólo getter/reservar EXEC service_role, fuera de allowlist SDK/HTTP. Getter verifica Auth original/caso/preparación; replay conserva preparación/UUID y recupera historia con emisor/catálogo apagados, sin exigir consulta fresca ni modificar número. Nuevas reservas exigen READ COMMITTED, caso/preparación activos, contexto033 idéntico al histórico035, lock por caso y serie; revalida tras esperar y rechaza último agotado/negativo/timestamp infinito/futuro o mayor30s. El futuro adaptador privado debe acreditar origen WSFE real: forma/fecha SQL no autentican un último autorizado inventado por quien ya posee privilegio privado.
Cuerpo canónico producido en SQL coincide con FiscalCreditRequest y asociación original, A/B/C y conceptos1/2/3. Reserva/cuerpo inmutables, únicos por caso/UUID/serie+número. Serie se mantiene cerrada ante cualquier reserva hasta futura resolución privada; no existe todavía workflow para continuar serie tras resultado ARCA. Trigger de cancelación excluye borrado simple de caso numerado; instalación rechaza historia con reserva y cancelación simultáneas. Cancelación previa impide numeración tardía; no se emite ni cambia stock/caja/devoluciones. Futuro flujo de cancelación/resolución numerada y exclusión intención/worker son prerequisito antes de exposición remota.
12 pruebas036 PASS (325 filtradas, pilot-credit-reservation-sql-v1-20261024.log); selección completa359 PASS/2archivos (337 SQL y22 contrato, pilot-credit-reservation-sql-v2-20261024.log). Reaplicación036 dos veces por fixture. Tests: igualdad byte a byte SQL/TS, replay/UUID distinto, consulta inválida/rollback sin serie parcial, cancelación previa/posterior, catálogo/emisor revocados, ACL columnas/tabla e inmutabilidad. Build677 módulos PASS (pilot-credit-reservation-build-v1-20261024.log); manifiesto bootstrap43 PASS, no incluye opcionales fiscales; lint sin hallazgos nuevos, finally previo del runner. Concurrencia nativa ampliada5 escenarios:128 PASS/salida0, credit-reservation-concurrency-v4-20261024.json; PostgreSQL nativo con036 instalado dos veces después de123 escenarios previos. Verifica mismo caso/una reserva, cancelación antes/después de numerar, rollback y consulta vencida esperando serie. Contenedor propio kiosko-pr03-local-0270dfcd detenido/datos conservados, cero solicitudes externas/emisiones. Intento v3 conservado como FAIL en paso124 por esperar42501 cuando contrato correcto devuelve55000 al cancelar antes de numerar; corregida expectativa del test, sin relajar SQL. primer check sintáctico detectó nombre duplicado en runner y se corrigió; siguiente intento no creó contenedor por Docker cerrado, luego se inició app local y respondió29.9.2. No contar intentos fallidos como PASS.
SQL001–036 no instalado/activado remotamente por nosotros. Sin SDK/HTTP/worker nuevos ni reserva/consulta/CAE reales; incluir tablas NC nuevas en dump/restore autorizado, restauración integral sigue bloqueada. PR03/PR02 y objetivo común parciales. Próximo: resolución de reserva NC, adquisición privada de numeración verificada, revisión/worker/conciliación y aplicación única, luego aceptación hospedada autorizada. Sin secretos, consultas ARCA autenticadas nuevas, master/Production o merge.
Prueba adicional036: dos casos parciales legítimos distintos sobre venta pesable de0.500 (0.250/$62 cada uno) preparan datos por pipeline real; tras reservar primero, segundo no avanza serie aunque declare siguiente último autorizado.13 pruebas036 PASS (325 filtradas, pilot-credit-reservation-sql-v3-20261024.log). Refactor menor del helper de instalación036 para reaplicar dos veces; selección final360 PASS/2archivos (pilot-credit-reservation-sql-v4-20261024.log) y build final677 módulos PASS (pilot-credit-reservation-build-v2-20261024.log, avisos conocidos de chunks/timings). No se usa metadata retrospectiva en estos escenarios embebidos. Fixtures nativas de unidades siguen sintéticas para aislar carreras, como documentado antes; no son backfill ni aceptación real.

### 24/10/2026 — SQL037 y servicio de lectura del cuerpo NC reservado
cargar_fuente_cuerpo_nc_homologacion recupera packet privado cerrado3 campos(preparacion035,reserva036,cuerpo canónico/SHA), con Auth fiscal original/caso/preparación/UUID de reserva y locks heredados, sin exigir catálogo/emisor actuales. NULL sólo ante reserva ausente del caso autorizado. Sin tablas nuevas ni escrituras; EXEC service_role, tablas permanecen privadas. SDK49 admite lectura037, fuera de HTTP/cliente/UI. loadFiscalCreditRequest captura scope y verifica Auth una vez, representación026 y propuesta exacta del caso, luego valida packet/cuerpo.
validateFiscalCreditRequestRecord reconstruye preparación/cuerpo numerado contra factura/caso/reserva, compara canónico/SHA completos y devuelve CUERPO_NC_RESERVADO inmutable/emisión false. Rechaza extra/permisos/hash/canónico/UUID/número/preparación cancelada alterados. Es evidencia histórica; no aprobación, credencial, vigencia actual ni permiso. No se debe usar este getter como autorización de envío.
419 PASS/3archivos (342 SQL embebido,30 contrato/servicio,47 SDK), salida0 pilot-credit-request-source-v1-20261024.log. Nuevos: A/B/C lectura real servicio/SQL tras apagar emisor/catálogo; Auth reasignado entre fuente y getter bloquea cuenta anterior/nueva; sólo null como ausencia, identidad/Auth único, contenido reconstruido y ACL indirectas del SDK. SQL037 se reaplica dos veces en fixtures. Build677 módulos PASS (pilot-credit-request-source-build-v1-20261024.log), lint/diff sin hallazgos nuevos salvo finally previo del runner.
PostgreSQL nativo130 escenarios PASS/salida0:037 instalado dos veces tras128;2 nuevos lector espera reserva confirmada y recupera canónico/hash enlazados, Auth reasignado mientras espera no revela cuerpo. credit-request-source-concurrency-v1-20261024.json. Contenedor propio kiosko-pr03-local-172b31ba detenido/datos conservados; cero solicitudes externas/emisiones. Auth/metadata nativas sintéticas, no JWT/RLS/Edge/Web Locks hospedados ni backfill real. Suite global definitiva sigue pendiente.
Siguiente: adquisición privada de numeración NC con WSFE auténtico y gates, revisión temporal Dueño sobre cuerpo exacto, permiso/intención/worker, resolución/FECompConsultar NC y aplicación comercial única sólo tras CAE. Serie continúa cerrada mientras reserva pendiente. SQL001–037/Edge/flags no instalados/activados remotamente por nosotros. Getter nuevo debe estar incluido en esquema de dump/restore autorizado, sin tablas nuevas; backup JSON no cubre diario fiscal y restore integral sigue bloqueado. Sin secretos, ARCA autenticada nueva, CAE, merge o master/Production. PR03/PR02/objetivo común parciales.

### 24/10/2026 — Adaptador privado de último número NC (SOAP sintético)
FiscalCreditNumberXml valida serie cerrada4 campos HOMO/CUIT módulo11/PV1..99998/tipo3/8/13, y decodifica FECompUltimoAutorizado con XML seguro existente (límites bytes/nodos/profundidad, sin DTD/entidades, esquema/namespace/duplicados). Conserva último0..99999999 exacto; no convierte cero en ausencia ni incrementa automáticamente. Rechaza serie equivocada, decimales/exponentes/negativos/agotamiento fuera de rango, Errors de negocio y acciones ajenas. Events sólo se validan; no se devuelven mensajes privados. WSFE no retorna CUIT en esta respuesta: parser no autentica emisor ni transporte. Futuro worker debe acreditar binding de TA/contexto y autoridad de consulta, no atribuirlo al XML.
Consulta privada usa endpoint homologación y SOAPAction fijos, POST/redirect:error, TA escapado y callback obligatorio antes de enviar. Captura serie antes de await; no crea TA, escribe SQL, reserva, reintenta ni emite. Reutiliza postPrivateFiscalWsfe con deadline/aborto/lectura acotada/content-type/UTF8 y añade guard fijo URL/método/redirect/acciones. Comparte sólo validador CUIT/bloque Auth; normalizeFiscalSeries/parser/factura v1 siguen rechazando NC, sin ampliar contrato de emisión existente. Helpers nuevos son internos, no HTTP ni cliente/UI; callback por sí mismo no sustituye autorización SQL.
130 PASS/3 archivos inicialmente (pilot-credit-number-xml-v1-20261024.log). Regresión ampliada627 PASS/8 archivos (pilot-credit-number-xml-v2-20261024.log), incluidos29 nuevos de numeración NC y contratos/XML/worker/preparación SQL/cache existentes. Build677 módulos PASS (pilot-credit-number-xml-build-v1-20261024.log); manifiesto43/diff PASS; lint sin nuevos hallazgos, regex de controles preexistentes de Auth/escape conservados. Símbolos del adaptador/transporte NC ausentes del bundle público. No se repitió PostgreSQL nativo130 previo: no cambió SQL/locks. No es suite global ni aceptación hospedada; todos fetchers nuevos sintéticos, cero consultas ARCA autenticadas/emisiones reales.
Siguiente: fuente/binding SQL privado específico de numeración NC y worker gated que recupere037 antes de TA/consulta, valide emisor/caso/preparación actuales y persista036 tras consulta auténtica; sin inferir autorización del estado AUTORIZADA de la factura original. Luego revisión Dueño sobre cuerpo exacto, permiso/intención, resolución/FECompConsultar NC, aplicación única tras CAE y aceptación hospedada autorizada. SQL001–037/Edge/flags no instalados/activados remotamente por nosotros; sin secretos, CAE, merge o master/Production. PR03/PR02/objetivo común parciales.

### 24/10/2026 — SQL038: fuente/binding específicos de numeración NC
cargar_fuente_numeracion_nc_homologacion exige trabajador service_role, READ COMMITTED, Dueño activo/no SuperAdmin del comercio, Auth original/caso y preparación SHA exactos; rechaza cancelación y reserva existente (recuperar037 antes de consulta nueva). Contexto033 actual debe ser idéntico al histórico035 y el emisor vigente conserva revisión/credencial/certificado del caso. Fuente privada devuelve sólo preparación y binding cerrado20 campos con finalidad NUMERACION_NC, identidades venta/operación_origen/caso/Auth/comercio y metadata de emisor/catálogo. Sin tokens, claves ni permiso de emisión/TA. Sin tablas nuevas, SDK50 lectura038, no HTTP/UI ni worker.
FiscalCreditNumberBinding es deliberadamente incompatible con FiscalWorkerBinding de facturas: NO operacion_id y usa revision_emisor. Se identificó que createSharedFiscalTicketLoader utiliza binding.operacion_id en RPC de lease/renovación TA ligadas a operaciones de factura. No pasar UUID de caso NC ni tomar factura AUTORIZADA como permiso sustituto; falta coordinador/lease específico NC compatible con reutilización de TA por certificado. Validator reconstruye preparación y cruza scope/Auth/SHA/CUIT/PV/tipo/revisiones, congela metadata y rechaza extras/cancelación/permisos. loadFiscalCreditNumberingSource verifica JWT vía Auth.getUser una vez, conserva actor original en026/038 y devuelve metadata saneada; no consulta cache/custodia/WSAA/WSFE.
Primera selección SQL0387 PASS/2FAIL por fixtures que violaban constraints de usuarios (EMPLEADO inexistente y SuperAdmin con comercio), corregidos a CAJERO y SuperAdmin sin comercio; no se relajó esquema. Contratos94 PASS/3archivos inicialmente; selección final445 PASS/4archivos (351 SQL embebido,17 fuente,29 SOAP NC,48 SDK), salida0 pilot-credit-number-source-v2-20261024.log. Cobertura: actor y scope, sin permiso heredado, casos reservados/cancelados, emisor/catálogo/pago cambiados, roles/SuperAdmin, Auth reasignado, captura antes de await y metadata cerrada. Build677 módulos PASS (pilot-credit-number-source-build-v1-20261024.log); manifiesto43/diff PASS, lint sin hallazgos nuevos (finally previo). Símbolos de fuente/binding privados ausentes del bundle.
PostgreSQL nativo133 PASS/salida0;038 reaplicado tras130 y3 escenarios: reserva gana/exige recuperar cuerpo, emisor revocado esperando y Auth reasignado esperando no devuelven fuente para TA. credit-number-source-concurrency-v1-20261024.json. Contenedor propio kiosko-pr03-local-788e3147 detenido/datos conservados; cero solicitudes externas/emisiones. Auth/metadata sintéticas, sin acreditar aceptación JWT/RLS/Edge/Web Locks real ni backfill. Suite global definitiva pendiente.
Siguiente: coordinación privada de TA NC con identidad de caso/actor/emisor y guardias propias, reutilizando TA válido/cifrado por certificado sin renovar en paralelo; trabajador gated que recupere037 antes de TA/consulta y revalide038 antes de enviar, persista036 y recupere cuerpo exacto. Luego revisión Dueño/permiso/intención, resolución/FECompConsultar y aplicación comercial única tras CAE. SQL001–038/Edge/flags no instalados/activados remotamente por nosotros; sin secretos, consultas ARCA autenticadas nuevas, CAE, merge o master/Production. Incluir038 en esquema de dump/restore autorizado, sin nuevas tablas; restore integral sigue bloqueado. Objetivo común/PR03/PR02 parciales.

### 24/10/2026 — SQL039: coordinación TA NC compartida por certificado
coordinar_ta_nc_homologacion separa SOLICITAR/INICIAR/CONFIRMAR/CANCELAR/ESTADO con scope Auth/caso/preparación/binding completos. Comparte fiscal_ta_homologacion e intentos globales por certificado para no renovar en paralelo con facturas. Nueva tabla privada/inmutable fiscal_nc_ta_vinculos_homologacion liga intento a caso/Auth/binding NC; intento global NC conserva operacion_origen_id=NULL, sin inventar operación de factura. Funciones008 no lo pueden adoptar/cancelar; intentos históricos de factura no se adoptan ni rellenan como NC. EXEC sólo service_role; helper histórico sin EXEC público/service y tablas/columnas/RLS revocados.
SOLICITAR/INICIAR exigen fuente038 actual y la revalidan tras lock del TA; propietario/gen/CAS y permiso de envío único. TA vigente >60s se comparte sólo cifrado, margen cercano exige esperar vencimiento; PREPARADA/ENVIO_INCIERTO no generan otra renovación. Nuevas generaciones conservan intentos anteriores. CANCELAR sólo antes de envío, con replay sin liberar generación siguiente. Una vez iniciado, incertidumbre no se libera por timeout ni cancelación. CONFIRMAR almacena únicamente sobre cerrado(version/keyId/nonce/ciphertext/expiresAt), vigencia <=12h1m, resultado/hash durables e idempotentes; rechaza texto plano/extras/sobre inválido. Confirmación de respuesta ya recibida y cancelación de preparación sin envío usan binding histórico del mismo Auth/caso, no permiso038 nuevo: conservan TA cifrado aun si caso/emisor se canceló/revocó entretanto, pero no permiten un envío nuevo. ESTADO no expone IDs de preparación ajena (COMPARTIDA), nunca Token/Sign. Sobre no acredita por sí solo AES/WSAA; futuro loader privado debe cifrar/descifrar y verificar contexto/TA reales.
11 pruebas039 PASS inicialmente (351 filtradas, pilot-credit-ticket-sql-v1-20261024.log); se agregó replay de cancelación contra generación nueva. Selección final385 PASS/2archivos (363 SQL embebido +22 cache, pilot-credit-ticket-sql-v2-20261024.log);98 persistencia/loader heredados PASS aparte (pilot-credit-ticket-legacy-v1-20261024.log). No sumar filtrados como omitidos de aceptación: escenarios039 se instalan/reaplican explícitamente dentro de sus transacciones; baseline histórico por fases se conserva y no todos los tests antiguos corren tras039. Pruebas: lifecycle/ACK, cancelación antes/después, confirmación tras caso cancelado/emisor revocado, TA compartido de factura PREPARADA/ENVIO/DISPONIBLE sin apropiación, sobres inválidos, tabla privada/inmutable y RPC heredada no cancela NC. Cifrados SQL sintéticos, no validación criptográfica nueva ni TA auténtico.
PostgreSQL nativo137 PASS/salida0:039 instalado dos veces después de133,4 nuevos escenarios. Dos comercios NC/certificado una preparación, dos workers un permiso envío, cancelación gana impide envío tardío, envío gana preserva incertidumbre. credit-ticket-concurrency-v2-20261024.json; contenedor propio kiosko-pr03-local-7b100a86 detenido/datos conservados. Primer ensayo133 previos yFAIL por fixture intentando helper canónico privado con service_role; corregido cálculo sintético por observer de pruebas, sin ampliar ACL. Fixtures nativas rotan metadata sólo en comercios sintéticos antes de crear casos, no claves reales/backfill. Cero solicitudes externas/emisiones.
Build677 módulos PASS (pilot-credit-ticket-build-v1-20261024.log), manifiesto43/diff PASS, lint sin nuevos hallazgos (finally previo). Sin cambio de implementación TypeScript ni nuevo SDK/HTTP/loader/worker; coordinación039 aún fuera de allowlist. Siguiente: loader TA NC específico con cifrado/contexto certificado y callback de envío autorizado por039, integración worker de numeración gated/recuperación037 y persistencia036; luego revisión/permiso/intención/worker/conciliación/resolución NC y aplicación única tras CAE confirmado. No usar cargador de factura mediante cast. Pérdida de Auth original o envío incierto requieren recuperación privada controlada, no apropiación automática de lease. SQL001–039/Edge/flags no instalados/activados remotamente por nosotros; sin secretos, WSAA/WSFE autenticados nuevos, CAE, merge o Production. Dump/restore autorizado debe incluir nuevo vínculo TA NC y diario/TA cifrado previos; JSON app no cubre esto, restore integral sigue bloqueado. Objetivo común/PR03/PR02 parciales, aceptación hospedada pendiente.

### 24/10/2026 — cargador TA NC privado, avance local sin activar
Implementado cargador específico NC sobre coordinación039, sin convertir el binding en operación de factura. Cifra con AES-GCM y contexto de certificado, reutiliza sobres, exige guard antes de claves/envío y ACK INICIAR único. Un ACK perdido tras posible envío no cancela ni renueva; confirmación perdida puede recuperarse por lectura del cifrado. TA tardío tras aborto se conserva pero no se entrega al consumidor. Validación cerrada de metadata y SDK privado habilitado sólo para RPC039, sin instalación/flags remotos.
Pruebas focalizadas iniciales72 PASS/3 archivos (credit-loader-tests-v2.log), build PASS (credit-loader-build.log), lint sin hallazgos. Nueva prueba SDK agregada después: resultado final registrado en credit-loader-tests-v3.log. Cifrado real con claves efímeras y TA sintéticos; no ARCA ni secretos reales. Pendiente integración de este cargador con SQL039 real, custodia/CMS NC específico y worker de numeración/recuperación037/reserva036. Pérdida de ACK SOLICITAR conserva preparación pendiente; no renovación automática. No aceptación hospedada ni cierre PR03/PR02, CAE, merge o Production. Cambios locales aún sin publicar.

### 24/10/2026 — PR03: cargador TA NC cifrado integrado con SQL039
Cargador privado específico NC, sin convertir binding/permiso de factura. AES-GCM real con claves efímeras sintéticas; coordinación global por certificado y vínculo NC propio. Integración PGlite con039 instalado dos veces prueba reutilización entre instancias, ACK CONFIRMAR perdido recuperable, ACK INICIAR perdido sin cancelar/reenviar y fallo de clave previo que libera sólo preparación. No alteración de venta/stock/caja. Selección538 PASS/5archivos (credit-loader-final-tests.log), incluyendo367 SQL embebidos y98 persistencia heredada; no suite global ni aceptación hospedada. Build PASS (credit-loader-final-build.log), lint sin hallazgos, manifiesto bootstrap43/diff PASS; símbolos privados ausentes del bundle. Prueba filtrada previa4PASS/363omitidos sólo diagnóstica, no sumar como cobertura adicional. Sin cambios SQL: concurrencia nativa137 previa permanece evidencia de039, no prueba nueva del cargador.
Pendientes: custodia/CMS NC específico, worker numeración con recuperación037 y reserva036, revisión/permiso/intención/envío/conciliación/resolución NC y aplicación comercial única después de CAE. ACK SOLICITAR perdido conserva preparación y requiere recuperación controlada; no renovación automática. SDK incluye coordinación privada039, sin HTTP/UI ni activación nueva. SQL001–039/Edge/flags no instalados/activados remotamente por nosotros, sin secretos reales, consultas ARCA autenticadas nuevas, CAE, merge, master o Production. PR03/PR02 parciales; restore integral bloqueado; impresora/cajón y Point diferidos. Este bloque se publica en rama del PR3 conservando historial.

### 24/10/2026 — PR03: custodia/CMS WSAA específico NC preparado localmente
Nuevo adaptador NC con binding cerrado038, snapshot antes de awaits, firma CMS antes del callback durable039 y transporte WSAA de homologación fijo. La custodia usa revisión_emisor explícita y comparte únicamente el descifrado privado PKCS8 ya validado; no convierte NC en binding/operación de factura. Certificado/huella/revisión/proyecto y RSA no exportable se verifican antes de transporte. Token/Sign no enumerables, errores sanitizados, sin nuevos endpoints/flags/SQL.
Selección195 PASS/7archivos (credit-wsaa-final-tests.log), incluye7 nuevos escenarios NC: PKCS8 cifrado sintético→CMS firmado real→TA simulado ligado al uniqueId firmado, revisión/huella/proyecto/shape inválidos y permiso rechazado/abortado. Ajuste posterior conserva catch sanitizado de custodia de factura:56 PASS/3archivos repetidos (credit-wsaa-post-review-tests.log); no sumar como251 únicas. Ninguna clave/certificado real ni solicitud ARCA externa. Provisionamiento/uso real siguen gated.
Siguiente dependencia: worker de numeración NC con Auth original capturado una vez, recuperación037 antes de TA, fuente038 vigente antes de claves/consulta y reserva036 una sola vez/ACK perdido. Luego revisión/permiso/intención/envío/conciliación/resolución NC y aplicación comercial sólo tras CAE confirmado. No se ha cerrado PR03/PR02 ni aceptación hospedada. SQL001–039/Edge/flags sin instalación/activación remota por nosotros, sin CAE, merge/master/Production. Restore integral bloqueado; físicos/Point diferidos.
Cierre del bloque local: buildv2 PASS (credit-wsaa-build-v2.log), lintv2 sin hallazgos, diff PASS y símbolos privados ausentes del bundle público. Trabajo probado se publica en la rama del PR3; no despliegue fiscal remoto.

### 24/10/2026 — PR03: proceso privado de numeración NC preparado
Nuevo prepareFiscalCreditNumber captura Auth una vez y conserva la identidad original en cada RPC. Recupera037 antes de TA incluso con gate de numeración cerrado; requiere gate privado ARCA_HOMO_CREDIT_NUMBERING_ENABLED exacto para trabajo nuevo. Fuente038 revalidada antes de claves/WSAA/WSFE, TA cifrado coordinado039, consulta de último número con callback y reserva036 una sola vez. Confirmación final sólo por lectura037 y validación de canónico/hash/preparación; ACK RPC no acredita persistencia. No FECAESolicitar ni efectos de dinero/stock. SDK privado incluye reserva036 (52RPC); sin endpoint/acción UI ni activación remota.
Selección anterior477 PASS/5archivos (credit-number-worker-final-tests.log); no incluye último ajuste de recuperación al fallar fuente por carrera. Ocho escenarios posteriores8PASS/367omitidos (credit-number-worker-race-tests.log), antes de ese ajuste. Verificación del último ajuste y noveno escenario en curso: credit-number-worker-race-v2.log y build-v2. No declarar estos resultados posteriores PASS hasta observar finalización/salida. Intercalaciones inyectadas en PGlite, no nueva prueba de procesos PostgreSQL concurrentes. SQL sin cambios;137 nativas previas acreditan sólo coordinación SQL039.
Pendientes: exposición privada controlada y recuperación de identidad de reserva por cliente, revisión/permiso sobre cuerpo NC numerado, intención/envío/FECompConsultar/resolución NC y aplicación única después de CAE confirmado; además aceptación hospedada JWT/RLS/Edge/E2E y custodia/PV/parámetros reales. Gate nuevo apagado por ausencia; no consultas ARCA autenticadas nuevas, SQL/Edge/flags remotos, emisión/CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Revisor automático interrumpió una edición/verificación por límite de uso; operación no ejecutada entonces. Revisión volvió a permitir operaciones al retomar, sin bypass ni ampliación de autoridad.

Cierre de verificación 24/10/2026: último ajuste de recuperación de fuente y noveno escenario9 PASS/367omitidos (credit-number-worker-race-v2.log). Los omitidos son filtrado por nombre, no aceptación. Buildv2 PASS, lintv2 sin hallazgos, manifiesto bootstrap43/diff PASS; símbolos worker/gate privados ausentes del bundle público. Selección477 previa y9 enfocadas posteriores se reportan por separado, sin inventar suite global actual. Se publica bloque probado en rama PR3, con endpoint/UI e instalación/activación remota todavía pendientes.

### 24/10/2026 — PR03: revisión humana NC durable preparada (SQL040)
Revisión específica de cuerpo numerado NC, separada de factura y de permiso de envío. Tabla privada/inmutable liga UUID de revisión, caso/reserva, Auth original, cuerpoSHA/preparaciónSHA y contexto de emisor/catálogo/hechos comerciales. Vencimiento fijado a diez minutos, replay histórico no lo extiende ni acredita vigencia actual. Nueva aprobación exige Dueño activo único/no SuperAdmin, cuerpo exacto y contexto033 vigente igual al conservado en035. Getter histórico ligado a037; no permite aportar un cuerpo alternativo ni borra historia al revocar emisor. Revalidación tras INSERT/espera evita acreditar aprobación nueva con contexto vencido/cambiado. Contrato TypeScript reconstruye cuerpo/hash y rechaza aprobaciones ajenas/extra/alteradas; es evidencia histórica, no autoridad/permiso.
Evidencia:415 PASS/2archivos (385 SQL embebidos +30 contrato/cuerpo NC, credit-owner-review-final-tests.log). Nueve escenarios040 y alteraciones de DTO; instalación/reaplicación040 explícitas por fixture con ROLLBACK, baseline histórico por fases se conserva. PostgreSQL17.11 nativo140 PASS:137 anteriores,3 después040 instalado dos veces (credit-owner-review-native-v1.json/.log): dos trabajadores misma revisión un ACK/vencimiento, emisor revocado y Auth reasignado esperando bloquean aprobación. Cero solicitudes externas/emisiones; contenedor propio kiosko-pr03-local-e460972f detenido/datos conservados. Build PASS, lint del cambio sin hallazgos; runner conserva warning no-unsafe-finally previo. Manifiesto bootstrap43/diff PASS no valida opcional040; símbolos privados ausentes del bundle.
Pendientes: conectar transporte/SDK privado y captura/revisión visible con UUID durable, separar aprobación histórica de vigencia al conceder futuro permiso, intención/envío/FECompConsultar/resolución NC y aplicación comercial única sólo tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros; sin provisión/uso de secretos reales, llamadas ARCA autenticadas nuevas, CAE, merge/master/Production. PR03/PR02 y aceptación hospedada siguen parciales. Dump/restore privado futuro debe incluir revisiones NC además de diario/TA/unidades/reservas; JSON app no lo cubre y restore integral permanece bloqueado. Impresora/cajón/Point diferidos. Se publica incremento probado en rama del PR3.

### 24/10/2026 — PR03: servicio y transporte de revisión NC preparados
Servicio privado verifica Auth una vez, conserva scope/Auth original, valida representación/caso/cuerpo040 y enlaza UUID de aprobación al cuerpoSHA/preparaciónSHA esperados antes de escribir. Un único POST y lectura durable posterior, incluso con ACK perdido; respuesta ajena/hash incoherente no se acepta. SDK privado añade cargar/aprobar revisión040 (54RPC). HTTP REVISION_NC cerrado6campos/APROBAR_REVISION_NC cerrado8campos, máximo2KiB, IDs/hash estrictos y origen/proyecto/Auth/gate backend existentes. Escritura con ARCA_HOMO_CREDIT_REVIEW_ENABLED exacto true, apagado por ausencia; lectura/recuperación histórica permitida con gate de escritura cerrado. DTO explícito sólo cuerpo canónico/hash y aprobación, sin paquete SQL/contexto/custodia. No TA, WSAA/WSFE ni CAE/efectos comerciales.
Seis escenarios de servicio iniciales6PASS/385omitidos por filtro (credit-review-service-v1.log); build/lint finales PASS y manifiesto bootstrap43/diff PASS, símbolos privados ausentes del bundle. Selección HTTP/SQL completa en curso en credit-review-transport-final.log: registrar resultado antes de cerrar/publicar. SQL sin cambios en este incremento;140 nativas anteriores siguen evidencia de040, no nueva aceptación de transporte hospedado.
Pendientes: cliente con UUID/hash durables y recuperación antes de repetir escritura, validación de wire y pantalla NC, transporte controlado de numeración, permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación comercial sólo tras CAE. SQL001–040/Edge/flags sin instalar/activar remotamente por nosotros, sin provisión/uso de secretos reales, nuevas llamadas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos.

Cierre 24/10/2026: selección completa565 PASS/3archivos (credit-review-transport-final.log), incluyendo servicio/HTTP NC integrado conSQL040 y controles HTTP/SDK existentes. Build PASS (credit-review-transport-build.log), lint sin hallazgos, manifiesto bootstrap43/diff PASS y símbolos privados ausentes del bundle. Sin aceptación hospedada nueva. Se publica trabajo probado en rama del PR3.

### 24/10/2026 — PR03: cliente durable de revisión NC preparado
Cliente de revisión integrado a credits del cliente fiscal y exclusión compartida existente por venta. Reconstruye el wire canónico/hash contra fuente/propuesta/preparación explícitas verificadas, sin confiar en datos fiscales recibidos ni en campos extra. Antes de POST persiste y relee sólo7campos (version/operación/caso/propuestaSHA/preparaciónSHA/cuerpoSHA/revisiónUUID), aislados por Auth/comercio/venta; no guarda canónico/PII. Un POST y GET del mismo UUID, ACK perdido recuperable. Pendiente incierto sobrevive recarga y approve con pendiente sólo recupera, sin nuevo POST/UUID; hash/ACK ajenos no lo retiran. Fallo storage impide POST. Guardado de casos/preparación y cancelación se bloquean mientras hay revisión incierta; recuperar sigue disponible. API cliente permite leer/revisar/recuperar pero pantalla de aprobación todavía pendiente.
Evidencia:511 PASS/5archivos cliente/contrato/SQL (credit-review-client-final-tests.log),75 PASS/2pantallas existentes (credit-review-client-ui-tests.log). Tras corrección de tipado en prueba de respuesta ajena39 PASS del archivo afectado repetidos (credit-review-client-post-types-tests.log); no sumar como pruebas únicas extra. Buildv1/v2 detectó fixtures y tipado de prueba desactualizados; se corrigieron sin casts ni relajar tipos y buildv3 PASS. Lintv3 sin hallazgos, manifiesto bootstrap43/diff PASS. Validadores puros/acciones HTTP entran al navegador por diseño; RPC SQL/custodia privada y prefijos de secretos ausentes del bundle. SQL/HTTP sin cambios,140 nativas y565 transporte previas no acreditan navegador/Web Locks/aceptación hospedada actuales.
Pendientes: pantalla NC con recuperación antes de confirmar, transporte controlado de numeración y UUID durable correspondiente, permiso vigente/intención/envío/FECompConsultar/resolución NC y aplicación comercial sólo tras CAE. Aprobar/reconstruir un cuerpo no acredita vigencia actual, Auth/RLS hospedado ni permiso de emisión. SQL001–040/Edge/flags sin instalación/activación remota por nosotros, sin provisión/uso de secretos reales, nuevas consultas ARCA autenticadas, CAE, merge/master/Production. PR03/PR02 parciales, restore integral bloqueado y físicos/Point diferidos. Se publica incremento probado en rama del PR3.
