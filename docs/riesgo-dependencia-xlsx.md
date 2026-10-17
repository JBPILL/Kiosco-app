# Dependencia `xlsx`: tratamiento de los dos avisos HIGH

## Estado actual — 17/10/2026

La dependencia pasa de `xlsx` 0.18.5 de npm a SheetJS CE 0.20.3, fijada al
[tarball oficial](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz).
`package-lock.json` conserva URL, versión e integridad SHA-512. La instalación
se hizo sin ejecutar scripts; no se usó `npm audit fix` ni se ignoraron avisos.
`npm audit --omit=dev --json` devuelve cero vulnerabilidades de producción.

Los dos avisos anteriores cubren versiones anteriores a 0.19.3 (Prototype
Pollution) y 0.20.2 (ReDoS), respectivamente:
- [CVE-2023-30533](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6).
- [CVE-2024-22363](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9).

El uso real es la lectura de catálogos en `ImportarCatalogoModal`; la exportación
usa `write-excel-file`. Se conservan XLS, XLSX y CSV y la vista previa antes de
confirmar escrituras. Los tests de integración usan bytes reales, sin mockear el
parser: XLSX corporativo generado por el exportador, XLS BIFF8, ceros iniciales,
precios decimales, rechazo de reportes y entrada inválida. CSV conserva sus tests.

## Decisión y mantenimiento

Se mantiene SheetJS actualizado para conservar XLS. El lector alternativo ya
instalado, `read-excel-file`, cubre XLSX pero no reemplaza el soporte XLS requerido.
Se sigue la [instalación oficial de SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/):
las versiones corregidas no se distribuyen en el paquete npm antiguo.
No usar `latest`, volver a `^0.18.5`, omitir integridad ni desactivar audit.
Revisar futuras versiones y avisos antes de cada actualización; cero avisos hoy
no constituye una garantía permanente sobre archivos no confiables.

## Antecedente

La reconciliación anterior había documentado dos avisos HIGH en 0.18.5 sin fix
automático disponible. Ese diagnóstico histórico era correcto para esa versión.
El presente tratamiento cierra esos dos avisos mediante actualización explícita,
no mediante excepciones o supresión de alertas.
