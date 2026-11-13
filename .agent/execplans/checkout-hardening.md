# Hardening del checkout y consistencia transaccional

## Objetivo

Evitar que una venta confirmada para el cajero quede sin sus efectos críticos de ventas, pagos, stock físico, lotes o cuenta corriente. Un cobro online debe tener un único resultado autoritativo; un cobro sin confirmación del servidor debe seguir visible como pendiente y no presentarse como venta sincronizada.

## Contexto actual

- `PaymentModal.tsx` selecciona el checkout transaccional sólo cuando `VITE_CHECKOUT_MANUAL_TRANSACCIONAL === 'true'`; la variable es de compilación. El valor del despliegue no se puede inferir del repositorio.
- Sin la bandera, el frontend escribe `ventas`, `detalles_venta` y `pagos_venta` mediante solicitudes separadas. Después intenta actualizar stock, movimientos, FEFO y cuenta corriente. Los errores de varios efectos secundarios se absorben.
- Con la bandera, el cliente persiste primero el ticket original en IndexedDB y llama a `checkout-manual`. El backend autentica, recotiza con datos del servidor y solicita el cierre a RPC privadas. `confirmar_venta_manual` en el SQL del repositorio agrupa la venta, detalles, pagos, consumo de productos/componentes, FEFO y cuenta corriente en una función PostgreSQL transaccional. La tabla de checkout conserva el resultado para reintentos con el mismo ID y cuerpo.
- La confirmación manual offline permanece provisional; no cambia venta, stock ni deuda remotos hasta reconectar. La cola antigua de `localStorage` no se convierte automáticamente cuando la bandera está activa; requiere conciliación.
- El stock y el historial de envases vacíos se mantienen en Zustand/`localStorage`. El backend valida tipo y precio de una devolución, pero el cierre financiero no actualiza ese inventario local. Su coordinación entre terminales no está resuelta por el checkout transaccional.
- La documentación registra que no se completó el piloto JWT/PostgREST/concurrencia en Supabase. También registra evidencia comunicada por el usuario sobre el catálogo de políticas del paso 52; esa evidencia no confirma el despliegue de Edge Function, la bandera del build ni una venta autenticada actual.

## Problema

La ruta directa puede dejar filas huérfanas o un estado donde venta/pago existe mientras stock o deuda fallan. Su rollback es de mejor esfuerzo y no restaura todos los efectos (por ejemplo, lotes FEFO/caché). La cola offline antigua puede retirar una venta de la cola pese a fallos de stock o cuenta corriente. Mantener ambas rutas como fallback operativo impediría garantizar que todo cobro online pase por el commit transaccional.

## Alcance

- Consolidar el cierre online en la ruta server-side existente, después de resolver sus gaps de paridad y comprobar el despliegue.
- Mantener cobros offline en una outbox durable y claramente provisional; al reconectar deben enviar la solicitud original al mismo endpoint, con el mismo ID, caja, fecha y pagos.
- No retirar el camino directo hasta conciliar sus colas y completar aceptación de ensayo. Después del corte, no usar escrituras directas como fallback si el endpoint falla.
- Cubrir idempotencia, autorización, efectos de dominio, reintentos, recuperación tras cierre del navegador y feedback de estado.
- Definir el límite de consistencia de envases vacíos y resolverlo según el uso real entre terminales.

## Fuera de alcance

- Integración de Point/Mercado Pago, cambios de aplicación ajenos al checkout, cambios generales de esquema no requeridos y deploy/ejecución de migraciones sin autorización específica.
- Declarar el entorno productivo migrado basándose sólo en el código, pruebas locales o documentación.

## Componentes afectados

- `src/components/pos/PaymentModal.tsx`, `src/pages/POSPage.tsx`.
- `src/lib/manualCheckoutFlow.ts`, `manualCheckoutClient.ts`, `manualCheckoutOutbox.ts`, `manualCheckoutCart.ts` y el contrato/snapshot de checkout.
- `src/stores/cartStore.ts`, `offlineSyncStore.ts`, `comboStore.ts`, `loteStore.ts`, `clienteStore.ts`, `envasesStore.ts`, `cajaStore.ts`.
- `supabase/functions/checkout-manual/` y `supabase/functions/_shared/manualCheckout*.ts`, `pointQuote*.ts`.
- RPC y políticas de checkout, caja, autorización, recuperación e inmutabilidad SQL; documentación operativa y pruebas dirigidas de cliente, SQL real local e integración.

## Dependencias

- Confirmar el valor de `VITE_CHECKOUT_MANUAL_TRANSACCIONAL` en cada entorno y que frontend, Edge Function y Supabase apunten a la misma instancia.
- Inventariar qué migraciones de checkout, autorización y políticas están instaladas realmente; verificar permisos JWT de dueño y cajero con una operación real en ensayo.
- Conciliar la cola antigua y solicitudes manuales pendientes antes del corte. No recrear ni descartar ventas ya cobradas.
- Determinar si stock de envases vacíos debe compartirse entre terminales. Si sí, el estado autoritativo no puede seguir siendo `localStorage`.
- Acordar la regla comercial para una devolución de envase recibida mientras el servidor no puede confirmar el ticket: ingreso local provisional versus prohibir su presentación como saldo compartido.

## Decisiones importantes

### Comparación de alternativas

| Alternativa | Consistencia y concurrencia | Offline, operación y rollback | Evaluación |
| --- | --- | --- | --- |
| A. Mantener y reforzar la ruta directa | Varias escrituras HTTP no se vuelven atómicas por mejorar manejo de errores; read-modify-write y combos siguen sujetos a carreras salvo mover los efectos a RPC. | Conserva comportamiento offline conocido, pero obliga a implementar compensaciones/conciliación duplicadas. El rollback puede fallar también. | No recomendada como destino. Si se lleva todo a una RPC ya equivale a centralizar el commit, no a conservar esta ruta. |
| B. Hacer principal la ruta manual y conservar fallback directo | El cierre normal puede ser atómico, pero usar la ruta directa ante fallo de Edge vuelve a permitir ventas parciales y elude la autoridad única. | Facilita una transición sólo si el fallback queda limitado a ensayo/operadores controlados y no se activa automáticamente para un cobro ya intentado. Rollback de versión coordinado con permisos. | Aceptable sólo como etapa temporal de despliegue; nunca como fallback silencioso de producción. |
| C. Un único cierre online transaccional y outbox offline | Venta, pago, stock, lotes, combos y crédito se validan y confirman bajo bloqueos/una transacción server-side. La concurrencia por producto se decide en el servidor. | Offline es pendiente/provisional, conserva la solicitud y reintenta la misma identidad. Requiere conciliación de la cola heredada y UX explícita para conflictos. | Recomendada como arquitectura destino, condicionada a cerrar gaps, piloto y fuente de verdad de envases. |
| D. RPC única para toda operación; guardar outbox local antes de invocarla | Mantiene el mismo límite transaccional de C y hace duradero el intento incluso si se pierde la respuesta del navegador. | La recuperación reenvía ID/cuerpo idénticos; la RPC devuelve el resultado previo o rechaza conflicto. No promete disponibilidad de stock cuando el terminal está offline. | Es la forma concreta recomendada de C; gran parte existe en `manualCheckoutOutbox` + `checkout-manual`. Completar y validar, no asumir que está desplegada. |

### Recomendación

Adoptar D como implementación y C como política: ninguna venta online confirmada por el cajero debe escribirse por REST desde la ruta directa; la única confirmación es el endpoint autenticado y la RPC transaccional. La ruta directa puede seguir en el código durante el piloto, pero no debe convertirse en fallback cuando hay una respuesta incierta. Ante incertidumbre se conserva el cobro en estado pendiente y se reintenta/consulta con el mismo ID.

Mantener el modo offline como solicitud durable no confirmada, sin descontar stock remoto ni registrar deuda hasta que el servidor acepte el cierre. No marcarla como venta completada/sincronizada mientras esté pendiente. La disponibilidad compartida se vuelve a validar al sincronizar; conflictos por caja cerrada, stock/lotes/crédito insuficientes o receta cambiada permanecen pendientes para conciliación autorizada.

El inventario de envases vacíos es una decisión de dominio separada: el tipo/precio se consulta en backend, pero `stock_vacios` y sus movimientos son locales. Si debe ser común a todos los terminales, incluir ese efecto en el commit o diseñar una operación durable coordinada; si es por terminal, documentarlo como dominio local fuera de la garantía de venta.

## Matriz inicial de paridad

Estado basado en implementación local; no acredita instalación remota.

| Capacidad | Estado | Evidencia / gap para el corte |
| --- | --- | --- |
| Promociones de producto y recargos/descuentos | Cubierta | `pointQuote` recotiza desde promociones del servidor y compara total/subtotales; validar reglas y fechas en ensayo. |
| Promociones de combo | Parcialmente cubierta | El motor cotiza `items_combo`; separar ese descuento comercial de los combos físicos y comprobar mezcla, distribución y líneas repetidas. |
| Combos físicos | Cubierta | Snapshot guarda receta; SQL la compara y consume componentes en cierre. Verificar locks/concurrencia real. |
| Productos pesables | Cubierta | Contrato permite tres decimales y valida `es_pesable`; probar extremos, lotes y compatibilidad del detalle. |
| Pagos mixtos | Cubierta | El backend suma y valida pagos; SQL exige suma igual al total e IDs únicos. Ensayar medios reales y redondeos. |
| Cuenta corriente | Cubierta | SQL bloquea cliente y escribe saldo/movimiento junto a la venta, sujeto a política, crédito y migraciones instaladas. |
| Lotes FEFO | Cubierta | SQL bloquea y deduce lotes en transacción con fecha original; PGlite no prueba concurrencia remota. |
| Devolución de envases / depósito | Parcialmente cubierta | El backend valida tipo/precio y persiste la línea; el stock vacío y su historial siguen locales y se incrementan antes del cobro. |
| Anulación de venta confirmada | No cubierta por el checkout | La cancelación manual resuelve un cobro pendiente con auditoría; no sustituye la anulación comercial ni reintegra dinero/stock de una venta ya confirmada. |
| Stock local/caché | Parcialmente cubierta | En confirmación manual se invalida/refresca y no se reaplica la deducción; offline provisional puede mostrar disponibilidad obsoleta. |
| Caja | Parcialmente cubierta | Se valida y bloquea caja en servidor para entradas preparadas. Otro equipo no conoce solicitudes exclusivamente offline; falta prueba de carrera real y operación completa de cierre. |
| Comprobante | Parcialmente cubierta | Recibo local durable y presentación reclamada una vez; cierre del equipo antes de imprimir requiere recuperación manual. |
| ARCA | Parcialmente cubierta | No se emite para recibo provisional; venta confirmada y factura son efectos separados con recuperación desde tickets emitidos. |
| Offline/reintentos | Parcialmente cubierta | Outbox IndexedDB conserva cuerpo/ID y conflictos; colas antiguas requieren conciliación manual y estados pendientes deben mantenerse visibles. |
| Idempotencia / doble envío | Cubierta en el checkout manual; no cubierta en el directo | Manual conserva ID y cuerpo, outbox/servidor detectan repetición. Directo sólo tiene guardia mientras el handler vive y genera UUID nuevo por intento. |
| Recuperación tras cierre inesperado | Parcialmente cubierta | Outbox y resultado durable permiten recuperar; ventana anterior al guardado local y recuperación entre equipos/operadores tienen límites documentados. |

## Riesgos

| Riesgo actual | Severidad / probabilidad | Impacto | ¿Lo elimina el checkout transaccional? | Mitigación de implementación |
| --- | --- | --- | --- | --- |
| Escrituras separadas en ruta directa | Crítica / media | Venta/detalle/pago incompletos | Sí para los efectos incluidos, si todas las ventas pasan por RPC. | Corte coordinado; no fallback ante timeout; probar fallo inyectado entre efectos. |
| Error de stock absorbido | Crítica / media | Venta visible con inventario incorrecto | Sí en el cierre SQL, no para efectos fuera de la función. | Errores server-side hacen fallar todo; éxito UI sólo tras acuse validado. |
| Fallback read-modify-write de stock | Alta / media | Lost update concurrente o stock negativo | Sí si se elimina para ventas y el RPC valida stock bajo lock. | No usar fallback directo; exigir resultado RPC y controles de stock. |
| Rollback directo incompleto | Alta / media | Stock/lotes/cache quedan diferentes de la venta anulada | Se evita rollback compensatorio para commit SQL atómico; no resuelve una anulación posterior. | Conservar anulación como flujo aparte, auditado e idempotente; probar transacción fallida. |
| Componentes de combo actualizados por separado | Alta / media | Componentes del mismo combo quedan sólo parcialmente deducidos. | Sí en función SQL actual por transacción para checkout manual. | Desactivar ruta de combo directa; ensayar recetas, componentes compartidos y locks. |
| Cuenta corriente ignora errores Supabase | Crítica / media | Venta y pagos registrados con saldo/movimiento ausente. | Sí si el crédito se aplica dentro del RPC y cualquier error aborta. | No usar `imputarCargoVenta` como side effect del checkout transaccional; mantenerlo sólo en otros flujos revisados. |
| Cola offline da éxito con error de stock/crédito | Crítica / media | Ticket retirado de cola pero efectos faltantes; duplicación ante reintento manual. | Sí si la cola sólo elimina tras acuse completo del endpoint. | No convertir la cola antigua; mantenerla en conciliación y comprobar atomicidad del ACK local. |
| Envases se incrementan antes del cobro | Alta / media | Envase devuelto queda acreditado aunque el cobro no se confirme. | No en el estado actual; el inventario no pertenece al commit. | Acordar local vs compartido; si compartido, hacer efecto transaccional; si local, estado provisional/reversión durable. |
| Divergencia de envases entre terminales | Alta / alta si se comparten | Terminales muestran stocks vacíos incompatibles. | No. | Definir fuente de verdad compartida o declarar inventario local por equipo. |
| Conflicto de dos terminales durante venta offline | Alta / media | Dos comprobantes provisionales compiten por la última unidad. | El cierre online serializa/deniega el segundo; no evita que se acepte dinero offline. | UI provisional, resolver conflicto sin recrear ID ni dar falso éxito; definir política comercial offline. |
| Flag, Edge y permisos desalineados | Crítica / desconocida | Cajero bloqueado o ruta antigua rechazada; dueño podría aún conservar permisos según políticas. | No; riesgo de despliegue. | Matriz de versiones/SQL, smoke test JWT, activación por entorno y reversión coordinada. |

## Idempotencia y recuperación

- **Doble pulsación en el mismo formulario:** `procesandoRef` la bloquea mientras vive la promesa. En el modo manual, la misma solicitud se guarda en outbox antes de red; backend y SQL reconocen el ID/cuerpo repetidos. En el directo, el guard sólo cubre el handler y cada nuevo intento crea otro UUID.
- **Conexión perdida durante cierre / respuesta perdida tras commit:** manual conserva la entrada; al reintentar, recupera la entrada/snapshot y el servidor devuelve el resultado existente. Mismo ID con cuerpo distinto debe seguir siendo rechazado. El directo no tiene ese protocolo durable.
- **Cierre del navegador después de cobrar pero antes de limpiar carrito:** si ya se persistió la outbox, se puede recuperar y no se debe volver a cobrar. Si el medio de pago físico fue aceptado antes de guardar la solicitud local, el código no puede reconstruir por sí solo el intento; el procedimiento operativo debe evitar esa ventana o registrar primero el intento.
- **Reenvío de pendiente:** manual conserva ID original; si ya se confirmó no vuelve a descontar. La cola legacy tolera algunos duplicados de cabecera/detalle/pago, pero aplica stock y crédito por fuera del conjunto idempotente: no es segura como cola destino.
- **Dos terminales venden el mismo stock:** el SQL manual bloquea productos/lotes y valida existencia en la transacción; el cierre que ya no dispone de saldo falla completo y requiere conciliación. El fallback directo y el descuento de combos no ofrecen la misma protección.

## Riesgos de migración, rollback y despliegue

