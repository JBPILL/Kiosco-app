# Protección de tickets transaccionales frente a cajeros

## Instalación

Aplicar `supabase_fase_checkout_manual_inmutabilidad.sql` (paso 47) después de
checkout manual/backend y las funciones de autorización por comercio.
La migración puede reaplicarse. No modifica datos de tickets.

## Alcance

Tres políticas restrictivas por tabla protegen ventas, detalles_venta y
pagos_venta. INSERT del cajero queda bloqueado cuando existe preparación o
registro del cierre. UPDATE y DELETE requieren dueño/superadmin también en
ventas anteriores: un cajero no puede alterar importes ni trasladar o borrar
artículos y pagos después de guardarlos.

La sincronización anterior inserta pagos con `ignoreDuplicates: true`
(ON CONFLICT DO NOTHING). Ese reintento se conserva para ventas sin preparación;
no se permite reemplazar una fila mediante ON CONFLICT DO UPDATE.

SELECT se conserva para historial y reimpresión. El dueño conserva operaciones
permitidas por las políticas anteriores, incluida la anulación auditada. Las
funciones privadas SECURITY DEFINER pueden completar el cobro como propietario;
la migración no otorga acceso a esas funciones al cajero.

El helper consulta las tablas privadas sin conceder SELECT sobre ellas y limita
su respuesta al comercio autenticado o superadmin.

## Verificación local

- 10 pruebas ejecutan la migración real dos veces en PostgreSQL/PGlite.
- Rechazo de inserciones y traslado de artículos/pagos hacia ticket protegido.
- UPDATE y DELETE del cajero no encuentran filas protegidas; lectura conservada.
- Conservación de operaciones de dueño y ejecución de backend privado de prueba.
- Protección por preparación o registro de cierre, sin revelar otro comercio.
- 92 pruebas aprobadas junto a cierre manual, caja compartida y sincronización
  de servicios offline. Incluyen reintento ON CONFLICT DO NOTHING y bloqueo de
  cambios/borrado de filas anteriores.
- `npm run build` aprobado; persiste el aviso previo de tamaño de bundle.

El esquema de prueba es reducido y sus políticas permisivas son deliberadamente
amplias para comprobar la restricción. La función de backend es una fixture,
no una prueba integral del cierre real bajo esta migración.

## Pendientes

No aplicada remotamente. Validar JWT/PostgREST reales en base aislada, reimpresión,
anulación del dueño y recuperación tras caída de red. UPDATE/DELETE bloqueados
por RLS pueden devolver cero filas en lugar de error; eso no es confirmación de
una modificación exitosa.

Todavía se permiten inserciones anteriores en ventas sin preparación transaccional.
Se debe completar su migración y restringirlas para cerrar la frontera de
autorización de descuentos. Este paso no declara completa la fase de seguridad.

## Autoevaluación

| Eje | Nota | Evidencia |
| --- | --- | --- |
| Exactitud | 4/5 | SQL real probado localmente; JWT remoto pendiente. |
| Completitud | 3/5 | Protege modificaciones; inserciones anteriores siguen abiertas. |
| Claridad | 4/5 | Explica filas bloqueadas, lectura y excepciones de dueño/backend. |
| Acción | 4/5 | Migración reaplicable y orden documentado; instalación pendiente. |
| Concisión | 4/5 | Un helper y nueve políticas sin duplicar el cierre financiero. |
