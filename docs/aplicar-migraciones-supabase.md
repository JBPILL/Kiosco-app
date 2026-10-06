# Aplicar las mejoras SQL de KioskoPOS en Supabase

## 1. Preparar el proyecto

Abrí el Dashboard de Supabase y seleccioná el proyecto que usa KioskoPOS. Confirmá su identidad antes de ejecutar SQL. Primero aplicá el procedimiento en una base de prueba con el esquema completo.

Guardá un respaldo de la base antes de migrar. El JSON operativo de KioskoPOS no incluye ventas, caja ni todas las relaciones. Revisá Database > Backups y la disponibilidad de recuperación de tu proyecto; para proyectos sin copias administradas disponibles, prepará un dump externo. Los objetos de Storage necesitan su propia copia. Ver [respaldos de Supabase](https://supabase.com/docs/guides/platform/backups).

## 2. Comprobar el esquema y perfiles

En SQL Editor, creá una consulta nueva y ejecutá:

```sql
SELECT nombre, to_regclass('public.' || nombre) AS tabla
FROM unnest(ARRAY['kioscos','usuarios','productos','categorias','clientes',
  'proveedores','promociones','lotes_producto','movimientos_stock','ventas','auditoria']) AS nombre;

SELECT auth_user_id, count(*) AS perfiles
FROM public.usuarios
WHERE auth_user_id IS NOT NULL
GROUP BY auth_user_id HAVING count(*) > 1;
```

Todas las tablas deben existir. Si aparecen identidades duplicadas, resolvé cuál es el perfil legítimo antes de avanzar; la migración de perfiles aborta ante duplicados y no elimina datos. Si falta una tabla/columna, conservá el mensaje de error y revisá el esquema instalado antes de continuar. No ejecutes todos los SQL históricos del repositorio: algunos corresponden a versiones alternativas.

## 3. Ejecutar los archivos en orden

Abrí cada archivo del repositorio, copiá su contenido completo en una consulta nueva del SQL Editor y ejecutá Run. Guardá la consulta con el nombre del archivo y anotá el resultado. El SQL Editor permite ejecutar y guardar consultas, según la [documentación de Supabase](https://supabase.com/docs/guides/database/overview).

| Orden | Archivo | Propósito |
|---|---|---|
| 1 | `supabase_seguridad_roles_rls.sql` | Funciones de autorización y políticas base. |
| 2 | `supabase_fase_seguridad_perfiles.sql` | Protege roles, identidad y privilegios. |
| 3 | `supabase_fase_seguridad_costos_privados.sql` | Migra los costos reales a una tabla protegida. |
| 4 | `supabase_fase_auditoria_anulaciones.sql` | Protege motivo, actor y auditoría de anulaciones. |
| 5 | `supabase_fase_auditoria_precios.sql` | Restringe y audita cambios de precio. |
| 6 | `supabase_fase_backup_integral.sql` | Habilita el snapshot operativo con costos privados. |
| 7 | `supabase_fase_mermas_trazables.sql` | Registra costo histórico, lotes y movimientos de stock. |
| 8 | `supabase_fase_capacidades_multirrubro.sql` | Agrega capacidades configurables por comercio. |
| 9 | `supabase_fase_stock_idempotente.sql` | Evita duplicar movimientos manuales al reintentar la misma solicitud. Requiere el paso 7. |
| 10 | `supabase_fase_costos_movimientos_privados.sql` | Protege snapshots históricos de costos de stock. Requiere los pasos 3 y 7. |
| 11 | `supabase_fase_reporte_bajas_stock.sql` | Consulta autorizada de bajas del período completo. Requiere el paso 10. |

Si una consulta falla, detené la secuencia y guardá el error completo. Los archivos con BEGIN/COMMIT se ejecutan completos; si quedó una transacción abortada, ejecutá ROLLBACK antes de reintentar. No repongas costos privados en la columna pública como rollback. La aplicación actualizada necesita estas migraciones: sin la RPC de snapshot no genera nuevos respaldos.

## 4. Verificar instalación y acceso

```sql
SELECT to_regclass('public.producto_costos') AS costos_privados,
       to_regprocedure('public.generar_snapshot_backup(uuid)') AS snapshot;

SELECT count(*) AS costos_publicos_no_cero
FROM public.productos WHERE precio_costo <> 0;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('usuarios','productos','producto_costos','ventas','auditoria','lotes_producto','movimientos_stock')
ORDER BY tablename, policyname;

SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

NOTIFY pgrst, 'reload schema';
```

El conteo de costos públicos no cero debe ser cero después de la migración. Que aparezcan tablas y triggers confirma su instalación, pero no demuestra los permisos efectivos. Revisá políticas adicionales permisivas: pueden ampliar acceso al combinarse con OR. No elimines políticas sin identificar su propósito y dependencia.

Desde KioskoPOS, con sesiones reales separadas:

- Dueño: crear producto con costo, guardar costo cero, cambiar precio, descargar respaldo y verificar los seis conteos y costos en un comercio de prueba.
- Cajero: comprobar que no obtiene costos privados ni puede elevar rol, cambiar precios de catálogo o anular ventas.
- Otro comercio: comprobar aislamiento de productos, costos y respaldo.
- Dueño: registrar una merma y verificar stock, lote y movimiento; comprobar costo histórico y reversión coherente ante error.
- Ajustes: guardar capacidades, recargar y comprobar su persistencia.

Probá la restauración en la base de prueba; todavía aplica escrituras por etapas y no garantiza rollback global. No uses una restauración de ensayo sobre el comercio activo.

## 5. Publicar la aplicación

Después de aplicar y comprobar el SQL del entorno destino, desplegá el frontend actualizado. `git push` publica código en GitHub; no ejecuta estas migraciones en Supabase. Si el hosting despliega automáticamente desde master, coordiná la migración SQL antes de usar la nueva versión.

Estado de esta sesión: SQL preparado y comprobado parcialmente con PostgreSQL local en memoria; no aplicado a Supabase remoto. Las verificaciones de mermas, JWT/PostgREST y esquema completo siguen pendientes.

Actualización de mermas: la migración corrigió el descuento de lotes en ajustes negativos, rechaza cantidades de más de tres decimales y habilita ejecución del backend de servicio. Si ya ejecutaste el paso 7 antes de esta corrección, volvé a ejecutar ese archivo completo. Ver alcance de las pruebas y conciliación pendiente en `docs/verificacion-mermas-postgresql.md`.

El frontend con reintentos seguros necesita también el paso 9. Sin esa función, el movimiento informa un error; no recurre a una escritura sin protección contra duplicados. La función anterior permanece disponible para clientes anteriores.

El paso 9 incluye ahora `resolver_operacion_stock` para la pantalla de pendientes. Reaplicá el archivo si ejecutaste su versión inicial. Consultar una operación ausente no la cancela; cancelar reserva su identificador e impide que una solicitud demorada se ejecute luego. Cancelar una operación aplicada informa su resultado y no revierte el movimiento.

El paso 10 copia los costos históricos conocidos a `movimiento_stock_costos` con acceso restringido y deja NULL la referencia pública. No completa históricos desconocidos con precios actuales. El historial actualizado del dueño necesita esta relación instalada. Si reaplicás mermas, usá su versión actual, que conserva esta protección; después reaplicá el paso 10 para verificar funciones y triggers.

Comprobación posterior al paso 10:

```sql
SELECT count(*) AS snapshots_publicos_expuestos
FROM public.movimientos_stock WHERE costo_unitario_referencia IS NOT NULL;
```

Debe devolver cero. Luego comprobá con sesiones reales que el dueño puede leer sus snapshots privados y el cajero/otro comercio no los obtiene.

El paso 11 es nuevo: supabase_fase_reporte_bajas_stock.sql. Instala un reporte de gestión de bajas del período completo, autorizado para dueño/superadmin. No requiere reejecutar los pasos anteriores si sus versiones actuales ya están instaladas. Después de aplicarlo, comprobá la existencia con:

```sql
SELECT to_regprocedure('public.resumir_bajas_stock(uuid,date,date)') AS reporte_bajas;
```

Con una sesión de dueño en la aplicación actualizada, abrí Reportes > Bajas de Inventario y elegí el rango. Compará movimientos por motivo y snapshots conocidos con los registros del comercio. Probá también un período vacío y un cajero (no debe obtener costos mediante la función). No ejecutes la prueba de permisos únicamente desde SQL Editor con su rol administrador: eso no representa una sesión de usuario. Esta nueva migración aún no se aplicó remotamente desde la sesión de Codex.

## Paso 12: equipos del comercio

Antes de publicar el formulario nuevo, ejecutá el archivo completo
`supabase_fase_equipos_comercio.sql` en SQL Editor. Agrega una columna JSON
opcional a kioscos; conserva los comercios existentes y sus políticas de acceso.
No exige conocer todavía el modelo de los dispositivos.

Después, en Configuración > General > Equipos del comercio, registrá tipo,
marca/modelo y conexión de impresora y lector; el modelo e ID opcional de
Terminal Point; y observaciones. Pulsá Guardar Cambios del Comercio.
Salí y volvé a entrar para comprobar la persistencia.

Es un registro compartido del comercio, no el permiso de conexión del navegador.
Los datos declarados quedan con compatibilidad por verificar. No ingreses claves,
tokens ni credenciales en esos campos. Esta migración no se ejecutó remotamente
desde Codex; la confirmación de persistencia real queda pendiente.

El guardado verifica que Supabase devuelva el ID del comercio actualizado.
Si una política impide actualizarlo, no muestra éxito. Si falta la columna
equipos_comercio, indica explícitamente el archivo SQL necesario. Los campos
de identificación se limitan a 150 caracteres y las observaciones a 500.

## Paso 13: precios compartidos de envases (preparación de Point)

`supabase_fase_envases_precios_compartidos.sql` crea el catálogo de tipos y
precios por comercio. Requiere las funciones de seguridad de roles previamente
instaladas. Se puede aplicar completo y volver a aplicar. No copia los datos
de este navegador ni modifica el stock de envases vacíos.

El guardado se realiza mediante `guardar_precios_envases(uuid,jsonb)` con sesión
de dueño. El JSON contiene sólo `id`, `nombre` y `precio` por tipo; es un reemplazo
completo y los tipos omitidos se desactivan. La función valida duplicados y
decimales y revierte todo ante un error. Cajeros pueden consultar precios de su
comercio pero no modificarlos; otro comercio no puede leerlos ni guardarlos.

Validado localmente con tres pruebas PostgreSQL: reaplicación, reemplazo,
rollback y denegación de escritura. La fixture simula las funciones de identidad;
todavía falta comprobar las políticas con sesiones reales en Supabase.
Después de aplicar el SQL, abrí Catálogo > Precios de envases > Tipos Oficiales.
Con sesión de dueño, revisá los precios de este puesto y pulsá **Publicar precios
de este puesto**. Reemplaza el catálogo compartido con todos los tipos actuales.
En otro puesto, pulsá **Cargar precios compartidos**. Conserva su stock de vacíos;
tipos locales ausentes del catálogo remoto permanecen con aviso de revisión y
no deben usarse para devoluciones Point hasta tener precio compartido activo.

La carga es explícita: no sincroniza automáticamente todos los navegadores. Los
precios de depósito de productos retornables se guardan por separado desde el
catálogo. La interfaz no está verificada todavía con sesiones reales o fallas
de red en producción. Aplicar sólo la migración deja el catálogo vacío y aún no
habilita cobros Point.

## Paso 14: aislamiento de componentes de combos

Aplicá `supabase_fase_seguridad_combos.sql` después de `supabase_combos.sql` y
las funciones de seguridad de roles. Protege `combo_items`, que es la tabla usada
por el código. La migración maestra también contiene una tabla distinta,
`items_combo`; protegerla no garantiza protección de la que utiliza el POS.

El script antiguo de combos agrega políticas permisivas. Esta migración instala
guardas restrictivas que siguen vigentes aunque se reaplique ese script: lectura
por comercio, modificación por dueño/superadmin, componentes del mismo comercio
y denegación anónima. Rechaza componentes idénticos al padre y cantidades que no
sean positivas o tengan más de tres decimales. No migra recetas entre las dos
tablas ni borra datos existentes.

Cuatro pruebas PostgreSQL locales verifican lectura aislada, cajero sin escritura,
componentes ajenos, cantidades y acceso anónimo tras una política/grant permisivos posteriores.
Las funciones de identidad se simulan en la fixture; verificá después con sesiones
reales de dueño, cajero y otro comercio. El guardado actual de recetas todavía usa
varias solicitudes y conserva cambios locales si falla el servidor: esta migración
no lo transforma en una transacción ni demuestra sincronización offline.
