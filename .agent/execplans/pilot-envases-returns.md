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
- [x] Commits publicados: 93bc14a (persistencia/reglas), 3f50621 (interfaz),
      bd37eb0 (sólo CRLF→LF en los dos SQL nuevos; instrucciones equivalentes
      a las instaladas, sin reaplicar SQL remoto). El checksum anterior registra
      los bytes realmente instalados; no se modifica esa evidencia histórica.
      Diff final e índice PASS después de normalizar; SQL históricos intactos.
- [x] Frontend bd37eb0 publicado únicamente en kiosco-app-staging:
      dpl_7mnwAh7Y4nTobBuVEgG5TKu6YcTW READY; alias estable
      https://kiosco-app-staging.vercel.app. Flags de Staging conservados.
      Bundle público verificado con acciones de pendientes, saldos y mensaje de
      enteros, destino Supabase Staging sin referencia al ref de Production.
      Contenedor local de ensayo detenido/conservado. PR #3 sigue en borrador,
      sin merge; master y Production intactos. Aceptación del usuario pendiente.

Nota de whitespace: diff de trabajo e índice PASS. La comparación completa con
master señala CRLF ya existentes en returns/002, que este bloque no modifica;
.gitattributes exige preservar esos bytes. La misma comparación con las reglas
blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol pasa. No se normalizó SQL
anterior ni se ocultaron espacios adicionales; los dos SQL 003 nuevos usan LF.


## Segunda revisión visual y stock fraccionado anterior (19/10/2026)
El usuario pide acercar aún más recepción al modal antiguo. Se agrupan precio,
cantidad/atajos y saldos en un panel compacto; total/acciones como el original.
Recepción de pendientes mediante elección explícita que oculta pagos/descuentos;
observaciones y administración plegadas. Sin cambios de contrato ni SQL.
Captura del usuario muestra stock 5,013 bloqueado por step=1. ProductForm también
truncaba con parseInt si se forzaba submit. Se preserva exactamente el saldo previo
al editar otros datos, con aviso de conciliación; correcciones unitarias nuevas
exigen entero. Nunca ajustar stock remoto ni reinterpretar historia automáticamente.
- [x] Regresiones finales: 25 PASS / 2 archivos; suite posterior al segundo
      hallazgo: 2053 PASS / 1 skipped / 217 archivos, 184,78 s. Suite anterior
      de 2052 pruebas fue previa al caso 0,987, no sustituye esta evidencia.
      Build final 631 módulos PASS; diff de trabajo/índice y manifest 43 SQL PASS.
      Audit omit=dev cero; scan 1128 textos, 14 binarios, mismos 46 candidatos
      conocidos sin nuevos secretos. No cambian dependencias ni SQL.
- [x] Revisión visual local con datos ficticios y guardado bloqueado: panel
      compacto con acciones principales visibles; marcar pendientes oculta
      pagos/descuentos. Stock 5,013 conserva value exacto y validity.valid=true,
      stepMismatch=false. Línea 0,987 muestra conciliación con Todo/cantidad y
      reposición deshabilitados. Capturas ../pilot-modal-v2-{envases,stock,
      pendientes,legacy-return}.png. No equivale a aceptación física del usuario.
- [x] Commits 4fdfdbf (stock anterior sin truncamiento) y e03867f (modales),
      push normal. Frontend e03867f publicado sólo en kiosco-app-staging:
      dpl_Eh56ojaB8M3rg4ErbjzEH1rsM6qy READY, alias estable
      https://kiosco-app-staging.vercel.app. Bundle verifica diseño compacto,
      preservación de stock previo y aviso de conciliación; destino sólo Staging.
      Sin nuevas operaciones financieras, cambios de inventario remoto ni SQL.
      PR #3 continúa en borrador sin merge; master/Production intactos.

El segundo hallazgo del usuario muestra saldo por devolver 0,987 después de
devoluciones antiguas que suman 4,013 sobre cinco unidades. No redondear ni
aumentar el máximo: esa línea se identifica como conciliación y deshabilita
cantidad/Todo/reposición, sin enviar RPC. Otras líneas compatibles conservan
su flujo. Diagnóstico read-only de Staging confirmó 0,013 repuesto con artículo
UN no pesable, guardado antes del guard; no se alteran stock, caja ni historia.


## Observaciones opcionales de pendientes (19/10/2026)
Se retira la obligatoriedad de escribir el motivo en la interfaz. Si está vacío
o sólo tiene espacios, la operación guarda la nota neutral «Sin observaciones
adicionales», conservando el contrato SQL y su registro de actor/cantidades.
Los textos escritos por el usuario se conservan recortando espacios externos.
Sin cambios de SQL, permisos, saldo esperado ni semántica de reintentos.
- [x] Dirigidos: 55 PASS / 3 archivos (incluye blanco, espacios y texto propio),
      build 631 módulos PASS. Diff de trabajo/índice PASS; scan mismos 46
      candidatos conocidos sin nuevos secretos. Sin cambios de dependencias/SQL.
