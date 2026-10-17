# Contrato de backend de la aplicación

Este directorio mantiene el inventario automático de dependencias de `src/`, las excepciones strict-pilot y la decisión de escritura por flujo. Ejecutar `npm test -- --run src/test/backendContract.test.ts src/test/kioskoBootstrapSql.test.ts` después de cambiar una relación, RPC, Edge Function, bucket, Auth o modo de escritura.

Las dependencias extraídas del código son REQUIRED por defecto. Solo se exceptúan recursos incluidos en `out-of-scope.json`, con justificación. `write-access.json` separa CRUD tenant-scoped de operaciones que deben ir por RPC. Los estados BLOCKER allí son funcionalidad incluida en alcance pero todavía incompatible con el esquema/permisos o no atómica; no se cuentan como recursos fuera de alcance.

El test compara nombres de relaciones y RPC con las definiciones SQL ordenadas del bootstrap. El test PGlite instala toda la secuencia para validar sintaxis/estructura local. Ninguno valida ownership, grants, RLS, concurrencia, Auth, Realtime o runtime de Edge Functions en Supabase real.

El módulo comercial tiene capacidad independiente y default false. Sus RPCs se
clasifican aparte en out-of-scope.json y sus mutaciones en write-access.json.
`commercialSubscriptionSql.test.ts` instala el módulo opcional después del
baseline y verifica autorización, ACL, transacciones, idempotencia y estados en
PGlite; la aceptación hospedada sigue pendiente. Los importadores F6 no instalan
este módulo automáticamente. Ver docs/commercial-subscription-backend.md.
