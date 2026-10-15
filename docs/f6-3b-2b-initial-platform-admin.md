# F6.3B-2B — Initial Platform Admin

Estado: implementación y rehearsal local real PASS (2026-10-14). El runner sólo acepta un stack local loopback.

## Hallazgo contractual previo

`public.usuarios.rol` admite exactamente `DUEÑO`, `CAJERO` y `VISOR`. No existe el rol `SUPERADMIN`. El contrato separa rol comercial (`rol`) y privilegio global (`es_superadmin`): `auth_es_superadmin()` consulta el booleano activo del perfil; `auth_es_dueno_o_superadmin()` permite el flag global o `rol='DUEÑO'`. `auth_user_kiosco_id()` devuelve el kiosco del perfil activo y, por ello, `NULL` para un perfil global.

La UI/login ya permiten el caso `es_superadmin=true AND kiosco_id=NULL` y enrutan esa identidad al panel SuperAdmin. Sin embargo, antes de este cambio, `001_domain.sql` declaraba `usuarios.kiosco_id NOT NULL`, por lo que el destino limpio no podía representarlo. El schema del baseline se actualizó para admitir esa forma y ahora exige el invariante: SuperAdmin global ⇒ `kiosco_id IS NULL`; perfil ordinario ⇒ `kiosco_id IS NOT NULL`.

El SuperAdmin inicial usa `rol='VISOR'`, el rol permitido de menor privilegio, y `es_superadmin=true`. El primer dueño usa `rol='DUEÑO'`, `es_superadmin=false` y el kiosco creado en la misma operación. Nunca se asigna `SUPERADMIN` como rol.

## Superficie de autorización existente

- Las policies de `900_final_security.sql` reconocen `auth_es_superadmin()` como lectura global para kioscos, perfiles, catálogo, stock, ventas, caja, clientes, proveedores y soporte, entre otras relaciones. Algunas policies de auditoría/electrónica conservan alcance por kiosco. Esta lectura global es parte del contrato RLS actual; el addendum no la amplía.
- `authenticated` no recibe INSERT/UPDATE/DELETE directo sobre tablas de negocio. El estado de inicialización tampoco es visible ni modificable por `anon`, `authenticated` o `service_role`.
- Varios RPC de escritura evalúan `rol='DUEÑO'` o `es_superadmin`; los flujos operativos derivan actor/kiosco de la sesión y no deben tratar `VISOR` por sí solo como autorización. `actor_operativo_actual()` sólo selecciona Dueño/Cajero o un SuperAdmin activo.
- `provision-user` autentica el JWT y perfil en servidor. `create_staff` admite sólo `CAJERO`/`VISOR`, inserta `es_superadmin=false`, y su compensación elimina el usuario Auth si falla el perfil. `link_credentials` sólo vincula perfiles no SuperAdmin del kiosco del actor. No hay acción para crear un SuperAdmin o Owner.
- Los clientes que protegen el panel usan `es_superadmin`; bajo strict pilot el panel comercial sigue fuera de alcance. Las policies RLS, no la UI, son la frontera de datos.

## Diseño del bootstrap inicial

`scripts/f6-3b-initial-platform-admin.mjs` ejecuta `INITIAL_PLATFORM_ADMIN_BOOTSTRAP` sólo sobre loopback local, puerto API 54321 y DB 54322. Rechaza URLs hosted. Requiere evidencia local PASS del bootstrap de cero filas, credenciales de dos usuarios nuevas recibidas por variables de entorno del proceso y una ruta de evidencia nueva fuera del repo. No admite passwords/keys en argumentos y no los incluye en logs/evidence.

El runner mantiene una conexión PostgreSQL de sesión y adquiere un advisory lock exclusivo durante todo el flujo. Antes de crear usuarios exige Auth=0, perfiles=0, kioscos=0 y estado no inicializado. La tabla interna `platform_initial_admin_bootstrap_state` empieza vacía, queda incluida como destino-only `reinitialize`, tiene RLS y no otorga acceso a roles API. Sus estados son `IN_PROGRESS`, `READY`, `PASS`, `TAINTED`; `PASS` impide una segunda ejecución incluso si alguien elimina después los perfiles/kiosco.

Orden de operación:

1. Validar evidencia de bootstrap y destino local.
2. Tomar el advisory lock y comprobar todos los conteos/estado.
3. Reclamar `IN_PROGRESS`.
4. Crear SuperAdmin y Dueño nuevos mediante Auth Admin local; no se establecen `app_metadata` de rol/kiosco ni se reutiliza identidad existente.
5. En una transacción PostgreSQL crear el kiosco y ambos perfiles con los valores anteriores.
6. Verificar Auth=2, usuarios=2, kioscos=1 y las invariantes exactas.
7. Hacer login de ambas identidades contra Auth local.
8. Insertar y retirar un kiosco sintético temporal; probar que el Dueño ve sólo su kiosco, el SuperAdmin ve el alcance global que declara la policy y el Dueño no puede actualizar `es_superadmin` directamente.
9. Marcar el estado durable `PASS` y escribir evidencia sólo con hashes, estado y conteos.

