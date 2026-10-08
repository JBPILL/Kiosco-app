# Evidencia de checkout aportada por el usuario

El usuario ejecutó consultas en Supabase y compartió resultados el 08/10/2026.
Estos datos no fueron consultados directamente por el agente.

## Venta con cajero, caja compartida y PIN

- Venta: `ef754442-ec79-480c-844e-4091d1ff71ea`.
- Total: $2.240; pagos: $2.240.
- Vendedor: Lucía; titular del turno: Pedro Ramírez.
- `requiere_supervisor=true`, umbral congelado 15 y cierre confirmado.
- El usuario informó rechazo con PIN incorrecto y confirmó que el comprobante
  se emitió después del PIN correcto. La captura muestra el comprobante.

La evidencia respalda esa operación, no prueba todas las combinaciones de
medios, rubros, concurrencia, límites de intentos ni llamadas directas a la API.

## Pendiente recuperado

- Entrada: `ebf2345b-64c4-47c3-bb09-601ed515777a`.
- Inicialmente sólo existía la preparación por $3.020, sin venta.
- La consulta posterior mostró `COMPLETADA`, total $3.020, cierre confirmado,
  sin cancelación. El panel remoto ya no la lista.
- No volver a cobrar ni recrear esa operación. No se dispone del registro
  completo de pasos que llevó a su confirmación.

## Brecha detectada en el circuito antiguo

La venta `01c41181-a23b-4d19-a877-5758ef0e5671` fue de Lucía por $24.820,
sin preparación ni cierre transaccional. El cliente anterior no mostraba PIN
cuando el flag estaba apagado. Desde `32c6cc9`, el formulario consulta política
y bloquea descuentos protegidos si falta checkout seguro. La captura posterior
confirmó ese bloqueo, luego mostró PIN sin aviso tras activar el despliegue.

Esta protección del formulario no es una frontera de seguridad para llamadas
directas. Verificar RLS y revocar rutas críticas anteriores de manera coordinada
sigue siendo un requisito antes de declarar completo el plan de seguridad.

## Interfaz

Desde `0091e12`, pendientes remotos se revisan en Caja y Turno, plegados y sólo
para dueño. Cobros locales pendientes mantienen su aviso en Punto de Venta.
La confirmación remota desde una copia perdida no tiene acción dedicada aún;
el panel ofrece revisión de cancelación. No interpretar una lista vacía como
prueba de ausencia de toda solicitud sin consultar estado financiero.

## Recuperación y cambio de sesión

La lectura de la entrada original exige identidad de autenticación del dueño
y vuelve a comprobarla después de la RPC, además del perfil, rol, actividad y
comercio. Una respuesta tardía de otra sesión se descarta antes de procesar su
contenido. Seis regresiones cubren esos cambios; 13 pruebas dirigidas de lectura
de pendientes y su panel pasaron. Esto no añade una acción de confirmación
cuando se perdió la copia local; esa parte de P09 permanece pendiente.

Autoevaluación: precisión 4 (aserciones de contexto y resultado local);
completitud 3 (falta el circuito de confirmación remota y su piloto);
claridad 4 (alcance separado de recuperación completa); acción 4 (protección
implementada, piloto pendiente); concisión 4 (resumen con límites explícitos).