- Primero desplegar y verificar el endpoint/RPC y las políticas que autorizan sólo la ruta servidor; después activar frontend compatible. Nunca aplicar una política que quite INSERT directo antes de que el build de cajero use backend.
- Inventariar y resolver colas legacy y cobros manuales pendientes; no transformarlos automáticamente ni descontar de nuevo.
- Durante el piloto, comparar identificadores e importes y reconciliar todos los efectos en Supabase. El rollback de aplicación debe seguir siendo compatible con las políticas ya activadas; no restaurar el bypass directo como fallback.
- Si hay error posterior a un pago físico, conservar una única solicitud pendiente y ofrecer recuperación/conciliación. No emitir un nuevo ID, no trasladar caja/fecha, y no decir “venta registrada” antes del ACK.

## Criterios de aceptación

- Cada cierre aceptado deja exactamente una venta, detalles, pagos, movimientos físicos/FEFO y movimiento de crédito coherentes; cualquier fallo inyectado en uno de esos efectos no deja un cierre financiero parcial.
- Reintentar igual ID/cuerpo tras timeout devuelve el mismo resultado sin duplicar stock, lote, pago ni deuda; cambiar el cuerpo o reutilizar un ID conflictivo se rechaza y queda visible.
- En competencia por el último producto/lote/crédito, a lo sumo se confirma lo disponible; el rechazado conserva la solicitud y no muestra éxito final.
- Si IndexedDB no puede guardar el intento, el POS no presenta recibo como pendiente ni envía al servidor. Si el servidor no confirma, el ticket permanece recuperable y el cajero ve estado pendiente/error específico.
- La cola legacy no se marca sincronizada ni elimina registros por fallos de efectos críticos; los registros existentes se concilian antes del corte.
- Promociones, combos, pesables, pagos mixtos, crédito, devolución de envases, ticket, caja y ARCA pasan los escenarios de la matriz con resultado visible definido.
- El flujo se valida con JWT de dueño/cajero, dos conexiones reales y la instancia de ensayo desplegada; evidencia local PGlite/tests no se presenta como prueba de producción.
- La ruta directa ya no es alcanzable para el cierre normal luego del corte. El rollback conserva recuperación de pendientes sin reabrir una escritura client-side insegura.

## Plan de implementación

1. **Preflight y evidencia remota:** confirmar flag/build, commit desplegado, versión Edge, migraciones/políticas aplicadas, usuarios y colas pendientes. Sin cambios financieros hasta cerrar este inventario.
2. **Cerrar contrato y paridad:** definir envase compartido/local, regla de aceptación offline, anulación de venta ya confirmada, recibo/ARCA/caja. Especificar efecto y responsable de cada capacidad de la matriz.
3. **Validar postventa (Fase 3):** ejecutar pruebas locales de anulación/rollback y comparar catálogo remoto con el SQL esperado; validar la carrera con dos sesiones reales cuando haya acceso de staging. No considerar PGlite evidencia de concurrencia remota.
4. **Completar la única transacción:** corregir gaps del endpoint/RPC para que toda mutación financiera/de stock que forma parte de la venta esté dentro de una transacción; revisar cancelación, locks de caja/producto/lote/crédito y respuesta idempotente. Diseñar por separado la anulación compensatoria e idempotente. No dejar writes críticos posteriores al RPC.
5. **Unificar durable outbox:** todas las confirmaciones online y pendientes offline guardan el cuerpo original antes de red y envían al mismo endpoint. Quitar del camino destino las escrituras directas, la sincronización legacy de ventas y las deducciones optimistas que puedan repetirse. Mantener caché como proyección refrescable.
6. **Migración controlada:** desplegar backend y permisos compatibles; pilotear en ensayo con cajero/dueño. Conciliar cola previa; activar frontend con el flag de compilación correcto; no usar fallback automático. Vigilar estados pendientes y errores.
7. **Aceptación de fallos y concurrencia:** ejercitar timeout antes/después del commit, app cerrada, doble envío, retries, caja cerrada, stock/lote/crédito agotado y dos terminales vendiendo el último artículo. Resolver conflictos sólo con identidad/caja/fecha originales.
8. **Corte y retiro diferido:** habilitar a producción sólo tras aceptación observable. Desactivar/retirar ruta directa en una fase posterior cuando no haya builds activos dependientes y las colas estén conciliadas; conservar el historial y el mecanismo de recuperación.

## Validación

- Pruebas dirigidas de unidad/contrato para serialización de solicitud, selección de ruta, guardas de doble envío, outbox, resultado/errores y presentación del recibo.
- Pruebas PostgreSQL con el SQL/migraciones vigentes para rollback por fallo de cada write, idempotencia, constraints de identidad, crédito, combos, FEFO, caja y cancelación.
- Pruebas de integración con JWT reales de dueño/cajero contra Supabase de ensayo, dos conexiones concurrentes y Edge Function desplegada; comprobar que INSERT directo de cajero se rechaza.
- Ensayo manual de desconexión, pérdida de respuesta después de commit, recarga/cierre del equipo, sincronización, impresora/cajón y conciliación de legacy queue.
- Build y tests relacionados en la fase de implementación, según la política de `AGENTS.md`; no usar métricas globales arbitrarias. No ejecutar migraciones ni deploy sin autorización.

## Progreso

- [x] Auditoría estática inicial de la ruta directa y transaccional, dependencias y documentación local.
- [x] Comparación de alternativas y matriz preliminar de paridad.
- [x] Incertidumbres de entorno y decisiones de dominio enumeradas.
- [x] Preflight remoto suficiente para iniciar Fase 1: Edge `checkout-manual` activa v5 con `verify_jwt=true`; RPC `confirmar_venta_manual(uuid,jsonb)` SECURITY DEFINER propiedad de `postgres`, EXECUTE sólo `postgres`/`service_role`; las tres tablas de checkout tienen RLS y policies sólo para `service_role`; 2 entradas, 2 confirmadas, 0 canceladas y 0 pendientes (evidencia provista por el usuario).
- [ ] Confirmar flag del frontend desplegado e inspeccionar outbox/cola legacy de los terminales antes de cualquier activación o corte.
- [x] Auditar en Fase 1 la cadena JWT→Edge→actor autenticado→RPC, `SECURITY DEFINER`, idempotencia y outbox local.
- [x] Validar mediante pruebas relacionadas y build los criterios locales de Fase 1.
- [x] Fase 2 — auditar localmente la cancelación pendiente, anulación confirmada, ARCA, caja/pagos, stock/lotes/combos, crédito y envases; actualizar paridad, riesgos y diseño objetivo. Sin cambios funcionales ni verificación remota nueva de la RPC de anulación.
- [ ] Implementación y piloto (no iniciados en esta fase).

### Evidencia de Fase 1

- **Identidad:** el cliente envía el JWT de la sesión y no incluye `actor_auth_id` en la solicitud comercial. La Edge Function llama `admin.auth.getUser(token)`, obtiene `contexto.authUserId` y lo pasa al RPC usando el cliente de servicio. El SQL limita el RPC al rol `service_role` y vuelve a comprobar el perfil activo, comercio y rol; un cajero sólo puede cerrar su usuario original. Un UUID dentro del cuerpo no puede elegir al actor.
- **Privilegios SQL:** la definición local de `confirmar_venta_manual` y su wrapper usan `SECURITY DEFINER SET search_path=pg_catalog,public`. Relaciones y helpers de aplicación aparecen calificados (`public.*`; `auth.role()` también calificado). El wrapper llama a `public.checkout_uuid` y a la implementación interna; ésta usa validadores/reservas y escribe checkout, venta, detalle, pagos, productos, lotes/movimientos de stock, cliente y cuenta corriente. Los grants locales revocan EXECUTE de `PUBLIC`, `anon` y `authenticated`, y conceden el RPC a `service_role`. La metadata remota aportada confirma owner `postgres` y EXECUTE para `postgres`/`service_role`, pero no incluye el cuerpo remoto ni sus ACL de esquema. Como `public` sigue en `search_path`, confirmar antes del corte que `anon`/`authenticated` no tengan CREATE en ese schema; las referencias de aplicación observadas están calificadas. No se cambió SQL sin evidencia de una vulnerabilidad concreta.
- **Idempotencia/outbox:** `PaymentModal` crea un UUID al entrar al handler, que bloquea sincrónicamente un segundo clic; el flujo recupera primero por comercio/operador/ticket y reutiliza la entrada existente. IndexedDB guarda entrada, recibo e identidad antes de la red. La outbox usa `PENDIENTE`, `CONFIRMADO` y `CANCELADO`; `ultimoError` conserva fallos sin sustituir la solicitud. No hacen falta estados `sending` o `retryable` separados: un pendiente se reenvía con mismo ID/cuerpo. La confirmación coherente finaliza el pendiente; un ID/cuerpo diferente se rechaza local y remotamente. Tras pérdida de respuesta, reapertura de IndexedDB vuelve a enviar el original y el RPC devuelve el resultado anterior.
- **Prueba agregada:** doble clic rápido en “Recuperar cobro guardado” invoca una sola recuperación y finaliza una sola vez; ejercita el guard síncrono común al handler de cobro. Los demás criterios de idempotencia, cambio de cuerpo, respuesta perdida, reapertura, persistencia de fallos y confirmación ya tenían pruebas dirigidas.
- **Límites:** la prueba confirma recuperación durable si el registro llegó a IndexedDB; no puede reconstruir un intento si el navegador se cierra antes de completar esa primera escritura. El flag de frontend desplegado y las outboxes/colas legacy reales de los terminales siguen sin inspeccionar. La evidencia de versión Edge/ACL no acredita por sí sola que el cuerpo remoto coincida byte a byte con el SQL local, ni confirma los privilegios CREATE en `public`.
- **Validación:** 5 archivos dirigidos, 147 tests aprobados. `rtk npm run build` aprobado (Vite 8.3; aviso de chunk principal mayor a 500 kB). No se ejecutaron despliegues ni migraciones.

## Fase 2 — paridad y contrato de postventa/anulación

Auditoría estática local; no se ejecutaron pruebas, consultas remotas, cambios de aplicación, SQL, despliegues ni migraciones en esta fase. El usuario aportó evidencia remota del checkout (Gate 1.5), pero no del despliegue actual de `anular_venta_atomica`; la documentación local registra una operación remota anterior de efectivo, que no equivale a validar hoy la RPC ni los demás casos.

### Cancelación pendiente y anulación confirmada

| Operación | Límite y conducta comprobada | Efectos / resultado |
| --- | --- | --- |
| Cancelar checkout todavía no confirmado | `manualCheckoutOutbox` conserva entrada/recibo/ID en IndexedDB. La cancelación persiste intención local antes de `cancelar_checkout_manual`; SQL serializa el checkout, autoriza dueño y rechaza si ya hay venta confirmada. Un envío incierto requiere recuperar/reintentar/consultar el mismo ID; no es seguro descartar localmente por timeout. | Auditoría de cancelación y resolución (`NO_COBRADO`/`REINTEGRADO` y referencia si corresponde), sin venta, stock, lote, caja o deuda creados por la cancelación. No devuelve por sí sola un medio externo. Estado visible local puede permanecer pendiente hasta respuesta; revisar la lista remota para reconciliar. |
| Anular venta ya confirmada | `ReportesPage` valida motivo y llama a una sola RPC `anular_venta_atomica`. SQL local autentica actor, exige dueño activo del kiosco, verifica checkout transaccional con resultado, bloquea operación/venta/datos afectados y devuelve el mismo resultado al reintento. Rechaza venta fiscal con CAE, venta con devolución parcial y venta legacy sin snapshot verificable. | Compensación SQL en una transacción: conserva venta/detalles/pagos, marca venta ANULADA, registra actor/motivo/auditoría, repone productos/lotes exactos y crea ABONO de crédito; caja según turno. No procesa reembolso electrónico ni fiscal. Remote actual: NO VERIFICADO en esta fase. |

**Punto de frontera:** antes de que el servidor prepare/acepte la operación y mientras puede demostrarse que no hubo commit, corresponde cancelar el cobro pendiente. Desde que el commit se confirma —incluido el caso respuesta perdida que se resuelve consultando el mismo ID— existe una venta y ya no debe tratarse como cancelable: los efectos se revierten mediante anulación compensatoria. Si la respuesta es desconocida, no se cambia de operación ni se asume cancelación; primero se reconcilia el ID original.

### Efectos y compensaciones de la venta confirmada

| Dominio | Comportamiento local comprobado | Reversión correcta / brecha |
| --- | --- | --- |
| Venta, detalles y pagos | La RPC guarda el estado ANULADA, motivo, actor/fecha y fila de `anulaciones_venta_atomicas`; triggers impiden borrar/editar detalles y pagos de la venta anulada. | Preservar como evidencia histórica. No borrar ni reescribir cabecera/detalles/pagos; la fila de anulación es el contramovimiento lógico. |
| Stock de producto / movimientos | La RPC compara cantidades vendidas contra egresos históricos por venta, suma cantidades compensatorias al stock vigente y añade INGRESOS al kardex; falla completa si falta evidencia o aparece una reposición adicional de trigger. | No rebobinar el stock anterior. Sumar el egreso inverso al saldo actual permite conservar ventas posteriores. Costo privado se copia del egreso original. Cache local se invalida y se refresca después; falla de refresh es posterior al commit y se informa aparte. |
| Lotes FEFO | Checkout guarda egresos con `lote_producto_id`; anulación repone esos lotes consumidos, no recalcula FEFO con la fecha/estado actual. | En la ruta verificada el lote original se conserva en cada movimiento. Si movimiento/costo/lote histórico no está disponible, la RPC aborta y requiere conciliación, no inventa lote. |
| Combos / promociones | Snapshot de checkout conserva componentes y el SQL deriva la receta histórica del snapshot; no depende de la receta actual. La cantidad a reponer se deriva de unidades/componentes que generaron movimientos. Descuentos/promociones son importes del ticket, no inventario aparte. | Correcto para snapshots y movimientos coincidentes. Casos de receta histórica/componentes tienen pruebas locales; no hay evidencia remota actual de esos casos. Artículos libres y renglones de devolución de envase no generan reposición de producto. |
| Pesables / decimales | El SQL opera con `numeric`; cantidades/componentes se reconstruyen multiplicando cantidad y receta. | La suma compensatoria conserva decimales si movimientos históricos son precisos; falta aceptación operativa remota del ciclo completo para pesables y lotes decimales. |
| Caja / efectivo | Si la sesión original sigue abierta, excluir la venta ANULADA del balance/arqueo ya resta el efectivo, sin segundo egreso. Si está cerrada, exige sesión abierta actual del mismo kiosco y registra EGRESO `DEVOLUCION_VENTA` sólo por efectivo. | En otro turno queda movimiento compensatorio separado y trazable. No modificar arqueo cerrado. El egreso de caja no prueba entrega física del efectivo ni cubre tarjetas/transferencias. |
| Pagos electrónicos / mixtos | Los pagos originales se conservan y la RPC verifica que coincidan con el snapshot. Sólo suma el tramo efectivo para caja. | Devolución al procesador/medio externo es una operación externa; no se realiza automáticamente. En pago mixto deben conciliarse por medio el efectivo, reembolso electrónico y crédito. Estado/ref. del refund externo no se modela en esta RPC. |
| Cuenta corriente | La RPC valida el cargo histórico `CARGO_VENTA`, resta el total de crédito del saldo actual y agrega `ABONO_PAGO` ligado a la venta. | Es compensatoria y no borra el movimiento. Brecha: el SQL no verifica pagos/abonos posteriores asignados a ese cargo; si el cliente ya pagó parte, revertir el crédito completo puede alterar saldo/deuda incorrectamente. Bloquea anulaciones de ventas con crédito hasta definir y probar imputación/reconciliación de pagos parciales. |
| Envases vacíos | `RecibirEnvaseModal` agrega línea negativa y aumenta de inmediato stock vacío local al elegir “agregar al ticket”; si se quita la línea, `cartStore` intenta contrarrestar con un ajuste local. La alternativa “pagar efectivo” registra egreso de caja y luego aumenta stock local. Venta de producto retornable y devolución/envase son líneas distintas (`sin_envase`, `es_devolucion_envase`). | Checkout no mueve stock vacío remoto; venta confirmada/anulación no lo compensa. El estado/historial viven en localStorage por kiosco/terminal browser y el historial se trunca a 100. La reversión no es durable/atómica entre IndexedDB, caja y storage; con fuente remota compartida hace falta ledger remoto idempotente y vínculo movimiento↔checkout/venta. Mantener separado stock de producto y stock de envase vacío. |
| Comprobante / reportes | Recibo local se muestra después de respuesta; ventas anuladas se excluyen de los resúmenes que filtran `COMPLETADA`; el Balance carga movimientos de caja y devoluciones por separado. | Mantener ticket original y agregar estado/operación de anulación. Comprobar que exportaciones/libro diario representen compensaciones y reembolsos externos sin convertirlas en ventas nuevas. |

