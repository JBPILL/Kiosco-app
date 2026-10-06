# Registro de equipos por comercio

Se agregó el registro opcional en kioscos.equipos_comercio y tres tarjetas
en Configuración > General. Impresora y lector incluyen tipo, modelo y
conexión; Point incluye modelo e ID opcional. Las observaciones son compartidas.
Se usa Input y el estilo de tarjetas existente. Los campos pueden quedar vacíos.

La carga normaliza datos ausentes o inválidos. El guardado recorta textos,
actualiza únicamente el comercio del usuario y confirma el ID devuelto.
El registro no cambia permisos Web Serial, ancho del ticket ni conecta Point.
La compatibilidad queda pendiente de verificación real.

Actualización de detección: el formulario consulta WebUSB, WebHID y el puerto
serial configurado. Completa únicamente campos vacíos, identifica impresoras USB
por su clase y lectores HID por la colección de códigos de barras. No deduce
ESC/POS, láser 1D/2D ni un modelo a partir de identificadores desconocidos.
Si hay varios dispositivos del mismo tipo, exige elección con **Identificar por USB**.
La elección USB queda en este navegador; los datos del formulario se registran al
guardar el comercio. Conexión/desconexión actualiza las etiquetas sin borrar modelos.
El estado es **Detectado · prueba pendiente**, no compatibilidad confirmada.
El lector con modo teclado puede funcionar sin que el navegador exponga su modelo.
Point sigue con registro manual: la verificación requiere la cuenta de Mercado Pago.

Referencias oficiales: [Web Serial](https://developer.chrome.com/docs/capabilities/serial)
y [WebHID](https://developer.chrome.com/docs/capabilities/hid).
Siete pruebas dirigidas aprobaron detección, conservación de datos, desconexión y
etiqueta de artículos sin ventas. No se probó con hardware físico ni con sesiones remotas.

La migración agrega una columna opcional y comprueba que el JSON sea un objeto.
Mantiene las políticas existentes de kioscos. No se ejecutó en Supabase remoto.

Verificación pendiente en producción después del SQL y despliegue:

1. Guardar los tres equipos y observaciones con un usuario dueño.
2. Salir y volver a Configuración; comprobar los valores.
3. Abrir desde otro puesto del mismo comercio y comprobar que se conservan.
4. Comprobar que otro comercio no obtiene ni modifica esos datos.
5. Dejar Point vacío mientras se desconoce el modelo y comprobar que guarda.

Para el formulario inicial no se agregaron ni ejecutaron pruebas nuevas. La compilación
del formulario inicial pasó; no sustituye las comprobaciones remotas anteriores.

Autoevaluación: precisión 4/5, completitud 4/5, claridad 5/5,
accionabilidad 4/5 y concisión 4/5. El formulario y el almacenamiento están
preparados; la persistencia real y el aislamiento dependen de validar Supabase.

Autoevaluación de los ajustes actuales: precisión 4/5 (siete pruebas, sin hardware
real); completitud 3/5 (Point aún no identifica su modelo automáticamente);
claridad 4/5 (se muestran detección y prueba pendiente); accionabilidad 4/5
(autocompletado y elección USB disponibles, publicación pendiente); concisión 4/5
(detalle concentrado aquí). Promedio 3.8/5. Próxima mejora: consultar la terminal
desde el servidor con la cuenta vinculada y verificar con los equipos reales.
