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
