# Recordatorio de descarga de respaldo externo

Configuración y el panel diario de Reportes muestran al dueño el aviso cuando pasan más de siete días desde la última solicitud de descarga JSON o Excel maestro registrada en este navegador. Reportes es el panel de resumen existente; no se agregó una ruta Dashboard. El enlace abre Configuración en Backups.

La marca se guarda en localStorage por ID de kiosco después de que `descargarArchivo` termina o `write-excel-file` resuelve `toFile`. Abrir formularios, restaurar datos, descargar reportes individuales, generar copias locales de cierre o fallar al exportar no actualiza la fecha. Excel aborta si alguna consulta devuelve error, para no registrar una exportación con consultas fallidas.

Sin historial se toma la fecha de creación del comercio como referencia de los primeros siete días, sin guardar datos por visitar una pantalla. Si esa fecha falta o es inválida se muestra un aviso de ausencia de historial. Un comercio nuevo tiene siete días antes del recordatorio. Las fechas futuras no se consideran evidencia de respaldo reciente.

El navegador confirma que se solicitó la descarga, pero no confirma que el usuario conservó el archivo ni su destino físico. El banner pide verificar el archivo y guardarlo en un pendrive o disco externo. El historial es local: otro dispositivo, otro perfil de navegador o borrar datos comienza sin registro. El fallo de localStorage no impide descargar, aunque el aviso continuará visible.

El JSON conserva el alcance actual de seis colecciones operativas; no incluye ventas ni movimientos de caja. Excel es una exportación comercial con los límites de filas vigentes y no reemplaza una copia completa de PostgreSQL. El recordatorio no amplía ninguno de estos formatos.

Pruebas dirigidas: aislamiento por kiosco, frontera de siete días, ausencia de historial sin escrituras, storage corrupto/bloqueado, fechas futuras, actualización del banner, éxito y fallo de JSON, espera y rechazo del exportador Excel.
