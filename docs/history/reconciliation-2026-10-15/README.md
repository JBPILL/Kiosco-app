# Reconciliación preservada — 15/10/2026

Estos documentos son históricos, no instrucciones de instalación ni estados actuales.

- `plan-published-41bebe9.md`: versión íntegra publicada, antes de la reducción local.
- `plan-reduced-local.md`: versión local recibida; la reducción de 132 líneas quitaba avances de recuperación, costos y verificación de backups que siguen teniendo valor histórico.
- Plan original y variante veterinaria: propuestas históricas; no autorizan nuevos roles ni ampliar el piloto al dominio clínico.
- Guías Windows/snapshot: copias locales diferentes de `docs/`; ambas variantes se conservan. Las guías vigentes siguen en `docs/`.
- `preserved-file-inventory.json`: SHA-256 de bytes iniciales y stash de los 26 archivos no versionados, con comparación exacta tras reemplazar únicamente CRLF por LF. No se ignoran espacios ni saltos finales. Los 26 son equivalentes; no se confirmó la premisa de que sólo cuatro diferían.

Se normalizan a LF únicamente los cuatro Markdown locales de raíz y estas copias documentales. Los originales siguen en disco, ignorados mediante rutas explícitas. No se elimina ningún archivo.

## Clasificación restante

| Elemento | Decisión y razón |
| --- | --- |
| `artifacts/sql-motivo-precio-2026-10-08/**` (3 archivos) | Paquete histórico local, incluido hash de entrega; conservar bytes y excluir Git. No es SQL canónico F6. |
| `artifacts/sql-pendientes-2026-10-07/**` (18 archivos) | Paquete incremental histórico local (16 SQL, guía y hashes); conservar sin aplicar. |
| `bootstrap_staging_completo.sql` | Concatenación local obsoleta: todavía exige kiosco NOT NULL para SuperAdmin. No usar para bootstrap; usar manifest canónico de 43 SQL. |
| ZIP de `artifacts/` ya versionados | Entregas históricas existentes; no borradas ni regeneradas. |
| SQL de raíz ya versionados | Historia incremental y fixtures usados por tests; no mover ni ejecutar. |
| `.env.local` | Local, ignorado, intacto; no leer ni imprimir valores. |
| `node_modules`, `dist`, `.vercel`, metadata Supabase | Generados/configuración local según exclusiones existentes; no versionar. |

## Respaldo Git

Conservar `stash@{0}` (`ec675efd112b7c2ed2e9e4912f9ddbac9010344b`) y `codex/gh013-remediation-20261015` (`41bebe9367ad6ca040288f869b77f22ecfd28b13`). No se ha probado publicación de este nuevo bloque; no corresponde eliminarlos. El stash no se aplicó ni se descartó.

## Production

GET público a `https://kiosco-app-five.vercel.app`: HTTP 200, contenedor SPA presente y bundle `/assets/index-Dwv7v1KC.js` HTTP 200 (1.628.629 bytes). Esto demuestra disponibilidad del frontend, no login, RLS ni checkout autenticado. Sin redeploy ni cambios de variables.
