# Checkout manual en caja compartida

La consulta remota aportada por el usuario confirmó la venta
`34916fd3-385b-4866-a39b-6ed2123f5fe8`, por $3.020, realizada por Lucía
en la sesión abierta por Pedro. El checkout nuevo rechazaba esa combinación
porque preparación y cierre exigían que vendedor y titular coincidieran.

Aplicar `supabase_fase_checkout_manual_caja_compartida.sql` después de las
migraciones de checkout, orden de bloqueos y política congelada. No requiere
desplegar Edge Functions ni Vercel: modifica exclusivamente tres predicados SQL.
No cambia ventas existentes, titular del turno, identidad del vendedor ni PIN.
La migración conserva las definiciones actuales y sus permisos; aborta toda la
transacción si falta una función o no reconoce el predicado esperado. Es
reaplicable. No volver a aplicar las migraciones antiguas encima de esta fase.

Validación: 35 pruebas de dos archivos pasaron. La prueba SQL ejecuta la
migración dos veces sobre funciones reducidas y comprueba vendedor distinto,
comercio ajeno rechazado y caja cerrada rechazada en preparación. No demuestra
el cierre financiero completo, concurrencia ni integración remota. Comprobar
en ensayo: caja de Pedro, vendedor Lucía, descuento superior al umbral exige
PIN; confirmar una sola venta y verificar vendedor, sesión y total en la base.
No recrear la venta de $3.020 ya registrada.

Autoevaluación: precisión 4 (predicados verificados y pruebas locales);
integridad 3 (validación financiera remota pendiente); claridad 4 (reglas y
límites explícitos); utilidad 4 (SQL listo, aplicación externa pendiente);
concisión 4 (cambio limitado a tres predicados). Media 3,8. Mejora prioritaria:
integración SQL completa y aceptación remota del flujo compartido. No dar por
resuelto el despliegue hasta obtener esa evidencia.
