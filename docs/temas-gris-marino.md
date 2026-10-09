# Modo claro crema tenue y modo oscuro azul profundo

Paletas compartidas en `src/styles/color-themes.css`, importadas por
`src/index.css`. Reemplazan la variante crema y la primera variante azul marino.
La revisión actual reduce la luminosidad de las superficies claras con crema
apagado y refuerza el componente azul del tema oscuro.

| Superficie | Claro | Oscuro |
| --- | --- | --- |
| Fondo | #dcd4c4 | #0e2033 |
| Panel lateral | #e9e2d4 | #09111b |
| Tarjetas / modales | #e9e2d4 | #183b63 |
| Subpanel / hover / separadores | #d1c7b5 | #3b5d80 |
| Cabecera / pie de modal | #d1c7b5 | #112b46 |
| Borde de ventana | #bfb39e | #52789e |
| Botón principal | #a8c6d1 | #8db6d7 |
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
#09111b (oscuro) y #183b63 (azul). El panel lateral conserva el oscuro;
tarjetas y cuerpos de modal usan el azul. El fondo y las cabeceras tienen tonos
intermedios, con bordes azules visibles y sombra para separar las ventanas.
Los botones principales y las selecciones usan azules coordinados con los
modales; las acciones de peligro y éxito conservan sus colores semánticos.
La paleta completa de controles está en `src/styles/button-colors.css`:
azul petróleo en claro, azul acero en oscuro, verde salvia para confirmar,
rojo arcilla para acciones destructivas y ocre para advertencias. Cubre botones
compartidos, botones propios de cada pantalla y enlaces, incluidos iconos,
bordes, fondos suaves, hover y estados activos mediante tokens locales.
Los controles deshabilitados mantienen su opacidad y bloqueo existentes.
Los botones sólidos ahora usan fondos más claros y texto oscuro (#142b3a).
Los secundarios también tienen una superficie más clara para distinguirse
de las tarjetas, conservando sus bordes y estados de interacción.
Hover y chips neutros usan un escalón azul más claro. En claro se armonizan los fondos
indigo/blue/violet y avisos de estado con crema, y se oscurecen los textos de
acción para reducir los acentos intensos. Los meses sin ventas tienen una pista
más tenue para que no parezcan barras de importe distinto de cero.
