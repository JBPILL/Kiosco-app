Este documento registra decisiones arquitectónicas o de dominio que sean no triviales, junto con su contexto y justificación.

## Alta de producto desde un código desconocido en POS (15/10/2026)

El usuario define que este flujo pertenece sólo al Dueño. Se conserva el alta
editable existente, con guardas al abrir y guardar y sin alta local falsa ante
rechazos. La cámara y la pistola comparten esa regla; el cajero solicita el
registro al dueño. El alta confirmada agrega el producto al ticket, no cobra.

Se descarta mantener creación directa por cajero en la RPC genérica de catálogo:
ocultar el modal no impediría invocarla por API. El SQL impide nuevas altas del
cajero y preserva la administración existente de catálogo por Dueño/SuperAdmin;
el acceso de POS continúa restringido a DUEÑO. El cambio SQL y su prueba son
locales; requiere aplicación incremental y aceptación autenticada antes de
afirmar la restricción instalada en Production. No se reaplica el bootstrap
one-shot ni se alteran evidencias históricas de hashes.

## Checkout transaccional

### Decisión

1. **Un único cierre online server-side.** La venta, pagos y efectos financieros/de stock deben confirmarse en una transacción del servidor. Evita que escrituras REST separadas dejen venta, stock o deuda desalineados.
2. **Outbox durable e identidad estable.** Guardar la solicitud original en IndexedDB antes de la llamada de red y conservar el mismo ID y cuerpo para cada reintento. La RPC compara la solicitud y devuelve el resultado previo ante repetición idéntica; un cuerpo distinto con el mismo ID requiere rechazo y conciliación.
3. **Sin fallback directo ante ambigüedad.** Un timeout o error de `checkout-manual` deja el intento pendiente y recuperable; volver a escribir venta/pagos desde el navegador podría duplicar una operación cuyo commit ya ocurrió.
4. **Cobros offline provisionales.** El comprobante local no equivale a una venta confirmada. Stock y deuda remotos cambian únicamente después de la aceptación del servidor, que vuelve a validar disponibilidad al sincronizar.
5. **Envases compartidos por kiosco con autoridad remota.** El estado local por terminal no puede ofrecer una cantidad común fiable entre cajas. La fuente remota compartida y su coordinación transaccional quedan como requisito de diseño para la fase que implemente el flujo de envases.

### Evidencia y alcance

La auditoría de esta fase verificó la cadena JWT → Edge Function → identidad autenticada → RPC, el guard de doble envío, la persistencia previa a la red, la recuperación del mismo ID y la semántica idempotente de la función SQL local. La evidencia remota aportada confirma Edge Function activa con JWT requerido, permisos restringidos y tablas de checkout con RLS; también reporta dos operaciones confirmadas y ninguna pendiente. No confirma el flag del frontend desplegado ni las colas locales de los terminales. Estas decisiones definen el destino; no activan el flag ni retiran todavía la ruta directa.

## Identidad inicial del backend productivo

### Decisión

1. El primer perfil global nuevo usa `rol='VISOR'`, `es_superadmin=true` y `kiosco_id=NULL`. `VISOR` es el rol permitido de menor privilegio; no se inventa un rol `SUPERADMIN`. El primer propietario usa `DUEÑO`, flag false y el kiosco nuevo.
2. El schema destino permite kiosco nulo únicamente para perfiles SuperAdmin y exige kiosco para cualquier perfil ordinario.
3. El bootstrap inicial es operador/local-only, separado de `provision-user`. Usa Auth Admin server-side, un advisory lock de sesión y una transacción única para kiosco/perfiles. El proceso registra `IN_PROGRESS/READY/PASS/TAINTED` en una tabla privada para bloquear concurrencia y reuso después de PASS.
4. Auth y PostgreSQL no comparten transacción; ante fallo se eliminan filas insertadas y Auth users creados. Si no se puede confirmar limpieza, se marca TAINTED y se detiene sin retry automático.

### Evidencia y alcance

El login/UI ya reconocían el SuperAdmin global sin kiosco, pero `001_domain.sql` lo impedía con `kiosco_id NOT NULL`. `auth_es_superadmin()` lee el flag del perfil en DB, no metadata del usuario. Las policies actuales permiten lectura global al SuperAdmin donde lo declaran explícitamente; no se amplía esa superficie. `provision-user` conserva sólo CAJERO/VISOR y perfiles con `es_superadmin=false`. El rehearsal real sobre Supabase local terminó PASS el 14/10/2026, incluidos Auth/GoTrue, login, RLS, separación de privilegios y checkout; ese resultado no valida Production hospedado. La validación hosted sigue diferida.