### ARCA / contrato fiscal observado

- En modo manual, `PaymentModal` invoca `emitirFacturaVenta` sólo tras el resultado online confirmado. Para operación offline pendiente o resultado recuperado, instruye facturar desde Tickets Emitidos una vez verificada la confirmación. En la ruta directa, invoca ARCA después de escrituras de venta/pago/stock/crédito; no pertenece a una transacción común con el checkout.
- En producción, error/rechazo/sin certificado actualiza `afip_estado='PENDIENTE'` y observaciones, y el ticket ofrece facturar después cuando no hay CAE. El estado de venta puede ser `COMPLETADA` mientras la fiscal queda pendiente: son dimensiones diferentes. El cajero debe ver “venta confirmada; fiscalización pendiente/error”, no “venta fallida”.
- `afip-wsfe` solicita correlativo a WSFE y llama `FECAESolicitar`; luego persiste CAE, vencimiento, tipo/número y estado `OFICIAL` en `ventas`. La llamada externa y ese update no son atómicos. Si WSFE otorga CAE pero se pierde la respuesta antes de persistirlo, una repetición puede pedir otro número/CAE; la función no demuestra reconciliación por clave de venta ni idempotencia fiscal. Si WSFE responde éxito pero falla el update, el resultado remoto puede existir sin CAE local. Es riesgo alto hasta tener reconciliación antes de reintentar.
- La evidencia de venta fiscal almacenada incluye CAE, vencimiento, tipo y número de comprobante; la Edge persiste parte de esos campos. CUIT/razón social/punto de venta/condición IVA y receptor se usan en config/payload/recibo, pero no se ha comprobado que una copia completa e inmutable quede vinculada a la venta. Definir qué snapshot fiscal guardar y cómo protegerlo antes de cerrar ese contrato.
- La RPC de anulación rechaza `afip_cae` y cita circuito de nota de crédito. No se encontró implementación local de nota de crédito/anulación fiscal vinculada a esa anulación. Si venta fiscalizada: mantener bloqueo y conciliación hasta resolver en ARCA. Requisitos fiscales, secuencia, comprobante y datos obligatorios que no define el código son **DECISIÓN EXTERNA PENDIENTE** (responsable fiscal/contable), no inferirlos aquí.

### Matriz de paridad actualizada

Estado conceptual por ruta, basado en código/SQL local; remoto salvo evidencia expresa NO VERIFICADO. CUBIERTA no significa validación productiva.

| Capacidad | Ruta directa legacy | `checkout-manual` | Diferencia / siguiente paso |
| --- | --- | --- | --- |
| Promociones de producto | CUBIERTA | CUBIERTA | Quote server-side en transaccional; comparar reglas en ensayo. |
| NxM | NO VERIFICADA | PARCIAL | No quedó evidencia de paridad específica de todas las combinaciones; prueba dirigida antes del piloto. |
| Promociones de combos | PARCIAL | PARCIAL | Comprobar descuento comercial separado del combo físico y mezcla/repetición de líneas. |
| Combos físicos | PARCIAL | CUBIERTA | Transaccional conserva snapshot de componentes; legacy aplica efectos por fuera de una transacción única. |
| Productos pesables / decimales | PARCIAL | CUBIERTA | Contrato numeric/tres decimales; probar extremos y restitución remota. |
| Pagos simples | PARCIAL | CUBIERTA | Registro directo multiparte vs validación de total; falta ensayo con medio real. |
| Pagos mixtos | PARCIAL | CUBIERTA | Transaccional valida suma/IDs; reintegros externos siguen fuera del commit. |
| Caja / movimientos normales | PARCIAL | PARCIAL | Transaccional valida caja/cierre; reembolsos y cambio de turno tienen operación separada. |
| Cuenta corriente en checkout | PARCIAL | CUBIERTA | Cargo y saldo en transacción; anulación con abonos posteriores no segura aún. |
| Lotes FEFO / stock de producto | PARCIAL | CUBIERTA | Transaccional retiene salidas por lote y movimientos; concurrencia remota no verificada. |
| Cache local | PARCIAL | PARCIAL | Proyección refrescable; puede quedar obsoleta sin red o si refresh falla después del commit. |
| Envases vacíos | PARCIAL | AUSENTE | Sin efecto transaccional compartido; requiere ledger remoto idempotente y bloquea declarar paridad de envases. |
| Offline | PARCIAL | PARCIAL | Outbox durable es provisional; stock/crédito se validan al reconectar. Acordar política comercial offline. |
| Reintentos / idempotencia checkout | AUSENTE | CUBIERTA | Directo sólo protege doble envío durante handler; transaccional conserva ID/body en outbox/servidor. |
| Impresión | PARCIAL | PARCIAL | Ticket recuperable; hardware y reinicio requieren ensayo operativo. |
| ARCA | PARCIAL | PARCIAL | Efecto post-commit, respuesta externa ambigua y sin circuito local de nota de crédito. Bloquea venta fiscal hasta cerrar recuperación. |
| Cancelación pendiente | PARCIAL | PARCIAL | RPC de cancelación y outbox existen; estado remoto ante carrera/timeout y despliegue deben confirmarse. |
| Anulación confirmada | PARCIAL | PARCIAL | RPC compensatoria para venta manual no fiscal, sin devolución parcial; remoto no confirmado. |
| Autorización de supervisor | PARCIAL | PARCIAL | Política de descuento aplica; anulación exige dueño. Rol/alcance de anulación es decisión de negocio. |
| Reportes | PARCIAL | PARCIAL | Excluyen ANULADA de completadas; revisar compensaciones y reembolso externo en libro/exportación. |
| Múltiples terminales | PARCIAL | PARCIAL | Locks transaccionales no tienen ensayo remoto reciente; envases continúan locales. |

### Contrato objetivo para anulación server-side

La base local actual es `anular_venta_atomica`; no se debe implementar otra ruta que la duplique antes de resolver los gaps. Contrato recomendado para una versión evolucionada:

1. Solicitud autenticada con `annulment_id` estable, `venta_id`, kiosk/comercio derivado del actor, motivo requerido, actor autenticado y metadatos de caja destino sólo cuando aplique. El cliente no elige `actor_auth_id`. Política de rol (dueño vs supervisor autorizado), límites y motivo requieren decisión de negocio.
2. Persistir solicitud y payload canónico/idempotency key; mismo ID y cuerpo devuelve resultado previo; mismo ID/cuerpo distinto rechaza. Venta bloqueada/serializada antes de cualquier compensación; dos solicitudes concurrentes producen una sola anulación.
3. En una transacción, verificar snapshot y ledger original; insertar auditoría/registro compensatorio; reponer cantidades y lotes documentados, compensar crédito sólo con saldo/imputaciones conciliadas y registrar efecto de caja interno. Mantener la venta original inmutable en su identidad y líneas. Cualquier inconsistencia aborta toda la transacción y devuelve estado reconciliable.
4. Reembolsos de tarjeta/transferencia/MP y nota de crédito no se fingen como commit local: modelarlos como suboperaciones externas con identidad, referencia, estado pendiente/confirmado/rechazado y recuperación idempotente, una vez definidos sus contratos.
5. Respuesta incluye annulment ID, venta ID, estado, resultado estable, referencia del movimiento compensatorio, stock/lotes resultantes informativos, dinero efectivo a entregar/caja, reembolsos externos pendientes y estado fiscal. No devolver balances como reemplazo de ledger.

### Estados conceptuales

Separar dos ejes, sin añadir aún enum/campos al código:

- **Checkout:** `prepared/pending` → `confirmed` o `cancelled_before_commit`; `unknown` es una condición de recuperación, no una conclusión de fallo/cancelación. La outbox actual usa PENDIENTE/CONFIRMADO/CANCELADO y resultado del servidor.
- **Venta:** `confirmed` → `annulled` con registro compensatorio; los pagos y la evidencia original persisten.
- **Fiscal:** `not_requested` → `pending` → `authorized` o `rejected/reconciliation_required`; si venta anulada ya fue fiscalizada, una dimensión separada `credit_note_pending` → `credit_note_confirmed` o `reconciliation_required`. No llamar “venta anulada” a un checkout pendiente, ni implicar que estado ANULADA resuelve ARCA.

### Riesgos de postventa y mitigaciones

| Riesgo | Severidad / probabilidad | Evidencia e impacto | Mitigación / bloquea rollout |
| --- | --- | --- | --- |
| Doble compensación | Crítica / baja si el SQL remoto coincide | PK por venta + lock + resultado estable hacen idempotente el SQL local; remoto de anulación no verificado. Duplicaría stock, crédito o efectivo si se perdiera la serialización. | Confirmar remoto y probar solicitudes simultáneas/reintento; bloquea habilitar anulaciones nuevas bajo ese contrato. |
| Stock/lote incorrecto | Crítica / media en legacy sin snapshot | RPC requiere checkout/movimientos/costos/lotes verificables y falla cerrado; evidencia histórica de trigger duplicado existe y la SQL local comprueba restitución adicional. Ventas legacy quedan fuera. | No rebobinar saldo; reconciliar legado; verificar función/triggers remotos y probar segunda venta entre A y anulación de A. Bloquea anular legacy o desplegar migración desalineada. |
| Crédito sobrecompensado tras abonos posteriores | Alta / media | SQL resta todo el crédito original del saldo actual; no asocia pagos de deuda al cargo por saldo imputado. Puede dejar saldo incorrecto/negativo. | Política de imputación y monto compensable (deuda remanente vs contramovimiento por saldo), ledger y pruebas con pago parcial/total/posterior; bloquea crédito en anulación hasta cerrar. |
| Caja incoherente / reembolso externo omitido | Alta / media | Caja original abierta se corrige por exclusión de venta; cerrada requiere egreso en turno nuevo. Tarjeta/transferencia/MP no se reintegra. | Confirmar efectivo entregado y conciliación por medio; probar turno cerrado/mixto. Bloquea afirmar reembolso completo, no necesariamente revertir inventario/venta interna. |
| Venta anulada local pero fiscalmente vigente / duplicación ARCA | Crítica / media | ARCA ocurre tras venta; WSFE y update DB no son atómicos ni muestran idempotencia por venta; la anulación rechaza CAE. Puede haber CAE remoto sin CAE persistido. | Reconciliación por punto de venta/tipo/número/venta antes de reintentar; contrato ARCA y nota de crédito con experto; bloquea activar flujo fiscal sin proceso de incertidumbre. |
| Envases divergentes entre terminales o ante fallo parcial | Alta / alta mientras sea local | Stock e historial localStorage; recepción modifica stock antes de que el ticket se confirme y la compensación de quitar/cancelar sólo modifica la copia local. | Congelar diseño de operaciones de envase; ledger remoto compartido/idempotente con relación a venta/cancelación/anulación. Bloquea prometer stock vacío compartido. |
| Checkout confirmado, respuesta perdida y cancelación interpretada como éxito | Crítica / baja si se recupera mismo ID | Cancelación server-side rechaza venta confirmada; un UI offline no puede concluir estado remoto. | Recuperar ID/estado antes de informar cancelación; si committed, usar annulment. Bloquea cualquier fallback/limpieza local por timeout. |
| Reporte/arqueo omite el contramovimiento | Media / media | Ventas se filtran por `COMPLETADA`; movimientos caja se consultan aparte. | Conciliar vistas, exportaciones y libro diario con venta anulada y egreso compensatorio. Bloquea aprobación contable/piloto con reportes operativos. |

### Pruebas necesarias para solución futura

| Nivel | Casos mínimos |
| --- | --- |
| Unitarias / contrato | Cancelar pendiente sin commit; reintento de cancelación misma identidad; timeout/commit desconocido conserva ID; venta ya confirmada rechaza cancelar; estados/feedback del cajero; fiscal pendiente tras venta confirmada; ningún fallback directo. |
| SQL / integración local | Anulación simple y repetida; dos anulaciones concurrentes; ya anulada; rollback inducido a mitad; dueño/rol inválido; venta legacy no verificable; motivo/auditoría/inmutabilidad; producto normal y decimal; Venta A, Venta B, anular A; lote FEFO consumido exacto; combo con receta histórica; trigger que intenta duplicar reposición. |
| SQL / integración local (finanzas) | Pago mixto; efectivo en caja abierta; caja original cerrada y caja actual; referencia externa no marcada como refund; cuenta corriente sin pago, con pago parcial/total y movimientos del cliente posteriores; concurrencia con abono/venta; saldo y ledger final. No cerrar expectativa de pagos a cuenta hasta decisión sobre imputación. |
| Integración ARCA | Éxito CAE; rechazo; caída antes del request; respuesta perdida después de CAE; persistencia DB fallida; reintento recupera el mismo comprobante; venta con CAE bloquea anulación hasta circuito de nota de crédito; conciliación de CAE sin venta actualizada. Requiere contrato fiscal externo antes de fijar asserts. |
| E2E | Cajero crea venta, recibe pendiente/confirmada, imprime/recupera; dueño anula confirmada; aparece evidencia original+compensación; usuario ve fiscal pendiente/anulada con mensaje distinto; dos terminales ven stock. |
| Operativas reales | Dos sesiones Supabase para carrera; dispositivos/turnos diferentes; hardware impresión/cajón; devolución de pago en adquirente; consulta fiscal de ARCA y reintento; conteo compartido de envases. No sustituibles por PGlite. |

### Decisiones abiertas y siguiente fase segura

- **DECISIÓN EXTERNA PENDIENTE:** nota de crédito, anulación fiscal, reintentos/consulta de CAE y datos fiscales inmutables obligatorios. Consultar responsable contable/fiscal antes de especificar la integración.
- **DECISIÓN DE NEGOCIO PENDIENTE:** quién puede anular (dueño/supervisor), plazos, motivo, pago externo/reembolso, caja destino y tratamiento de deuda ya abonada o devolución parcial.
- **Contrato de envases pendiente:** aunque DECISIONS.md ya fija kiosco compartido y autoridad remota, faltan operaciones, ledger, idempotencia, permisos, offline y vínculo entre recepción/venta/anulación. No mover sólo el contador de stock a Supabase.
- **Remoto pendiente:** el Gate 1.5 confirma checkout, no acredita versión/cuerpo/trigger/policies actuales de `anular_venta_atomica`, los casos de caja/crédito/lotes ni el contrato de ARCA. Las verificaciones remotas documentadas son históricas y puntuales.
- **Puede hacerse con seguridad en Fase 3:** especificar y probar localmente los gaps no abiertos (matriz de productos/combo/decimal, rollback, concurrencia SQL, cancelación vs commit, reportes); preparar consultas de preflight de sólo lectura para la RPC de anulación y armar UX de estados sin cambiar el cierre. No implementar todavía reintegros externos, crédito con abonos posteriores, nota de crédito ni migración de envases.
- **Bloquean rollout/corte:** desconocer flag y colas reales locales; no confirmar versión/cuerpo remoto de checkout/anulación; falta de recuperación fiscal ambigua; habilitar anulaciones con crédito ya abonado sin regla; afirmar sincronización de envases; y operar offline como venta final. ARCA/fiscal requiere gate separado. El piloto de checkout no debe confundirse con certificación de anulación ni paridad de medios externos.

No se modifica `DECISIONS.md`: la auditoría no cierra política fiscal, comercial, reembolso, crédito parcialmente pagado, autorización de anulación ni contrato operativo de envases. Se conservan las cinco decisiones previas ya justificadas.

## Resultado al cierre de Fase 1

Fase 1 completada en el alcance de contrato, idempotencia y seguridad local. No fue necesario cambiar código de aplicación ni SQL; se añadió una regresión UI de doble clic y se registraron las decisiones justificadas en `DECISIONS.md`. Pasaron 147 pruebas relacionadas y `npm run build`; queda un aviso de tamaño de chunk. No se activó globalmente `VITE_CHECKOUT_MANUAL_TRANSACCIONAL`, no se retiró la ruta directa y no se ejecutaron migraciones ni despliegues. Antes de activar o cortar faltan confirmar el flag desplegado, inspeccionar/conciliar las colas locales reales y validar el cuerpo/configuración completa contra la instancia de ensayo.