Si falla Auth, perfil, login o prueba de permisos, el runner elimina los perfiles/kiosco propios y los Auth users creados por ese intento. Si confirma conteos cero, deja `READY` y reporta `FAILED_COMPENSATED`; no reintenta automáticamente. Si no puede demostrar limpieza, deja `TAINTED` cuando sea posible, escribe evidencia `TAINTED_INITIAL_ADMIN_BOOTSTRAP` y se detiene. Estados `IN_PROGRESS`, `PASS` o `TAINTED` bloquean la siguiente invocación.

La tabla de estado se clasifica en `data-migration.json.reinitialize`: debe estar vacía durante la reconciliación zero-row y no es dato comercial exportado. Su fila de estado se crea sólo al iniciar el bootstrap administrativo.

## Rehearsal local

Usar un stack Supabase local limpio y un paquete PRE_CUTOVER de cero filas ya reconciliado. El runner se niega a usar cualquier host hosted incluso si se proporciona un secreto válido. Variables obligatorias, sólo con valores sintéticos locales:

- `F6_LOCAL_DATABASE_URL`: PostgreSQL local en loopback, puerto 54322, base `postgres`.
- `F6_INITIAL_ADMIN_SUPABASE_URL`: API local loopback, puerto 54321.
- `F6_INITIAL_ADMIN_SERVICE_ROLE_KEY` y `F6_INITIAL_ADMIN_PUBLIC_KEY`: claves sintéticas locales en el entorno del proceso; no imprimirlas, pasarlas como argumento ni copiarlas a evidencia.
- `F6_INITIAL_ADMIN_INPUT_JSON`: JSON de dos emails/nombres sintéticos y dos passwords sintéticas distintas; no imprimir ni persistir en el repo.

La evidencia de precondición debe tener `status=PASS`, `finalStatus=PASS`, `reconciliationStatus=PASS`, `expectedMigrableRows=0`, `lastPassedStep=RECONCILIATION_FINAL` y `targetProjectRef=local`.

Comando:

```powershell
node scripts/f6-3b-initial-platform-admin.mjs INITIAL_PLATFORM_ADMIN_BOOTSTRAP --target local --bootstrap-evidence 'C:\KioskoPOS-Migration\local-production-bootstrap-evidence.json' --evidence 'C:\KioskoPOS-Migration\initial-platform-admin-evidence.json'
```

PASS esperado: `AUTH_USERS=2`, `USUARIOS=2`, `KIOSCOS=1`, `SUPERADMINS=1`, `DUEÑOS=1`; el archivo de evidencia no contiene emails, passwords, API keys, service-role, tokens ni IDs de cuenta.

Este procedimiento todavía necesita ejecutarse contra Supabase local real para verificar Auth, login, grants/RLS y runtime GoTrue. Las pruebas PGlite y mocks no equivalen a esa validación.
## Resultado del rehearsal local real (2026-10-14)

Se ejecutó en `X:\Programación\kiosko-app-f6-validation`, sin link ni remote Git, sobre Supabase local en loopback. El stack se comprobó limpio antes del bootstrap: sin tablas de dominio, sin usuarios Auth y sin estado de inicialización. El paquete PRE_CUTOVER validado tenía cero filas migrables.

La secuencia canónica terminó PASS: 41 pasos pre-import, import local del paquete de cero filas, reconciliación pre-trigger, `042_post_import_triggers.sql` con 15 triggers, `900_final_security.sql`, postflight y reconciliación final. La verificación final encontró 43 tablas con RLS, cero DML directo para roles API, cero `PUBLIC EXECUTE`, cero huérfanos y cero relaciones cross-kiosk.

`INITIAL_PLATFORM_ADMIN_BOOTSTRAP` terminó PASS con Auth=2, perfiles=2, kioscos=1, SuperAdmins=1 y Dueños=1. Las dos identidades hicieron login en GoTrue local. La prueba autenticada de RLS confirmó alcance de un kiosco para el Dueño y alcance global declarado para el SuperAdmin; el Dueño no pudo elevar su perfil. Un intento de repetir el bootstrap quedó bloqueado antes de escribir.

Pruebas adicionales con identidades/datos sintéticos locales: `provision-user/create_staff` permitió al Dueño crear un CAJERO, rechazó la acción de un CAJERO y rechazó la promoción a DUEÑO; un usuario Auth sin perfil fue rechazado. `supervisor-pin` respondió que no hay PIN configurado. `checkout-manual` completó una venta de prueba con un pago, descontó stock y permitió cerrar la sesión; la verificación encontró cero cajas abiertas. Se retiraron el CAJERO temporal, el usuario Auth sin perfil y el kiosco temporal de prueba.

Evidencia local sin credenciales ni identificadores de cuenta:

- `C:\KioskoPOS-Migration\local-production-bootstrap-evidence-2026-10-14.json`
- `C:\KioskoPOS-Migration\initial-platform-admin-evidence-2026-10-14.json`
- `C:\KioskoPOS-Migration\initial-platform-admin-replay-evidence-2026-10-14.json`

La validación final pasó: 183 archivos de test, 1715 tests aprobados y 1 omitido (excluyendo `src/test/partialReturnPreparation.test.ts`), build y `git diff --check`. El build conserva la advertencia existente de un chunk mayor a 500 kB. Esta evidencia sólo valida el stack local; Edge Functions desplegadas, Auth/configuración administrada, secretos hosted y diferencias de infraestructura siguen `DEFERRED_HOSTED_VALIDATION`.