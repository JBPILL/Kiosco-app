# Relaciones del respaldo y componentes pendientes

## Comportamiento comprobado

Las copias 3.0 y 4.0 se validan al leer el archivo y antes de restaurar.
Se rechazan identificadores ausentes o duplicados, registros de otro comercio y
referencias a categorías, proveedores, productos o componentes de promociones
que no están incluidos en la copia. No se escribe antes de esta validación.

Si falla la creación de una categoría o proveedor durante la restauración,
no se guarda el producto dependiente sin esa relación. Los lotes sólo usan
identificadores de productos cuya restauración quedó confirmada.
La operación completa todavía no es atómica: los cambios anteriores a un error
se conservan y se informan como restauración incompleta.

## Combos físicos: trabajo pendiente

`generar_snapshot_backup` incluye los campos del producto mediante `to_jsonb`,
incluido `es_combo`, pero no exporta `combo_items`. La restauración del catálogo
tampoco recupera esas filas. Por ahora se rechazan las copias 3.0/4.0 con
`es_combo=true` para evitar declarar una recuperación que perdió componentes.
Esta protección es transitoria y no satisface el requisito de recuperar combos.

Para terminar esa recuperación se necesita:

1. Exportar componentes dentro del mismo snapshot y comercio.
2. Validar cantidades, productos relacionados y ciclos.
3. Remapear ambos productos del componente al comercio destino.
4. Reemplazar componentes y activar el combo en una operación atómica del servidor.
5. Verificar permisos, reintentos y stock derivado con una restauración real aislada.

Las copias antiguas 2.0 no tienen las garantías completas de relaciones de 3.0/4.0.
Una copia PostgreSQL debe probarse en un entorno separado antes de confiar en ella.

## Evidencia local y autoevaluación

61 pruebas aprobadas en cinco archivos de respaldo, incluidas fallas de categorías,
proveedores y productos. No hubo restauración remota ni comprobación física.

| Criterio | Nota | Evidencia o mejora pendiente |
| --- | --- | --- |
| Exactitud | 4/5 | Casos locales aprobados; falta ejecución remota. |
| Completitud | 2/5 | Los componentes físicos todavía no se exportan ni recuperan. |
| Claridad | 4/5 | Error explícito y límites documentados; falta un flujo de recuperación de combos. |
| Acción posible | 3/5 | La protección evita pérdidas silenciosas; falta la migración de componentes. |
| Concisión | 4/5 | Informe acotado al problema y siguientes requisitos. |
