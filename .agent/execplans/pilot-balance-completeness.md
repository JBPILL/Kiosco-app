# Balance completo y errores explícitos del piloto

## Objetivo y contexto
Continuar el siguiente pendiente documentado en pilot-rotation-completeness.md:
BalanceContableTab limita ventas a 15000 y caja/devoluciones a 10000; proveedores,
compras y pagos provienen de un store con límites y fallback silencioso de caché.
Puede presentar un balance y exportar Excel después de una lectura parcial/fallida.

## Alcance y decisiones
Extraer una lectura propia para el informe: seis fuentes literales, paginación
por ID hasta página vacía, tenant obligatorio y período anual. Conservar filtros
y fórmulas actuales. Los proveedores activos se leen completos para la deuda
vigente; compras y pagos del año conservan su relación de proveedor (incluidos
proveedores luego inactivos). No usar ni alterar el fallback operativo del store.
Una carga publica las seis fuentes juntas; error/carga/cambio de comercio o año
ocultan métricas, detalle y exportación. Proteger respuestas fuera de orden.

## Límites y riesgos
Sólo lectura: sin SQL, caja, checkout, compras nuevas ni escrituras remotas.
No cambiar fórmulas fiscales/contables ni habilitar ARCA/Point. La lectura paginada
no es un snapshot transaccional y se identifica como informe de análisis.
Una fuente denegada por RLS bloquea el balance completo; no mostrar ceros falsos.

## Validación
Páginas cortas, filtros de las seis fuentes en cada página, strict sin columnas
fiscales, error tardío/datos nulos, montos y relaciones incompletas, sin tenant.
UI de error/reintento, exportación bloqueada y descarte de respuestas antiguas.
Lectura de helpers reales en Staging con JWT de ensayo, sin datos ni claves en
la salida. Suite/build, diff/index, manifest, secret scan y audit diagnóstico.

## Progreso
- [x] Delimitar fuentes y riesgo confirmado.
- [x] Helper completo y UI de carga atómica. Commit eac247f: seis fuentes propias
      paginadas, sin límite total ni fallback de caché; importes/fechas/detalles
      inválidos rechazan la carga. La UI bloquea las tres exportaciones y oculta
      métricas/ticket al cambiar comercio/año o al fallar una fuente.
- [x] Dirigidos conjuntos de Balance/devoluciones/contrato: 62 PASS / 6 archivos.
      Build PASS, 630 módulos. Lectura del helper real en Staging, con JWT Dueño
      del fixture suspendido: cinco ventas, seis movimientos y cinco devoluciones;
      proveedores/compras/pagos vacíos. Las páginas cortas y datos positivos de
      esas tres fuentes se probaron localmente; no se inventaron compras remotas.
      Evidencia: ../pilot-balance-staging-result.json. Sólo lectura, sin secretos
      ni datos comerciales en la salida. Vista local del error y exportaciones
      bloqueadas: ../pilot-balance-error-preview.png (datos ficticios).
- [x] Suite final de eac247f: 2038 PASS / 1 skipped / 217 archivos, 414,22 s.
      Build 630 módulos PASS; diff/index y manifest de 43 SQL PASS. Audit 0.
      Scan de 1125 textos: mismos 46 candidatos sintéticos/ejemplos/PEM conocidos;
      14 binarios e historial excluidos. Sin secretos nuevos detectados.
      Registro persistido fuera del checkout: ../pilot-final-suite.log y
      ../pilot-final-suite-result.json. La ejecución anterior perdió su salida al
      interrumpirse la conversación; no se contó como PASS y se repitió completa.
      Publicación junto a la corrección de devoluciones en PR #3, sin merge.

## Resultado
Implementación, suite/build y aceptación de lecturas Staging completas, para
PR #3 sin merge. El alcance no certifica el resto del piloto ni
hardware, ni transforma la lectura paginada en snapshot transaccional.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR05, PR06, PR09 y PR11**.

Completar conciliación de venta/pagos/caja, período argentino y clasificación comercial/fiscal; errores y falta de datos deben seguir explícitos.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.
