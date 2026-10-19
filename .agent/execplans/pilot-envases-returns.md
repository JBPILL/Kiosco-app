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

La primera devolución exige venta original íntegramente en efectivo, no fiscal y
sin recepción de envases. La devolución/anulación de tickets con esos créditos
está bloqueada hasta conciliar vacíos y crédito. Se consultó la regla pendiente:
conservar vacíos/reintegrar artículo, devolver vacíos/efectivo neto, o elección
del Dueño por operación. No implementar ni asumir esa regla sin respuesta.
Cuenta corriente, pagos mixtos,
refunds externos, ARCA/WSFE y Point siguen fuera. Ticket v1 usa pesos enteros;
envases con centavos deben recibirse en efectivo. La cotización existente limita
el catálogo a 100 tipos activos. La marca de entrega y el bloqueo de cierre son
del dispositivo, no coordinación física global. Conciliar vacíos locales por
conteo real, nunca sumarlos entre puestos. Impresión física pendiente.

## Resultado
Implementación validada localmente y mediante ensayos backend en Staging, publicada
en PR #3. SQL y checkout-manual instalados sólo en Staging; operaciones ficticias
conservadas en comercio aislado y suspendido. El frontend no se habilitó para los
comercios existentes. No se presenta como activación real ni como aceptación de
Production; quedan los gates de interfaz, conciliación e integración autorizada.
