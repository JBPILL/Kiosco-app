# Stock de sachets y paquetes

Decisión del comercio: mantener **el sachet como unidad base de stock**.

- Crear un producto por artículo real: por ejemplo, mayonesa sachet 60 g y mostaza
  sachet 60 g son productos distintos, con unidad **UN**.
- Un paquete de 24 sachets aporta 24 unidades al stock del producto correspondiente.
  Cinco paquetes aportan 120 sachets; los 60 g describen su contenido y no cambian
  la unidad de inventario.
- Si se vende la presentación completa, crear un combo/pack del mismo producto
  con un componente de cantidad **24**. Vender un sachet consume una unidad;
  vender un pack consume 24 unidades del mismo stock base.
- No crear además stock independiente de paquetes: duplicaría las existencias.
- Registrar cantidad y vencimiento de cada partida en sachets. Dos partidas con
  fechas diferentes mantienen lotes separados aunque sean el mismo producto.

El stock calculado del combo indica cuántos grupos de 24 se pueden formar. No
distingue paquetes sellados de sachets sueltos ni convierte automáticamente una
cantidad ingresada como “paquetes”: al cargar mercadería hay que expresar la
cantidad en unidades base. Conservá la presentación física según cómo se vende.
