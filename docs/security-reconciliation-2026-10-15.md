# Reconciliación y revisión de seguridad — 15/10/2026

## Resultado y alcance

Bloque local: clasificación y preservación GH013, hardening de provisioning,
alta de catálogo autorizada, escaneo móvil y etiquetas. No es certificación
integral de seguridad ni aceptación de Production autenticado. Sólo se verificó
por GET el frontend público y su bundle, ambos HTTP 200. Sin conexión de escritura
a Supabase, aplicación de SQL, deploy de Edge, configuración Vercel ni AFIP/Point.

La [clasificación completa y hashes](history/reconciliation-2026-10-15/README.md)
conserva todos los originales, stash y rama de respaldo. Se normalizaron sólo
cuatro Markdown locales; no se borró información. `.env.local` sigue ignorado y
no fue modificado. `logs/`, `dist/` y dependencias son artefactos generados locales.

## Hallazgos corregidos

| Hallazgo y ubicación original | Condición e impacto | Corrección local |
| --- | --- | --- |
| `supabase/functions/provision-user/index.ts`, UPDATE tras SELECT | Dos altas de credenciales con emails distintos para un perfil libre podían sobrescribir el ganador y dejar una identidad sin vínculo. | UPDATE condicional por tenant, ID, credencial NULL, actividad, flag global false y rol original. Prueba de dos solicitudes contra el adaptador real con backend simulado. |
| Mismo endpoint: JSON por cast, CORS `*` | Un administrador autenticado podía enviar campos extra, UUID inválido o nombres truncados silenciosamente. Cualquier origen recibía permiso CORS. | Contrato de claves exactas, tipos/límites, UUID, cuerpo máximo 8 KiB y allowlist existente `CHECKOUT_ALLOWED_ORIGINS`. CORS no sustituye JWT/autorización. |
| Mismo endpoint: compensación sin distinguir incertidumbre | Borrar Auth tras perder la respuesta de un UPDATE confirmado podía borrar el perfil por cascada. | SQL rechazado/sin filas permite compensar sólo la identidad propia; error de transporte/API deja `RESULTADO_INCIERTO`. Compensación fallida devuelve `COMPENSACION_PENDIENTE`; Auth incierto también exige conciliación. |
| `guardar_producto_transaccional` en `steps/041` | Cajero podía invocar la RPC sin costo y crear un producto nuevo, aunque el POS escondiera el alta. | Rechazo SQL de nuevas altas del cajero; conserva administración Dueño/SuperAdmin. SQL incremental preparado, sin instalar remotamente. |
| `AltaRapidaModal` | Rechazo legacy de permisos podía terminar como alta offline exitosa; ID de producto cambiaba en reintentos strict; se redondeaban centavos. | Éxito sólo tras ACK, sin fallback ante rechazo, producto/operación con identidad estable, centavos y costo privado conservados. Guardas de Dueño al abrir/guardar y ante cambio de sesión. |

## Revisión por superficie