## Estado al cierre de Fase 2

Fase 2 completa como auditoría local y actualización de diseño. En esta fase sólo se modificó este ExecPlan. No se cambiaron `src/`, SQL, Edge Functions, `DECISIONS.md` ni datos; no se ejecutaron tests/build, consultas remotas, deploy, migraciones, commit o push. La anulación compensatoria local preserva venta y pagos y devuelve producto/lote por movimientos históricos, pero no cubre ventas fiscales, devoluciones parciales ni anulaciones seguras con crédito ya abonado; la RPC remota y esos escenarios siguen pendientes de Gate propio. Los contratos de ARCA, reembolso externo y ledger compartido de envases deben cerrarse antes de implementar esos efectos.

## Fase 3 — validación local y preflight remoto

### Preflight remoto y comparación

En la revisión local inicial, el preflight remoto **no pudo ejecutarse**: `supabase` y `psql` no estaban instalados/disponibles y no se encontró una conexión autenticada configurada. Ese estado queda supersedido para la RPC de anulación por la evidencia remota que el usuario aportó al iniciar la Fase 4. No intenté instalar herramientas ni abrir una conexión remota en esta actualización.

Se preparó [`sql_preflight_anulacion_atomica_solo_lectura.sql`](../../sql_preflight_anulacion_atomica_solo_lectura.sql), que sólo lee catálogos PostgreSQL: firma/owner/return type/configuración/ACL/definición de funciones, helpers conocidos, triggers activos y sus funciones sobre las tablas afectadas, RLS/policies y constraints. No consulta filas de negocio ni ejecuta funciones/triggers. La consulta fue ejercitada localmente en PGlite; eso valida su sintaxis/contenido en el fixture, **no observa Supabase remoto**.

| Componente | SQL local / pruebas | Remoto observado en esta fase | Estado de comparación |
| --- | --- | --- | --- |
| `public.anular_venta_atomica(uuid,text,uuid) -> jsonb` | Existe; `SECURITY DEFINER`, owner `postgres`, `search_path=pg_catalog, public`; bloqueos, idempotencia, validación histórica y compensaciones comprobadas localmente. | El usuario confirma existencia, owner, `SECURITY DEFINER`, `search_path` y cuerpo con locking, idempotencia, validación histórica, reposición de stock/lotes, caja, cuenta corriente, auditoría y comprobaciones post-compensación. | **CONFIRMADO por evidencia remota informada por el usuario** |
| Permisos de la RPC | Local: `PUBLIC`/`anon` no ejecutan; `authenticated` sí. Es intencional para la sesión UI; la RPC valida actor dueño activo. | Usuario confirma `PUBLIC`/`anon` sin EXECUTE y `authenticated` con EXECUTE intencional; la RPC revalida `auth.uid()`, usuario activo, rol `DUEÑO` y kiosco. | **CONFIRMADO por evidencia remota informada por el usuario** |
| Helpers privilegiados | Tests locales verifican que `authenticated` no ejecute helpers críticos. | Usuario confirma que los helpers críticos no están expuestos directamente a `authenticated`. | **CONFIRMADO por evidencia remota informada por el usuario** |
| Registro, RLS/policies y triggers | Migración local y tests cubren protección, RLS y compensaciones. | Usuario confirma RLS/policies relevantes y triggers de protección de venta anulada, detalles/pagos, auditoría y demás dependencias observadas. | **CONFIRMADO por evidencia remota informada por el usuario** |
| Concurrencia multi-sesión | La prueba PGlite usa una sesión y no acredita locks entre conexiones reales. | Sin prueba remota de dos sesiones/conexiones. | **PENDIENTE** |

La información remota anterior es evidencia comunicada por el usuario; no se volvió a consultar ni a inspeccionar directamente el cuerpo remoto en esta fase. La existencia, seguridad, permisos, RLS/policies, triggers y bloques funcionales enumerados arriba quedan confirmados conforme a esa evidencia. No equivale a demostrar concurrencia real entre conexiones: ese gate requiere ensayo seguro y autorizado. El script de catálogo permanece como instrumento de lectura si luego hace falta comparar la definición desplegada con el SQL local.

### Pruebas locales añadidas y resultados

- Se ampliaron pruebas PGlite en `src/test/annulmentAtomicSql.test.ts`: asserts de venta/pagos/cargos originales y ledger compensatorio; dos llamadas simultáneas con resultado estable y sin duplicar stock/caja/crédito/auditoría; Venta A → Venta B → anular A con stock vigente y lotes independientes; restitución `numeric` de 2.5 sin pérdida; rollback completo al fallar el egreso de caja después de stock/crédito; caracterización marcada `BLOCKED_BY_BUSINESS_RULE` del saldo actual ante abono posterior; y ejecución local de la consulta de preflight sin modificar el fixture.
- Ya existían casos para anulación/reintento, venta ya anulada, historial/costo/lote ausente, stock adulterado, receta de combo histórica distinta a `combo_items`, pago mixto, autorización, caja cerrada, conservación de venta/detalles/pagos, auditoría, trigger duplicado/omitido y rollback.
- La prueba “simultáneas” corre dos promesas sobre **una única sesión PGlite**. Verifica resultado y no duplicación del camino reentrante, pero el motor serializa esa conexión; no demuestra bloqueo real entre conexiones ni sustituye prueba concurrente en Postgres/Supabase.
- El caso de cuenta parcialmente abonada documenta el resultado actual (saldo 300 → 200 tras abono 100 → 50 al anular crédito 150). Es una caracterización diagnóstica, no una política aceptada ni un test de comportamiento deseado. Pago total, asignación específica al cargo y concurrencia con abonos siguen `BLOCKED_BY_BUSINESS_RULE`.
- El test remoto de caja cerrada confirma en PGlite que se exige una sesión válida y que el egreso de $100 aparece una sola vez en la caja nueva; la sesión vieja permanece cerrada. El test abierto confirma cero egresos adicionales. Fallo inducido al insertar egreso revierte stock, crédito, auditoría y anulación y deja intacto el cierre histórico.
- Tests dirigidos finales: `rtk npm test -- src/test/annulmentAtomicSql.test.ts src/pages/ReportesPage.test.tsx src/test/annulmentClient.test.ts` — **3 archivos, 59 tests aprobados**. Hubo un primer `spawn EPERM` del sandbox; el reintento autorizado llegó a ejecutar Vitest y encontró inicialmente formato textual `8.50` vs `8.5`, luego fixture de saldo; ambos se corrigieron sin tocar lógica productiva. La última ejecución aprobó.
- `rtk npm run build` — **aprobado** (`tsc -b` y Vite 8.3.0; 603 módulos). Persiste el aviso preexistente de chunk principal de 1.63 MB (>500 kB). El build inicial de esta fase detectó tipos `unknown` en aserciones nuevas; se tiparon y el build final pasó.

### Trazabilidad de reportes y estados

`ReportesPage.test.tsx` ya comprueba que ventas `ANULADA` no participan en facturación/cantidad/ticket promedio, que la acción usa una única RPC y que un error de recarga posterior no revierte ni oculta la confirmación. `BalanceContableTab` filtra el resumen por `COMPLETADA` y consulta movimientos de caja por separado. Las pruebas locales mantienen la venta original, sus pagos y detalles y requieren auditoría única. No se verificó en producción ni se probaron exportaciones/libro diario completos; quedan en aceptación operativa.

### Seguridad local observada y bloqueos

- La migración usa `SECURITY DEFINER SET search_path=pg_catalog,public`, nombres de objetos de aplicación calificados, actor de `auth.uid()`, kiosco activo y rol `DUEÑO`. `PUBLIC` y `anon` no reciben EXECUTE; `authenticated` sí porque el flujo actual llama la RPC desde Reportes. La prueba del nuevo preflight local comprueba owner/config/ACL; no acredita esos mismos atributos remotos.
- **Riesgo de rollout:** la evidencia remota aportada ahora confirma permisos, triggers y cuerpo de la RPC para el proyecto observado, pero no se reconsultó desde esta sesión ni se confirmó que ese sea el mismo proyecto que servirá el frontend del piloto. Un trigger legado adicional de reposición puede causar doble stock; el SQL local aborta si detecta la reposición en la transacción y el checklist exige alinear el proyecto antes del uso.
- **Bloqueo de concurrencia:** faltan dos sesiones/conexiones Supabase de staging para anular simultáneamente la misma venta y para carrera anulación vs. devolución/cierre de caja/abono. PGlite local no las sustituye.
- Se mantienen gates fuera de esta fase: ARCA/nota de crédito, refunds externos, crédito con abonos posteriores (`BLOCKED_BY_BUSINESS_RULE`), devoluciones parciales y envases compartidos. No se habilita anulación de esos casos.

### Progreso de Fase 3

- [x] Añadir pruebas locales de comportamiento ya definido, rollback y diagnóstico de catálogo.
- [x] Ejecutar suite dirigida: 59/59 aprobadas.
- [x] Ejecutar build: aprobado, con aviso de chunk grande.
- [x] Preflight remoto de existencia, privilegios, helpers, RLS/policies, triggers y bloques de la RPC: confirmado según evidencia remota aportada por el usuario al inicio de Fase 4; no reconsultado desde este entorno.
- [ ] Concurrencia real de dos conexiones: pendiente de entorno de ensayo y fixture desechable explícitamente autorizado.
- [x] Fase 3: implementación y validación local completas; preflight remoto de la RPC ahora confirmado por evidencia informada. El gate de concurrencia se traslada a Fase 4. DECISIONS.md no cambia; crédito con abonos posteriores, ARCA/refunds, devoluciones parciales y envases permanecen abiertos.

Sólo se modificaron el ExecPlan, el test SQL local y el script nuevo de catálogo de solo lectura. Se conservó el resto del working tree; no se activó el flag, retiró la ruta, ejecutó migración/deploy, hizo commit/push ni modificó datos remotos.

## Fase 4 — piloto y concurrencia remota controlada

### Evidencia nueva y alcance del gate

La evidencia remota aportada por el usuario confirma el preflight de `public.anular_venta_atomica(uuid,text,uuid)`: función `jsonb`, propiedad `postgres`, `SECURITY DEFINER`, `search_path=pg_catalog, public`; `PUBLIC`/`anon` sin `EXECUTE`, `authenticated` con permiso intencional; validación interna de `auth.uid()`, usuario activo, rol `DUEÑO` y kiosco; helpers críticos no ejecutables directamente por `authenticated`; RLS/policies y triggers relevantes; cuerpo con locks, idempotencia, comprobación histórica y compensaciones de inventario/lote, caja, crédito y auditoría. Esta confirmación es evidencia comunicada por el usuario, no una consulta ejecutada en esta sesión.

Continúan separados y pendientes: concurrencia multi-sesión real; crédito con abonos posteriores; ARCA; refunds externos; devoluciones parciales; envases compartidos remotos. No se cambia `DECISIONS.md`: esos puntos todavía requieren decisión o alcance separado.

### Ruta del frontend de anulación

`ReportesPage.handleAnularVenta` valida motivo (mínimo cinco caracteres), toma el kiosco de la sesión local y opcionalmente la sesión de caja seleccionada; `annulmentClient.anularVentaAtomica` hace una única llamada a `supabase.rpc('anular_venta_atomica', ...)` con venta, motivo y caja. El singleton Supabase usa configuración URL + clave publishable/anon y la sesión persistida por Supabase Auth; el cliente no contiene ni envía `service_role`, y el request no incluye `actor_auth_id`. La identidad autorizada proviene de la sesión JWT y, según la evidencia remota aportada, la función valida `auth.uid()` y el perfil/rol/kiosco.

No hay fallback a writes directos ni creación de otro identificador de compensación en el cliente. La clave idempotente de dominio es la venta original (`p_venta_id`). Un error RPC se pasa como mensaje crudo a la UI; no se mapea actualmente en categorías de autorización, negocio y conectividad. Tras un error el diálogo conserva la venta/motivo/caja para reintentar, pero el operador puede editar motivo/caja antes del siguiente intento. El servidor debe devolver/reconciliar el resultado anterior por la misma venta y no reaplicar compensaciones; para el piloto se debe conservar el motivo y la caja originales ante resultado incierto, comprobar estado antes de cambiar parámetros y no empezar otra anulación. La evidencia de idempotencia remota respalda la protección por venta, pero no sustituye observar el comportamiento concurrente.

Tras éxito, la página invalida el caché de productos y refresca cliente/caja; un fallo de refresco se comunica aparte (“venta anulada; recargá…”), sin revertir la transacción. La comprobación estructural de la respuesta exige venta, kiosco, `ANULADA` y filas de stock válidas. Esto no constituye una cola durable de anulaciones del lado cliente: ante timeout, la reconciliación requiere reintentar la misma venta y confirmar el estado en reportes/datos autorizados.

### Prueba remota segura — procedimiento, no ejecutado

**Estado:** pendiente. En esta sesión no se identificó un entorno de ensayo ni una venta fixture creada expresamente y autorizada. La existencia de evidencia de catálogo/RPC no autoriza escribir datos ni convertir una venta real en prueba. No se llamó a la RPC ni se modificaron datos.

**Precondiciones obligatorias:** (1) proyecto Supabase de ensayo identificado inequívocamente y separado de producción; (2) autorización explícita para crear/usar fixtures desechables; (3) frontend/build y RPC apuntando al mismo proyecto; (4) cuenta `DUEÑO` de ensayo y dos sesiones autenticadas independientes; (5) caja, producto, lotes, cliente y venta de prueba con IDs anotados, creados por el flujo de ensayo; (6) medios externos, ARCA y terminales reales fuera del circuito; (7) captura de estado inicial de solo lectura. No usar ventas de clientes ni caja/stock de negocio.

**A. Dos anulaciones simultáneas de la misma venta:** preparar venta de ensayo con producto/lote y, si el caso de fixture lo contempla, caja y cargo de cuenta corriente. Abrir dos conexiones/clientes con JWT autenticados independientes del mismo dueño autorizado. Con una barrera sincronizada, invocar a la vez `anular_venta_atomica` con el mismo `p_venta_id`, `p_motivo` y `p_sesion_reintegro`; guardar hora, SQLSTATE/respuesta y request IDs de ambas. Una llamada debe aplicar la transacción; la segunda debe esperar el lock y responder con resultado coherente/idempotente. Consultar sólo después, con queries de lectura, la venta, fila de anulación, auditoría, kardex/lotes, movimientos de caja y libro del cliente. Exigir: `ANULADA` una vez; una anulación/auditoría; compensaciones exactas una sola vez; balances derivados correctos; respuestas de ambas referidas a la misma venta y estado. Las diferencias de campos temporales o del snapshot retornado deben compararse según contrato, no asumirse idénticas sin conocerlo.

**B. Venta A → Venta B → dos conexiones anulan A:** en el mismo entorno desechable, completar A y luego B usando stock común, con lotes/combos de prueba que permitan distinguir consumo de cada venta. Capturar movimientos y saldos tras B. Lanzar dos anulaciones concurrentes de A con idénticos parámetros. Verificar que sólo se compensa el consumo histórico de A, B permanece `COMPLETADA` con detalles/pagos/movimientos intactos, los lotes consumidos por B no se rellenan por la anulación de A y el stock final equivale al estado posterior a B más la compensación comprobada de A. Rechazar cualquier implementación basada en restaurar un snapshot global anterior a A.

**Consulta de resultado incierto:** nunca iniciar una operación nueva ni cambiar de venta/ID ante timeout. Conservar el mismo ID de venta y parámetros; consultar el estado de la venta y su registro de anulación por lectura; si el resultado no puede determinarse, repetir la misma RPC con los mismos parámetros. Registrar ambas respuestas y verificar que no se repiten efectos. No ejecutar este procedimiento hasta tener endpoints/credenciales de ensayo confirmados.

### Checklist de piloto controlado

