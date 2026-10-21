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

Avance posterior 21/10: SQL 004 y orquestador privado preparados para guardar
CAE conciliado, cerrar reserva con avance único y recuperar ACK sin otra
consulta. 196 pruebas fiscales y nueve carreras PostgreSQL PASS; build PASS.
Falta custodia/caché de TA, autorización del worker y aceptación hospedada; no
hay nueva instalación ni emisión. El ExecPlan conserva evidencia y próximos gates.
Verificación final: suite integrada 2373 PASS / 1 skipped / 228 archivos;
Edge Runtime local con autorización simulada y replay PASS (una consulta mock),
sin SQL ni llamadas fiscales. Contenedores propios detenidos.

Avance F04 21/10: gate privado de actor/comercio/emisor y caché TA en memoria
preparados, con carga perezosa al conciliar. 192 pruebas enfocadas y diez casos
PostgreSQL locales PASS. Falta custodia real, renovación entre procesos y
endpoint/hospedado; no se instalaron SQL/Edge ni se usaron credenciales reales.
Resultado posterior: suite integrada 2426 PASS / 1 skipped / 230 archivos;
corrección de fixture readonly verificada con 102 pruebas afectadas y build
final PASS. Edge local composición/replay PASS con una carga y consulta mock.
No se instala SQL/Edge ni se autoriza emisión por esta verificación local.

Avance F04 compartido 21/10: SQL 006 y sobre AES-GCM preparados con datos y claves
efímeros sintéticos; coordinación por certificado/wsfe y recuperación de ACK.
105 pruebas enfocadas y doce casos PostgreSQL PASS. TA vigente se reutiliza;
se espera su vencimiento en el margen final. No hay activación ni custodia real;
seguir con proveedor CMS/WSAA y recuperación operativa antes del endpoint.
Resultado final del incremento: 2447 PASS / 1 skipped / 231 archivos, build PASS,
doce casos PostgreSQL y tres aserciones Edge con cifrado real y servicios mock
PASS. No hay TA/claves reales ni instalación remota. Custodia real y recuperación
operativa siguen pendientes antes de habilitar el worker.

Avance WSAA 21/10: proveedor CMS RSA/SHA256, lector de TA y transporte fijo
preparados con custodia inyectada. Certificados efímeros en pruebas; .NET verificó
CMS y rechazó alteración. 148 casos enfocados y recorrido DB con WSAA/WSFE mock
PASS; Edge local con CMS/cifrado reales y servicios mock PASS. Falta lector real
de custodia, recuperación operativa y endpoint antes de instalación autorizada.
Verificación final: 2492 PASS / 1 skipped / 233 archivos; build PASS, auditoría
npm 0 alertas; CMS contrastado por .NET y recorrido Edge mock PASS. Sin cambios
de lógica posteriores, llamadas fiscales reales ni nuevas instalaciones.

Avance de custodia 21/10: lector privado PKCS8 cifrado y keyring implementados,
con bloqueo de proyecto antes de leer secretos, importación no exportable y
rotación de IDs. 93 pruebas enfocadas, interoperabilidad .NET UTF-8 y Edge con
material sintético PASS; build PASS y lector ausente del frontend. Provisión
real, recuperación operativa y endpoint siguen pendientes de sus gates.
Verificación posterior de custodia y corrección de conteo Envases: 2514 PASS /
1 skipped / 234 archivos, con dos trabajadores y mismos timeouts, build final
PASS. Se conservan los fallos previos de timeout y la regresión real del conteo.
Nuevo lector sin instalación SQL/Edge, provisión real ni llamadas fiscales.

Recuperación TA previa a red preparada en SQL 007: PREPARADA cancelable con
historial, permiso único de envío y recuperación de metadata tras ACK perdido.
118 pruebas enfocadas y quince carreras PostgreSQL locales PASS; build PASS.
La incertidumbre posterior al permiso no se libera por timeout. Sin instalación
ni llamada ARCA real; endpoint y aceptación hospedada aún pendientes.
Cierre posterior: suite completa 2532 PASS / 1 skipped / 234 archivos, build PASS;
Edge local cuatro aserciones PASS. Incremento de recuperación TA listo para revisión
en rama del piloto; no se instaló SQL 007 ni se activó un endpoint fiscal.

Frontera HTTP fiscal preparada: consultas/replay y recuperación TA por IDs, sin
emisión, CORS Staging cerrado y doble gate Auth/SQL antes de custodia. SDK privado
sin reintentos ni sesión persistente, host y RPC limitados. 146 pruebas enfocadas,
build y Edge local PASS (entrypoint deshabilitado + integración sintética).
Sin instalación SQL/Edge ni llamadas reales; pruebas JWT/RLS/E2E hospedadas siguen
pendientes y el flag privado permanece sin activar. Suite completa en ejecución.
Revisión de aislamiento: SQL 008 restringe recuperación TA a su operación origen;
no expone ni cancela intentos de otro comercio aunque comparta certificado. 150
casos enfocados, dieciséis carreras PostgreSQL, build y Edge local finales PASS.
Suite completa final en curso; la anterior de 2589 PASS precede este guard.
Cierre final HTTP + aislamiento: 2593 PASS / 1 skipped / 236 archivos, build,
150 dirigidas, 16 carreras PostgreSQL y Edge local 3+5 PASS. Sin instalación ni
activación remotas. Sigue pendiente el trabajador de último número/emisión y la
integración UI antes de aceptar PR03/PR02, además de los gates hospedados.
