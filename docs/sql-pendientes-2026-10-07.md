# SQL de actualización — 7 de octubre de 2026

Esta lista corresponde a una base existente de KioskoPOS, con tablas comerciales, caja, cuenta corriente, combos, lotes y columnas fiscales ya instaladas. No es un instalador para una base vacía. Los SQL históricos de creación, limpieza de demos y variantes de reparación no forman parte del paquete.

## Cómo aplicarlos

1. Abrí el proyecto de ensayo correcto en Supabase y guardá un respaldo de la base.
2. Abrí SQL Editor. Copiá un archivo completo y ejecutá Run; conservá BEGIN/COMMIT.
3. Seguí el orden numerado. Si falla, detenete y compartí el error completo. Si quedó una transacción abortada, ejecutá `ROLLBACK;` antes del reintento.
4. Anotá los nombres aplicados. Si ya instalaste la versión actual de un archivo, podés omitirlo; no tengo acceso al registro remoto para identificarlo por vos.

Actualización del 08/10: el usuario informó que aplicó los SQL enviados y confirmó el éxito de la migración de caja compartida (46). No hay un registro remoto completo inspeccionado por el agente. Esta tabla es el orden de referencia, no una instrucción de reaplicar todo. Verificá funciones y privilegios antes de deducir que una fase está instalada. El guardado de PIN fue confirmado por el usuario; el cobro completo con cajero, caja compartida y PIN sigue pendiente de aceptación remota.

El ZIP de pendientes contiene **16 SQL (18–33)** y esta guía. La tabla siguiente conserva las referencias anteriores para comprobar dependencias, pero no te indica que vuelvas a ejecutar todos los SQL antiguos. En particular, el archivo 15 histórico recrea una vista con CASCADE: si ya está instalado el rubro, no lo reapliques como parte de esta actualización.

## Orden completo de las mejoras

| Nº | Archivo |
| --- | --- |
| 01 | supabase_seguridad_roles_rls.sql |
| 02 | supabase_fase_seguridad_perfiles.sql |
| 03 | supabase_fase_seguridad_costos_privados.sql |
| 04 | supabase_fase_auditoria_anulaciones.sql |
| 05 | supabase_fase_auditoria_precios.sql |
| 06 | supabase_fase_backup_integral.sql |
| 07 | supabase_fase_mermas_trazables.sql |
| 08 | supabase_fase_capacidades_multirrubro.sql |
| 09 | supabase_fase_stock_idempotente.sql |
| 10 | supabase_fase_costos_movimientos_privados.sql |
| 11 | supabase_fase_reporte_bajas_stock.sql |
| 12 | supabase_fase_equipos_comercio.sql |
| 13 | supabase_fase_envases_precios_compartidos.sql |
| 14 | supabase_fase_seguridad_combos.sql |
| 15 | supabase_rubro_fotocopiadora.sql |
| 16 | supabase_fase_rubros_especializados.sql |
| 17 | supabase_fase_electronica.sql |
| 18 | supabase_fase_backup_ampliado.sql |
| 19 | supabase_fase_dietetica_bazar.sql |
| 20 | supabase_fase_checkout_manual.sql |
| 21 | supabase_fase_checkout_manual_backend.sql |
| 22 | supabase_fase_checkout_manual_cancelacion.sql |
| 23 | supabase_fase_checkout_manual_cierre_caja.sql |
| 24 | supabase_fase_checkout_manual_orden_bloqueos.sql |
| 25 | supabase_fase_checkout_manual_preparacion_bloqueos.sql |
| 26 | supabase_fase_checkout_manual_consulta_pendientes.sql |
| 27 | supabase_fase_checkout_manual_recuperar_entrada.sql |
| 28 | supabase_fase_checkout_manual_conciliar_cancelacion.sql |
| 29 | supabase_fase_supervisor_pin_privado.sql |
| 30 | supabase_fase_supervisor_pin_intentos.sql |
| 31 | supabase_fase_supervisor_autorizacion_descuento.sql |
| 32 | supabase_fase_checkout_manual_supervisor.sql |
| 33 | supabase_fase_checkout_manual_politica_supervisor.sql |
| 34 | supabase_fase_supervisor_pin_espera.sql |
| 35 | supabase_fase_supervisor_auditoria_consulta.sql |
| 36 | supabase_fase_supervisor_politica_descuento.sql |
| 37 | supabase_fase_checkout_manual_politica_congelada.sql |
| 38 | supabase_fase_supervisor_auditoria_politica.sql |
| 39 | supabase_fase_motivo_cambio_precio.sql |
| 40 | supabase_fase_auditoria_comercial_consulta.sql |
| 41 | supabase_fase_apertura_manual_cajon.sql |
| 42 | supabase_fase_resultado_apertura_cajon.sql |
| 43 | supabase_fase_consulta_auditoria_cajon.sql |
| 44 | supabase_fase_lectura_identidad_edge.sql |
| 45 | supabase_fase_lectura_catalogo_checkout.sql |
| 46 | supabase_fase_checkout_manual_caja_compartida.sql |
| 47 | supabase_fase_checkout_manual_inmutabilidad.sql |

