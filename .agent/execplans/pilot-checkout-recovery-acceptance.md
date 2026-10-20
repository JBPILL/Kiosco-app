# Recuperación de cobros del piloto (20/10/2026)

## Objetivo y alcance
Avanzar P08/P09/P23 sin impresora ni Point, diferidos por el usuario para el
final. Conservar siempre ID/cuerpo original y distinguir aceptación de backend,
persistencia local simulada y ensayo físico del puesto.

## Método
1. Revisar y ejecutar pruebas existentes de IndexedDB, cliente, sesión y backend.
2. En Staging aislado, seleccionar únicamente un cobro ya confirmado del operador
   de ensayo. Verificar identidad, comercio, venta completada y solicitud guardada.
3. Reenviar esa solicitud exacta con JWT real en memoria, descartar un ACK y
   recuperarlo; ensayar dos peticiones concurrentes del mismo cuerpo.
4. Comparar venta/pagos/detalles/stock antes y después. Detenerse al primer fallo.
   No crear cobros nuevos ni modificar precios, caja, stock o identidades.
5. Documentar límites y resultados, publicar sólo evidencia/correcciones necesarias.

## Progreso
- [x] Guías POS, persistencia y seguridad revisadas; árbol inicialmente limpio.
- [x] 117 pruebas locales PASS en seis archivos: IndexedDB/outbox, cliente,
      flujo, cambios de sesión, recuperación remota y backend; 17.12 s.
- [x] Ensayo real con JWT Dueño del comercio aislado: ACK descartado por el
      consumidor, reenvío secuencial y dos solicitudes simultáneas del cuerpo
      original recuperan idéntico resultado, sin generar otra solicitud.
- [x] Venta, pagos, detalles y stock idénticos antes/después. La venta completada
      no aparece como pendiente y recuperar_entrada_checkout_manual la rechaza
      como pendiente. 23 comprobaciones PASS en el último ensayo.
- [x] Evidencia sanitizada documentada y preparada para publicación. Runner y
      resultado fuera del repositorio: ../verify-checkout-recovery-staging.cjs y
      ../checkout-recovery-staging-result.json. Sin secretos en disco ni logs.

## Límites de aceptación
El reenvío de una venta ya confirmada prueba recuperación desde el registro del
servidor, no pérdida de red durante el primer commit. Las peticiones concurrentes
no sustituyen dos terminales físicas. No se borra ningún perfil ni se provoca
una venta desde la UI del operador. P09 sólo cierra con su ensayo propio sin copia
local y operador/caja originales. Sin merge, SQL remoto ni Production.

## Resultado final
Se amplía evidencia de P08 y se comprueban las exclusiones de P09 con JWT real.
No se detectó un defecto que requiriera modificar código; no hay deploy nuevo.
P08/P09/P23 siguen abiertos para los casos expresamente no cubiertos: primer
commit con pérdida real de respuesta, pendiente preparado sin copia local,
cancelación concurrente y dos terminales físicas. No se da por aceptado todo el
piloto por el éxito del reintento de una venta ya confirmada.

## Ensayos iniciales adicionales autorizados (20/10/2026)
El usuario solicita probar corte durante primera confirmación y recuperación
sin copia local, y continuar con el siguiente bloque. Se anuncian dos tickets
ficticios de servicio de $1 cada uno en el comercio aislado activo, sin dinero
real, producto físico ni cambios al comercio original/Production.

- [x] Identidad Dueño de ensayo, comercio y caja abierta original comprobados.
      UUID nuevos y diario externo conservado antes del primer envío. El runner
      se detiene si ya existe el diario; no crea nuevas operaciones al repetirlo.
- [x] Primer ticket inexistente antes del envío. Proxy de loopback consume el
      ACK 200 del servidor y corta el socket antes de responder al consumidor:
      el fetch del consumidor falla por transporte, después del commit real.
      Antes de reintentar hay exactamente una venta, pago y detalle. Reintento
      secuencial y dos simultáneos conservan resultado y cardinalidades de uno.
- [x] Segundo ticket preparado mediante RPC privada del servidor con política
      vigente; aún no hay venta, pago ni detalle. El consumidor descarta su
      entrada en memoria, no dispone de cola IndexedDB y recupera la solicitud
      por listado/RPC del Dueño. Hash canónico confirma mismo cuerpo; ID,
      operador y caja originales conservados. Confirmación y reintento producen
      exactamente una venta, pago y detalle.
- [x] Ambos dejan de estar pendientes; stock físico activo idéntico antes/después.
      Dos ventas ficticias por $2 totales conservadas como auditoría del ensayo.
      43 comprobaciones PASS; sin secretos impresos/guardados ni SQL de instalación.

Evidencia externa: ../test-first-checkout-recovery-staging.cjs y
../first-checkout-recovery-journal.json. No se debe ejecutar de nuevo para
recrear operaciones. El diario guarda la primera solicitud para recuperación y
sólo ID/hash de la segunda, sin tokens, claves ni contraseñas.

Estos ensayos cierran el corte controlado de transporte tras primer commit y
la recuperación backend de un preparado sin cola local. No simulan pérdida
física del disco: el consumidor se descarta lógicamente dentro del runner.
P08/P09/P23 siguen abiertos para UI del operador sin copia local, cambio de
operador/caja, cancelación concurrente y dos terminales físicas. Sin merge,
deploy, modificación de aplicación ni acceso a Production.
