# Respaldo operativo 4.0

Aplicá `supabase_fase_backup_ampliado.sql` después de la fase de respaldo integral,
las migraciones fiscales y las de rubros/capacidades/equipos. El frontend utiliza
la nueva RPC; mientras falte, la descarga informa que el servicio no está habilitado.
La función de formato 3.0 se conserva para clientes anteriores.

La copia 4.0 agrega configuración pública del comercio, datos fiscales y alícuota,
metadatos de equipos y capacidades, y una foto explícita de los saldos de clientes
y proveedores. Las seis colecciones y los saldos se toman del mismo snapshot de
PostgreSQL, sin el límite de filas de PostgREST. También se incluyen el ancho de
papel del equipo y preferencias fiscales públicas locales.

No exporta claves, certificados fiscales, tokens, PIN de supervisor ni numeración
fiscal. La impresión silenciosa no tiene una preferencia persistida independiente;
el campo correspondiente expresa la política segura de no activarla al restaurar.
Los permisos del puerto de impresora no se copian.

## Recuperación

Las copias 2.0 y 3.0 continúan siendo importables. Para una copia 4.0 del mismo
comercio, el formulario permite recuperar optativamente datos administrativos y
fiscales públicos, o el ancho de papel. Las casillas empiezan desmarcadas.
La configuración se aplica al terminar las colecciones sin errores. Si falla,
se informa como restauración incompleta; las etapas anteriores no se revierten.

El rubro debe coincidir. La restauración no cambia capacidades ni equipos, no
conecta una impresora y no activa facturación. Al recuperar ancho de papel se
desactiva la apertura automática del cajón. Los certificados, claves, entorno y
numeración fiscal vigentes se conservan. Volvé a ingresar para recargar los datos.

Los saldos son una foto del momento de la copia. Para clientes y proveedores
existentes se conservan sus saldos actuales; los nuevos recuperan el saldo del
registro respaldado. No se reconstruye el historial de cuenta corriente ni se
crean movimientos contables por recuperar esta foto.

La migración agrega `arqueo_ciego_obligatorio` con valor inicial verdadero sólo
si esa columna todavía no existe. Revisá esa política en Configuración tras aplicar
el SQL. Los valores de una columna existente se conservan.

Esta copia operativa todavía no incluye ventas, caja, series/garantías/reparaciones
ni sustituye una copia de toda la base de datos. El SQL no se aplicó remotamente
desde Codex.