| Control | Evidencia observable antes/durante el piloto | Estado actual |
| --- | --- | --- |
| Flag `VITE_CHECKOUT_MANUAL_TRANSACCIONAL` | Valor del build por entorno, fuente del build y confirmación en el frontend servido; habilitar sólo en el piloto autorizado. | Despliegue no confirmado; flag global no activar. |
| Versión de frontend y proyecto Supabase | SHA/versión servida, URL/ref del proyecto y alineación con Edge/RPC de ensayo. No registrar secretos. | Pendiente. |
| Edge `checkout-manual` v5 y `verify_jwt=true` | Metadatos del proyecto de ensayo. | Confirmado antes para el remoto reportado; revalidar que sea el mismo proyecto de piloto. |
| RPC checkout `confirmar_venta_manual` | Firma, grants, policies y migraciones del proyecto de ensayo. | Preflight previo informado; alinear con proyecto/build del piloto. |
| RPC anulación `anular_venta_atomica` | Preflight remoto aportado: confirmada; repetir sólo si el proyecto/ref de piloto difiere. | Confirmada según usuario; multi-sesión pendiente. |
| IndexedDB `KioskoPOSCobrosManuales` | Revisar pendientes en cada terminal, ID/body/estado y recuperación tras reinicio; cero pendientes sin conciliar antes de prueba. | Datos reales no inspeccionables desde el repo. |
| Cola legacy `kioskopos_cola_offline_<kioscoId>` | Exportar/conciliar entradas por terminal; no borrar ni sincronizar por lote durante preparación. | Requiere inspección manual de equipos. |
| Caja abierta y roles | Caja de ensayo abierta; validar dueño y cajero autenticados y permisos esperados. | Pendiente de fixture/ensayo. |
| Stock y lote | Producto fixture, saldo inicial y lote FEFO identificados; comparar ledger antes/después. | Pendiente. |
| Combo y pesable | Fixture de combo con componentes físicos y artículo pesable con cantidad decimal; comparar movimientos. | Pendiente. |
| Pagos mixtos | Sólo medios de prueba/simulados; conciliar detalle de pagos y caja. No disparar refunds externos. | Pendiente. |
| Cuenta corriente | Cliente fixture sin abonos ni movimientos posteriores; comprobar cargo y compensación. | Caso posterior a abonos excluido. |
| Impresión | Recibo de ensayo, ticket presentado una vez, recuperación si se reinicia antes de imprimir. | Pendiente, sin hardware de ensayo demostrado. |
| Reconexión | Poner una operación fixture en pendiente offline, restablecer red, reintentar mismo ID y comprobar una sola confirmación. | Pendiente en equipo de ensayo. |
| Concurrencia de anulación | Ejecutar A y B con dos conexiones siguiendo el protocolo anterior; conservar logs/consultas de lectura. | Gate bloqueado hasta entorno y fixture autorizados. |

No se activa la bandera global ni se retira la ruta directa como parte de este piloto de preparación. La activación de ensayo se hará sólo después de autorización y con rollback compatible; ninguna ruta directa se usará como fallback automático para una respuesta ambigua.

### Alcance excluido del piloto

- Anulación fiscal, venta con CAE anulada o nota de crédito/estado fiscal.
- Crédito con abonos u otros movimientos posteriores al cargo original.
- Refund electrónico automático o método externo ya procesado.
- Ledger remoto compartido de envases retornables.
- Devoluciones parciales.

Estos escenarios no se deben presentar al operador como capacidades aprobadas por el piloto; requieren decisiones y pruebas propias.

### Criterios GO / NO-GO

| Decisión | Criterios observables |
| --- | --- |
| **GO sólo para el alcance controlado** | Proyecto de ensayo y build identificados; flag observado en ese build; Edge/RPC y permisos alineados; cero colas sin conciliar; cada operación fixture tiene una sola venta/compensación; reintento devuelve estado recuperable sin efectos duplicados; la carrera de dos conexiones pasa; A→B→anular A conserva B; venta, caja, stock, lotes, crédito y auditoría cuadran con sus ledgers; pendiente offline sobrevive reinicio y se concilia tras reconexión; ruta directa no aparece como fallback; impresión se verifica en el equipo previsto; logs/consultas y estado final quedan guardados. |
| **NO-GO inmediato** | Duplicación de venta o compensación; pérdida/ganancia inexplicada de stock o lote; movimiento de caja/crédito/auditoría duplicado; B alterada por anular A; timeout que no puede reconciliarse con el mismo ID; pendiente que desaparece o no se recupera; cola local sin conciliación; build/flag/proyecto/backend desalineados; permisos distintos a los esperados; uso accidental de producción/datos reales; necesidad de ruta directa para resolver un timeout. |

GO no autoriza por sí solo activación global, deploy productivo, retiro de ruta directa ni inclusión de los casos excluidos; esos requieren gates y autorización independientes.

### Evidencia local y pendientes de equipos

La Fase 3 ya tiene resultado local previo de 59 tests dirigidos y `npm run build` aprobado; no se repitieron porque esta actualización sólo cambia documentación. No hubo cambios de aplicación, por lo que no se ejecutaron tests ni build en Fase 4. Las pruebas PGlite siguen sin demostrar concurrencia multi-sesión.

Falta obtener de terminales reales: valor del flag incorporado en cada build instalado; versión/commit y proyecto Supabase al que apunta cada equipo; contenido y número de pendientes en IndexedDB; contenido de la cola legacy localStorage; estado de impresora; y evidencia de reconexión/recuperación. No se inspeccionaron datos reales del navegador en esta sesión.

### Próximo paso

Preparar un proyecto de ensayo aislado y obtener autorización para fixtures desechables; documentar ref/build y estados iniciales; después ejecutar el protocolo A y B con dos sesiones autenticadas y recopilar evidencia de sólo lectura posterior. Hasta cerrar ese gate, no iniciar piloto operativo ni activar el flag global. Mantener además bloqueadas las cinco exclusiones que requieren decisión o contrato independiente.

## Fase 4A — preparación del entorno y protocolo multi-sesión

### Inventario local de entornos

Revisión sólo de archivos/configuración local y documentación. No se usaron credenciales, CLI autenticada ni conexiones remotas. Los valores de claves de `.env.local` se mantuvieron ocultos.

| ENTORNO | PROJECT REF | USO ESPERADO | EVIDENCIA | ¿PUEDE SER STAGING? | RIESGO |
| --- | --- | --- | --- | --- | --- |
| Configuración Vite local `.env.local` + vínculo CLI temporal | `wlqujnwxrmksheubfrha` | Proyecto actualmente configurado para el checkout local; metadatos lo nombran `kioskopos`, sin etiqueta de ambiente. | `VITE_SUPABASE_URL` coincide con `supabase/.temp/project-ref` y `.temp/linked-project.json`; `src/lib/supabase.ts` usa además ese mismo proyecto como fallback. | **No demostrado.** No asignarlo a staging. | **Crítico / NO-GO:** podría contener datos activos; no hay evidencia que autorice crear fixtures. `supabase/.temp` es metadato local y no certifica aislamiento. |
| `.env.example` | Sin ref real (placeholder) | Plantilla de configuración | `VITE_SUPABASE_URL` contiene `tu-proyecto.supabase.co`; no define el flag transaccional. | No identifica proyecto. | Bajo para los datos; no sirve para ejecutar prueba. |
| Proyecto de ensayo mencionado por documentación | No identificado | Ensayo de SQL/Edge/checkout | `docs/checkout-manual-pos.md`, `docs/checkout-manual-backend.md` y otras guías dicen usar ensayo, pero las instrucciones de deploy usan `TU_PROJECT_REF`/`REFERENCIA_ENSAYO`; no hay ref vinculable a ese entorno. | **Candidato documental, no entorno verificable.** | Alto: confundir el placeholder o proyecto local con ensayo podría afectar producción. |
| Preview/producción de frontend | No identificado | Hosting Vercel/preview posible | `vercel.json` contiene sólo reglas de rutas/cache; no hay workflows `.github/workflows`, pipeline ni env mapping de Vercel en el repo. `package.json` no define deploy de Supabase/Vercel. | No demostrado. | Alto: variables/build del hosting y project ref servido son desconocidos. |

Metadatos auxiliares: `.env.local` define URL y claves públicas (valores no reproducidos), pero no `VITE_CHECKOUT_MANUAL_TRANSACCIONAL`; el proceso actual tampoco tiene esa variable. `.env.example` tampoco define el flag. El código compara estrictamente con `'true'`, así que con estas fuentes locales ausentes el valor por defecto es falso; no demuestra qué valor se compiló o sirve en otro proceso/despliegue. `vite.config.ts` no define mapeos de ambientes. No hay `supabase/config.toml`. Las ramas visibles son `master` y `v0/add-critical-module-tests`; no expresan ambientes. Los scripts listados en `package.json` son desarrollo/build/lint/tests/preview, no despliegue. No se confirmó un frontend desplegado.

`supabase/.temp/linked-project.json` identifica el nombre `kioskopos`; ese nombre no acredita que sea staging. El ref conocido coincide con el configurado para uso local y con la documentación de una operación de despliegue, pero no hay evidencia que clasifique inequívocamente ese proyecto como producción o ensayo. **La incertidumbre basta para prohibir escrituras.**

### Clasificación del entorno

**Resultado histórico de la revisión inicial: C. NO_STAGING (SUPERSEDIDO).** En esa revisión sólo se identificaba el ref local. La evidencia posterior comunicada por el usuario identifica un proyecto separado, creado específicamente para staging; ver “Fase 4A.2”.

**Acceso accidental a metadata:** una búsqueda amplia de referencias incluyó en su salida una URI almacenada en `supabase/.temp/pooler-url`. No se usó para conectarse, no se copió al ExecPlan y no se repetirá aquí. El archivo local quedó intacto. La inspección deliberada de `.env.local` sólo mostró nombres de variables y host/ref público, ocultando los valores de claves.

### Matriz de alineación para el único ref identificado

Los estados remotos confirmados en fases anteriores provienen de evidencia informada por el usuario. No se obtuvo en esta revisión una asociación verificable entre esa evidencia y el ref local de la tabla anterior.

| Elemento | Evidencia disponible | Estado respecto al proyecto/ref de ensayo |
| --- | --- | --- |
| Frontend build/version/commit servido | No hay metadata de despliegue local, pipeline CI/CD ni referencia verificable al build de preview. El commit local es `08ea06a`, `package.json` declara versión `0.0.0`; ninguno acredita el frontend publicado. | **PENDIENTE** |
| `VITE_SUPABASE_URL` y ref local | `.env.local`, metadata temporal y fallback del cliente coinciden en el único ref conocido. Valores secretos de claves no se recopilaron. | **CONFIRMADO (configuración local); PENDIENTE (alineación con ensayo)** |
| Project ref de staging | En la revisión inicial no se encontró otro ref. La evidencia posterior del usuario identifica `acoyfwwmhaeruciyedri`. | **SUPERSEDIDO: staging identificado; inventario independiente pendiente** |
| `VITE_CHECKOUT_MANUAL_TRANSACCIONAL` local | Ausente de `.env.local`, `.env.example` y entorno del proceso revisado; por el comparador estricto, default local es falso. | **CONFIRMADO (fuentes locales revisadas); PENDIENTE (build servido)** |
| `checkout-manual` Edge Function | Usuario informó versión activa 5 y `verify_jwt=true` para un remoto anterior; no se vinculó ese remoto al ref de ensayo, ni se consultó ahora. | **PENDIENTE de alineación** |
| `confirmar_venta_manual(uuid,jsonb)` | Evidencia previa del usuario confirma existencia/seguridad/grants en el remoto reportado. Ref del remoto no asociado a un ensayo identificado. | **PENDIENTE de alineación** |
| `anular_venta_atomica(uuid,text,uuid)` | El usuario confirmó firma, owner, `SECURITY DEFINER`, configuración, permisos, RLS/policies, triggers y cuerpo para el remoto reportado. | **PENDIENTE de alineación** |
| Grants de checkout/anulación | Remoto reportado: checkout sólo backend según evidencia previa; anulación ejecutable por `authenticated` intencionalmente, `PUBLIC`/`anon` sin permiso. No se cotejó con el ref local. | **PENDIENTE de alineación** |
| RLS/policies | Existen en las tablas relevantes del remoto reportado según usuario; no se vinculó al posible ensayo. | **PENDIENTE de alineación** |
| Triggers críticos de anulación | Existencia informada por usuario para el remoto reportado; no comparados con el ref local/ensayo. | **PENDIENTE de alineación** |

No había filas **DESALINEADO** porque en esa revisión no se compararon dos ambientes identificados. Esa matriz es histórica y queda reemplazada para el staging por la matriz de Fase 4A.2. “No se encontró staging” no equivale a “la función falta”.

### Gate para solicitar/crear ensayo

Para pasar a `STAGING_CONFIRMADO` se necesita una de estas vías, documentada por el responsable del proyecto:

1. Identificar un proyecto Supabase separado ya existente y confirmar por Dashboard/configuración administrativa que es un proyecto de ensayo aislado, sin datos ni medios reales, y que está autorizado a recibir fixtures de prueba; o
2. Crear/autorizar expresamente un proyecto nuevo desechable, con ref propio y responsable que apruebe fixtures.

Luego confirmar el ref desde el panel administrativo del proyecto y una conexión local configurada por el responsable, sin reutilizar la metadata actual por suposición. Identificar build/preview de frontend separado, variables de build y funciones/RPC desplegadas allí. La persona autorizante debe confirmar por escrito que se permiten los cobros de ensayo, la anulación y los movimientos contables sintéticos. Cualquier duda sobre si el ref es producción mantiene **NO-GO**. No incluir tokens, claves ni URI de conexión en el plan o logs.

### Fixtures desechables (diseño; no creados)

Crear dentro del ensayo aislado y sólo tras autorización; no copiar clientes, productos, stock ni ventas de producción. Nombres/etiquetas con prefijo inequívoco `F4A_TEST_<fecha>_<caso>` y una hoja de control que relacione IDs UUID, rol, cantidad inicial y resultados esperados.

| Fixture | Mínimo requerido | Reglas de seguridad |
| --- | --- | --- |
| Kiosco de ensayo | Uno, identificado como test y distinto del comercio operativo. | Sin integración productiva ni datos de clientes reales. |
| Usuario DUEÑO | Usuario Auth dedicado del kiosco de test. | No reutilizar una cuenta personal/producción; no copiar tokens a archivos. |
| Usuario CAJERO (opcional) | Cuenta dedicada para validar login/checkout si forma parte del piloto; no necesita anular. | Sólo roles/permisos de test. |
| Dos sesiones | Dos sign-ins independientes del dueño de ensayo, cada una con su cliente/almacenamiento aislado. | JWT distintos de contexto, sin service_role; nunca imprimir tokens. |
| Caja | Una caja de prueba abierta para ventas A/B; para escenario de reintegro con caja cerrada, cerrar sólo esa caja sintética y abrir otra caja TEST. | Efectivo contabilizado sólo como movimiento simulado; sin entrega/devolución de dinero real. |
| Productos | Producto normal; producto con dos lotes TEST diferenciables; producto pesable; productos físicos componentes de un combo TEST. | Stock inicial artificial y documentado; bloquear integración de compras/abastecimiento. |
| Combo físico | Receta de dos o más componentes TEST con cantidades conocidas. | No usar componentes del catálogo real. |
| Cliente de cuenta corriente | Cliente ficticio tipo `TEST`, sin datos personales, autorizado por esquema de ensayo. | Cargo de prueba sin abonos ni movimientos posteriores; no probar saldo con historia real. |
| Ventas | Venta A para prueba de doble anulación; juego separado A2/B para secuencia A→B→anular A. | Cada caso tiene IDs nuevos; checkout por ruta transaccional sólo en el build aislado; medios cash/CC simulados, sin Point/tarjeta real ni CAE/ARCA. |

La venta A debe consumir cantidades registradas de producto normal, lote y, si el contrato del caso lo admite, componentes de combo/pesable; B debe consumir el mismo producto de saldo/lote distinto para demostrar que A no restaura el estado anterior a B. Para verificar cuenta corriente, usar un cliente aislado con cargo de A y cero movimientos posteriores. Si se mezclan efectivo y crédito, el efectivo es sólo asiento de prueba y se anota la caja destino. La prueba de B usa IDs nuevos; una venta anulada no se reutiliza como fixture.

