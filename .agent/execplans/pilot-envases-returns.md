# Envases y Devoluciones — ampliación del piloto

## Objetivo
Implementar los apartados solicitados por el usuario después del cierre de
rotación. Esta instrucción amplía el alcance de desarrollo; no equivale a una
instalación SQL remota ni autoriza movimientos financieros de ensayo en Production.
ARCA permanece en pausa y PR #1 sin merge.

## Situación verificada
- envasesStore conserva tipos, vacíos e historial en localStorage por comercio;
  no es una fuente de stock compartido. El historial se recorta a 100 entradas.
- RecibirEnvaseModal paga efectivo mediante caja y luego cambia vacíos locales;
  no existe transacción común. En el ticket también hay recepción/reversión local.
- PreciosEnvasesCompartidos comparte precios cuando su SQL está instalado;
  conserva explícitamente el stock local. No es un ledger de envases.
- devolucionStore está bloqueado en strict. La ruta heredada usa escrituras
  separadas de devolución, stock/lotes y reintegro; no debe activarse como reemplazo.
- Hay contratos y cálculos privados de devoluciones parciales validados localmente,
  pero falta confirmar efectos y conectar frontend. La preparación fiscal usa
  to_jsonb(v), compatible con la ausencia de afip_cae; se debe ensayar contra el
  baseline estricto completo antes de conectarla.
- supabase/bootstrap/README.md excluye ambos circuitos; devoluciones_venta es
  sólo el guard mínimo para anulación, sin el modelo completo.

## Decisiones de negocio confirmadas
El usuario confirmó efectivo en caja abierta y cambio de producto, con cuenta
corriente diferida. Envases: descuento en ticket, pago en efectivo y entrega al
distribuidor. Las reglas de crédito abonado y refunds externos quedan fuera de
esta primera implementación; no se amplía ese alcance por inferencia de la UI.
El cambio se resuelve con reintegro en efectivo confirmado y nueva venta normal,
según respuesta posterior del usuario. No se implementan vales ni el método
heredado OTRO como sustituto de un crédito conservado.

## Arquitectura y límites de la implementación
Módulos incrementales separados del bootstrap histórico y flags específicos por
capacidad; no apagar strict global para habilitar rutas heredadas. Autoridad
servidor/JWT: actor activo, tenant y estado comercial efectivos. No aceptar precios,
saldo, actor ni comercio del navegador como autoridad.

Envases: tipos/precios por comercio, saldo compartido y movimientos auditables;
recepción, ajustes y entrega serializados, sin saldos negativos ni recortes
silenciosos al entregar más vacíos que los existentes. Identidad de operación
durable antes de red; mismo cuerpo en cada reintento. Migración de vacíos locales
requiere conciliación física, nunca sumar automáticamente todos los puestos.

Devoluciones: detalle original por ID, cálculo histórico neto a centavos, cantidades
ya devueltas bajo lock, stock físico/receta/lotes originales y reintegro en la misma
transacción. Rechazar circuitos no soportados explícitamente. Una respuesta perdida
se recupera por el mismo ID; no compensar ni generar otro reintegro automáticamente.
Cambiar un artículo implica devolución confirmada y nueva venta; no emitir un
comprobante fiscal ni un refund electrónico sin su circuito separado.

## Plan
1. Cerrar decisiones consultadas y definir matriz de casos admitidos/rechazados.
2. Completar schema/RPCs incrementales y pruebas locales de RLS/roles, cantidades,
   centavos, rollback, replay, aislamiento y datos históricos inconsistentes.
3. Integrar stores/modales con outbox durable, ACK y recuperación de pendientes.
   No éxito optimista financiero ni stock compartido exclusivamente local.
4. Validar tests dirigidos, suite/build, manifest base intacto, diff/secret scan/audit.
5. Preparar instalación revisable, backup/rehearsal y pedir autorización sobre
   destino concreto. Ensayos JWT/concurrencia reales sólo en Staging autorizado;
   la aceptación local/PGlite no los sustituye. Production en gate posterior.

