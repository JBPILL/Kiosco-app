# F6.3B-2B — Initial Platform Admin

## Objetivo

Revisar y habilitar localmente el bootstrap de un SuperAdmin global nuevo y un primer Dueño nuevo, de manera transaccional para las filas de negocio, protegida contra concurrencia y de uso único.

## Contexto actual

`usuarios.rol` permite DUEÑO/CAJERO/VISOR. La app reconoce un SuperAdmin por `es_superadmin` y permite kiosco nulo, pero el bootstrap SQL exigía kiosco no nulo. `provision-user` requiere un actor existente y crea sólo CAJERO/VISOR. La migración productiva F6 continúa separada de cualquier ejecución hosted.

## Alcance

- Permitir en el schema limpio sólo perfiles globales SuperAdmin con kiosco NULL.
- Agregar estado destino-only de inicialización one-shot, sin privilegios API.
- Crear runner local con lock, precondiciones, Auth Admin, transacción de perfiles/kiosco, login smoke, pruebas RLS/DML y compensación.
- Mantener SuperAdmin role value dentro del enum actual y no habilitar creación ordinaria de SuperAdmins.

## Fuera de alcance

- Acceso, lectura o escritura hosted.
- Reutilización/migración de identidad legacy.
- Cambios a `provision-user`, Vercel, Auth settings o frontend.
- Abrir funciones globales adicionales a las ya declaradas por el contrato RLS.

## Decisiones importantes

- SuperAdmin usa `rol=VISOR`, `es_superadmin=true`, kiosco NULL: el flag aporta el privilegio global; VISOR minimiza privilegios de rol.
- El estado one-shot es `IN_PROGRESS/READY/PASS/TAINTED` y se protege de API roles. Advisory lock serializa intentos.
- Auth users se crean con Auth Admin local; kiosk + perfiles se insertan en una sola transacción. Fallo activa compensación; limpieza no demostrable implica TAINTED.

## Riesgos

- La policy RLS actual permite al SuperAdmin lectura global de varias tablas operativas; esta es una capacidad existente y se documenta explícitamente.
- PGlite/mocks no verifican GoTrue, login, managed roles ni configuración de Auth real.
- Si el proceso se interrumpe tras comenzar, `IN_PROGRESS` bloquea reintentos; requiere evaluación local antes de cualquier nueva acción.

## Criterios de aceptación

- Roles exactos y semántica de flag/null documentados y protegidos por constraints.
- Sólo un SuperAdmin y un Dueño, kiosco único.
- Lock durable impide carrera y reuso tras PASS.
- Auth failure/profile failure/login failure se compensan; compensación fallida => TAINTED.
- Direct browser DML sigue denegado; Dueño no puede promoverse.
- Pruebas locales, suite excluyendo deuda declarada, build, manifest y diff-check.

## Plan de implementación

1. Inspeccionar schema, helpers, RLS, RPC y Edge de provisioning.
2. Actualizar schema y estado durable; refrescar manifest/contrato de cero filas.
3. Implementar runner local-only y evidencia sin secretos.
4. Agregar pruebas SQL y runner.
5. Documentar el procedimiento y ejecutar validaciones.
6. Verificar si el stack local real está disponible; reportar cualquier rehearsal no ejecutado.

## Validación

- `node --check` del runner.
- `VALIDATE_ONLY`, `check-bootstrap`, manifest y JSON parse.
- Tests focalizados y suite completa excluyendo `partialReturnPreparation.test.ts`.
- `npm run build`, `git diff --check`.
- Supabase local real sólo si se confirma loopback/no-linked; nunca staging/legacy.

## Progreso

- [x] Inspección contractual de roles, flag, kiosco NULL, RLS/RPC/Edge.
- [x] Schema, tabla de estado y runner implementados localmente.
- [x] Tests focalizados iniciales PASS.
- [x] Documentación/contrato final y validación completa.
- [x] Rehearsal Supabase local real: bootstrap de cero filas, triggers y seguridad final, postflight, Auth inicial, separación de privilegios y pruebas autenticadas Edge.

## Resultado final

PASS local (2026-10-14). El rehearsal terminó con Auth=2, kioscos=1, perfiles=2, SuperAdmins=1, Dueños=1; login de ambos; `provision-user/create_staff`, aislamiento RLS, rechazo de escalamiento y usuario sin perfil, `supervisor-pin` sin PIN configurado, checkout manual transaccional, reconciliación de venta/pago/stock/caja y replay bloqueado. Suite excluyendo `partialReturnPreparation.test.ts`: 183 archivos, 1715 aprobados, 1 omitido. Build, manifest y diff-check PASS. No hubo acceso remoto ni commit/push/deploy. La validación hosted permanece diferida.


## Production Readiness — revisión permanente 20/10/2026

Referencia canónica: [gates PR01–PR11](../../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026). Gates aplicables a este ExecPlan: **PR06, PR08, PR10 y PR11**.

El bootstrap de identidad y sus smoke tests no cierran permisos fiscales ni transición productiva. Conservar las autorizaciones y el alcance exacto de la evidencia histórica.

Esta adenda complementa los estados y decisiones anteriores, sin borrarlos ni convertir un PASS local/histórico en aceptación global. Registrar entorno, versión, fecha, evidencia y límites antes de cerrar el gate aplicable. Continuar según el primer gate pendiente del registro maestro (PR01); las autorizaciones de la sesión conservan su alcance y no se amplían por este plan.
