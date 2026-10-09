# Modo claro gris neutro y modo oscuro azul oscuro

Paletas compartidas en `src/styles/color-themes.css`, importadas por
`src/index.css`. Reemplazan la variante crema y la primera variante azul marino.
La segunda revisión usa grises sin matiz azulado y azul oscuro más luminoso.

| Superficie | Claro | Oscuro |
| --- | --- | --- |
| Fondo | #e5e5e5 | #132d4c |
| Panel | #f4f4f4 | #1b3c61 |
| Subpanel / hover | #dadada | #2a507a |
| Borde | #cccccc | #2a507a |
| Texto principal | #222222 | #eef5ff |
| Texto secundario | #4d4d4d | #a0c0e8 |

Los tokens gray/slate cubren las utilidades de Tailwind, sus opacidades y
estados. Toast, foco de teclado, selección y scroll también usan la paleta.
Los colores de acciones y categorías conservan su significado. El papel de
comprobantes conserva blanco, incluyendo exportación y vista previa.

La compilación es la comprobación local; queda pendiente la revisión visual
del despliegue en celular y computadora. No se ejecutaron pruebas funcionales
por este cambio de colores.