## Progreso
- [x] Auditoría inicial y ampliación de alcance registradas.
- [x] Decisiones de reintegro/recepción respondidas expresamente.
- [x] Backend incremental y regresiones locales: capacidades privadas apagadas
      por defecto, ledger compartido de envases, recepción en efectivo y ticket,
      ajuste contra saldo esperado, distribuidor y devolución parcial atómica.
      Baseline completo; replay, rollback por triggers que omiten escrituras,
      roles/tenant, caja propia del Cajero y costo/lotes históricos. El Dueño
      puede operar una caja abierta de su comercio. Commit 45f56c0.
- [x] Integración de formularios y recuperación: IndexedDB antes de red, cuerpo/ID
      inmutables, JWT vinculado al actor y descarte de respuestas si cambia sesión.
      Marca humana de entrega separada del ACK; bloqueo local de cierre de caja.
      Créditos compartidos provisionales sin alterar/revertir vacíos locales.
      Flags específicas, rutas heredadas strict aún bloqueadas. Commit 3ba2540.
- [x] Ensayo visual aislado con datos sintéticos y RPC remotas bloqueadas; los
      archivos temporales se retiraron. Evidencia fuera del checkout:
      ../pilot-returns-preview.png. No representa aceptación física/hospedada.
- [x] Validación final del código 3ba2540: build PASS (627 módulos); pruebas
      dirigidas PASS, incluida caja propia del Cajero. Suite completa final:
      1979 PASS / 1 skipped / 213 archivos, 286,78 s, posterior al último cambio
      de código/SQL. Manifest histórico PASS (43 SQL intactos), audit --omit=dev 0
      vulnerabilidades. Escaneo: 46 candidatos revisados, todos sintéticos o PEM
      incompletos conocidos; no valores reales. Diff/index PASS.
- [x] Publicación normal de feat/pilot-envases-returns; PR #3 abierto en borrador:
      https://github.com/JBPILL/Kiosco-app/pull/3. Sin merge; PR #1 intacto.
- [x] Instalación y aceptación backend en Staging autorizadas expresamente:
      respaldo public completo y privado, restauración en contenedor aislado,
      ensayo de los siete SQL e instalación atómica con hashes verificados.
      checkout-manual desplegado sólo en acoyfwwmhaeruciyedri, con JWT requerido.
      51 comprobaciones hospedadas PASS: Dueño/Cajero/Visor/otro comercio,
      concurrencia, replay, recepción en efectivo/ticket, distribuidor,
      devolución parcial y stock vendible. Costo histórico 50 conservado después
      de cambiar el costo actual a 99, comprobado además por postflight.
      Las huellas de las tablas originales no cambiaron al excluir el fixture.
      Comercio de ensayo conservado SUSPENDIDO y capacidades deshabilitadas;
      cero comercios habilitados. Sin intervención en Production ni PR #1.
- [x] Faltantes de interfaz completados en 2b90397: historial compartido de envases
      de los últimos 30 días, paginado hasta vacío y sin presentar errores como
      período sin movimientos; historial completo de devoluciones de cada ticket
      y saldo por ID de línea, con cálculo en milésimas/centavos. Una historia
      fallida o incompatible bloquea otra devolución hasta recuperar su lectura.
      Pruebas dirigidas 25 PASS / 3 archivos; build PASS (629 módulos).
      Los helpers reales se ejecutaron con JWT del Cajero en Staging, sólo lectura:
      3 movimientos y 2 devoluciones, cantidad total devuelta 3. Comercio suspendido.
      Se verificó la salida negativa al distribuidor frente al ledger real y se
      agregó regresión; no se cambió el formato financiero del servidor.
      Evidencia local: ../pilot-staging-history-result.json y capturas
      ../pilot-return-history-preview.png / ../pilot-envases-history-preview.png.
- [x] Suite completa final de 2b90397: 1998 PASS / 1 skipped / 215 archivos,
      326,27 s. Build 629 módulos PASS, manifest 43 SQL PASS, diff/index PASS.
      Audit --omit=dev: 0 vulnerabilidades. Escaneo de 1120 textos: mismos 46
      candidatos sintéticos/ejemplos/PEM incompletos, ninguno nuevo; 14 binarios e
      historial Git excluidos. Fixture visual retirado; capturas fuera del repo.
- [ ] Aceptación del frontend con el módulo habilitado, conciliación física y
      autorización posterior de integración/Production. PR #3 sigue en borrador.