44 y 45 conceden al servidor las columnas necesarias para verificar identidad y
cotizar sin incluir costos ni datos personales del cliente. El backend debe usar
las consultas explícitas actuales. El 46 permite separar vendedor y titular del
turno; aplicarlo al final si se reinstalan las funciones antiguas de checkout.
No cambia ventas existentes ni exige un nuevo despliegue de Edge Functions.
La consulta `sql_verificar_checkout_caja_compartida.sql` comprueba los tres
predicados y privilegios de ejecución sin ejecutar cobros. Un resultado correcto
no certifica todo el checkout, RLS ni una venta con PIN.

El archivo 33 debe ir después del 32 y de las funciones originales de checkout. Si reaplicás esas funciones anteriores, reaplicá el 33 al final para conservar el control de supervisor. No modifiques las decisiones ya almacenadas ni borres las preparaciones pendientes.

El 34 reemplaza las funciones de reserva y finalización del 30. Si reaplicás el 30, ejecutá nuevamente el 34 para conservar la espera progresiva. El 35 habilita la consulta acotada de auditoría del dueño; no concede lectura directa de las tablas privadas.

36–38 están en `artifacts/sql-politica-descuentos-2026-10-07.zip`, con guía y
SHA256 verificados contra los originales. No están en los dos ZIP anteriores. El 36
agrega la política privada y su auditoría; el 37 congela su revisión en el cobro.
Configuración y formulario de cobro ya usan la política; falta ensayo remoto.
**No aplicar 37 aisladamente con checkout antiguo
activo**, porque revoca su preparador: requiere despliegue coordinado del backend
nuevo y ensayo. Ver `docs/supervisor-politica-descuento.md` antes de instalarlo.
El 38 amplía la consulta de auditoría con valores anterior/nuevo del umbral;
si reaplicás el 35, ejecutá nuevamente el 38 para conservar estos eventos.

## Consulta inicial de sólo lectura

El 39 está en `artifacts/sql-motivo-precio-2026-10-08.zip`. Exige motivo específico
para cambiar precios. Requiere 01–05 y despliegue de cliente coordinado con
`VITE_AUDITORIA_MOTIVO_PRECIO=true`; no se aplica aisladamente al cliente antiguo.
Ver `docs/aplicar-motivo-precio.md`. No activa la integración Point.

```sql
SELECT nombre, to_regclass('public.' || nombre) AS objeto
FROM unnest(ARRAY[
  'kioscos','usuarios','productos','clientes','proveedores','ventas',
  'sesiones_caja','combo_items','lotes_producto','movimientos_stock',
  'producto_costos','movimiento_stock_costos','electronica_unidades',
  'checkout_manuales','checkout_manual_entradas','checkout_manual_cancelaciones',
  'supervisor_pin_secretos','supervisor_pin_intentos','supervisor_autorizaciones'
]) AS nombre;
```

NULL indica que el objeto falta. Esta consulta no certifica toda la instalación. Las comprobaciones de roles y políticas están en `docs/aplicar-migraciones-supabase.md`; probar JWT reales y concurrencia remota sigue pendiente.

## Publicación de código

El push a GitHub/Vercel no ejecuta estos SQL ni despliega Edge Functions de Supabase. Las fases de checkout necesitan su backend desplegado y la configuración descrita en `docs/checkout-manual-backend.md`. Checkout requiere el archivo 33; el circuito completo de supervisor y su auditoría requiere también 34 y 35. No actives el circuito transaccional sin validar primero el proyecto de ensayo.

Point/QR integrados siguen pausados. Sus SQL no están en este paquete. El cobro manual con posnet permanece como acordamos.

## Verificación del paquete adicional

Se comprobó que el ZIP adicional contiene exactamente dos SQL, LEEME y SHA256,
y que los bytes de ambos SQL coinciden con los originales vigentes del repositorio.
Esta comprobación valida el empaquetado; no demuestra aplicación en Supabase.

Autoevaluación: exactitud 4 (hashes comprobados; aplicación remota no comprobada),
completitud 4 (orden y dependencias documentados; ensayo remoto pendiente),
claridad 4 (se distinguen ambos paquetes; historial largo), utilidad 4 (paquete listo;
requiere ejecución del usuario), concisión 4 (dos archivos nuevos; guía histórica extensa).
Promedio 4,0/5. Mejora prioritaria: verificar el circuito con sesiones reales en ensayo.

El 40 permite consultar cambios de precio y anulaciones en Seguridad y Caja; requiere 04 y 05. Ver docs/auditoria-comercial-consulta.md. Validación remota pendiente.

Paquete 40–43: artifacts/sql-auditoria-cajon-2026-10-08.zip. Incluye cuatro SQL en orden, LEEME y SHA256. Se verificó la lectura del ZIP y la identidad de bytes con los archivos fuente; aplicación remota pendiente.