### Dos sesiones independientes

Usar dos contextos de navegador separados o dos procesos Node independientes. Cada uno crea su propio `createClient` con URL y clave pública del proyecto de ensayo y ejecuta su propio login Auth del mismo usuario DUEÑO dedicado; conservar JWT sólo en memoria del proceso. Se puede usar el mismo usuario de test con dos sign-ins independientes para que `auth.uid()` sea el mismo actor; las sesiones/clientes deben tener almacenamiento y refresh independientes. Invocar RPC con rol autenticado normal. No usar service_role, dos promesas sobre el mismo cliente, una sola sesión de base, PGlite ni mocks como prueba de concurrencia.

Para maximizar la carrera: crear ambos clientes y completar login; validar previamente con lecturas de que ambas sesiones pertenecen al kiosco TEST y tienen la sesión/caja esperada; calentar conexión HTTP con consultas `SELECT` inocuas; preparar ambos argumentos idénticos; esperar una barrera/latch en ambos procesos; liberar ambas invocaciones al mismo tiempo y registrar `performance.now()`/timestamp UTC inmediatamente antes y después. Las llamadas deben ejecutarse con `Promise.all` desde procesos/clientes independientes, sin espera entre ellas. No guardar `Authorization`/JWT en logs. Registrar códigos SQLSTATE/PostgREST y respuesta reducida a IDs/estado/cantidades. La simultaneidad temporal por sí sola no demuestra que ambas transacciones se solaparon en el servidor; guardar tiempos servidor/auditoría disponibles y repetir varias veces con ventas fixture nuevas, sin reusar una venta anulada.

### Prueba A — misma venta (protocolo, no ejecutado)

1. Crear una venta de test completada por checkout transaccional, con stock/lote y un caso de caja/crédito sintético apropiado. Capturar estado inicial y referencias de venta, checkout, productos/lotes consumidos, pagos, cliente y caja.
2. Desde ambas sesiones independientes, con exactamente el mismo `venta_id`, motivo de al menos 5 caracteres y `sesion_reintegro` (incluido `NULL` idéntico si no aplica), sincronizar barrera y llamar `anular_venta_atomica`.
3. Capturar para cada llamada timestamp inicio/fin UTC, respuesta reducida o error/código SQLSTATE, sin JWT ni payload comercial completo.
4. Consultar después sólo mediante SELECT: venta final; conteo de `anulaciones_venta_atomicas`; conteo de auditoría `VENTA_ANULADA`; productos/lotes; movimientos `EGRESO/VENTA` y `INGRESO/DEVOLUCION`; movimientos de caja; movimientos de cuenta corriente.
5. Exigir estado `ANULADA` una vez, un único registro de anulación/auditoría, una única compensación con cantidades por producto/lote que igualen el consumo original, una única compensación financiera esperada y ambas respuestas coherentes para el mismo ID. La llamada ganadora puede aplicar y la segunda leer resultado idempotente; registrar el orden/resultado observado.

### Prueba B — Venta A, Venta B y anulación concurrente de A

1. Con fixtures nuevos, completar A y luego B por checkout de ensayo. Ambos consumen un producto compartido; para el caso de lotes, A consume el primer lote FEFO y B el siguiente lote/saldo según inventario. Incluir componente de combo/decimal sólo con cantidades exactas y conocidas.
2. Capturar después de B venta/estado, detalles y pagos agregados, stock, cada lote, movimientos de ambas ventas, caja y saldo/movimientos del cliente.
3. Desde las dos sesiones, correr la misma barrera y anular A con motivo/caja idénticos.
4. Hacer consultas posteriores de sólo lectura y comparar con el snapshot inmediatamente posterior a B. B debe seguir `COMPLETADA`; sus detalles/pagos y movimientos originales no cambian. Sólo se agrega una compensación para los egresos/componentes/lotes atribuidos a A. B no se borra ni se altera; los lotes que B consumió no se reponen por A. Stock esperado = estado después de B + cantidades históricas compensadas de A, sin restaurar un snapshot global anterior.

Si la política del proyecto bloquea la lectura directa desde el rol de dueño, obtener el informe desde un operador SQL autorizado en el dashboard del proyecto de ensayo, en modo lectura y limitado a estos UUID TEST. No ampliar grants para facilitar la prueba.

### Consultas post-resultado (sólo lectura)

Reemplazar los UUID placeholders por IDs de fixture; ejecutar únicamente en el proyecto confirmado y después de cada carrera. No seleccionar nombres de clientes, correos, credenciales, motivos libres ni JSON completo de solicitud. Estas consultas son guías que deben contrastarse con el esquema desplegado antes de ejecutarlas; el repositorio usa los nombres/columnas indicados, pero no prueba el catálogo del ensayo.

```sql
-- Q1: estado y metadatos mínimos de A/B; prueba que A quedó ANULADA y B sigue COMPLETADA.
SELECT id, kiosco_id, estado, total, sesion_caja_id, anulada_en
FROM public.ventas
WHERE id IN ('<VENTA_A_UUID>'::uuid, '<VENTA_B_UUID>'::uuid)
ORDER BY id;

-- Q2: una fila de idempotencia por venta; no devuelve el JSON de resultado.
SELECT venta_id, kiosco_id, actor_auth_id, creado_en, jsonb_typeof(resultado) AS resultado_tipo
FROM public.anulaciones_venta_atomicas
WHERE venta_id IN ('<VENTA_A_UUID>'::uuid, '<VENTA_B_UUID>'::uuid)
ORDER BY venta_id;

-- Q3: cantidad/conteo de auditorías de anulación, sin motivo libre.
SELECT entidad_id AS venta_id, accion, count(*) AS filas,
       min(creado_en) AS primera, max(creado_en) AS ultima
FROM public.auditoria_operaciones
WHERE entidad='ventas' AND accion='VENTA_ANULADA'
  AND entidad_id IN ('<VENTA_A_UUID>'::uuid, '<VENTA_B_UUID>'::uuid)
GROUP BY entidad_id, accion ORDER BY entidad_id;

-- Q4: movimientos históricos y compensatorios por producto/lote/tipo.
SELECT producto_id, lote_producto_id, tipo, motivo, notas,
       count(*) AS filas, sum(cantidad) AS cantidad
FROM public.movimientos_stock
WHERE kiosco_id='<KIOSCO_TEST_UUID>'::uuid
  AND notas IN (
    'Checkout manual <VENTA_A_UUID>', 'Anulación atómica <VENTA_A_UUID>',
    'Checkout manual <VENTA_B_UUID>', 'Anulación atómica <VENTA_B_UUID>'
  )
GROUP BY producto_id, lote_producto_id, tipo, motivo, notas
ORDER BY producto_id, lote_producto_id, tipo, notas;

-- Q5: saldos actuales de los productos y lotes TEST indicados en la hoja de control.
SELECT id AS producto_id, stock_actual
FROM public.productos
WHERE id IN ('<PRODUCTO_TEST_1_UUID>'::uuid, '<PRODUCTO_TEST_2_UUID>'::uuid)
ORDER BY id;
SELECT id AS lote_id, producto_id, cantidad_actual, activo
FROM public.lotes_producto
WHERE id IN ('<LOTE_TEST_1_UUID>'::uuid, '<LOTE_TEST_2_UUID>'::uuid)
ORDER BY id;

-- Q6: movimientos de caja por venta destino y motivo de compensación; importes sintéticos.
SELECT sesion_caja_id, tipo, motivo, descripcion, count(*) AS filas, sum(monto) AS monto
FROM public.movimientos_caja
WHERE kiosco_id='<KIOSCO_TEST_UUID>'::uuid
  AND descripcion IN ('Anulación atómica <VENTA_A_UUID>', 'Anulación atómica <VENTA_B_UUID>')
GROUP BY sesion_caja_id, tipo, motivo, descripcion
ORDER BY sesion_caja_id, descripcion;

-- Q7: contramovimiento de cuenta corriente para A/B, sin datos de identidad del cliente.
SELECT venta_id, tipo, count(*) AS filas, sum(monto) AS monto,
       max(saldo_resultante) AS saldo_resultante
FROM public.movimientos_cuenta_corriente
WHERE kiosco_id='<KIOSCO_TEST_UUID>'::uuid
  AND venta_id IN ('<VENTA_A_UUID>'::uuid, '<VENTA_B_UUID>'::uuid)
GROUP BY venta_id, tipo ORDER BY venta_id, tipo;

-- Q8: comparación agregada de detalles y pagos de B antes/después de anular A.
-- Guardar ambas salidas; counts, cantidades, subtotales e importes por medio deben coincidir.
SELECT producto_id, count(*) AS filas, sum(cantidad) AS cantidad, sum(subtotal) AS subtotal
FROM public.detalles_venta WHERE venta_id='<VENTA_B_UUID>'::uuid
GROUP BY producto_id ORDER BY producto_id;
SELECT medio_pago, count(*) AS filas, sum(monto) AS monto
FROM public.pagos_venta WHERE venta_id='<VENTA_B_UUID>'::uuid
GROUP BY medio_pago ORDER BY medio_pago;
```

Q1/Q2/Q3 prueban estado y unicidad de anulación/auditoría; Q4 contrasta los egresos con ingresos inversos por lote, Q5 confirma saldo final, Q6/Q7 comprueban compensación financiera y Q8 que B conserva líneas y pagos. Comparar Q4–Q8 con snapshots previos guardados tras A/B; los datos posteriores por sí solos no demuestran el valor inicial.

### Limpieza en ensayo

No ejecutar limpieza durante Fase 4A/4B. Preferir conservar ventas, anulaciones, auditoría y movimientos marcados por su asociación al kiosco/IDs TEST: borrarlos destruye precisamente la evidencia del ensayo y puede violar triggers/relaciones. Cerrar/reconciliar sólo la caja TEST y mantenerla como historial sintético. No borrar movimientos de stock, pagos ni cargos/abonos.

Productos, lotes y cliente TEST: conservarlos inactivos o con etiqueta TEST si tienen referencias; sólo evaluar borrado de fixtures maestros sin referencias después de auditar claves foráneas, retención y autorización separada. Cuentas Auth de prueba: revocar sesiones y deshabilitar el perfil; no borrar Auth/usuarios si son actor de auditoría o tienen FK. La alternativa de eliminar el proyecto Supabase entero sólo sería válida para un proyecto efímero inequívocamente aislado, con respaldo y autorización separada; nunca generar deletes para producción ni desde este plan.

### Inspección manual por terminal (sólo lectura)

Realizar en cada equipo antes del piloto, sin limpiar almacenamiento ni sincronizar:

1. En la pantalla “Acerca de”/información de despliegue o panel de hosting de sólo lectura, anotar URL de frontend, versión/build y commit. Si no existe metadata, marcar desconocido; `package.json` local no prueba versión instalada.
2. En el panel de despliegue, consultar variables asociadas exactamente a ese build (sin copiar claves): anotar `VITE_CHECKOUT_MANUAL_TRANSACCIONAL` como true/false/ausente. En DevTools → Network, registrar únicamente el host/ref de solicitudes a Supabase. No pegar storage, headers ni tokens en el informe.
3. DevTools → Application → IndexedDB → `KioskoPOSCobrosManuales` → `cobros`: contar registros y anotar sólo `id`, `estado`, kiosco/usuario seudonimizados si hace falta. No abrir/copiar solicitud, pagos, cliente, recibo ni autorización.
4. En Application → Local Storage, ubicar `kioskopos_cola_offline_<kioscoId>` y contar entradas; registrar sólo IDs y estado disponible. Si es necesario usar consola, leer/parsing en memoria e imprimir únicamente `length`, IDs y estado; nunca ejecutar `setItem`, `removeItem`, sync ni copiar JSON completo.
5. Revisar en configuración de POS/sistema que la impresora seleccionada/estado figure conectada, sin enviar impresión de prueba ni abrir cajón.
6. Para supervivencia local, registrar conteos/IDs/estados antes del reinicio, reiniciar terminal y volver a leerlos offline antes de permitir sincronización. Esto sólo prueba persistencia local. Probar reconexión real y conciliación invoca escrituras del checkout; no es una inspección de solo lectura y queda para un ensayo autorizado posterior. No pulsar sincronizar ni cambiar de operador/comercio.

Resumen por terminal: etiqueta del equipo, build/commit, host/ref, flag efectivo, count + IDs/estados IndexedDB, count + IDs/estados cola legacy, impresora, presencia igual de colas después del reinicio, y `reconexión/recuperación = NO PROBADA` hasta ensayo escrito y autorizado.

### GO / NO-GO del entorno para Fase 4B

`GO_ENTORNO` sólo si se conserva evidencia observable de todos estos puntos:

- Proyecto inequívocamente de ensayo, con ref cotejado desde el panel y separado de producción; responsable autoriza por escrito crear/usar fixtures descartables.
- Ninguna cuenta, cliente, producto, caja, medio externo ni credencial de negocio real; ARCA, Point/Mercado Pago y tarjetas reales fuera del flujo.
- Frontend de ensayo identificado por URL/build/commit; su URL Supabase/ref coincide con el ref aislado; flag inspeccionado en ese build. No requiere activar globalmente ni productivamente.
- `checkout-manual`/v5/`verify_jwt`, `confirmar_venta_manual`, `anular_venta_atomica`, grants, RLS/policies y triggers comprobados en ese mismo proyecto mediante acceso administrativo de lectura.
- Dos sesiones Auth independientes autenticadas con rol de dueño de ensayo; fixtures claramente marcados TEST e IDs anotados; snapshots iniciales leídos y guardados antes del ensayo.
- Caja/productos/lotes/cliente de prueba y movimientos sintéticos listos; sin abonos posteriores; sin colas reales no conciliadas en el equipo de ensayo.

Cualquier campo desconocido, discrepancia, duda sobre producción o falta de autorización = **NO-GO**, sin llamadas mutantes ni creación de fixtures. La clasificación histórica `NO_STAGING` queda supersedida; la clasificación actual y el gate de infraestructura están en Fase 4A.2.

### Progreso

- [x] Corregir el conteo de exclusiones del piloto a cinco.
- [x] Inventariar la configuración local/documentación sin exponer claves; no encontrar un ref de ensayo separado.
- [x] Clasificar inicialmente como `NO_STAGING` (resultado histórico supersedido por Fase 4A.2).
- [x] Preparar matriz de alineación, fixtures, dos sesiones, pruebas A/B, consultas de sólo lectura, limpieza segura y procedimiento manual por terminal.
- [ ] Obtener identidad/ref administrativo de staging y autorización escrita de fixtures.
- [ ] Capturar estado inicial de fixtures y ejecutar Fase 4B A/B en dos sesiones reales sólo tras `GO_ENTORNO`.

En esta fase sólo se actualizó el ExecPlan. No se cambió código, `.env.local`, `.env.example`, SQL, Edge Functions, `DECISIONS.md` ni datos remotos. No se ejecutaron tests, build, consultas Supabase, migraciones, deploy, sincronización local, commit o push.

## Fase 4A.2 — inventario y bootstrap de staging

### Identidad y procedencia de evidencia

- `STAGING_PROJECT_REF=acoyfwwmhaeruciyedri`, proyecto separado creado específicamente para ensayo según confirmación directa del usuario.
- `wlqujnwxrmksheubfrha` es el ref anterior/conocido y está expresamente excluido de toda operación remota. Ningún comando sin `--project-ref acoyfwwmhaeruciyedri` puede considerarse dirigido a staging.
- El usuario informa que el inventario de staging tiene cero tablas públicas, cero funciones públicas y ninguna Edge Function. Lo registro como **evidencia aportada por el usuario**, no como consulta independiente de esta sesión.
- La CLI/psql no está disponible y el Dashboard de esta sesión redirige a login; por eso no se reconsultaron catálogos. No se ejecutó ninguna operación remota.

**Clasificación actual:** `STAGING_IDENTIFICADO=PASS`; `STAGING_VACÍO=PASS (reportado por el usuario)`; `GO_STAGING_INFRA=NO-GO`. Identificar un proyecto vacío no prueba todavía que pueda reproducir de forma segura el contrato requerido.

### Inventario remoto informado

