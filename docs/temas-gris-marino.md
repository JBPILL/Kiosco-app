# Modo claro crema tenue y modo oscuro azul profundo

Paletas compartidas en `src/styles/color-themes.css`, importadas por
`src/index.css`. Reemplazan la variante crema y la primera variante azul marino.
La revisión actual reduce la luminosidad de las superficies claras con crema
apagado y refuerza el componente azul del tema oscuro.

| Superficie | Claro | Oscuro |
| --- | --- | --- |
| Fondo | #dcd4c4 | #123164 |
| Panel | #e9e2d4 | #193f79 |
| Subpanel / hover | #d1c7b5 | #2c5694 |
| Borde | #bfb39e | #2c5694 |
| Texto principal | #2b2721 | #eff5ff |
| Texto secundario | #4d453a | #a8c7f5 |

Los tokens gray/slate cubren las utilidades de Tailwind, sus opacidades y
estados. Toast, foco de teclado, selección y scroll también usan la paleta.
Los colores de acciones y categorías conservan su significado. El papel de
comprobantes conserva blanco, incluyendo exportación y vista previa.

La compilación es la comprobación local; queda pendiente la revisión visual
del despliegue en celular y computadora. No se ejecutaron pruebas funcionales
por este cambio de colores.
