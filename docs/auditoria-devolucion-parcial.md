# Devolución parcial — revisión del 08/10/2026

Código revisado: `40b623a`. Alcance: lectura de store y migración base;
no se inspeccionó catálogo remoto ni se ejecutó una devolución sobre producción.

## Hallazgos que impiden cerrar P06

| Ruta actual | Evidencia | Consecuencia |
| --- | --- | --- |
| Comprobación de devoluciones anteriores | `src/stores/devolucionStore.ts`, consulta previa: sólo verifica límites si no hay error; catch continúa. | Ante permiso/red fallidos, puede avanzar sin límite conocido. |
| Cantidades y reintegro | Validación inicial usa isNaN; monto usa precioUnitario recibido del cliente y Math.round por item. | Falta rechazo de infinito, cálculo autoritativo y control agrupado de entradas repetidas. |
| Persistencia | Inserts de cabecera/detalles, updates de stock, movimientos y lotes son llamadas separadas. | Falla intermedia o concurrencia puede dejar efectos parciales. |
| Receta de combo | Reposición usa `useComboStore` y productos actuales. | No acredita restitución de componentes históricos de la venta. |
| Reintegro | Errores de movimiento de caja y reversión de deuda se capturan con console.warn; flujo alcanza success. | Éxito no acredita efecto financiero confirmado. |
| Compensación | Catch final elimina detalles/cabecera. | No revierte los movimientos, stock o saldo que se hubieran aplicado. |
| RLS base | `supabase_devoluciones.sql` crea políticas FOR ALL USING(true) WITH CHECK(true). | La migración base no aísla comercio/rol. El permiso efectivo requiere diagnóstico remoto: no se deduce sólo del archivo. |

## Controles previos corregidos después de la auditoría

El store ahora rechaza comercio distinto, total inválido, cantidades no finitas,
precios inválidos, productos ajenos y productos repetidos en una entrada.
Un error, excepción o respuesta no válida al consultar devoluciones anteriores
impide todas las escrituras. Doce pruebas del store con Supabase simulado
comprueban ese bloqueo. Estos controles no convierten el navegador en una
frontera de autorización ni resuelven concurrencia/atomicidad: los hallazgos
anteriores describen la revisión inicial y el backend transaccional sigue abierto.

## Requisitos del reemplazo transaccional (pendientes)

### Base de cálculo implementada, todavía sin conexión al circuito

`supabase_fase_devolucion_calculo_historico.sql` define una función privada que
calcula diferencia de importe acumulado redondeado a centavos. Un artículo de
$1 dividido en tres devoluciones reintegra $0,33, $0,34 y $0,33. Valida finitud,
precisión monetaria/de cantidades y límite original. Doce pruebas PostgreSQL
locales aprobaron cálculo, pesables, valores inválidos y ejecución API revocada.

No aplicar esta función como reemplazo de la devolución existente: aún no hay
RPC transaccional conectada. El futuro llamador debe bloquear venta/devoluciones,
obtener cantidades previas del registro confirmado y usar importe neto histórico
de cada detalle. Debe distribuir previamente descuentos globales conservando
exactamente el total cobrado; el subtotal bruto no sustituye ese importe neto.
La función no lee ni autoriza una venta, no audita ni repone stock/caja/deuda.

La misma base incluye `distribuir_importes_historicos_devolucion`: reparte el
total neto por subtotales históricos mediante diferencias acumuladas redondeadas
y orden estable por ID de detalle. Conserva el total aunque cambie el orden de
entrada. Rechaza IDs repetidos, subtotales negativos o datos insuficientes.
Dieciocho pruebas locales aprobaron ambos cálculos; roles API no pueden
ejecutarlos. El futuro backend debe proporcionar estos datos desde el checkout
persistido, nunca desde importes del navegador. No constituye todavía devolución
confirmada ni prueba de tratamiento fiscal de comprobantes ARCA.

### Implementación y aceptación restantes

1. Identidad autenticada verificada, comercio y permiso de devolución en servidor;
   ningún rol/precio/costo o saldo enviado por navegador decide autorización.
2. Identificador estable de solicitud, snapshot de entrada y resultado guardado
   para reintento. Bloquear venta original y devoluciones concurrentes antes de
   validar cantidades acumuladas por detalle original.
3. Calcular reintegro desde importes históricos y descuento distribuido, con
   precisión monetaria y remanente que impida exceder el total original.
4. Restituir receta y lotes históricos; si faltan datos suficientes en ticket
   antiguo, exigir conciliación explícita, sin reconstrucción con catálogo actual.
5. Cabecera, detalles, stock/kardex/lotes, caja o cuenta corriente y auditoría
   deben confirmar juntos. Error de cualquiera revierte toda la operación.
6. Conservar venta/pagos originales inmutables. No modificar notas de la venta
   como sustituto de un registro de devolución confirmado.
7. Revocar escritura directa por tabla y columna y definir RLS de lectura
   por comercio. No aplicar bloqueo SQL sobre producción sin publicar antes
   la ruta backend que sustituye el store.
8. Probar pago mixto, fiado, caja cerrada, combo con receta cambiada, lote,
   duplicados, respuesta perdida y dos devoluciones concurrentes.

La anulación atómica existente no equivale a devolución parcial. Esta auditoría
no cierra P06: identifica el trabajo de implementación y aceptación que falta.

## Entorno para ensayo PostgreSQL

En esta revisión `Get-Command pg_dump,pg_restore,psql` no encontró herramientas
en PATH. Falta confirmar un proyecto/base de ensayo separado del comercio
operativo. La consulta no busca contraseñas ni acredita que las herramientas
no existan en otra carpeta. El dump/restore real sigue abierto (P15).
