# Riesgo conocido de la dependencia `xlsx`

## Estado

El hallazgo preexistente de `npm audit --omit=dev` reporta vulnerabilidades de
severidad alta en `xlsx`, relacionadas con Prototype Pollution y ReDoS, sin una
versión corregida disponible en el reporte recibido. `xlsx` es una dependencia
de producción declarada por el proyecto.

Este registro conserva ese hallazgo como riesgo abierto. No se volvió a ejecutar
`npm audit` durante esta reconciliación y no se ejecutó `npm audit fix`.

## Tratamiento

- No actualizar ni sustituir la dependencia automáticamente.
- Antes de cambiar el parser, revisar compatibilidad con importaciones reales,
  formato de archivos admitidos y el uso actual en el proyecto.
- Revaluar el riesgo cuando exista una versión corregida o una alternativa
  compatible, y añadir pruebas para los flujos de importación afectados.
