# Umbral de descuento por comercio

## Estado

El paso 36, `supabase_fase_supervisor_politica_descuento.sql`, incorpora
almacenamiento privado de una política y sus cambios. El paso 37,
`supabase_fase_checkout_manual_politica_congelada.sql`, y el servidor actualizado
leen esa política y congelan umbral, revisión y decisión al preparar el cobro.
**Todavía falta el formulario y su consulta en el cliente**. El frontend conserva
la regla de 15%; no activar ni desplegar esta fase como circuito completo aún.

El dueño activo configura un porcentaje entre 0 y 100 con hasta dos decimales.
La identidad y el comercio se resuelven desde auth.uid(), sin parámetros de actor
o comercio. El cajero sólo puede consultar la política propia. Sin configuración,
la consulta devuelve 15 y revisión 0. Cada cambio incrementa revisión y registra
valor anterior/nuevo, actor y fecha en la misma transacción. No borra historial.
Las tablas no conceden escritura directa a clientes ni al servidor de cotización.

## Integración pendiente

1. Conectar configuración exclusiva del dueño y consulta para el formulario de
   cobro. Una política local desactualizada no debe permitir saltar la aprobación.
2. Ampliar la consulta de auditoría para incluir cambios de política y validar
   sesiones reales, concurrencia y reintentos antes de activar.

## Preparación de servidor y orden de despliegue

El servidor lee sólo la política del comercio autenticado. Si falta la tabla o
falla la consulta, detiene nuevas cotizaciones; no sustituye una falla por el
default. El default 15/revisión 0 corresponde únicamente a un comercio sin fila.
SQL compara el umbral y revisión cotizados con los vigentes bajo bloqueo del
comercio y rechaza cambios concurrentes antes de preparar. Verifica además la
decisión porcentual. La decisión de descuento fijo procede de la cotización del
servidor, que excluye depósitos de envases de la base comercial.

Una preparación existente conserva política y decisión originales. Las anteriores
sin política conservan reglas heredadas del 15% y protección de descuentos fijos
sin decisión conocida. Recuperar una confirmación no repite efectos financieros.

El paso 37 revoca la ejecución directa de preparadores antiguos de tres/cuatro
argumentos al servicio; el nuevo backend usa seis. **No aplicar 37 aisladamente
si hay un checkout transaccional antiguo activo**: requiere una ventana coordinada
de SQL y despliegue del nuevo checkout-manual, después de completar el cliente y
validar ensayo. Reaplicar funciones anteriores puede restaurar accesos antiguos;
volver a aplicar 37 al final. Point permanece pausado.

No se debe sustituir únicamente el 15 en React: servidor y PostgreSQL deben
aplicar la misma política a la solicitud original. No habilitar esta funcionalidad
como terminada hasta integrar y comprobar el circuito completo.

## Evidencia local

114 pruebas enfocadas aprobadas en tres archivos: backend, funciones financieras
SQL y política comercial. La prueba SQL de integración ejecuta las funciones
reales de preparación/confirmación y reaplica 37 dos veces. Comprueba rechazo de
revisión vieja, decisión porcentual incoherente, preparador antiguo inaccesible,
política congelada después de cambios y saldo no duplicado al confirmar dos veces.
Además: default, propietario y comercio, registro de
cambios, límites, cajero, inactividad, anonimato, identidad ambigua, reejecución y
rechazo de escritura directa. No hay comprobación remota de JWT/PostgREST ni
concurrencia entre conexiones reales.

Autoevaluación: precisión 4 (reglas SQL probadas; falta instancia remota),
completitud 3 (servidor y política congelada listos; cliente pendiente), claridad 4
(estado y dependencias explícitos), utilidad 4 (RPC aplicables; no cambia cobro
aún en cliente), concisión 4 (dos migraciones; conserva pasos de integración). Promedio 3,8/5.
Prioridad siguiente: integrar consulta y configuración del cliente antes de activar.
