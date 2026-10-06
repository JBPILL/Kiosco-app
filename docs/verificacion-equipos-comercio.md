# Registro de equipos por comercio

Se agregó el registro opcional en kioscos.equipos_comercio y tres tarjetas
en Configuración > General. Impresora y lector incluyen tipo, modelo y
conexión; Point incluye modelo e ID opcional. Las observaciones son compartidas.
Se usa Input y el estilo de tarjetas existente. Los campos pueden quedar vacíos.

La carga normaliza datos ausentes o inválidos. El guardado recorta textos,
actualiza únicamente el comercio del usuario y confirma el ID devuelto.
El registro no cambia permisos Web Serial, ancho del ticket ni conecta Point.
La compatibilidad queda pendiente de verificación real.

La migración agrega una columna opcional y comprueba que el JSON sea un objeto.
Mantiene las políticas existentes de kioscos. No se ejecutó en Supabase remoto.

Verificación pendiente en producción después del SQL y despliegue:

1. Guardar los tres equipos y observaciones con un usuario dueño.
2. Salir y volver a Configuración; comprobar los valores.
3. Abrir desde otro puesto del mismo comercio y comprobar que se conservan.
4. Comprobar que otro comercio no obtiene ni modifica esos datos.
5. Dejar Point vacío mientras se desconoce el modelo y comprobar que guarda.

No se agregaron ni ejecutaron pruebas nuevas para esta petición. La compilación
del formulario inicial pasó; no sustituye las comprobaciones remotas anteriores.

Autoevaluación: precisión 4/5, completitud 4/5, claridad 5/5,
accionabilidad 4/5 y concisión 4/5. El formulario y el almacenamiento están
preparados; la persistencia real y el aislamiento dependen de validar Supabase.
