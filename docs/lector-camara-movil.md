# Lector móvil de códigos

Los lectores de ventas y captura de catálogo comparten un visor adaptable que
no exige dimensiones mínimas superiores al espacio disponible. Usan 10 lecturas
por segundo, preferencia de cámara trasera y selección de cámara por el deviceId
real de la pista activa. Si falla una restricción de cámara se intenta la
predeterminada, sin repetir solicitudes ante permisos denegados o cámara ocupada.

Se conserva html5-qrcode, su decodificador compatible con navegador y los formatos
EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 y QR. La linterna sólo se ofrece
cuando la pista anuncia esa capacidad. La entrada manual sigue disponible.
Una cámara cuyo inicio termina después de cerrar se detiene, y sus callbacks
no procesan códigos si ya no corresponde al escáner activo.

La cámara requiere contexto seguro HTTPS y permiso del navegador. La biblioteca
documenta soporte iOS desde 15.1 y navegadores Android modernos; esto no garantiza
enfoque o lectura en cada modelo. Referencias:
- https://scanapp.org/html5-qrcode-docs/docs/supported_frameworks
- https://scanapp.org/html5-qrcode-docs/docs/apis/interfaces/Html5QrcodeCameraScanConfig

Validación local: diez pruebas de tamaño, errores, reintento y respuestas tardías;
build aprobado. Las consultas de ventas filtran el comercio y descartan resultados
al cerrar, cambiar operador o cambiar ticket. No se procesan consultas simultáneas
del mismo código; la captura de catálogo acepta sólo una lectura por apertura.
Cuando el navegador indica desconexión, ventas usa el catálogo local del comercio
con código exacto y único, activo y sin costos. Avisa que utilizó datos guardados;
no confirma stock/precio de servidor ni concede autorización de cobro offline.
Pendiente: iPhone Safari/Chrome/Brave, Android Chrome/Samsung Internet, rotación,
denegación de permisos, cierre durante inicio y teléfonos con múltiples lentes.
No se ha probado hardware físico en esta fase.

Revisión tras reporte de congelamiento: `Html5Qrcode.getCameras()` abre un segundo
stream mediante getUserMedia para enumerar dispositivos y lo detiene después
(código instalado: camera/retriever.js). Ambos lectores ahora usan directamente
enumerateDevices después de obtener permiso, sin abrir otra cámara. Se descartan
resultados de enumeración si el lector se cerró o cambió mientras esperaba.
Esta interferencia es una causa probable del reporte; falta reproducir en iPhone.

El canvas iOS mantiene el video nativo visible debajo, limita el dibujo a 10 fps
y 640 píxeles de ancho, omite trabajo en segundo plano y continúa ante un frame
interrumpido. Ambos lectores liberan el ciclo al detener la cámara. El modal de
ventas tiene visor compacto, controles fuera de la imagen, reinicio y selector
de escaneo continuo accesible. No incluye bloques explicativos largos.

Validación de esta revisión: 13 pruebas enfocadas, incluidas enumeración sin
getUserMedia, límite de frames, recuperación ante error y limpieza del canvas.
La compatibilidad física sigue pendiente; no se afirma que el reporte esté
resuelto en el dispositivo del usuario hasta probar la versión publicada.

Regresión de reapertura: dos pruebas reprodujeron que ventas y catálogo perdían
la solicitud de inicio si el modal se reabría mientras el inicio anterior seguía
pendiente. Ahora conservan una única solicitud pendiente y la ejecutan después
de liberar la instancia anterior. Cerrar o desmontar cancela esa solicitud.
Cuatro pruebas de ciclo verifican reapertura y desmontaje en ambos lectores;
17 pruebas enfocadas y compilación aprobadas. Estas pruebas simulan el escáner:
la reproducción del congelamiento original en un teléfono sigue pendiente.

Autoevaluación: exactitud 4 (configuración contrastada con biblioteca instalada;
falta hardware), completitud 3 (mejoras de ambos lectores; falta matriz física),
claridad 4 (límites explícitos), utilidad 4 (entrada manual y errores accionables),
concisión 4 (helper compartido; queda duplicación de ciclo de cámara).
Promedio: 3,8/5. Prioridad siguiente: probar cámaras reales y flujo de cierre.

### Cierre durante un inicio fallido

Ambos lectores descartan el fallo de una instancia cerrada antes de intentar
otra cámara. También liberan un inicio exitoso que termina después del cierre.
Seis pruebas de ciclo pasan: reapertura, desmontaje y fallo tardío después de
cerrar, en Ventas y Catálogo. La compilación continúa como puerta de publicación.

Autoevaluación de esta corrección: exactitud 4/5 (regresión simulada comprobada;
falta dispositivo físico), completitud 4/5 (ambos lectores cubiertos; falta
validación móvil), claridad 4/5 (comportamiento documentado; falta captura real),
utilidad 4/5 (evita reapertura involuntaria; falta confirmar el reporte original),
concisión 4/5 (guardas pequeñas; persiste duplicación entre lectores).
Promedio: 4,0/5. Siguiente comprobación: cerrar durante una solicitud de permiso
en iPhone y Android y confirmar que la cámara permanece apagada.
