# Fecha de inicio de actividades en ARCA

Formato elegido por el titular: **dd/mm/aaaa** (año de cuatro cifras).
El campo agrega barras al escribir o pegar dígitos, limita la entrada a diez
caracteres y muestra error si el día, mes o año no forman una fecha real.
Contempla años bisiestos y evita adivinar el siglo de un año de dos cifras.
Puede quedar vacío, como antes.

Fechas ISO ya guardadas se muestran como día/mes/año sin invertir componentes.
Las fechas inválidas existentes no se corrigen ni descartan silenciosamente: el
usuario debe revisarlas antes de guardar. El store valida antes de modificar
Zustand, localStorage o enviar la configuración al servidor; el formulario valida
tanto Guardar como el interruptor de habilitación.

Pruebas dirigidas de fechas/formulario/store: 57 PASS. Validación conjunta con
respaldo y WSAA: suite 2177 PASS / 1 skipped / 224 archivos (246,83 s), build PASS
con 634 módulos, manifiesto histórico 43 SQL PASS y diff sin errores. No se emitió
ningún comprobante para probar este cambio ni se modificó configuración fiscal real.
