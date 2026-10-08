# Relaciones del respaldo y recuperación de combos

## Instalación

Después de las fases de respaldo integral y ampliado, aplicar en Supabase SQL Editor:

1. `supabase_fase_backup_combos.sql` (49): actualiza el snapshot base para incluir
  `componentes_combo` dentro de cada producto. El snapshot ampliado 4.0 usa esta
  función y conserva configuración, saldos y costos privados.
2. `supabase_fase_restaurar_combos_backup.sql` (50): instala la recuperación de
  componentes, accesible únicamente al dueño activo del comercio.

El push a GitHub no aplica estas migraciones. Su aplicación remota está pendiente.
Una copia nueva debe contener los componentes de cada producto con `es_combo=true`.
Las copias 3.0/4.0 antiguas con combos sin componentes se rechazan explícitamente.
La recuperación de combos desde 2.0 no está permitida.

## Validación y restauración

Las copias 3.0 y 4.0 se validan al leer el archivo y antes de restaurar.
Se rechazan identificadores ausentes o duplicados, registros de otro comercio y
referencias a categorías, proveedores, productos o componentes ausentes.
Los combos físicos exigen entre 1 y 1000 componentes únicos, cantidades positivas
y finitas, sin referencias a sí mismos ni a otros productos virtuales.

Si falla la creación de una categoría o proveedor, no se guarda el producto
dependiente sin esa relación. Los lotes y componentes sólo usan identificadores
de productos cuya restauración quedó confirmada. Primero se convierten en físicos
los productos que eran combos en el destino y ahora son componentes.

Cada composición se sustituye en una transacción del servidor: valida dueño,
comercio activo, productos y cantidades; bloquea los productos; reemplaza las
filas; comprueba la composición almacenada y actualiza `es_combo`. Un fallo
revierte esa operación. Reintentar no duplica componentes. La caché local de
combos se invalida al terminar para cargar nuevamente los datos del servidor.

La restauración completa del catálogo **no es atómica**: los cambios anteriores
a un error se conservan y se informan como restauración incompleta.
Las copias 2.0 no tienen todas las garantías de relaciones de 3.0/4.0.

## Comprobación pendiente en un entorno separado

1. Aplicar 49 y 50 y generar una copia nueva con un pack de dos componentes.
2. Restaurar en un comercio de ensayo y comparar cantidades y stock derivado.
3. Reintentar: debe conservar una sola composición por pack.
4. Probar como cajero y con componentes de otro comercio: debe rechazarse.
5. Conservar evidencia de la restauración completa, incluyendo saldos y costos.

Pasaron 88 pruebas en siete archivos de respaldo. Las pruebas locales incluyen
PostgreSQL en PGlite, denegación por rol,
usuario inactivo, comercio suspendido, productos ajenos, cantidades inválidas,
reintentos, remapeo y reversión ante un fallo de inserción.
No se ha realizado una restauración remota ni un piloto de ventas del pack.

## Autoevaluación

| Criterio | Nota | Evidencia o mejora pendiente |
| --- | --- | --- |
| Exactitud | 4/5 | SQL y contratos probados; falta aplicación remota. |
| Completitud | 3/5 | Combos recuperables; falta verificar una restauración integral real. |
| Claridad | 4/5 | Orden y límites documentados; historial de migraciones extenso. |
| Acción posible | 4/5 | SQL y pasos disponibles; requieren ejecución en Supabase. |
| Concisión | 4/5 | Guía acotada a instalación, comportamiento y prueba pendiente. |
