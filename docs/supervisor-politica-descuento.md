# Umbral de descuento por comercio

## Estado

El paso 36, `supabase_fase_supervisor_politica_descuento.sql`, incorpora
almacenamiento privado de una política y sus cambios. El paso 37,
`supabase_fase_checkout_manual_politica_congelada.sql`, y el servidor actualizado
leen esa política y congelan umbral, revisión y decisión al preparar el cobro.
Seguridad y Caja incluye formulario del dueño con consulta y guardado autenticados.
El formulario de cobro consulta la política para descuentos nuevos del cajero,
presenta el umbral vigente y bloquea confirmación mientras no pueda verificarlo.
El flujo vuelve a consultar antes de archivar y pedir permiso. **Falta validar el
circuito completo con SQL y Edge desplegados en ensayo** antes de activar.

El dueño activo configura un porcentaje entre 0 y 100 con hasta dos decimales.
La identidad y el comercio se resuelven desde auth.uid(), sin parámetros de actor
o comercio. El cajero sólo puede consultar la política propia. Sin configuración,
la consulta devuelve 15 y revisión 0. Cada cambio incrementa revisión y registra
valor anterior/nuevo, actor y fecha en la misma transacción. No borra historial.
Las tablas no conceden escritura directa a clientes ni al servidor de cotización.

## Integración pendiente

1. Validar sesiones reales, concurrencia y reintentos antes de activar.

El paso 38 amplía la auditoría visible del dueño con los porcentajes anterior y
nuevo, actor y revisión. Los pasos 36–38 están reunidos en
`artifacts/sql-politica-descuentos-2026-10-07.zip`; sus hashes se comprobaron contra
los archivos vigentes del repositorio. Verificar el paquete no aplica sus SQL.

Los cobros guardados se recuperan sin consultar una política nueva ni reconstruir
su solicitud. Un descuento nuevo del cajero sin conexión no se archiva ni se
confirma porque no puede verificar el umbral; el carrito permanece disponible.
Los cobros sin descuento mantienen el circuito provisional existente. Después de
un error de autorización, el modal actualiza la política para reflejar posibles
cambios realizados mientras permanecía abierto.

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
   de SQL y despliegue del nuevo checkout-manual, después de validar el cliente y
validar ensayo. Reaplicar funciones anteriores puede restaurar accesos antiguos;
volver a aplicar 37 al final. Point permanece pausado.

No se debe sustituir únicamente el 15 en React: servidor y PostgreSQL deben
aplicar la misma política a la solicitud original. No habilitar esta funcionalidad
como terminada hasta integrar y comprobar el circuito completo.

## Evidencia local

Cobro: 59 pruebas enfocadas en cinco archivos aprobadas, incluidas interfaz real
del PaymentModal, hook, cliente, flujo y backend. Verifican umbral inferior/superior
al 15%, igualdad exacta, fallo sin archivar, respuesta tardía, texto dinámico del
PIN y recuperación sin consulta nueva. La compilación pasa. Esto no sustituye
prueba visual ni sesiones reales contra el backend desplegado.

Configuración: 20 pruebas enfocadas de cliente, UI y SQL aprobadas. Se verifica
sesión Auth antes y después de la RPC, rol dueño al modificar, respuesta estricta,
valor confirmado coincidente, cambio de comercio durante guardado y error de
consulta sin valor predeterminado engañoso. La tarjeta es compacta y usa el botón
de actualización común. No hay verificación visual en navegador todavía.

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
completitud 3 (circuito local y auditoría integrados; validación remota pendiente), claridad 4
(estado y dependencias explícitos), utilidad 4 (RPC aplicables; no cambia cobro
aún en cliente), concisión 4 (dos migraciones; conserva pasos de integración). Promedio 3,8/5.
Prioridad siguiente: validar despliegue coordinado en ensayo.