| Componente requerido | Estado en staging | Evidencia/procedencia |
| --- | --- | --- |
| Tablas de dominio `ventas`, `detalles_venta`, `pagos_venta`, `productos`, `lotes_producto`, `movimientos_stock`, `sesiones_caja`, `movimientos_caja`, `clientes`, `movimientos_cuenta_corriente`, `usuarios`, `kioscos` | **AUSENTE (según inventario aportado)** | El usuario informa 0 tablas `public`; no se consultó el catálogo independientemente. |
| `checkout_manual_entradas`, `checkout_manuales`, `checkout_manual_cancelaciones` | **AUSENTE (según inventario aportado)** | 0 tablas `public` informadas. |
| `confirmar_venta_manual`, `confirmar_venta_manual_interna_supervisor`, `cancelar_checkout_manual`, `anular_venta_atomica` | **AUSENTE (según inventario aportado)** | 0 funciones `public` informadas. |
| Triggers, constraints, RLS, policies y grants de las tablas de KioskoPOS | **AUSENTE/no aplicable al esquema vacío (según inventario aportado)** | Sin tablas públicas no hay triggers ni policies de dominio; no acredita settings globales ni objetos en otros schemas. |
| `checkout-manual`, `supervisor-pin`, `afip-wsfe` | **AUSENTE (según inventario aportado)** | El usuario informa que no hay Edge Functions desplegadas. `afip-wsfe` sólo se inventaría; ARCA queda fuera del piloto. |

Los estados anteriores no se deben convertir en “verificado por Codex” hasta obtener una lectura autenticada contra el ref explícito. Inventariar staging no autoriza a tocar el otro proyecto.

### Inventario local de SQL y fuentes de esquema

No existe `supabase/config.toml` ni historial utilizable en `supabase/migrations/`; el repositorio contiene SQL sueltos, paquetes/artifacts y scripts de verificación. No hay un grafo de migraciones CLI que se pueda aplicar automáticamente. `docs/sql-pendientes-2026-10-07.md` aclara expresamente que su lista es para una base existente y **no** instala una base vacía; la lista 01–50 tampoco es una orden para reaplicar todo.

| Grupo / archivos locales | Crea o modifica | Dependencias principales | Idempotencia y riesgo | Disposición para staging |
| --- | --- | --- | --- | --- |
| `supabase_master_fase1_consolidacion.sql` | Núcleo: kioscos, usuarios, productos, lotes, `items_combo`, promociones, caja, ventas/detalles/pagos, movimientos, clientes/CC, compras/devoluciones, índices, vista y RLS. | Extensión `pgcrypto`/UUID y ninguna tabla de negocio previa; políticas consultan usuarios/kioscos. | Usa `IF NOT EXISTS`, pero no es una migración reconciliadora. El nombre de combo difiere del runtime actual (`combo_items`); contiene RLS/policies históricas que requieren revisión. | Fuente histórica; no usar como bootstrap. El candidato actual es `supabase/bootstrap/`, aún no apto para instalar. |
| `supabase_actualizacion_completa.sql` | `ALTER productos`; crea/extiende clientes/CC, lotes, `combo_items`, proveedores/compras, devoluciones y promociones con policies. | Base `kioscos`, `usuarios`, `productos`, `ventas` y detalles. | Parcialmente idempotente; no es instalador vacío. Incluye policies amplias para `authenticated` (p. ej. lotes `USING/WITH CHECK true`), inaceptables sin revisión/normalización. | No ejecutar como bootstrap integral; seleccionar sólo DDL faltante después de reconciliar esquema/policies. |
| `supabase_combos.sql`, `supabase_promociones.sql`, `supabase_lotes_vencimientos.sql`, `supabase_envases_retornables.sql`, `supabase_balanza_pesables.sql`, `supabase_soporte_pesables_decimales.sql` | Extensiones de combos, promociones, lotes, envases y pesables. | Tablas core y, según archivo, usuarios/kioscos/productos/detalles. | Se solapan con el master y `supabase_actualizacion_completa.sql`; políticas antiguas pueden ser permisivas. | No combinar por nombre: cotejar columnas y policies contra el snapshot consumido por checkout. Envases compartidos remotos quedan fuera del piloto. |
| `supabase_seguridad_roles_rls.sql`, `supabase_fase_seguridad_perfiles.sql`, `supabase_fase_seguridad_combos.sql` | Helpers de identidad/rol/kiosco, policies RLS, protección de perfiles y endurecimiento específico de `combo_items`. | Esquema de dominio `usuarios`, `kioscos`, `productos`, `combo_items` y tablas referenciadas por cada policy. | Reejecución modifica policies y helpers; el endurecimiento de combos presupone la tabla/runtime correctos. Auditar cada grant/policy antes de datos. | Necesarios para contrato de seguridad; aplicar sólo sobre esquema reconciliado y comprobar grants/RLS. |
| `supabase_fase_stock_idempotente.sql`, `supabase_fase_mermas_trazables.sql`, `supabase_rpc_stock_atomico.sql` | Operaciones idempotentes, registro/compensación de stock, columnas de costo histórico y triggers. | `productos`, `lotes_producto`, `movimientos_stock`, helpers de auth y, para costos, tablas/funciones de costo. | Evolución histórica parcialmente superpuesta; algunos scripts reemplazan funciones y triggers. | Determinar qué funciones consume checkout actual; no instalar legacy RPC de stock a ciegas. |
| `supabase_fase_seguridad_costos_privados.sql`, `supabase_fase_costos_movimientos_privados.sql` | Costos privados de producto/movimiento, copias históricas, triggers; pone costos públicos a cero. | `productos`, `movimientos_stock`, helpers de auth; el segundo declara “después de mermas”. | Idempotencia parcial; escribe/reclasifica valores existentes y cambia semántica. Riesgo alto para datos preexistentes aunque staging esté vacío. | Requisito explícito de precondición en SQL de checkout; preparar contra base limpia con revisión y test de rollback. |
| `supabase_fase_auditoria_anulaciones.sql` | Campos de anulación, `auditoria_operaciones`, funciones/triggers de validación y auditoría. | `ventas`, `usuarios`, `kioscos`; tabla de auditoría y RLS. | `ADD COLUMN IF NOT EXISTS`/reemplazos, pero modifica trigger behavior. | Prerequisito de anulación atómica; instalar antes de RPC final. |
| `supabase_fase_checkout_manual.sql` | `checkout_manuales`, helpers de validación/reserva y `confirmar_venta_manual`. | Tablas de dominio, combos/lotes/CC/caja y costos privados + trigger de costos de movimiento (el SQL valida estos prerequisitos). | `CREATE OR REPLACE`; instala SECURITY DEFINER/grants/RLS. Repetir versión antigua puede reemplazar contrato posterior. | Núcleo del checkout; versión final debe coordinarse con los overlays posteriores. |
| `supabase_fase_checkout_manual_backend.sql` | `checkout_manual_entradas`, preparador backend y grants/RLS. | Checkout base, usuarios/Auth, caja y esquema de dominio. | Crea tabla y reemplaza función; no equivale al checkout final por sí solo. | Después del núcleo; desplegar Edge sólo una vez que SQL/grants estén alineados. |
| `supabase_fase_checkout_manual_cancelacion.sql`, `...cierre_caja.sql`, `...orden_bloqueos.sql`, `...preparacion_bloqueos.sql`, `...consulta_pendientes.sql`, `...recuperar_entrada.sql`, `...conciliar_cancelacion.sql`, `...caja_compartida.sql`, `...inmutabilidad.sql` | Tabla de cancelaciones; protecciones/triggers; reemplazos para locks, preparación, consulta/recuperación, caja compartida e inmutabilidad. | `checkout_manual_entradas`, `checkout_manuales`, sesiones de caja, ventas/detalles/pagos y helpers. | Secuencia evolutiva; los reemplazos no son intercambiables ni idempotentes semánticamente. Aplicar fuera de orden puede reabrir permisos o perder comportamiento. | Mantener el orden registrado en la guía y verificar definición final/grants después de todo overlay. |
| `supabase_fase_supervisor_pin_privado.sql`, `...pin_intentos.sql`, `...autorizacion_descuento.sql`, `supabase_fase_checkout_manual_supervisor.sql`, `supabase_fase_checkout_manual_politica_supervisor.sql`, `...pin_espera.sql`, `supabase_fase_supervisor_politica_descuento.sql`, `supabase_fase_checkout_manual_politica_congelada.sql`, `supabase_fase_supervisor_auditoria_consulta.sql`, `supabase_fase_supervisor_auditoria_politica.sql` (incluye copias numeradas 29–38 en artifacts) | Secretos PIN, intentos/autorizaciones, política/auditoría, wrappers de checkout autorizado y política congelada. | Checkout base + usuarios/roles; las etapas congeladas requieren columnas de entrada y política creada previamente. | Alta sensibilidad; orden obligatorio. La guía indica que la política congelada no se instala aislada con backend viejo y revoca preparadores anteriores. | Requerido sólo para el contrato que incluya descuentos con supervisor; aplicar último en la cadena documentada, con Edge/backend coordinado. |
| `supabase_fase_lectura_identidad_edge.sql`, `supabase_fase_lectura_catalogo_checkout.sql`, `supabase_fase_ventas_cajero_solo_backend.sql`, `supabase_fase_ventas_sin_escritura_anonima.sql` | Columnas/lecturas mínimas para Edge, restricciones de permisos de cajero y retiro de escritura anónima. | Tablas y helpers de auth; algunas reglas dependen del backend ya desplegado. | Cambian grants efectivos; aplicar fuera de orden puede bloquear el cliente viejo. | Cerca del cierre de seguridad, en orden coordinado con Edge/frontend y luego verificar rol JWT real. |
| `supabase_fase_anulacion_venta_atomica.sql` | `anulaciones_venta_atomicas`, `anular_venta_atomica`, locks/compensaciones y triggers de protección. | Checkout, `ventas`, detalles/pagos, lotes, stock, caja, CC, auditoría, devoluciones y helpers de auth. | Tiene `CREATE OR REPLACE` pero también drop/recreación de trigger; alto riesgo si falta dependencia o se mezcla con triggers legados. | Último SQL funcional de anulación tras auditar dependencias y aplicar auditoría; prueba sólo con fixtures de staging autorizados. |
| `supabase_fase_devolucion_*`, `supabase_devoluciones.sql`, `supabase_fix_devoluciones_*.sql` | Contratos de devolución parcial e historial privado. | Tablas de devolución y venta. | Variantes/reparaciones sucesivas; no forman parte del piloto acotado. | No aplicar ahora salvo dependencia confirmada por SQL de anulación; devoluciones parciales excluidas. |
| `supabase_fase_envases_precios_compartidos.sql` y SQL de respaldo/Point/ARCA/administración/seed/limpieza/diagnóstico | Envases compartidos, backups, medios externos, facturación, fixtures o tareas operativas de otros módulos. | Dependencias particulares; algunos archivos pueden borrar/alterar datos o exigir secretos externos. | Riesgo desde bajo hasta destructivo; los seeds refieren a datos y no son bootstrap neutral. | Excluir del lote de checkout piloto salvo que una fase explícita lo requiera. `afip-wsfe` sólo inventario; no habilitar ARCA. |

Los scripts de auditoría/verificación (`sql_preflight_*`, `sql_verificar_*`, `sql_comprobar_*`, `sql_auditar_*`) son lecturas o comprobaciones dirigidas, no instaladores. `supabase_admin_eliminar_kiosco.sql`, `supabase_limpiar_demos.sql` y scripts `seed_*` no son material de bootstrap seguro y no se ejecutarán.

### Grafo y orden lógico propuesto (no ejecutado)

`base de dominio reconciliada` → `extensiones realmente requeridas (lotes, combos físicos, promociones, pesables, CC)` → `helpers de identidad + RLS/policies/grants revisados` → `movimientos de stock/costos y triggers requeridos` → `auditoría de anulaciones` → `checkout base (20)` → `entrada/backend (21)` → `cancelación y protección de caja (22–23)` → `overlays de locks/preparación/consulta/recuperación/conciliación (24–28)` → `supervisor y política en orden 29–38 cuando aplique` → `lecturas Edge 44–45` → `caja compartida/inmutabilidad/sin escritura anónima 46–48` → `anulación atómica` → `Edge Functions necesarias, con JWT y sin secretos en frontend`.

Esto es un grafo conceptual derivado de las dependencias declaradas y SQL local, no una receta de ejecución confirmada. En la guía 01–50 la seguridad aparece primero porque presupone un dominio ya instalado; para una base realmente vacía el núcleo debe existir antes de políticas que lo referencian. A su vez, las policies de algunos SQL de creación son demasiado amplias para considerar seguro insertar fixtures antes de normalizarlas. La versión final del orden debe verificarse con una restauración local descartable de PostgreSQL y consultas de catálogo, no por la etiqueta “idempotente”.

### Primer lote SQL identificado (actualizado en Fase 4A.3)

La evaluación inicial consideró `supabase_master_fase1_consolidacion.sql`, pero quedó **reemplazada** por el paquete candidato `supabase/bootstrap/`. El master sigue siendo una fuente histórica, no un instalador aprobado: crea la tabla relacional `items_combo`, mientras el runtime usa `combo_items`, y conserva policies que requieren revisión. `supabase_actualizacion_completa.sql` sigue siendo incremental y no debe combinarse como bootstrap vacío.

`supabase/bootstrap/` ahora resuelve explícitamente el contrato de combos y el conjunto de dominio del piloto; los dos checks PGlite dirigidos pasaron. Sigue **NO APTO PARA EJECUTAR** hasta instalarlo en una instancia PostgreSQL real local y desechable, inspeccionar los objetos/permisos efectivos y cerrar los gates de seguridad. La futura escritura remota aún requiere autorización específica y confirmación del ref exacto.

### Matriz de alineación de staging

Como staging está vacío según el inventario aportado, los componentes de aplicación aún no pueden alinearse; las filas no se marcan como `DESALINEADO` sólo por estar ausentes.

| Elemento | Estado actual | Evidencia / siguiente verificación |
| --- | --- | --- |
| Frontend build/versión/commit de ensayo | **PENDIENTE** | No hay frontend de staging identificado; `0.0.0` del package y commit local no prueban build servido. |
| `VITE_SUPABASE_URL` / project ref | **CONFIRMADO (destino propuesto, reportado)** | Debe resolver sólo a `acoyfwwmhaeruciyedri`; comprobar antes del primer query/operación con `--project-ref` explícito. |
| `VITE_CHECKOUT_MANUAL_TRANSACCIONAL` | **PENDIENTE** | No crear `.env.staging.local` todavía; plan propuesto: modo Vite staging separado con flag `true`, anon/publishable key del staging y nunca service_role. |
| Tablas de dominio y checkout | **AUSENTE (reportado)** | Crear sólo tras baseline/schema aprobado. |
| RPC checkout/anulación | **AUSENTE (reportado)** | Requieren instalar SQL en orden y validar firmas/cuerpo/grants posteriormente. |
| Edge `checkout-manual`, versión/`verify_jwt` | **AUSENTE (reportado)** | No desplegar ahora; luego desplegar sólo ref explícito y verificar versión/JWT. |
| `confirmar_venta_manual`, `anular_venta_atomica`, helpers SECURITY DEFINER/search_path | **AUSENTE (reportado)** | Validar propietario, search_path, `EXECUTE` y llamadas auxiliares tras instalación. |
| Grants, RLS y policies | **AUSENTE/no aplicable aún (reportado)** | Definir y revisar antes de cualquier fixture; verificar como `anon`, `authenticated` y `service_role`. |
| Triggers críticos checkout/anulación | **AUSENTE (reportado)** | Instalar al final de su cadena SQL y consultar `pg_trigger`/funciones enlazadas. |
| `supervisor-pin` | **AUSENTE (reportado)** | Sólo si el piloto necesita descuentos con supervisor; desplegar después de sus tablas/RPC. |
| `afip-wsfe` | **AUSENTE (reportado); NO APLICA al piloto** | Inventario solamente; ARCA permanece deshabilitado/fuera de alcance. |

No hay un `.env.staging.local` creado ni se tocó el `.env.local` actual. No registrar ni mostrar valores de claves. El frontend debe usar únicamente clave pública/anon de staging; service_role sólo en contexto server-side protegido.

### Gate `GO_STAGING_INFRA`

Permanece **NO-GO** hasta que se cumplan todos estos puntos observables:

