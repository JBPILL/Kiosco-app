# Respaldo operativo mediante snapshot SQL

## Cambio y alcance

`generarBackupIntegral` obtiene el archivo 3.0 desde `generar_snapshot_backup(p_kiosco_id)`. La función agrega todas las filas de las seis colecciones declaradas en un único valor JSONB y toma el costo de `producto_costos`. El frontend verifica formato, comercio, conteos y alcance antes de descargar o cifrar.

La consulta anterior pedía `.limit(50000)` para cada tabla y todos los costos en una única lista de IDs. Esas solicitudes no aseguraban recuperar todas las filas bajo límites del servicio. El agregado SQL devuelve un valor escalar con arrays internos; no devuelve una tabla de registros paginados. [Formato de respuestas RPC de PostgREST](https://docs.postgrest.org/en/stable/references/api/functions.html#scalar-functions).

La función es `STABLE`: sus lecturas utilizan el snapshot de la sentencia que la llama. Se verificó con una escritura dentro de la misma sentencia que el respaldo ve el estado previo coherente, mientras la consulta siguiente ve el cambio aplicado. [Snapshots de funciones STABLE en PostgreSQL](https://www.postgresql.org/docs/current/xfunc-volatility.html).

El alcance continúa siendo productos, categorías, clientes, proveedores, promociones y lotes. No es una copia completa de PostgreSQL: excluye ventas, movimientos de caja y credenciales. La configuración no secreta y las relaciones entre módulos necesarias para una recuperación completa siguen pendientes de ampliar y validar.

## Activación

Aplicar `supabase_fase_backup_integral.sql` en una base de prueba, después de:

1. `supabase_seguridad_roles_rls.sql`.
2. `supabase_fase_seguridad_perfiles.sql`.
3. `supabase_fase_seguridad_costos_privados.sql`.

La migración incluye `NOTIFY pgrst, 'reload schema'` para refrescar el esquema RPC. Solo concede ejecución a `authenticated` y `service_role`; dentro de la función comprueba dueño activo del comercio, superadmin o backend de servicio. El navegador usa la sesión autenticada existente; no recibe credenciales de servicio.

**Sin esta migración, la nueva descarga muestra que el servicio de respaldo aún no está habilitado.** No vuelve a las consultas antiguas que podían generar una copia truncada. Los archivos 2.0 y 3.0 existentes mantienen su flujo de importación; este cambio afecta la generación.

No se aplicó la migración en una instancia remota durante esta ejecución.

## Verificación local

```powershell
npm test -- --run src/lib/backupSnapshot.test.ts src/lib/backupExport.test.ts src/lib/afipBackup.test.ts
npm test -- --run
npm run build
```

- 9 casos SQL sobre PostgreSQL en memoria: 1502 productos, costos reales, aislamiento de todas las colecciones, dueño/cajero/superadmin, perfil desactivado, acceso anónimo, backend de servicio, comercio vacío y snapshot consistente.
- 8 casos de descarga: contenido completo, permisos rechazados, conteos contradictorios, comercio incorrecto, cifrado y recuperación del contenido, función no instalada, caída de red y alcance que declara credenciales.
- La suite completa terminó con **408 pruebas en 24 archivos** y build exitoso. Persiste el aviso conocido de tamaño del bundle principal.

## Restauración: errores parciales

La recuperación deja de declarar éxito si alguna operación informa un error. Proveedores y clientes solo se cuentan como actualizados si la petición no fue rechazada. Promociones y lotes registran los errores del servidor y las excepciones; los lotes sin producto asociado y registros sin nombre quedan en el informe. Los inserts sin confirmación del registro también se informan como incompletos.

El modo reemplazo desactiva artículos al final, después de recuperar las seis colecciones, y solo si no se acumularon errores. Las desactivaciones rechazadas no incrementan el contador. Las actualizaciones y desactivaciones agregan el filtro explícito del comercio. Las cachés del catálogo se limpian también cuando una lectura posterior falla, porque las escrituras anteriores ya pueden haberse aplicado.

El modal presenta los errores y conserva el resumen de cambios, sin ofrecer el botón de reintento inmediato sobre ese mismo resultado. El texto explica que la recuperación opera por etapas y no garantiza rollback automático.

Se agregaron 9 pruebas con cliente Supabase simulado, inicialmente 7 de los 8 casos originales fallaron por los errores descritos. La suite final cubre rechazos de proveedores/clientes/promociones, protección de reemplazo ante errores de productos y promociones, desactivaciones rechazadas, lotes huérfanos, limpieza de caché tras una falla posterior y éxito sin errores. No sustituye la recuperación sobre el esquema PostgreSQL completo ni prueba visualmente el modal.

Las actualizaciones de proveedores, clientes y productos ahora solicitan `.select('id')` y exigen recibir el ID esperado antes de incrementar el contador. Las desactivaciones cuentan los IDs esperados devueltos y registran los faltantes. Una respuesta sin error y sin filas ya no se declara exitosa. La devolución de filas después de un update requiere encadenar select, como indica la [referencia oficial de Supabase](https://supabase.com/docs/reference/javascript/update).

Se agregaron 7 casos: tres respuestas sin filas, tres actualizaciones confirmadas y una desactivación parcialmente confirmada. Los cuatro casos negativos fallaban antes de corregir la implementación. Estas respuestas están simuladas; falta comprobarlas con RLS y PostgREST reales.

## Identidad de promociones y lotes al reintentar

La restauración conserva el ID original en el mismo comercio. Para otro destino genera un UUID reproducible con SHA-256 sobre origen, destino, tabla e ID original. Consulta ese ID dentro del destino; si existe lo actualiza con filtro de comercio, y si no lo inserta. No usa upsert que pueda reasignar un ID existente de otro comercio. Una carrera entre dos inserts concurrentes se informa como conflicto de clave primaria; no crea dos identidades distintas para el mismo registro. Un reintento posterior puede actualizar el registro.

Se exige identidad original de registro y comercio; los archivos antiguos que no la contienen muestran un error de esos registros en lugar de crear nuevas promociones/lotes sin una clave estable. Las copias creadas por el snapshot incluyen esas identidades. Registros ya duplicados por el restaurador anterior no se eliminan automáticamente.

Las promociones usan ahora los campos del esquema vigente (`NXM`, `VOLUMEN`, `PORCENTAJE`, `COMBO`, cantidades/precios/descuentos, fechas y referencias). Se remapean producto, categoría y componentes del combo, y se rechaza la promoción si una referencia no fue recuperada. Los campos anteriores `valor`, `hora_desde`, `hora_hasta`, `fecha_desde` y `fecha_hasta` no pertenecían al modelo actual y podían provocar el rechazo de la escritura. Cada promoción/lote exige la devolución del ID confirmado.

Tres pruebas de identidad usan Web Crypto real: ID local preservado, UUID reproducible y separación por origen/destino/tabla, y rechazo de identidad ausente. Tres casos adicionales con Supabase simulado prueban insertar una promoción/lote una sola vez y actualizarlo al repetir, y un rechazo explícito de inserción de promoción. Falta verificar la repetición y concurrencia en PostgreSQL/PostgREST con el esquema completo y agregar cobertura de remapeo de combos.

Pendiente: transacción de restauración, paginación de lecturas existentes, resolución de identidades ambiguas de productos/clientes/proveedores, relaciones adicionales y verificación real de la recuperación repetida. No se considera terminada la fase por estas correcciones.

Los casos SQL utilizan funciones de roles y migraciones reales con un esquema mínimo y autenticación emulada. Los casos de descarga usan una RPC simulada y cifrado real de Web Crypto. No prueban la validación de JWT, el esquema completo ni los límites de tamaño/tiempo del gateway remoto.

## Puerta de salida pendiente

Probar el endpoint mediante PostgREST con cuentas reales y comparar conteos/costos contra la base de prueba. Medir tiempos y tamaños con inventarios representativos; si un límite del gateway impide la operación, la aplicación debe informar el error y no descargar una copia parcial.

Completar restauración y comparación de datos con el esquema real, configuración no secreta, relaciones entre módulos, copias automáticas, retención e indicador de última copia externa. Mantener respaldo administrado de PostgreSQL para recuperar las colecciones excluidas del archivo operativo.

## Autoevaluación

| Criterio | Puntaje | Evidencia y mejora |
|---|---:|---|
| Exactitud | 4/5 | SQL y cifrado ejecutados; falta el transporte real de PostgREST y su esquema completo. |
| Completitud | 3/5 | Generación consistente verificada; recuperación completa, configuración y automatización aún pendientes. |
| Claridad | 4/5 | Configuración explica alcance y migración; falta vista del estado de la última copia externa. |
| Accionabilidad | 4/5 | Migración y pruebas reproducibles; requiere validar su instalación en la base de prueba remota. |
| Concisión | 4/5 | Función y pruebas dedicadas; la construcción del JSON será más extensa al ampliar colecciones. |

Promedio: **3,8/5**. Para elevar completitud a 4/5, cerrar restauración/configuración y la estrategia de copias externas. La fase de respaldo y el objetivo completo permanecen abiertos.
