# Lectores, conteo móvil y etiquetas uniformes

## Objetivo
Ofrecer alta editable ante un código no registrado en POS (sólo dueño) y catálogo, agregar cámara al conteo físico y mantener etiquetas blancas de dimensiones fijas por formato.

## Contexto inicial
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
- [x] Rama `hardening/next-operational-block` publicada; [PR #1](https://github.com/JBPILL/Kiosco-app/pull/1) abierto hacia master, sin merge.
- [x] Test de categoría strict PASS sobre d2233ba, sin modificarlo. Suite final previa: 1830 PASS / 1 skipped / 190 files; build PASS (608 módulos).
- [x] Commits funcionales 3d35813 y 25edb12 y cierre d2233ba publicados.
- [x] Cierre de idempotencia en 9227508: el alta strict usa el ID de operación como ID de producto. Regresiones de respuesta perdida y conexión interrumpida conservan ambos IDs y p_datos, incluso recreando el hook; el segundo ACK recupera el producto y confirma la operación.
- [x] Cierre de productos inactivos en 268d81e: pistola/cámara distinguen inactivo de inexistente, no venden ni abren alta y piden reactivación desde Catálogo. Incluye entrada manual de cámara, lectura decodificada, caché offline y PLU remoto; se preservan venta activa y alta sólo Dueño.
- [x] Validación de las correcciones (16/10/2026): 64 tests dirigidos PASS en 4 archivos (incluye categoría strict). Suite completa final sobre 268d81e: 1840 PASS / 1 skipped / 190 files (158,92 s). Build PASS (608 módulos); diff/index PASS. Escaneo de 1061 textos versionados: mismos 44 candidatos de fixtures/ejemplos, sin secretos reales detectados; 14 binarios e historial Git fuera de alcance. Audit oficial sólo diagnóstico: xlsx HIGH, dos avisos, fixAvailable=false. Sin cambios de dependencias.
- [x] Correcciones preparadas en commits temáticos para push normal a la rama del PR #1; no mergear. Cierre documental posterior sin cambios de código probado.
- [ ] Post-merge autorizado: SQL incremental, despliegue separado de provisioning, JWT reales Dueño/Cajero/otro tenant y ensayo físico cámara/impresora. `xlsx` sigue abierto, sin fix automático. AFIP/WSFE/Point fuera de alcance.

## Resultado final
Findings finales corregidos y validados: identidad de alta estable y productos inactivos distinguidos en pistola/cámara. PR #1 abierto sobre la rama publicada; este cierre añade 10 regresiones y deja 1840 tests PASS, 1 skipped, 190 archivos, build PASS. No se modificó documentación histórica ni .env.local. xlsx sigue abierto. SQL remoto, provisioning, JWT reales y ensayo físico siguen post-merge y requieren autorización. Sin merge ni deploy en esta sesión.
