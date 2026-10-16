# Riesgo conocido de la dependencia `xlsx`

## Estado

El hallazgo preexistente de `npm audit --omit=dev` reporta vulnerabilidades de
severidad alta en `xlsx`, relacionadas con Prototype Pollution y ReDoS, sin una
versión corregida disponible en el reporte recibido. `xlsx` es una dependencia
de producción declarada por el proyecto.

Revalidado el 15/10/2026 con `npm audit --omit=dev
--registry=https://registry.npmjs.org --json`: código 1, una dependencia HIGH,
dos advisories, `fixAvailable=false`. Un primer audit dentro del sandbox devolvió
cero; se descartó como prueba suficiente al contradecir los advisories. No se
ejecutó `npm audit fix` ni se modificaron dependencias.

Fuentes del resultado oficial: [Prototype Pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
y [ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9).

## Uso real y mitigación pendiente

El único parser SheetJS se carga dinámicamente en
`src/components/catalogo/ImportarCatalogoModal.tsx` tras seleccionar un archivo.
Admite XLSX y XLS; el resto entra por CSV. No descarga hojas remotas, pero
`accept` del selector no es validación: hoy no impone tamaño ni MIME antes de
`XLSX.read`. Un archivo local malicioso sigue siendo una entrada no confiable.

Bloque siguiente propuesto: límite de bytes antes de lectura, validación conjunta
de extensión/MIME (con política para MIME vacío), límites de filas/columnas y
parser en Worker con terminación por timeout. Limitar tamaño por sí solo no
elimina Prototype Pollution ni garantiza límite de memoria tras descomprimir.

`read-excel-file` y `write-excel-file` ya están instalados; el segundo se usa
para exportación. Se evaluó sustituir el importador por el primero, pero no es
un reemplazo compatible con XLS/BIFF legado. No se elimina silenciosamente ese
formato ni se introduce una migración sin fixtures de XLS/XLSX, celdas combinadas,
fechas, números y round-trip de exportación. Mantener esta decisión como riesgo
abierto; la suite verde no corrige una dependencia vulnerable.

## Tratamiento

- No actualizar ni sustituir la dependencia automáticamente.
- Antes de cambiar el parser, revisar compatibilidad con importaciones reales,
  formato de archivos admitidos y el uso actual en el proyecto.
- Revaluar el riesgo cuando exista una versión corregida o una alternativa
  compatible, y añadir pruebas para los flujos de importación afectados.
