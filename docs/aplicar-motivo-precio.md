# Ensayo coordinado — motivo de cambios de precio

## Alcance

El SQL 39 (`supabase_fase_motivo_cambio_precio.sql`) requiere las tablas comerciales,
las funciones de autorización/RLS y la auditoría de anulaciones/precios (01–05).
No instala una base vacía ni activa Mercado Pago. No necesita reinstalar los
SQL 36–38; esas fases tienen su propio despliegue coordinado de checkout.

Exige un motivo específico de 5 a 300 caracteres a cualquier operación que
cambie `productos.precio_venta`, incluido service_role o mantenimiento SQL.
El motivo se guarda únicamente en auditoría; queda NULL en el producto.

## Aplicación

1. Usar el proyecto de ensayo y conservar un respaldo externo de la base.
2. Evitar cambios de catálogo durante la actualización. Las versiones anteriores
   no envían el motivo y sus cambios de precio serán rechazados después del SQL.
3. Compilar y desplegar el código actualizado con
   `VITE_AUDITORIA_MOTIVO_PRECIO=true`. La variable se incorpora al compilar:
   cambiarla sin una compilación nueva no activa los campos de la interfaz.
4. Ejecutar completo el SQL 39 en SQL Editor, conservando BEGIN/COMMIT. Si falla,
   detener la actualización y revisar el error; no continuar con archivos posteriores.
5. Abrir una sesión nueva y ejecutar el piloto descrito abajo antes de habilitar
   los cambios de catálogo del comercio.

Se puede aplicar el SQL antes de compilar si se mantiene la misma ventana sin
cambios de catálogo. Ambos pasos deben completarse antes de permitir escrituras.
Si se reaplica el SQL 05, reaplicar 39 al final: 05 reemplaza la función/trigger.
Desactivar la variable no desactiva la exigencia del servidor; no usarlo como
reversión aislada ni borrar auditorías para recuperar el servicio.

## Comprobaciones de sólo lectura

```sql
SELECT pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.productos'::regclass
  AND tgname = 'trg_auditar_cambio_precio_producto';

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.productos'::regclass
  AND conname = 'productos_motivo_precio_transitorio';
```

Se espera un trigger BEFORE UPDATE y una restricción que exige columna NULL
después de cada escritura. Esto no prueba identidad, permisos ni auditoría real.

## Piloto requerido

- Dueño: cambiar precio con motivo; comprobar actor, fecha, producto, precio
  anterior/nuevo y motivo en auditoría. El producto debe conservar motivo NULL.
- Repetir otro cambio sin motivo mediante la API: debe rechazarse; comprobar
  que ni precio ni auditoría cambian. Un texto vacío/corto/largo también falla.
- Cajero: probar directamente la API con motivo válido; no puede cambiar precio.
  Otro dueño no puede modificar productos ajenos.
- Edición, aumento, importación, restauración y siembra: ejecutar con motivo y
  comprobar los rechazos sin falso éxito ni cambios locales no confirmados.
- Importación con rollback: provocar un rechazo previo y comprobar que no da
  de baja otros productos. Restauración de productos nuevos no guarda motivos.
- Alta offline: reconectar; comprobar inserción única y recuperación de respuesta
  perdida. Un ID con otro precio no se sobrescribe y muestra conflicto.
- Artículo libre: reintentar sincronización; comprobar precio conservado, sin
  duplicar pagos. Ante identidad diferente, conservar la venta pendiente.

Los ensayos deben hacerse con JWT reales en el esquema completo de Supabase.
La suite local no acredita estos resultados ni compatibilidad de hardware.

## Evidencia local

Sobre `013a5fb`, `npm run test` aprobó 1238 pruebas en 134 archivos, sin fallos,
en 103,41 segundos. La compilación de esa revisión aprobó y conserva el aviso
de chunks grandes. El paquete contiene el SQL 39, esta guía y sus hashes SHA256.
La función está desactivada por defecto y no se activa en producción durante
la preparación local. Aplicación remota y piloto con JWT reales pendientes.
