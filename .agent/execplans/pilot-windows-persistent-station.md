# Piloto — puesto Windows con perfil persistente

## Objetivo
Avanzar P22/P23 del plan operativo: preparar el arranque de un puesto que no
dependa de la sesión InPrivate del modo kiosk de Edge. Los cambios visuales de
Envases quedan aceptados por el usuario; no se reabre ese diseño.

## Contexto y problema
El lanzador actual usa --kiosk. Microsoft documenta que ese modo usa InPrivate.
La app guarda solicitudes originales recuperables en IndexedDB; cambiar o perder
el perfil no equivale a cancelar operaciones ni permite repetir un cobro.

## Alcance
- Arranque en ventana de aplicación con perfil dedicado por usuario Windows,
  origen HTTPS y nombre de puesto, separado del Edge personal y de otros entornos.
- Preparación sin iniciar Edge ni crear archivos; argumentos correctamente
  delimitados aun con espacios y URL con query.
- Guía de adopción y recuperación que exige revisar el perfil anterior y no
  borra/importa automáticamente sesiones, permisos ni operaciones.
- Pruebas PowerShell con lanzamiento simulado, build y revisión de seguridad.

## Fuera de alcance
No instalar accesos directos, políticas, Assigned Access, iniciar sesión, abrir
Edge real, migrar perfiles ni ejecutar ventas/SQL. No instalar en Production ni
afirmar persistencia física validada. No integrar PR #3 ni tocar PR #1.

## Decisiones
Un perfil persistente reduce pérdida por cierre, pero no es copia de seguridad
ni bloqueo de Windows. Una sesión puede expirar y las políticas administradas
pueden limpiar datos; su aceptación requiere cerrar/reabrir en el puesto real.
La URL y el puesto determinan una ruta estable; cambiar de entorno/puesto usa
otra ruta y no copia datos. El modo de preparación no escribe en el equipo.

## Progreso
- [x] Identificado siguiente bloque pendiente y comportamiento del lanzador.
- [x] Implementar preparación y arranque persistente.
- [x] 25 pruebas PowerShell PASS: identidad, aislamiento, argumentos con espacios,
  nombres/URLs inválidos, políticas administradas y fallo de lectura. Edge simulado;
  crear/borrar/escribir archivos desde el script provoca fallo en las pruebas.
- [x] Guía de adopción/recuperación y P06/P22/P23 del registro actualizados;
  se conservan notas históricas. Aceptación visual de Envases registrada.
- [x] Validación final y publicación normal de e05582d en la rama del piloto,
  PR #3 en borrador, sin instalación real ni merge. No requiere deploy frontend
  manual: este bloque cambia lanzador/documentación/tests, no la interfaz.

## Resultado final
Implementación y validación local completas. El lanzador y la guía quedan listos
para revisión del operador; aceptación física y adopción del perfil pendientes.
No se abrió Edge ni se instaló/configuró un puesto real.


## Evidencia y aceptación pendiente
- Preparación real de Staging con -Preparar PASS: detecta Edge y políticas y
  devuelve perfil persistente propuesto sin iniciar navegador ni crear carpetas.
- Manifest histórico: 43 SQL intactos. Diff trabajo/índice PASS. Scan 1129 textos,
  14 binarios omitidos, mismos 46 candidatos conocidos; sin secretos nuevos.
- npm audit --omit=dev: 0 vulnerabilidades, sin cambios de dependencias.
- Suite completa final: 2085 PASS / 1 skipped / 217 archivos, 211,71 s con
  --maxWorkers=4. Evidencia ../pilot-station-final-suite.log. Build 631 módulos
  PASS; advertencia conocida de chunks grandes, sin errores de compilación.
- No hay instalación, adopción de perfil, prueba de cierre/reinicio, permisos
  físicos ni operaciones financieras. P22/P23 continúan abiertos a esa aceptación.
