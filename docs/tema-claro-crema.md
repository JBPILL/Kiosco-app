# Tema claro crema

Actualización del 09/10/2026. Paleta compartida en
`src/styles/cream-theme.css`, importada desde `src/index.css`.

| Uso | Color |
| --- | --- |
| Lienzo | #f6f0e4 |
| Panel / tarjeta | #fffaf1 |
| Subpanel / cabecera | #eee5d5 |
| Borde suave | #e2d6c2 |
| Borde de campo | #c9b99f |
| Texto principal | #302a24 |
| Texto secundario | #655745 |

Se sustituyen tokens grises y slate solamente en modo claro para cubrir las
pantallas existentes y sus estados hover/opacidad. Se eliminan las antiguas
reglas por coincidencia parcial de clases, que imponían fondos fríos incluso
cuando la clase era de hover o del modo oscuro. Avisos toast también usan marfil.
Los acentos de acciones y estados mantienen sus significados y los colores
personalizados de categorías se conservan.

Tickets internos, ARCA, cierres, pagos y etiquetas conservan papel blanco.
El modo oscuro conserva sus tokens originales.

Compilación local aprobada. Verificación visual en Safari y Windows pendiente;
los contrastes calculados de texto principal y secundario sobre el lienzo fueron
12.48:1 y 4.61:1 respectivamente. Esto no certifica todos los estados ni promete
efectos médicos: brillo de pantalla, iluminación y tamaño de letra también cuentan.

Autoevaluación: exactitud 4/5 (compilado, falta revisión visual), completitud 4/5
(paleta compartida, no rediseña disposición), claridad 4/5 (tokens documentados),
accionabilidad 4/5 (probar despliegue en dispositivos), concisión 4/5 (registro breve).