1. Inventario de lectura autenticado al ref exacto `acoyfwwmhaeruciyedri`; confirmación inequívoca de no apuntar a `wlqujnwxrmksheubfrha`.
2. `supabase/bootstrap/` elegido y probado en una base PostgreSQL local desechable; el chequeo auxiliar PGlite ya pasó y la discrepancia `items_combo`/`combo_items` está resuelta conceptualmente.
3. Orden SQL y artefactos fuente fijados por hash/revisión; grants, RLS/policies, SECURITY DEFINER y `search_path` aprobados y comprobados.
4. RPCs checkout/anulación instaladas en staging y lecturas de firma, cuerpo/versión, grants, tablas, triggers y policies verificadas.
5. Edge `checkout-manual` desplegada sólo en staging y verificada con JWT requerido; no service_role en frontend. `supervisor-pin` sólo si es necesario. ARCA/Point/Mercado Pago/tarjetas reales ausentes.
6. Build de staging separado y con ref/flag verificados antes de escribir; no reutilizar `.env.local` ni activar producción.
7. Sólo después, autorización explícita de fixtures de prueba y protocolo A/B; no crear fixtures antes de que el gate completo pase.

### Estado de Fase 4A.2

- [x] Registrar staging `acoyfwwmhaeruciyedri` y excluir `wlqujnwxrmksheubfrha` de operaciones.
- [x] Incorporar el inventario vacío informado por el usuario, distinguiendo su procedencia de una verificación independiente.
- [x] Inventariar fuentes SQL relevantes, contradicciones de esquema, cadenas de dependencias y primer candidato de lote.
- [x] Diseñar el orden de bootstrap y mantenerlo como propuesta no ejecutada.
- [x] Preparar matriz de alineación, sin crear archivo `.env` ni desplegar Edge.
- [ ] Verificar catálogos de staging con acceso de sólo lectura autenticado.
- [x] Preparar baseline canónico local y resolver `items_combo`/`combo_items`; comprobación auxiliar PGlite (2 tests) pasada.
- [ ] Ejecutar y revisar baseline en PostgreSQL real desechable; verificar policies, grants, owner, triggers y `search_path`.
- [ ] Obtener autorización separada para instalar SQL en el ref staging y luego crear fixtures.
- [ ] Mantener Fase 4B y `GO_ENTORNO` bloqueados hasta superar `GO_STAGING_INFRA`.

En esta actualización sólo se modificó este ExecPlan. No se ejecutaron SQL, `db push`, `db reset`, `migration repair`, consultas remotas, deploy, build, tests ni operaciones con datos. No se modificaron `.env.local`, `DECISIONS.md`, `src/`, funciones Edge ni el ref anterior. El working tree preexistente se conserva.

## Fase 4A.3 — Baseline canónico local para staging

### Alcance y restricciones

Se preparó un paquete local `supabase/bootstrap/` para una base vacía y descartable. No se conectó a Supabase, no se consultó ni escribió en `acoyfwwmhaeruciyedri`, no se tocó `wlqujnwxrmksheubfrha`, no se instalaron herramientas y no se ejecutaron migraciones, Edge Functions, fixtures, build de aplicación ni pruebas funcionales. `.env.local`, `.env.staging.local`, `DECISIONS.md` y el código de aplicación permanecen fuera del cambio de esta fase. El paquete no está autorizado para instalar en staging.

### Contrato de combos reconciliado

La fuente relacional vigente para recetas físicas es `public.combo_items`: la consumen `comboStore`, `useProducts`, `adminStore`, `pointQuoteBackend`, el SQL de checkout y las pruebas de combo/checkout/anulación. Se requiere la FK `combo_items_componente_producto_id_fkey`. La columna `promociones.items_combo` es JSONB independiente para promociones de tipo COMBO. La tabla relacional `items_combo` del SQL master no tiene consumidor runtime identificado y se excluye del baseline como legado. Esta distinción queda cubierta por la prueba local del baseline.

### Candidato y orden

El paquete candidato está en `supabase/bootstrap/README.md`, con DDL de dominio (`001_domain.sql`), helpers de identidad, módulos ordenados `steps/003`–`steps/029` y endurecimiento final (`900_final_security.sql`). Se basa en snapshots de SQL histórico enumerados en el README; los originales no se modificaron. La secuencia está destinada sólo a una instancia Supabase vacía, ejecutada como `postgres`, sin frontend ni fixtures hasta verificar todo el lote. El grant histórico para `envases_tipos_comercio` se omitió del módulo de lectura del Edge porque el modelo remoto compartido de envases queda fuera del piloto.

La prueba auxiliar `src/test/kioskoBootstrapSql.test.ts` ejecuta el paquete con PGlite, comprueba tablas/RLS, la separación `combo_items`/JSONB y ACL seleccionadas de checkout/anulación. Resultado: **2 tests pasaron**. PGlite es una comprobación de sintaxis/contrato auxiliar; no acredita compatibilidad completa con PostgreSQL/Supabase, roles administrados, ownership, políticas efectivas, Auth, Edge ni concurrencia.

### Modelo y límites

El baseline cubre identidad/kiosco, catálogo y combos físicos, stock/lotes FEFO, ventas/detalles/pagos, caja, cuenta corriente, costos históricos requeridos por checkout/anulación, auditoría, outbox/cancelación y anulación atómica. Incluye `supervisor_politicas`, que checkout consulta en cada cierre, y las estructuras de autorización de supervisor de la secuencia local. Excluye ARCA/CAE/notas de crédito, Point/Mercado Pago, refunds externos, stock compartido remoto de envases, devoluciones parciales y la compensación de cuenta corriente con abonos posteriores. El guard mínimo de devoluciones sólo permite que anulación detecte referencias existentes.

### Seguridad preparada

El paquete empieza revocando privilegios API sobre tablas, mantiene RLS y aplica grants/policies finales en el último módulo. El contrato propuesto reserva la confirmación manual a `service_role`/owner `postgres`, mantiene la anulación para `authenticated` con validaciones de identidad y rol dentro de la RPC, restringe políticas de lectura por kiosco y normaliza funciones `SECURITY DEFINER` a owner `postgres` y `search_path=pg_catalog,public`. Es una revisión estática más comprobación PGlite parcial, no un gate de seguridad aprobado. Deben verificarse en PostgreSQL real la sintaxis/semántica de catálogo, grants, owner, RLS/policies, triggers, firmas, search_path y supuestos del runtime Supabase antes de instalar.

### Estado y próximo gate

- `STAGING_IDENTIFICADO=PASS` (ref reportado por el usuario); `STAGING_VACÍO=PASS (reportado por el usuario)`. No se revalidaron remotamente en esta fase.
- `BASELINE_CANONICO=PENDIENTE`: candidato local preparado y PGlite auxiliar pasó; requiere restauración completa en PostgreSQL real desechable y revisión del resultado.
- `VALIDACION_POSTGRES_REAL=PENDIENTE`: no se encontró PostgreSQL, `psql`, `pg_ctl`, Docker, Podman ni Supabase CLI/servicio local disponible. No instalar herramientas en esta fase.
- `SEGURIDAD_BASELINE=PENDIENTE`: definición propuesta y parcialmente comprobada en PGlite; falta verificación sobre PostgreSQL/Supabase real.
- `GO_STAGING_INFRA=NO-GO`. No crear fixtures, aplicar bootstrap, desplegar Edge ni ejecutar Fase 4B hasta superar los gates locales y obtener autorización específica para la instalación en el ref de staging.

Siguiente paso recomendado: validar este paquete en un PostgreSQL/Supabase local descartable autorizado, conservando salida de catálogos para objetos, constraints/índices, triggers, policies, privilegios, owner y `search_path`. Corregir cualquier incompatibilidad detectada y repetir la prueba completa. Después presentar el artefacto revisado para autorización explícita de instalación en `acoyfwwmhaeruciyedri`; confirmar el ref inmediatamente antes de cualquier operación remota. El proyecto `wlqujnwxrmksheubfrha` sigue expresamente fuera de alcance.

## Fase 4A.4 — Preflight remoto detenido antes de SQL

La autorización de la fase delimita escrituras de esquema al ref `acoyfwwmhaeruciyedri` y prohíbe `wlqujnwxrmksheubfrha`. Se abrió el SQL Editor del Dashboard en la ruta que contiene exactamente el ref autorizado y la cabecera identifica el proyecto como `kioskopos-staging`; sin embargo, el selector de rama visible lo identifica como **`main PRODUCTION`**. La etiqueta es una señal de entorno inesperada frente al propósito declarado de staging.

Por el requisito de detenerse ante infraestructura inesperada, **no se ejecutó ninguna consulta SQL**, ni siquiera de preflight, y no se aplicó ningún archivo del paquete. No se conoció la versión PostgreSQL, los conteos actuales de tablas/funciones ni el inventario Edge de forma independiente. No hubo cambios remotos.

La CLI `supabase`, `psql`, `postgres`, `pg_ctl`, Docker y Podman no están disponibles localmente. El acceso visible al Dashboard no elimina la ambigüedad de la etiqueta de rama.

**Estado Fase 4A.4:** `PREFLIGHT=DETENIDO`; `ARCHIVOS_APLICADOS=NINGUNO`; `VALIDACION_POSTGRES_REAL=PENDIENTE`; `BASELINE_CANONICO=PENDIENTE`; `SEGURIDAD_BASELINE=PENDIENTE`; `GO_STAGING_INFRA=NO-GO`.

Para continuar se requiere confirmar que `main PRODUCTION` es una etiqueta esperada/no operativa para este proyecto aislado, o identificar un branch/proyecto de ensayo que el Dashboard marque inequívocamente como staging. Hasta resolverlo no ejecutar SQL ni instalar el baseline.

## Fase 4A.4 — Contrato canónico de movimientos de stock antes de step 005

### Estado remoto aportado

El usuario informa que en `acoyfwwmhaeruciyedri` se aplicaron y validaron `001_domain.sql`, `002_identity_helpers.sql`, `003_profile_integrity.sql` y `004_private_product_costs.sql`; `005_stock_history.sql` sigue sin ejecutarse. No se ejecutó SQL remoto durante esta corrección. `wlqujnwxrmksheubfrha` continúa prohibido.

### Auditoría de signo

- `001_domain.sql` define `movimientos_stock.cantidad numeric(12,3) CHECK (cantidad >= 0)`.
- El step 005 previo calculaba `v_delta` firmado para los tres tipos y lo guardaba directamente en `cantidad`. Esto rechazaba EGRESO y AJUSTE descendente por el CHECK; además, hacía que el registro no expresara un contrato único.
- En `registrar_movimiento_stock`, `p_cantidad` representa cantidad para INGRESO/EGRESO, pero para AJUSTE representa el conteo físico objetivo. El delta real es `p_cantidad - stock_actual`. Así se conserva la semántica de conteo, no se trata el objetivo absoluto como cantidad del movimiento.
- Checkout (`steps/008`) inserta EGRESO con magnitudes positivas (`tomar`, `restante`). Anulación (`steps/029`) suma esos EGRESO, valida `cantidad > 0` y registra su compensación como INGRESO positivo. No se alteraron estos módulos.
- Los caminos de checkout legacy en `PaymentModal`, `comboStore`, `offlineSyncStore` y reversión de compras en `proveedorStore` contienen EGRESO negativo. Esa convención contradice el CHECK canónico; el baseline final revoca DML de tablas al cliente, por lo que esos escritores directos no son una ruta operativa compatible con este baseline endurecido. No se modificó código de aplicación.
- `AuditoriaInventarioModal` escribe AJUSTE como delta firmado, mientras `stockMovementDisplay` muestra el campo `cantidad` sin consultar signo auxiliar. `StockPage` usa `registrar_movimiento_stock_idempotente`; esa RPC no forma parte del grant activo en el baseline final. La UI de ajustes/stock queda fuera de uso hasta adaptar su contrato/API en una fase posterior.
- `StockPage` lee filas con `select *` y delega la representación a `presentarMovimientoStock`, que sólo usa `tipo` y `cantidad`; `ConfigPage` exporta una lista explícita sin `delta_stock`; `exportUtils` imprime el signo de `cantidad` y calcula totales sólo de ingresos menos egresos. Por tanto, los ajustes descendentes perderían signo en la UI/exportación/backup si se usa el nuevo contrato sin adaptar frontend. `stockLossSummary` filtra EGRESO y usa valor absoluto; no interpreta AJUSTE.
- Los lectores SQL que suman `cantidad` lo hacen sobre EGRESO de checkout y comparan los positivos con las cantidades de detalle; para reconciliar cambios netos de stock que incluyan AJUSTE debe sumarse `delta_stock`, no `cantidad`. Los demás usos localizados son listados/exportaciones, filtros o conteos por tipo. Las pruebas `stockMigration.test.ts` describen SQL histórico separado y conservan su contrato legacy, no el baseline.

### Contrato elegido y cambio local

Contrato canónico: **magnitud no negativa en `cantidad`, efecto firmado en `delta_stock`**. INGRESO implica `delta_stock=+cantidad`; EGRESO implica `delta_stock=-cantidad`; AJUSTE guarda `cantidad=abs(delta_stock)` y el signo de `delta_stock` determina aumento/disminución. El tipo AJUSTE por sí solo no determina dirección.

Sólo se adaptó `supabase/bootstrap/steps/005_stock_history.sql`: agrega `delta_stock` nullable al DDL del step, instala un trigger de normalización, después exige `NOT NULL` y CHECK de correspondencia. Un movimiento con valores previos sin delta aborta la instalación para evitar inventar historia. La RPC mantiene su entrada de AJUSTE como stock objetivo, calcula delta y ahora persiste magnitud más delta. No se cambió `001_domain.sql` ni los steps de checkout/anulación; no hace falta modificar los módulos 001–004 ya aplicados si, como reporta el usuario, no contienen movimientos previos.

La normalización admite los escritores directos legacy de AJUSTE que pasan delta firmado y los EGRESO legacy negativos, y normaliza las filas a magnitud positiva. Eso no otorga DML a esos clientes: el contrato de grants del baseline sigue bloqueando escrituras directas autenticadas. Ingreso/Egreso en checkout/anulación ya vienen con magnitud positiva.

### Pruebas y estado

Se extendió `src/test/kioskoBootstrapSql.test.ts`. La ejecución PGlite del paquete completo comprobó ingreso, egreso, ajuste ascendente, ajuste descendente, CHECK efectivo contra cantidad negativa, deltas netos frente a stock, FEFO para ajuste descendente y formatos de fila de EGRESO/INGRESO usados por checkout/anulación; resultado **3 tests pasaron**. El test comprueba las filas normalizadas, no ejecuta los RPCs completos de venta/anulación sobre fixtures. PGlite sigue siendo auxiliar, no PostgreSQL remoto real.

`001_domain.sql` no cambió. Por lo tanto, la secuencia informada 001–004 puede continuar sin recreación **si se confirma que no se insertaron filas de negocio en movimientos_stock**; el step 005 falla cerrado si encuentra registros sin `delta_stock`. No se ejecutó ni preparó parche remoto en esta actualización.

Recomendación para retomar: verificar en staging, sólo lectura y con ref explícito, que la tabla está vacía y que los cambios 001–004 corresponden al paquete esperado; luego aplicar el `steps/005_stock_history.sql` local corregido como archivo completo. Si hay movimientos previos, detenerse: reconciliar explícitamente cada fila o recrear staging bajo autorización separada. Después validar la columna, trigger, CHECK, NOT NULL, resultado RPC y kardex antes de avanzar al step 006.

**Estado:** `CONTRATO_CANTIDAD=RESUELTO_LOCAL`; `STEP_005_LOCAL=PGlite_PASS`; `STEP_005_STAGING=PENDIENTE`; `001_CAMBIO=NO`; `STAGING_RECREACION=NO_REQUERIDA SI TABLA VACÍA`; `GO_STAGING_INFRA=NO-GO` hasta terminar la validación remota de schema/seguridad y reabrir explícitamente la secuencia de instalación.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR03, PR04, PR05, PR06, PR08 y PR09**.

El cierre histórico de cada fase sigue limitado a su evidencia. Completar matriz fiscal y comercial, concurrencia y recuperación hospedadas antes de declarar el circuito listo para Production.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.
