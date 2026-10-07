# Espera progresiva del PIN

Aplicar `supabase_fase_supervisor_pin_espera.sql` después de las migraciones de
PIN privado, intentos y autorización de descuento (paso 34).
Si se reaplica el SQL anterior de intentos, reaplicar este archivo al final.

La reserva impone una espera por operador de 2, 4, 8, 16 y 32 segundos,
según sus reservas fallidas o pendientes de la ventana actual. Durante la espera
devuelve BLOQUEADO y fecha de reintento sin entregar el hash ni consumir otro
intento. Se mantienen los topes de cinco intentos por operador y diez por
comercio en quince minutos. El abandono de una petición conserva la espera.

Un éxito válido libera la espera propia cuando no hay una reserva posterior.
No reinicia los fallos acumulados ni los límites de otros operadores.
El navegador no puede escribir la fecha de reintento. No requiere secretos nuevos.

Pruebas sobre PostgreSQL local en memoria: espera inicial, progresión, éxito,
finalización repetida, permisos y reejecución del SQL. Pendiente: piloto remoto,
concurrencia con conexiones independientes y presentación de tiempo restante.
El ZIP anterior de SQL no contiene este nuevo paso.

Autoevaluación: exactitud 4 (pruebas SQL locales; falta concurrencia real),
completitud 3 (espera implementada; falta UI de tiempo y retención), claridad 4
(orden explícito; falta piloto), utilidad 4 (migración ejecutable; requiere
aplicación remota), concisión 4 (funciones completas para migración independiente).
Promedio 3,8/5. El plan general sigue abierto.
