# Reconciliación GH013 y seguridad de aprovisionamiento

## Objetivo
Cerrar la clasificación de archivos preservados y entregar un bloque de seguridad local reproducible sin alterar Production.

## Contexto inicial
Base publicada `41bebe9367ad6ca040288f869b77f22ecfd28b13`. Un plan modificado, 26 archivos untracked preservados en stash y una rama local de respaldo. El plan reducido perdió evidencia todavía útil. `provision-user` acepta campos extra y puede sobrescribir una vinculación concurrente.

## Problema
La documentación mezcla estados históricos con gates actuales. La vinculación Auth usa un SELECT seguido de UPDATE sin comprobar que el perfil continúe libre, activo y con el mismo rol.

## Alcance
- Comparación exacta de EOL/hashes, clasificación completa, archivo histórico y exclusiones locales específicas.
- Auditoría estática por superficie; pruebas locales de SQL, autorización, backup y offline.
- Hardening de `provision-user`: JSON acotado y exacto, origen permitido, perfil de tenant obligatorio, actualización condicional, compensación explícita y errores sin detalles sensibles.

## Fuera de alcance
- Escrituras remotas, deploy, variables Vercel, AFIP/WSFE/Point y eliminación de respaldos.
- Afirmar aceptación hosted, concurrencia PostgreSQL real o restauración real usando mocks/PGlite.

## Componentes afectados
Plan operativo, documentación histórica, `.gitignore`, Edge provisioning, helper HTTP y pruebas.

## Decisiones importantes
Conservar originales locales y stash; versionar copias documentales de historia. No normalizar masivamente. Usar la allowlist `CHECKOUT_ALLOWED_ORIGINS` existente para provisioning. Vinculación compare-and-set, sin reemplazar una identidad existente.

## Riesgos
Auth/Postgres no comparten transacción. Una interrupción puede dejar Auth huérfano; compensación fallida debe ser explícita. Cambios de Edge requieren deploy separado y smoke autenticado. La actualización condicional protege la carrera local, no constituye idempotencia completa de creación.

## Criterios de aceptación
- Toda entrada inicial clasificada con hash y comparación exacta; trazabilidad preservada.
- Entradas inválidas y actores sin permisos no producen escrituras.
- Carrera de vinculación deja un único ganador; el perdedor compensa su propia identidad.
- Suite completa, build, audit diagnóstico, manifest, escaneo de secretos y Git registrados con resultados reales.

## Plan de implementación
1. Inventariar y archivar historia; comprobar Production por GET público.
2. Auditar superficies y seleccionar el siguiente bloque crítico.
3. Corregir provisioning y probar validación, autorización, carreras y compensación.
4. Validar, actualizar plan, separar commits y dejar estado final explicable.

## Validación
Vitest dirigido y completo, build, manifest, npm audit sin fix, scan de patrones sin imprimir valores, diff/index checks y fetch normal.

## Progreso
- [x] Base, stash, refs, EOL y Production público inspeccionados.
- [x] Clasificación y archivo histórico publicados en Git local (dd93ec7).
- [x] Hardening de provisioning y alta autorizada, con pruebas dirigidas (78ae486, 7e5f79e).
- [x] Auditoría local, manifest, diff, build y commits revisados (3d35813, 25edb12 y d2233ba).
- [x] Rama `hardening/next-operational-block` publicada y [PR #1](https://github.com/JBPILL/Kiosco-app/pull/1) abierto hacia master, sin merge.
- [x] Validación final previa sobre d2233ba: test strict PASS; suite 1830 PASS / 1 skipped / 190 files; build PASS (608 módulos); diff/index y escaneo textual sin secretos reales detectados. Audit diagnóstico: xlsx HIGH, dos avisos, sin fix automático; riesgo abierto.
- [x] Findings cerrados en 9227508 (identidad de alta strict estable) y 268d81e (productos inactivos en pistola/cámara); 64 tests dirigidos PASS, incluido categoría strict. Suite final sobre 268d81e: 1840 PASS / 1 skipped / 190 files, build PASS (608 módulos), diff/index PASS. Secret scan sin candidatos nuevos ni secretos reales detectados en textos versionados (binarios/historial excluidos); audit oficial confirma xlsx HIGH con dos avisos sin fix automático. Commits temáticos preparados para push normal al PR #1 (ver scanner-labels-and-theme.md).
- [ ] Post-merge con autorización: SQL incremental, deploy de provisioning, aceptación JWT reales Dueño/Cajero/otro tenant y ensayo físico de cámara/impresora.

## Resultado final
Bloque publicado en PR #1 y findings finales corregidos y validados; cierre documental posterior sin cambios del código probado. No se aplicó SQL remoto ni se desplegó provisioning; tampoco se mergeó el PR. xlsx sigue abierto; gates hosted y físicos permanecen post-merge. AFIP/WSFE/Point fuera de alcance. Documentación histórica y .env.local preservados.