- [x] 1b52b1f publicado y desplegado sólo en Staging:
      dpl_DhRXP8QG8Re2sAUSBzkMu4PjgH2B READY. Observaciones ya opcionales.
- [x] Ampliación de visibilidad: 76 PASS / 5 archivos, build 631 módulos PASS,
      diff/índice y scan PASS (mismos candidatos conocidos). Helper real con JWT
      Dueño en Staging lee 21 movimientos, 15 con notas; sólo lectura y sin
      imprimir textos privados. Evidencia ../pilot-notes-history-staging-result.json.
- [x] a3cc0ff publicado por push normal y desplegado sólo en Staging,
      dpl_8kWea5X4xxQdtn6e8yfe7iCfFVUg READY. Bundle público del alias estable
      verifica etiqueta opcional, nota neutral e historial con observaciones.
      Ruta: Catálogo → Precios de Envases → final del modal Depósito de envases.
      PR #3 sigue en borrador; sin merge, SQL ni cambios a Production.

El usuario no encontraba las notas del movimiento: estaban guardadas en DB pero
la proyección/historial no las mostraba. Se agrega lectura/validación de notas
y presentación como texto escapado junto al cambio de pendientes en Catálogo →
Precios de Envases → Depósito de envases → Movimientos de los últimos 30 días.
Sin SQL ni ampliación de permisos; compatible con registros sin nota.


## Rediseño de Depósito de envases (19/10/2026)
Se retiran campo/acción de distribuidor de este modal sin borrar movimientos
históricos ni modificar SQL. Conteo físico y saldos al frente; cantidad inicial
del conteo refleja el saldo seleccionado, con motivo propio separado de notas
de pendientes. Alta de tipo y edición del seleccionado en desplegables cerrados
por defecto, con estados separados para evitar sobrescrituras accidentales.
- [x] Dirigidos 42 PASS / 3 archivos; build 631 módulos PASS. Diff de trabajo/
      índice PASS; scan 1128 textos, 14 binarios, mismos 46 candidatos conocidos.
- [x] Vista local con datos ficticios y operaciones bloqueadas: pestañas como
      referencia anterior, modal completo a la vista en escritorio, alta cerrada
      por defecto que se despliega sin campos del tipo seleccionado; sin
      distribuidor. Historial accesible por Movimientos. Capturas privadas
      ../pilot-deposito-{redesign,tipos-closed,tipo-expanded}.png.
- [x] 017e052 publicado por push normal y desplegado sólo en kiosco-app-staging:
      dpl_DQgvhFQ5h7fY6F1uSZwPRsVVRTfV READY, alias estable verificado
      https://kiosco-app-staging.vercel.app. Bundle confirma pestañas y formularios
      separados, conserva notas opcionales y destino Supabase Staging.
      Sin operaciones financieras, SQL ni cambios de Production; PR #3 en borrador.
      Aceptación visual del usuario pendiente.

El usuario reafirma tomar el modal anterior como referencia. Se recupera su
navegación por pestañas y ancho de administración: Depósito de vacíos, Tipos y
precios, Movimientos. Alta plegada dentro de Tipos; historial en Movimientos,
sin apilar todos los formularios ni volver a escrituras locales antiguas.

## Uniformidad con el modal migrado y tipos creados por error (19/10/2026)
- [x] Modal compartido 2xl con pie fijo, tabla de existencias y controles Input/
      Button comunes; alta/edición plegadas y sin distribuidor.
- [x] Desactivar/reactivar sólo Dueño con confirmación y solicitud durable;
      conserva historial y saldos visibles, recepción de pendientes inactivos
      y bloqueo de cobros/descuentos nuevos. No se elimina ningún tipo remoto.
- [x] Dirigidos 46 PASS / 3 archivos; build 631 módulos PASS; diff trabajo/índice
      PASS, scan mismos 46 candidatos conocidos sin nuevos secretos. Audit
      --omit=dev: 0 vulnerabilidades. Sin cambios de SQL ni dependencias.
- [x] Vista local de componente real con datos ficticios: tabla, pie fijo,
      formularios cerrados y confirmación con saldos conservados verificados.
      Captura ../pilot-deposito-uniforme.png. Suite completa en ejecución.
- [x] Suite completa sobre código 5c288d6: 2068 PASS / 1 skipped / 217 archivos,
      191,88 s con --maxWorkers=4. Primera ejecución: 2067 PASS y un timeout
      PGlite de cinco segundos; repetición sin cambiar pruebas ni límites PASS.
      Se cierra esa deuda de validación local; permanece aceptación de Staging,
      conciliación de fracciones históricas y ensayo físico de impresora.
