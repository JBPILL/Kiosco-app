Este documento registra decisiones arquitectónicas o de dominio que sean no triviales, junto con su contexto y justificación.

## Límite de administración comercial (16/10/2026)

Se agrega una capacidad VITE_ADMIN_COMERCIAL_HABILITADO independiente del strict
pilot, false por defecto. Controla visibilidad, no privilegios ni instalación.
La autorización real pertenece a RPCs/Edge con perfil activo de DB; se eliminan
escrituras privilegiadas browser-side y el alta de Dueño mediante signUp.

El módulo SQL es una extensión incremental y canónica opcional instalada después
del baseline endurecido; sus checksums se verifican en optionalModules del manifest.
No se cambia la ventana F6 ni se insertan tablas comerciales en un import/cutover
histórico automáticamente. Para datos existentes se exige preflight y resolución
de suscripciones ambiguas; no se inventan planes ni coberturas. Esto evita reinterpretar
el historial migratorio y permite instalar comercial sin habilitar módulos excluidos.

La fuente de autoridad es el estado efectivo calculado en DB: suspensión administrativa
domina; falta de suscripción o vencimiento implica SOLO_LECTURA; renovación válida
reactiva sólo si no hay suspensión manual. Vencimiento inclusivo en fecha argentina,
sin gracia; meses calendario 1..12. Triggers con lock del kiosco protegen escrituras
de venta, stock, caja y crédito incluso desde SECURITY DEFINER. Login, consultas,
soporte y exportación de backups mantienen su alcance. El replay sin nueva mutación
recupera resultado cuando el contrato original lo permite; no se usa un rollback
del frontend como sustituto de autorización.

Se usa un libro privado equivalente a operaciones_escritura que admite operaciones
globales sin tenant (planes/config). Cada UUID queda ligado a actor, tipo, tenant,
solicitud y resultado; renovación/pago/auditoría son atómicos. No se guardan passwords
en navegador ni en el libro. Provision-commerce reserva antes de Auth Admin, finaliza
datos en una transacción y reclama compensación bajo lock sólo ante rollback inequívoco.
Incertidumbre o compensación fallida requiere conciliación/TAINTED, sin borrado ni
retry destructivo automático. Funciones de saga sólo service_role; RPCs de usuario
sólo authenticated con verificación interna. Ninguna de estas decisiones instala
la extensión ni autoriza deploy/SQL remoto.

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

## Distribución corregida de SheetJS para la importación de catálogos

Se conserva SheetJS CE y la API de importación XLS/XLSX, actualizando desde npm
0.18.5 al tarball oficial 0.20.3 fijado con integridad en el lockfile. Los dos
avisos HIGH conocidos afectan versiones anteriores; el paquete npm antiguo no
publica sus correcciones. Cambiar a read-excel-file retiraría XLS, por lo que se
descarta esa alternativa. Se valida con archivos binarios reales y audit, sin
supresiones, audit fix ni scripts de instalación. El origen CDN queda como
requisito de instalación reproducible y deberá revisarse en futuras actualizaciones.
