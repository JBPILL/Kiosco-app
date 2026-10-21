# Completar módulos pendientes del piloto

## Objetivo
Completar y verificar el registro vivo del plan operativo y comercial, con evidencia local y de Staging diferenciada.
Los gates permanentes PR01–PR11 del [plan canónico](../plan_operativo_y_comercial_kioskopos_revision.md#production-readiness--gates-permanentes-20102026)
definen la aceptación de Production Readiness. No sustituirlos por conteos de tests
ni duplicar su matriz. Los resultados históricos de este plan se conservan.

## Contexto actual
La rama feat/pilot-envases-returns conserva los módulos ya implementados. La restauración estricta de catálogo, categorías, promociones y combos cuenta con ensayo representativo en Staging; la restauración integral de la interfaz continúa bloqueada.

## Alcance
- Completar contratos de clientes, proveedores, saldos iniciales, lotes y asociación de proveedores.
- Continuar P01–P24 del plan operativo según dependencias y evidencia existente.
- Publicar commits temáticos sin fusionar PR #3.

## Fuera de alcance
Impresora/cajón físicos, Point y emisión ARCA; master y Production sin nueva
autorización. El titular reabrió expresamente la autenticación WSAA homologación
y pidió el control de fecha ARCA, implementados en este bloque.

## Componentes afectados
Restauración JSON, contratos SQL aditivos, verificadores, pruebas y documentación del piloto.

## Dependencias
El registro vivo en plan_operativo_y_comercial_kioskopos_revision.md define pendientes. Las nuevas instalaciones SQL requieren un artefacto revisado y probado antes de solicitar el gate correspondiente.

## Decisiones importantes
Conservar saldos de contactos existentes; inicializar la foto de saldo sólo en registros nuevos. No generar movimientos financieros ficticios. No habilitar la interfaz integral mientras falte un contrato requerido. Mantener intactos los 43 SQL históricos.

## Riesgos
Duplicados, asociaciones entre comercios, pérdida de ACK y sobrescritura de saldos. Usar identidad estable, operaciones idempotentes y comprobación del resultado persistido. Rechazar campos sin soporte antes de escribir.

## Criterios de aceptación
Cada módulo tiene pruebas de comportamiento y permisos, build cuando corresponde y evidencia hospedada donde sea necesaria. Los pendientes externos quedan identificados sin considerarlos aprobados.

## Plan de implementación
0. Por instrucción del titular del 20/10, actualizar planes existentes y retomar
   PR02: CAE homologación, preparando primero PR03 (backend seguro e
   idempotencia fiscal); sin emisión sin autorización ni cambios en Production.
1. Contratos SQL locales para contactos y saldos, con pruebas de autorización, idempotencia y conservación.
2. Completar lotes y asociaciones; integrar preflight de capacidades antes de cualquier escritura.
3. Validar instalación preparada y ensayo aislado de Staging con el gate necesario.
4. Continuar seguridad, recuperación, reportes y entrega operativa del registro vivo.

## Validación
Pruebas dirigidas, suite completa al cerrar cada bloque, build, diff y manifiesto histórico; ensayos hospedados aislados conservando sus registros.

## Progreso
- [x] Objetivo continuo registrado; exclusiones confirmadas.
- [x] Restauración representativa de catálogo/promociones/combos validada en Staging.
- [x] Contratos de contactos y saldos preparados y probados localmente.
- [x] Lotes y asociaciones preparados e integrados al motor con preflight de capacidad.
- [x] Suite final: 2177 PASS / 1 skipped / 224 archivos; build PASS (634 módulos).
- [x] Publicación de commits temáticos y frontend sólo en Staging autorizada.
- [ ] Instalación de SQL nuevos en Staging: autorización específica pendiente.
- [ ] Integración y aceptación hospedada del respaldo completo.
- [ ] Resto del registro vivo.
- [x] Gates permanentes PR01–PR11 incorporados al plan operativo y reglas ExecPlan.
- [x] PR01: WSAA y FEParamGetTiposCbte reales PASS (36 tipos, cero emisiones),
      20/10/2026 con diagnóstico cc199d5. Consulta previa de puntos 602 conservada.
- [ ] PR02: CAE pendiente; primero completar dependencia PR03 de backend seguro
      e idempotencia. Punto 2 todavía sin disponibilidad acreditada en ARCA.

## Resultado final
En curso. No se declara completado el piloto por terminar un bloque individual.
Instalación y ensayo hospedado de la restauración ampliada preparados en
restauracion-modulos-staging.md; la interfaz integral continúa bloqueada.


## Objetivo activo detallado — 20/10/2026

El titular pidió crear un objetivo para seguir con detalle el trabajo pendiente.
Se registró como objetivo activo completar los módulos y gates del piloto,
priorizando PR03 antes del CAE de PR02. El desglose fiscal F01–F09, entregables,
pruebas y autorizaciones está en el [ExecPlan ARCA existente](../.agent/execplans/arca-homologation.md#objetivo-de-continuidad-detallado--20102026).
El inventario inicial ya comenzó; no se instalaron SQL/Edge ni se emitieron
comprobantes por este nuevo objetivo. El resto del registro canónico sigue
vigente, con impresora/cajón físicos y Point diferidos y Production separada.


## Avance fiscal y seguridad — 21/10/2026

Contrato final v1 normalizado/SHA-256, lectura SOAP estricta y transporte de
consulta preparados y probados localmente; candidato de autorización no se
persiste todavía. Suite 2324 PASS / 1 skipped / 227 archivos, build PASS;
90 casos fiscales nuevos y dos pruebas Edge locales con fixtures PASS.
Dependencias parcheadas y audit npm 0 alertas. Siguiente paso: ligar cuerpo/hash
a operación/reserva y persistir la reconciliación con CAS, luego custodia/worker
e instalación/aceptación hospedada. Ver el ExecPlan ARCA existente; PR03/PR02
siguen abiertos y no se autoriza emisión por este avance.

Actualización 21/10: cuerpo/hash ligado a operación y reserva preparado en SQL
003, intención exige persistencia previa; 168 pruebas fiscales y build PASS.
Reintento no cambia el cuerpo ni habilita otro envío. Aún falta persistir el CAE
conciliado con CAS, el worker privado y aceptación hospedada. El nuevo SQL no
está instalado. Evidencia y límites en el ExecPlan ARCA existente.
Resultado posterior: suite integrada 2345 PASS / 1 skipped / 228 archivos y seis
carreras PostgreSQL 17.11 con SQL 001–003 PASS; contenedor propio detenido.
