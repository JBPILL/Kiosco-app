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
- [ ] Suite completa y build finales.
- [ ] Publicar en la rama del PR #3 y desplegar sólo el frontend de Staging.

## Conciliación pendiente
El cobro original inválido no debe redondearse ni marcarse confirmado. El Dueño
debe revisar la operación guardada y la resolución real del dinero mediante el
flujo existente de Cancelar pendiente. No declarar NO_COBRADO o REINTEGRADO sin
confirmación del operador. No crear venta de reemplazo antes de conciliar.
Esta corrección preventiva no constituye recuperación del cobro original.
El operador confirma que fue una prueba sin dinero real. Se indica cancelar
el pendiente con NO_COBRADO desde el mismo perfil, sin ejecutar esa decisión
por su cuenta ni borrar datos locales; falta confirmar el resultado de la UI.
Sin SQL remoto, Edge deploy, merge ni cambios de Production.