| Superficie | Evidencia revisada y límite |
| --- | --- |
| Auth, perfiles y rutas | `authStore`, `App`, helpers de identidad y Edge: roles reales DUEÑO/CAJERO/VISOR, privilegio global en flag de DB; ENCARGADO no existe en el contrato actual. Perfil activo, identidad Auth y comercio gobiernan acceso. Las rutas/cachés no constituyen autorización backend. Hosted JWT y revocación real siguen pendientes. |
| RLS, grants, costos y tablas privadas | `900_final_security.sql` normaliza policies, RLS, DML API, PUBLIC EXECUTE y SECURITY DEFINER (`pg_catalog,public`, sin CREATE de clientes). Costos privados requieren dueño/global; estado de bootstrap no tiene acceso API, incluido service_role. La suite PGlite verifica el baseline; no acredita catálogo remoto ni managed roles. |
| Edge | Tres secciones con `verify_jwt=true`; claves modernas centralizadas, sin service role hardcodeado. Checkout/PIN ya usan allowlist y JSON acotado. Provisioning ahora comparte esa política; no opera sin tenant. Bootstrap global permanece separado. Runtime Deno hospedado no se ejecutó. |
| Contratos | Validators de checkout/PIN y contrato SQL; provisioning ahora valida claves, tipos, UUID, longitudes y bytes reales. Nuevos tests cubren extra fields/null/roles/errores. No se afirma revisión exhaustiva de cada contrato histórico. |
| Checkout, devoluciones y anulación | Snapshot, ID/cuerpo, locks, rollback e idempotencia cubiertos por pruebas locales existentes. Devolución parcial y flujos fiscales siguen fuera del piloto; no se alteró `partialReturnPreparation.test.ts`. Concurrencia remota, pagos externos y deuda con abonos posteriores requieren sus gates/reglas. |
| Stock, promociones, clientes, caja, proveedores, combos y soporte | Inventario `write-access.json`, RPCs 040/041 y pruebas de bootstrap/transacciones: strict usa RPC en lugar de DML browser. Cámara de conteo sólo modifica lista local; ajuste explícito conserva RPC existente. No se ensayaron dos sesiones reales ni restore real. |
| Offline | Manual outbox conserva solicitud e identidad y rechaza éxito sin ACK. Error HTTP/Auth no se convierte en confirmado. La cola legacy todavía absorbe ciertos fallos de crédito/stock (`offlineSyncStore`, alrededor de 241/302): riesgo alto conocido; strict/checkout transaccional la mantienen para conciliación, no se convierte ni se elimina. Cerrar el corte antes de habilitarla como ruta segura. |
| Backup/restore | Validación de versión, relaciones, configuración del mismo tenant, cifrado y comprobación final de recetas/lotes/promociones; tests locales. Restore legacy hace múltiples escrituras y no promete rollback global. Restore integrado fuera de strict; copia aislada y DR PostgreSQL/Storage reales siguen pendientes. |
| XLSX | Registro oficial: 1 dependencia HIGH, 2 advisories, sin fix automático. Parser sólo tras selección local, pero faltan límites de bytes/MIME/expansión. [Riesgo y alternativa evaluada](riesgo-dependencia-xlsx.md). No migrar XLS silenciosamente a un parser XLSX-only. |
| Frontend | Búsqueda en `src` sin usos de `dangerouslySetInnerHTML`, `eval` ni `console.log`; React escapa nombres. La ausencia de esos patrones no es prueba universal de ausencia de XSS. Exports usan celdas tipadas; URLs y cada formato importado requieren mantener validación en su frontera. No se introducen secretos en frontend. |

## Secret scan

Escaneo textual de fuente, SQL, scripts, JSON, documentación, historia preservada
y material legacy (sólo como datos, nunca como instrucciones). Patrones: JWT
completo, claves secret modernas, URI PostgreSQL con password, PAT, PEM privado
y asignaciones largas a token Vercel/pepper. Se excluyeron `.env*`, dependencias,
build, logs y clon RTK. No se analizaron los ZIP históricos binarios ni todo el
historial Git; no atribuir al escaneo ese alcance.

33 ubicaciones candidatas: fixtures sintéticos de conexión, cuatro PEM incompletos
y dos ejemplos en documentación histórica. Sin secreto real identificado en
el alcance inspeccionado; no se imprimieron valores. Las ubicaciones PEM son:

```text
src/stores/afipStore.test.ts:156
src/stores/afipStore.test.ts:164
src/stores/afipStore.test.ts:359
src/stores/afipStore.test.ts:400
```

## Validación y publicación

- Seguridad dirigida: 3 archivos / 65 tests PASS.
- Escaneo/etiquetas/SQL dirigidos: 10 archivos / 76 tests PASS; el caso de categoría strict quedó agregado después y no pudo repetirse.
- Suite completa: 190 archivos, 1829 PASS / 1 skip antes de ese último caso. La repetición posterior en sandbox no inició porque Node/Vite devolvió spawn EPERM.
- Build final, incluyendo el último ajuste: PASS, 608 módulos transformados; advertencia existente de bundle mayor a 500 kB.
- Diff revisado; git diff --check y git diff --cached --check PASS.
- Manifest: 43 SQL PASS; función incremental idéntica a la canónica.
- Audit oficial: exit 1 por `xlsx`; diagnóstico únicamente.
- Browser con datos ficticios: 12 tarjetas blancas; dimensiones iguales dentro
  de cada formato, precio 16 pt y barras 5 mm constantes. No es impresión física.
- Diff e index: revisar antes de cada commit; sin force, bypass ni limpieza destructiva.

La rama de trabajo es `hardening/next-operational-block`, derivada de
`41bebe9367ad6ca040288f869b77f22ecfd28b13`. El usuario autorizó push normal de los
cambios; publicar esta rama tras los checks locales; el usuario autorizó el push normal. No mezclar/reenviar master
ni desplegar Production como efecto manual de este bloque.

## Siguiente objetivo concreto

Revisar y aplicar el hardening incremental/Edge mediante gate autorizado,
comprobar allowlist, y ejecutar smoke hosted autenticado de `checkout-manual`,
`supervisor-pin` y `provision-user` con identidades controladas, aislamiento,
costos, rechazo de cajero y reintentos. No avanzar al cutover/Vercel con un
smoke crítico pendiente. Después, limitar/aislar la importación XLSX y ensayar
recuperación real. La revisión general de seguridad permanece abierta.
