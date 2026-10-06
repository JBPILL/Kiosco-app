# Copia local parcial del arqueo al cerrar caja

Un cierre confirmado por Supabase, o registrado como cierre pendiente en localStorage cuando no hay conexión, solicita guardar una copia en IndexedDB (Dexie `KioskoPOSRespaldosLocales`, tabla `backups_locales_kiosco`). La identidad compuesta comercio/sesión permite reemplazar la misma copia sin duplicarla.

El formato `ARQUEO_CAJA` contiene campos explícitos de la sesión cerrada, totales del resumen y movimientos de esa misma sesión y comercio. Excluye relaciones de usuario y costos. Es una copia parcial del arqueo: no incluye catálogo, ventas completas, configuración ni demás datos del negocio. No cumple por sí sola un respaldo integral restaurable del comercio.

La creación del objeto y la escritura local tienen manejo de errores propio. Si falla cualquiera, se informa que el arqueo se registró pero su copia local falló; la sesión ya cerrada se libera y no se vuelve a enviar el cierre remoto. La escritura de IndexedDB es asíncrona para evitar bloquear al cajero. Una interrupción del navegador antes de completarse puede impedir guardar la copia.

Configuración permite al dueño descargar los cinco arqueos más recientes del comercio activo. El componente filtra por comercio al renderizar y revalida rol/comercio al descargar. Un cambio de comercio cancela la recepción de resultados previos. El indicador confirmado/pendiente describe el estado al crear la copia; no certifica el estado remoto actual y no se actualiza automáticamente tras una sincronización posterior.

Descargar un arqueo no actualiza el recordatorio de respaldo operativo JSON/Excel. Las copias quedan en este equipo y pueden perderse al borrar datos del navegador. No se verificó persistencia en hardware real ni sincronización remota durante estas pruebas.

Validación dirigida: constructor de copia que lanza después del cierre confirmado, rechazo de IndexedDB, escritura pendiente sin bloquear cierre, ausencia de segundo cierre, filtro por comercio, cambio de comercio durante lectura pendiente, revalidación al descargar y acceso restringido al dueño.
