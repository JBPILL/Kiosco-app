# Escaneo, alta de productos y etiquetas

## POS

Una pistola que lee un código no registrado abre el alta editable únicamente
para el Dueño activo con comercio asignado. Permite revisar descripción, costo,
precio, stock y categoría antes de **Guardar y agregar al ticket**. No cobra
automáticamente. El cajero recibe un aviso para pedir el alta al dueño.

La cámara ofrece **Agregar y editar producto** tras verificar en el servidor
que el código no existe. Sin red o ante un error no se afirma que el producto
sea nuevo. El alta sólo se suma al ticket cuando el servidor la confirma;
un rechazo de permisos no se convierte en producto offline.

En strict pilot se usa la RPC existente con ID de producto estable igual al ID
de operación. Un reintento conserva ID/cuerpo original y centavos; el costo se
envía al contrato privado existente. Un resultado incierto requiere revisar el
catálogo antes de generar otra alta. Las operaciones antiguas pendientes con
otro ID de producto requieren conciliación; no se convierten automáticamente.

## Catálogo

La pistola o **Escanear con cámara** busca el código dentro del comercio activo.
Si existe abre edición; si no existe abre Producto nuevo con el código
precargado y editable. No guarda hasta confirmar el formulario. Una consulta
fallida no abre un alta; un código de producto inactivo no se duplica.

## Conteo físico

**Escanear con cámara** permite usar el celular. Cada captura suma una unidad
en la lista local, igual que la pistola. Reabrir la cámara permite otra captura.
La persistencia del ajuste sigue siendo una acción explícita del operador.
La cámara requiere HTTPS (o localhost), permiso del navegador y prueba en el
dispositivo real; las pruebas automatizadas sustituyen el dispositivo con mocks.

## Etiquetas

| Formato | Dimensión de cada etiqueta | Papel |
| --- | --- | --- |
| A4 | 65 × 33 mm | 3 columnas × 8 filas, margen 5 mm, separación 2,5 mm |
| Rollo 58 mm | 54 × 40 mm imprimibles | Página 58 × 40 mm, margen lateral 2 mm |
| Rollo 80 mm | 76 × 40 mm imprimibles | Página 80 × 40 mm, margen lateral 2 mm |

Vista previa e impresión comparten la misma tarjeta. El papel siempre es
blanco con texto oscuro, independientemente del tema. El nombre ocupa hasta
dos líneas; precio de 16 pt y barras de 5 mm mantienen su tamaño. Las opciones
ocultas reservan el espacio, incluyendo cuando se imprime. A4 se pagina en
grupos de 24; el contenedor de impresión queda fuera del modal para evitar
recortes por su scroll/altura.

Imprimir a **100%, sin ajustar a página**, sin cabecera/pie del navegador.
Los márgenes de hardware y compatibilidad de formatos térmicos requieren
ensayo en la impresora real. No se imprimió físicamente durante este cambio.

## Instalación SQL separada

`supabase_fase_alta_producto_solo_dueno.sql` actualiza sólo la RPC existente
para impedir altas directas del cajero; conserva administración de catálogo
por Dueño/SuperAdmin, edición autorizada, transacción, costos e idempotencia.
El POS ofrece el flujo únicamente al rol DUEÑO. No se aplicó SQL remoto.

El baseline limpio incorpora el mismo cambio en `steps/041` y su manifest
actualizado. **No reaplicar el bootstrap one-shot sobre una base instalada**.
Revisar destino F6, copia de respaldo, dependencias y SQL incremental antes de
un gate autorizado de aplicación; después probar Dueño/CAJERO/otro tenant con
JWT reales. Los hashes históricos de bootstrap acreditan la versión anterior,
no esta nueva definición. No se cambian ni se falsifican esas evidencias.
