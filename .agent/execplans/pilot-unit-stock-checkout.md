# Cobro bloqueado por stock histórico fraccionario (19/10/2026)

## Diagnóstico y alcance
En Staging el operador informa un cobro de aproximadamente $1.003 del único
artículo del catálogo. checkout-manual responde 409 CIERRE_NO_CONFIRMADO.
Los registros del servidor sitúan el fallo en COTIZAR_TICKET, SIN_CODIGO.
La lectura del catálogo confirma artículo por unidades a $200, stock 5.013;
no hay una preparación reciente de ese cobro. No se reenvía la operación.

El carrito redondeaba la cantidad editada a entero y después la limitaba al
stock decimal, reintroduciendo 5.013. Agregar de golpe o sumar una unidad
también producía esa cantidad. El backend rechaza correctamente las fracciones
de artículos no pesables. El total visible redondeado coincide con el incidente.

## Corrección
Usar sólo la parte entera del stock positivo como límite vendible para artículos
por unidad, sin modificar el valor histórico de stock. Normalizar el agregado
a entero y bloquear remanentes positivos menores que una unidad. Conservar el
comportamiento existente de pesables y del aviso de stock cero/negativo.
No alterar solicitudes ya guardadas, UUID, importes, ventas ni reintegros.

## Validación
- [x] Cuatro regresiones reproducidas: agregar, sumar, editar y remanente < 1.
- [x] Después de corregir: 93 pruebas PASS en carrito, recuperación y backend.
- [x] Suite final: 2091 PASS / 1 skipped / 217 archivos, 269.44 s.
      Build 631 módulos PASS. Diff trabajo/índice PASS; manifest 43 SQL intactos.
      Scan 1130 textos, 14 binarios omitidos, 46 candidatos conocidos.
      npm audit --omit=dev: 0 vulnerabilidades; no se modifican dependencias.
- [x] Corrección 536b41f y evidencia 208506e publicadas en la rama del PR #3.
      Frontend Staging READY: dpl_6QHLjvCqN3Dfi3TjU3c3NYqzvo9J.
      Alias kiosco-app-staging.vercel.app y bundle público verifican el cambio.
      PR #3 abierto y borrador, sin merge. Falta aceptación del carrito corregido
      en el perfil del operador; no se confirma ninguna venta adicional por agente.

## Conciliación pendiente
El cobro original inválido no debe redondearse ni marcarse confirmado. El Dueño
debe revisar la operación guardada y la resolución real del dinero mediante el
flujo existente de Cancelar pendiente. No declarar NO_COBRADO o REINTEGRADO sin
confirmación del operador. No crear venta de reemplazo antes de conciliar.
Esta corrección preventiva no constituye recuperación del cobro original.
El operador confirma que fue una prueba sin dinero real y realiza la cancelación
desde el perfil original. Lectura del servidor confirma NO_COBRADO para el
identificador original. No se borraron datos locales ni se reemplazó la entrada.
Sin SQL remoto, Edge deploy, merge ni cambios de Production.
