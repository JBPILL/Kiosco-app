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

Autoevaluación: exactitud 4 (configuración contrastada con biblioteca instalada;
falta hardware), completitud 3 (mejoras de ambos lectores; falta matriz física),
claridad 4 (límites explícitos), utilidad 4 (entrada manual y errores accionables),
concisión 4 (helper compartido; queda duplicación de ciclo de cámara).
Promedio: 3,8/5. Prioridad siguiente: probar cámaras reales y flujo de cierre.