- [x] 5c288d6 publicado por push normal y desplegado sólo en kiosco-app-staging:
      dpl_8o1L6RZnFhrBq7VaXgpMckXtaDR2 READY, alias estable verificado.
      Bundle público: tabla heredada, confirmación de desactivación/reactivación,
      formularios separados, pendientes/notas e identidad Staging PASS.
      Sin SQL, bajas remotas ejecutadas ni cambios a master/Production.
      PR #3 abierto en borrador, sin merge; aceptación visual pendiente.

## Selección por fila y proporciones compactas (19/10/2026)
- [x] Fila completa clicable (precio/saldo/espacio), botón por teclado conservado;
      no cambia selección después de intentar una operación durable.
- [x] Ancho máximo 672 px, cantidad máxima 320 px y sin saldos repetidos.
      Vista local confirma selección al pulsar precio; captura
      ../pilot-deposito-compacto.png con datos ficticios, sin escrituras remotas.
- [x] Dirigidos 47 PASS / 3 archivos; scan mismos 46 candidatos conocidos,
      diff trabajo/índice PASS. Suite completa previa 2068 PASS / 1 skipped /
      217 archivos sobre 5c288d6, anterior a este ajuste visual/interacción.
      Repetir suite en HEAD definitivo antes de merge. Sin SQL/dependencias.
- [x] Build final PASS (631 módulos).
- [x] 12f6b69 push normal y despliegue Staging dpl_3QkBseR688qjuATL7rVSAEwmkLFz READY; alias y bundle con destino Staging verificados. PR #3 en borrador, sin merge ni cambios de Production.

## Colores consistentes de controles de envases (19/10/2026)
- [x] Paleta semántica acotada a los dos modales, con selección, acciones,
      cantidades, foco y deshabilitados legibles en claro/oscuro. Precio hereda
      texto de tarjeta; deshabilitados neutros sin opacidad acumulada.
      Button expone data-variant; no cambia comportamiento fuera de Envases.
- [x] 47 dirigidos PASS / 3 archivos, revisión visual local de ambos temas,
      sin operaciones remotas. Capturas ../pilot-envases-colores-{claro,oscuro}.png
      y ../pilot-deposito-colores-claro.png. No se alteran permisos ni SQL.
      Suite completa previa de 5c288d6 no cubre estos ajustes; repetir antes de merge.
- [x] Build final PASS (631 módulos), diff trabajo/índice PASS y scan sin nuevos secretos (46 candidatos conocidos).
- [x] 330645f publicado y desplegado sólo en Staging, dpl_Hy2YHDybkM1Dxy3DdmYfSHdDGQR2 READY. Alias y CSS público confirman temas, selección y deshabilitados. PR #3 borrador, sin merge ni cambios de Production.

## Paleta tierra y recepción más ancha (19/10/2026)
- [x] Se sustituye celeste por marrón/arena/oliva en acciones, foco, pestañas,
      selección, controles y resumen de ambos modales. Oscuro usa arena/oliva
      claros sobre su superficie existente; no modifica el tema global.
- [x] Recibir envases pasa de 448 a 512 px máximos. Tipos se ajustan al contenido,
      con ancho 96–192 px y padding compacto, sin estirarse todos a igual ancho.
      Depósito conserva 672 px y selección por toda la fila.
- [x] Dirigidos 47 PASS / 3 archivos; vista local clara/oscura con datos ficticios,
      sin escrituras remotas. Captura ../pilot-envases-tierra.png. Suite completa
      previa anterior a estos cambios: repetir antes de merge. Sin SQL/permisos.
- [x] Build final PASS (631 módulos); diff trabajo/índice y scan PASS, mismos 46 candidatos conocidos.
- [x] fc1459c publicado y desplegado sólo en Staging: dpl_GKnU1jbjuKjT1ZJkUrHqESRcZBbF READY. Alias y CSS público verifican paleta cálida. Sin SQL ni cambios de master/Production; PR sin merge.

## Verde suave igual a Cobrar (19/10/2026)
- [x] Acciones principales, éxito y opciones seleccionadas de ambos modales usan
      el verde de Cobrar: #98b79c claro / #94c1a9 oscuro, texto #142b3a.
      Conserva tonos neutros/deshabilitados y acción de peligro diferenciada.
- [x] 27 pruebas del modal PASS, build 631 módulos PASS. Cambio sólo de CSS;
      revisión visual local con datos ficticios ../pilot-envases-verde.png.
      Suite completa previa anterior al ajuste; repetir antes de integrar.
- [x] e0a2ea1 publicado y desplegado sólo en Staging: dpl_8HEBzb1H4XZZMq1FidToAvmkNBBy READY, alias y CSS público verde claro/oscuro verificados. Sin merge ni cambios de Production.
