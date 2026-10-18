# Etiquetas térmicas uniformes — 18/10/2026

## Problema
La vista previa usaba ancho intrínseco y altura mínima, y la impresión altura
variable. Los nombres de producto cambiaban el tamaño de las etiquetas. La
vista previa tampoco representaba los formatos térmicos impresos.

## Resultado
Se reutiliza EtiquetaTermica tanto en vista previa como en el área de impresión.
Rollo de 58 mm: área de contenido de 48 × 40 mm; rollo de 80 mm: 72 × 40 mm.
Página térmica de 58 × 40 o 80 × 40 mm, margen de página cero y una etiqueta por
página. El ancho de contenido deja márgenes laterales para el área imprimible.
Estas son medidas elegidas para la app; no se declara una medida universal de
etiqueta ni compatibilidad probada con todo firmware/controlador.

Filas fijas de negocio, descripción de hasta dos líneas, precio, barras y fecha.
Ocultar elementos conserva su espacio. Fondo blanco, texto negro y tamaño de
precio/código constante por formato. La impresión libera los contenedores del
modal y oculta sus hermanos, para evitar recorte por overflow y páginas vacías
por controles invisibles; limpia las clases al terminar o cerrar el modal.
Los tickets de venta/cierre y el diseño A4 no cambian en sus medidas.

## Verificación
Dirigidos: 9 PASS en tres archivos, incluyendo opciones ocultas, textos largos,
igualdad entre vista previa e impresión y limpieza de contenedores.
Navegador real: tres descripciones distintas dan 181,406 × 151,172 px en formato
58 y 272,125 × 151,172 px en 80; todas idénticas por formato, fondo blanco y
altura de barras 26,453 px. Equivalen a 48/72 × 40 mm en CSS a 96 dpi.
La vista previa fue revisada visualmente; fixture temporal retirado.
Suite final: 1877 PASS / 1 skipped / 200 archivos, 255,11 s (maxWorkers=2).
Build PASS, 613 módulos; aviso conocido de chunks mayores a 500 kB. Diff de
trabajo e índice PASS. Audit de producción cero vulnerabilidades. Escaneo de
1083 textos: mismos 44 candidatos sintéticos conocidos, sin nuevos candidatos;
14 binarios e historial no escaneados.

## Impresión física pendiente
Seleccionar rollo/ancho correspondiente, altura de etiqueta 40 mm si el driver
la requiere, escala 100 % y sin encabezados/pies del navegador. La app declara
las medidas por CSS; el diálogo/controlador puede sobrescribirlas. No hay ensayo
de papel realizado porque el usuario no tiene impresora disponible.
Sin SQL, credenciales ni cambios en ARCA; PR #1 no se integra.
