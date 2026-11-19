# Rotación completa y errores explícitos del piloto

## Objetivo y problema
Completar la consulta del informe de rotación sin truncamiento silencioso ni
clasificación de todo el inventario como inmovilizado cuando falla la lectura.
Hoy RotacionTab pide 10.000 filas sin paginar, consulta costos en URLs enormes y
convierte errores de ventas en historial vacío. Sus indicadores y Excel pueden
presentarse como válidos con productos cacheados y ventas faltantes.

## Alcance y componentes
Extraer lectura paginada por ID a un helper, reutilizar leerColeccionPorId,
mantener tenant obligatorio, productos activos, ventas COMPLETADAS y ventana
de 90 días. Costos protegidos únicos por lotes de 200. Actualizar UI sólo tras
lectura completa; mostrar error/reintento sin indicadores, exportación ni acciones
de liquidación cuando falten datos. Invalidar respuestas antiguas/cambio de tenant.
Componentes: RotacionTab, helper y pruebas dirigidas. Sin SQL ni datos remotos.

## Límites y riesgos
No habilitar devoluciones, Point, envases, ARCA ni integrar PR #1. No ampliar
ventana histórica ni cambiar fórmulas/definiciones de rotación. Lecturas paginadas
no son un snapshot transaccional. Se retira fallback de caché únicamente de este
informe, para no presentar estimaciones incompletas como datos confirmados.

## Validación
Páginas cortas hasta vacía, filtros en cada página, costos por lotes, errores
tardíos, datos nulos, tenant ausente y falta de exportación ante error. UI de
carga/error/reintento y respuestas fuera de orden. Dirigidos, suite, build,
diff/index, escaneo sin valores y audit diagnóstico. Push normal con gates verdes.

## Progreso
- [x] Revisar flujo y delimitar bloque.
- [x] Helper paginado y UI que rechaza resultados incompletos.
- [x] Regresiones dirigidas: 26 PASS / 5 archivos. Tests anteriores conservados,
      fixtures con páginas vacías finales; costos unificados/deduplicados. Mock
      compartido admite gt sin modificar su resolución de respuestas.
- [x] Suite final: 1886 PASS / 1 skipped / 202 archivos, 259,55 s. Build PASS,
      614 módulos. Audit 0; diff/index PASS.
      Escaneo: mismos 44 candidatos sintéticos conocidos, sin nuevos candidatos;
      binarios e historial no escaneados.
- [x] Publicación por push normal de 03a798f a master. Vercel Staging/Production
      success y versión pública index-CrwWtbi7.js con la corrección comprobada.

## Resultado
Corrección validada y publicada. No se presenta como certificación de concurrencia,
snapshot transaccional ni ensayo hospedado de datos.

## Pendientes detectados para siguientes bloques
BalanceContableTab conserva límites de 15.000 ventas y 10.000 movimientos/
devoluciones sin paginación; sus fuentes de compras/pagos también requieren
revisión conjunta para no declarar un balance completo sólo por paginar ventas.
No se modifica ese bloque en esta corrección de rotación. La impresión física
sigue pendiente. El cambio no equivale a aprobación integral de todo el piloto.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR05, PR06, PR09 y PR11**.

El reporte local completo requiere aceptación de períodos/actores/datos hospedados y conciliación; no sustituir datos ausentes por ceros o estimaciones sin identificar.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.