## Evidencia hospedada y ensayo
Artefactos locales fuera del checkout: ../private-pilot-staging-backup-20261018/
(schema y datos public, acceso local restringido), ../pilot-staging-install-result.json,
../pilot-staging-rehearsal-result.json, ../pilot-staging-operations-result.json y
../pilot-staging-postflight-result.json. Claves/JWT/contraseñas sólo en memoria.
El respaldo no exporta Auth ni roles: el ensayo local usa Auth simulado.
La revisión automática rechazó agregar metadatos de Auth/roles al respaldo;
se omitió ese payload. Otro intento se detuvo por límite de revisión y se retomó
tras la nueva instrucción del usuario. Ninguno de esos rechazos es un PASS técnico.

El ensayo inicial intentó abrir dos cajas en un mismo comercio; el índice
sesiones_caja_una_abierta_por_kiosco_idx lo rechazó. Se corrigió sólo el runner,
cerrando la sesión vacía de preparación y usando una única caja del Cajero.
La restricción de producción no se relajó. Los perfiles ficticios se sembraron
con guardas SQL del comercio nuevo, porque el DML directo del cliente de servicio
no estaba permitido; no se cambiaron permisos de usuarios para realizar el ensayo.

## Limitaciones y activación
La instalación opcional revisable está descrita en
supabase/bootstrap/pilot-operations/README.md. No ejecutar automáticamente.
Confirmar destino, respaldo y aceptación Staging antes de habilitar capacidad.
Después validar JWT reales Dueño/Cajero/Visor/otro comercio, concurrencia y replay;
Production es otro gate. El estado de flags y SQL hospedados de estos módulos no
se presenta como verificado por las pruebas locales.

La devolución parcial exige venta original íntegramente en efectivo, no fiscal y
sin recepción de envases. La regla corregida por el usuario exige devolver al
cliente el efectivo pagado y sus vacíos; la ampliación v2 permite devolución completa
sin devoluciones anteriores. La devolución parcial de tickets con esos créditos
y la anulación heredada siguen bloqueadas.
Cuenta corriente, pagos mixtos,
refunds externos, ARCA/WSFE y Point siguen fuera. Ticket v1 usa pesos enteros;
envases con centavos deben recibirse en efectivo. La cotización existente limita
el catálogo a 100 tipos activos. La marca de entrega y el bloqueo de cierre son
del dispositivo, no coordinación física global. Conciliar vacíos locales por
conteo real, nunca sumarlos entre puestos. Impresión física pendiente.

## Ampliación autorizada: elección del Dueño
El usuario eligió ambas modalidades para tickets que recibieron envases:
conservar los vacíos y reintegrar el valor del artículo, o entregar los vacíos
y reintegrar el efectivo neto. Se implementó primero para devolución completa
del ticket, sin devoluciones previas: evita inventar una asignación entre envases
y líneas de producto que el ticket no conserva. Sólo Dueño activo; importes y
tipos/cantidades desde el checkout inmutable, nunca desde precios actuales.
La entrega requiere saldo suficiente, locks estables y escritura atómica con el
egreso de caja y la reposición opcional de mercadería. No se habilita anulación.

- [x] Contrato versionado y helpers SQL privados; conservar replay v1.
- [x] UI y recuperación durable con modalidad e instrucciones de entrega.
- [x] Regresiones: ambas modalidades, actor, historial, saldo, rollback y replay.
- [x] Respaldo public nuevo y restauración aislada; dos SQL instalados en Staging
      en una transacción. SHA256 0a5547cc6dc18de5b45972d4570dafd179c6a79e354421ce564109b8987caf03.
      41 comprobaciones hospedadas PASS; sólo dos tickets ficticios nuevos en el
      mismo fixture. Elección $200/conservar frente a $100/entregar, JWT reales
      Dueño/Cajero/Visor, reintentos concurrentes, denegación de segundo reintegro
      y recuperación con comercio suspendido. Postflight confirma datos originales
      intactos y cero comercios habilitados. Helpers reales leen 6 movimientos
      con JWT Cajero, incluida salida al cliente; historial de venta anterior intacto.
      Evidencia: ../owner-choice-staging-{installed,result,history-result}.json,
      ../owner-choice-staging-journal.json y respaldo privado separado.
      Vista local con datos ficticios y RPC bloqueadas comprobada con el selector
      explícito y devolución completa; captura ../pilot-owner-choice-preview.png.
      Los contenedores de restauración propios quedaron detenidos y conservados.
