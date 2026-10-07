# Atajos de teclado

La ayuda F1 usa el mismo catálogo `src/lib/keyboardShortcuts.ts` que el hook del POS. Incluye F7 para cobro manual, Alt+P ofertas, Alt+H tickets, Alt+R envases (sólo si está habilitado), Alt+N nuevo ticket, Alt+flechas cambio de ticket y Alt+G guardar en espera. F6 enfoca el ticket; el título anterior de Pausar que mostraba F6 fue corregido.

Los atajos del POS funcionan desde su buscador principal. En otros campos respetan la edición; F2 puede recuperar la búsqueda y F1 abrir ayuda. No ejecutan acciones detrás de un diálogo, en composición de texto, con AltGr o repetición de tecla. Espacio conserva la activación nativa de botones/enlaces y abre cobro sólo desde el fondo del POS. Los atajos abren los formularios habituales: no confirman retiros ni cobros directamente.

Alt+1…9 sigue la numeración del menú visible para el rol y rubro. F10/Alt+M enfoca ese menú. No se promete una correspondencia fija entre número y pantalla para todos los roles. Fotocopias, impresiones, anillado y plastificado permanecen como acciones del módulo de servicios; F7 abre el formulario de cobro manual y Tab permite recorrer sus botones disponibles.

Validación: pruebas del hook para cada combinación del catálogo y fronteras de foco, modal, AltGr, composición, repetición y eventos consumidos; compilación del proyecto. Falta ensayo con teclado y navegador reales. No agrega SQL ni activa Point.

Autoevaluación: precisión 4/5 (catálogo y pruebas comunes; navegador real pendiente), completitud 4/5 (nuevos accesos y ayuda actualizada; servicios no tienen combinación individual), claridad 4/5 (ayuda compacta y títulos; menú depende del rol), utilidad 4/5 (acciones conectadas al POS; piloto pendiente), concisión 4/5 (catálogo único; alias conservados por compatibilidad). Promedio 4,0. Próxima mejora: comprobar el recorrido completo con teclado físico en el local. La evaluación no declara completo el plan general.
