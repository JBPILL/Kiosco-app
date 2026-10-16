# Lectores, conteo móvil y etiquetas uniformes

## Objetivo
Ofrecer alta editable ante un código no registrado en POS (sólo dueño) y catálogo, agregar cámara al conteo físico y mantener etiquetas blancas de dimensiones fijas por formato.

## Contexto actual
POS ya tiene AltaRapidaModal para pistola/buscador, pero sin restricción de dueño. La cámara POS no ofrece ese flujo. Catálogo tiene ProductForm y cámara de captura reutilizable. Conteo físico sólo tiene pistola. La vista previa de etiquetas duplica el markup de impresión, usa alturas mínimas y hereda el blanco crema del tema.

## Alcance
POS, cámara, catálogo, formulario de producto, conteo físico, etiquetas y campos del tema claro. Reutilizar RPC/persistencia existentes. No modificar checkout ni aplicar ajustes al escanear en conteo.

## Decisiones importantes
- La función de alta desde POS pertenece exclusivamente al rol DUEÑO activo con comercio; no se habilita por ser SuperAdmin ni Cajero.
- Errores de consulta no significan producto inexistente. Un alta rechazada no es un éxito offline.
- A4: 65 × 33 mm (3 × 8 por hoja, márgenes 5 mm); rollos 58/80: área imprimible 54/76 × 40 mm, respectivamente. Opciones ocultas conservan su espacio.
- Reutilizar captura de cámara existente; cada captura incrementa una unidad local del conteo y requiere aplicar ajustes explícitamente.

## Componentes afectados
POSPage, AltaRapidaModal, BarcodeScannerModal, CatalogoPage, ProductForm, ProductTable, AuditoriaInventarioModal, EtiquetasGondolaModal, estilos y pruebas.

## Riesgos
Permisos y aislamiento deben mantenerse también en backend. Cámara e impresión física requieren ensayo en dispositivo. Impresoras tienen márgenes de hardware y deben usar escala 100%. Alta y venta siguen siendo operaciones distintas.

## Criterios de aceptación
Dueño puede editar antes de crear; cajero no abre ni guarda altas desde POS. Código precargado en catálogo; fallo de red no abre alta. Cámara y pistola comparten conteo sin guardar stock automáticamente. Todas las opciones y nombres largos conservan tamaño de etiqueta/precio/código. Campos claros respetan crema incluso autofill.

## Plan de implementación
1. Trazar flujos y reutilizar formularios/cámaras existentes.
2. Agregar guards, altas desde códigos y captura en conteo.
3. Unificar tarjeta de etiqueta y dimensiones; corregir superficies del tema.
4. Tests dirigidos, suite, build y diff review; commits separados por bloque.

## Validación
Regresiones de permisos, lookup fallido/vacío, precarga del código, conteo sólo local y etiquetas con todas las combinaciones. Suite completa y build.

## Progreso
- [x] Inspección de flujos y confirmación de restricción sólo dueño en POS.
- [x] Implementación funcional, documentación y pruebas dirigidas; un test adicional de categoría fallida quedó agregado después de la última suite disponible.
- [x] Suite anterior: 1829 PASS / 1 skip en 190 archivos; build final posterior PASS (608 módulos). Repetir suite en sandbox dio spawn EPERM; repetir la prueba enfocada fue rechazado por revisión automática no disponible.
- [x] Commits funcionales: 3d35813 y 25edb12; un ajuste de impresión y la regresión strict quedan en commit documental final.
- [ ] Ensayo físico de cámara/impresora y aplicación de SQL fuera de este alcance.

## Resultado final
Implementación local lista para revisión. Prueba automatizada final del último caso y validación física quedan pendientes; el build de ese código sí finalizó correctamente.
