# Modo claro gris y modo oscuro azul marino

Paletas compartidas en `src/styles/color-themes.css`, importadas por
`src/index.css`. Reemplazan la variante crema previa.

| Superficie | Claro | Oscuro |
| --- | --- | --- |
| Fondo | #eceef1 | #101d35 |
| Panel | #f9fafb | #182b49 |
| Subpanel / hover | #e3e6eb | #2a4265 |
| Borde | #d5dae2 | #2a4265 |
| Texto principal | #1d2735 | #edf3fc |
| Texto secundario | #4d596b | #a4b8d5 |

Los tokens gray/slate cubren las utilidades de Tailwind, sus opacidades y
estados. Toast, foco de teclado, selección y scroll también usan la paleta.
Los colores de acciones y categorías conservan su significado. El papel de
comprobantes conserva blanco, incluyendo exportación y vista previa.

La compilación es la comprobación local; queda pendiente la revisión visual
del despliegue en celular y computadora. No se ejecutaron pruebas funcionales
por este cambio de colores.