- [x] Suite final de afedc08: 2018 PASS / 1 skipped / 215 archivos, 291,90 s;
      build PASS (629 módulos), posterior al último cambio. Manifest histórico
      PASS (43 SQL intactos); diff/index PASS; audit --omit=dev 0 vulnerabilidades.
      Scan: 1121 textos, 14 binarios excluidos, mismos 46 candidatos conocidos
      sintéticos/ejemplos/PEM incompletos; ninguno nuevo. No valores reales.
      Commits temáticos: 88afbd8 SQL y afedc08 interfaz/recuperación.

## Corrección vigente: efectivo pagado y vacíos al cliente
El usuario retiró conservar envases: sólo ENTREGAR_ENVASES para solicitudes
nuevas, sin selector. Se mantiene el Dueño activo, ticket completo y sin
devoluciones previas. Los contratos históricos ya confirmados conservan el ACK;
no se cambian sus cuerpos ni se genera otro pago para reinterpretarlos.

- [x] Guard servidor y guard local para nuevas operaciones; compatibilidad de
      recuperación histórica sin inventar un resultado ni descartar la cola.
- [x] Dirigidos de devolución: 51 PASS / 4 archivos.
- [x] Nuevo respaldo public/restauración aislada e instalación sólo returns/002
      en Staging. SHA256 0699a82989e7ef9d1bc6beb90aaec33faea67805ba08f8fd18fcdb85fe4c24ab.
      34 comprobaciones hospedadas PASS. Un ticket ficticio nuevo, conteos de
      vacíos ficticios para verificar faltante/recuperación y reintegro neto $100
      más un vacío. CONSERVAR nuevo rechazado; ACK anteriores recuperados intactos.
      Postflight: datos originales intactos, fixture suspendido y capacidades off.
      Evidencia privada fuera del checkout: ../return-rule-staging-*.json y backup
      ../private-return-rule-staging-backup-20261018/. No repetir el journal.
- [x] Validación conjunta del código eac247f (incluye Balance): 2038 PASS /
      1 skipped / 217 archivos, 414,22 s. Build 630 módulos PASS. Diff/index,
      manifest 43 SQL PASS; audit 0; scan mismos 46 candidatos conocidos,
      1125 textos y 14 binarios excluidos. Commits de código: 5a6a361 y eac247f.
      Captura local de regla única, con datos ficticios y operaciones remotas
      bloqueadas: ../pilot-return-correction-preview.png. Sin selector de modalidad.
      Actualización de PR #3 sin merge; gates de uso real permanecen vigentes.

## Resultado
Implementación validada localmente y mediante ensayos backend en Staging, publicada
en PR #3 sin merge. SQL y checkout-manual instalados sólo en Staging. Después del
postflight suspendido de los ensayos automáticos, el usuario autorizó probar la
interfaz con una cuenta Dueño propia: el comercio aislado queda ACTIVO durante esa
prueba interactiva, con ambas capacidades habilitadas exclusivamente allí. Los
comercios originales permanecen sin modificaciones. No representa aceptación de
Production; siguen pendientes aceptación de interfaz, ensayo físico e integración.

## Acceso interactivo a Staging (18/10/2026)
- Despliegue manual del código c910e6489193006fe562b11107a4cb667ff454ed en el proyecto
  Vercel kiosco-app-staging (prj_G6ti9AGW8hY4GsfjmY6jvO6mm0YR), dpl_DxXhz8zeX81yY2Vdv5g3MzVzc1CA:
  READY y alias https://kiosco-app-staging.vercel.app verificados. El entorno principal
  de ese proyecto es Staging; no se desplegó el proyecto de Production.
- Flags strict, checkout manual, envases y devoluciones activados para ese build.
  Recursos públicos: HTTP 200, 28 assets, destino Supabase Staging acoyfwwmhaeruciyedri,
  módulos presentes y sin referencia al proyecto Supabase de Production.
