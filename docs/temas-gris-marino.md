# Modo claro crema tenue y modo oscuro azul profundo

Paletas compartidas en `src/styles/color-themes.css`, importadas por
`src/index.css`. Reemplazan la variante crema y la primera variante azul marino.
La revisión actual reduce la luminosidad de las superficies claras con crema
apagado y refuerza el componente azul del tema oscuro.

| Superficie | Claro | Oscuro |
| --- | --- | --- |
| Fondo / panel lateral | #dcd4c4 | #09111b |
| Tarjetas / modales | #e9e2d4 | #183b63 |
| Subpanel / hover | #d1c7b5 | #23476d |
| Borde de ventana | #bfb39e | #09111b |
| Texto principal | #2b2721 | #edf3fc |
| Texto secundario | #4d453a | #a4bad5 |

Los tokens gray/slate cubren las utilidades de Tailwind, sus opacidades y
estados. Toast, foco de teclado, selección y scroll también usan la paleta.
Los colores de acciones y categorías conservan su significado. El papel de
comprobantes conserva blanco, incluyendo exportación y vista previa.

La compilación es la comprobación local; queda pendiente la revisión visual
del despliegue en celular y computadora. No se ejecutaron pruebas funcionales
por este cambio de colores.

La referencia suministrada por el usuario se muestreó en dos puntos interiores:
#09111b (oscuro) y #183b63 (azul). Panel lateral, cabeceras/pies y bordes de
ventanas usan el oscuro; tarjetas y cuerpos de modal usan el azul. Hover y chips
neutros usan un escalón azul algo más claro. En claro se armonizan los fondos
indigo/blue/violet y avisos de estado con crema, y se oscurecen los textos de
acción para reducir los acentos intensos. Los meses sin ventas tienen una pista
más tenue para que no parezcan barras de importe distinto de cero.