- Cuenta creada y confirmada por el usuario, verificada por ID exacto antes de
  vincularla como Dueño ordinario (sin SuperAdmin) al fixture b7254826-c767-4098-94b8-71013c12021d.
  No se cambió su contraseña ni el vínculo del Dueño automatizado anterior.
- Se desactivaron únicamente los perfiles ficticios cashier2/Visor del fixture,
  conservando sus registros: tres perfiles activos dentro del límite del plan.
  Caja ficticia anterior cerrada mediante RPC con su Cajero/JWT: sistema/declarado
  $1000, diferencia cero. No se abrió otra caja ni se crearon ventas/reintegros nuevos.
- JWT real del nuevo Dueño: rol, comercio, lectura RLS de productos y estado ACTIVO PASS.
  Postflight: un solo comercio con capacidades habilitadas, cero cajas abiertas;
  hashes de comercios y perfiles externos intactos. Claves/JWT sólo en memoria.
  Evidencia privada: ../pilot-staging-interactive-activation.json. No repetir operaciones
  financieras del journal anterior. El fixture queda activo para la prueba del usuario.
- Validación del código sin cambios: suite 2038 PASS / 1 skipped / 217 archivos y
  build 630 módulos previamente registrados; despliegue remoto READY. Esta actualización
  sólo registra configuración/ensayo y no requiere repetir la suite de código.
- Recorrido: ingresar como Dueño del fixture, abrir caja, POS → Tickets emitidos →
  seleccionar venta → Devolver. Con envases acreditados: ticket completo sin devolución
  previa, reintegro del efectivo neto y entrega de los vacíos al cliente. Aceptación
  interactiva todavía pendiente; master, PR #1 y Production fuera de esta activación.


## Ajuste de interfaz y pendientes por tipo (19/10/2026)
Solicitud: recuperar tarjetas/cantidad del modal antiguo sin volver a escrituras
locales; mostrar vacíos y pendientes por tipo. Pendientes sin cliente por elección
expresa: alta/corrección manual del Dueño, recepción sin dinero aumenta vacíos y
disminuye pendientes atómicamente. No inferir préstamos desde ventas históricas ni
cobrar automáticamente depósitos. Simplificar devolución y usar enteros para
artículos por unidad; preservar pesables y ACK históricos.
- [x] UI de recepción con tarjetas, contador y acciones separadas.
- [x] Libro remoto de pendientes, permisos/locks/replay y lectura por comercio.
- [x] Devolución simplificada y validación de cantidades local/servidor.
- [x] Suite final 2048 PASS / 1 skipped / 217 archivos, 178,80 s. Build PASS,
      631 módulos. Audit omit=dev cero vulnerabilidades; sin audit fix. Diff/index
      y manifest histórico PASS (43 SQL intactos). Secret scan: 1128 textos,
      14 binarios excluidos, mismos 46 candidatos conocidos; sin nuevos secretos.
      Pruebas dirigidas de núcleo/UI/outbox: 64 PASS / 4 archivos.
- [x] Respaldo nuevo de public en ../private-pending-staging-backup-20261019-r3/,
      restauración local aislada e instalación transaccional de ambos módulos
      003 sólo en Staging. SHA256 de instalación:
      2a10e944654829f70fb10cc15da30901909ccc679f1830245fb47444b26c7ad5.
      Los intentos previos quedaron conservados incompletos, no se usaron como respaldo.
- [x] Ensayo hosted: 27 comprobaciones PASS con JWT reales, helper frontend real,
      permisos, RLS otro comercio, replay concurrente, saldo viejo, enteros,
      sobregiro, sin ventas/egresos/devoluciones nuevas. Sólo un tipo ficticio
      nuevo; conciliado a cero pendientes, desactivado y conservado. Comercio
      del usuario sigue ACTIVO. Ver ../pending-staging-{installed,result}.json
      y ../pending-staging-test-journal.json; no repetir el journal.
- [x] Vista local con operaciones remotas bloqueadas: tarjetas/saldos/cantidad,
      y 0,013 rechazado con confirmación deshabilitada para artículo unitario.
      Capturas ../pilot-pending-{envases,return-integer}-preview.png.
- [ ] Commit/push y despliegue frontend exclusivamente en proyecto Staging;
      mantener PR #3 en borrador sin merge. Aceptación interactiva del usuario pendiente.
