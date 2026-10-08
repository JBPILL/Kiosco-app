# KioskoPOS — revisión del plan operativo y comercial

**Estado actualizado: 08/10/2026.** Implementación en curso. El registro siguiente
es el resumen vigente; la evaluación original del 05/10 y las notas de avance
del final se conservan como historial. Sus conteos y menciones de publicación
pendiente describen aquella ejecución, no el estado actual.

## Registro de tareas pendientes

**Última revisión del código: `eafbdd9`.** Este apartado registra trabajo abierto;
el siguiente reúne entregables realizados. Actualizar ambos al cerrar cada tarea.

Una tarea pendiente puede requerir desarrollo, aplicación SQL, aceptación
remota o prueba física. Una implementación local no cierra su fase hasta
cumplir la puerta de aceptación correspondiente.

| ID | Fase | Tarea pendiente | Qué falta para cerrarla |
| --- | --- | --- | --- |
| P01 | 0 · Producto | Definir entrega comercial y puestos soportados | Registrar SaaS/licencia, versiones de Windows/navegador, modelos de periféricos y responsables de soporte/credenciales. |
| P02 | 1 · Seguridad | Comprobar permisos con sesiones reales | Probar API/PostgREST con JWT de cajero, dueño y otro comercio: costos privados, cambios/anulación de ventas y escritura directa. No ampliar permisos para obtener un resultado verde. |
| P03 | 1 · Seguridad | Aceptar operativamente el paso 52 | Catálogo remoto confirmado; falta demostrar INSERT directo rechazado para cajero y checkout por backend funcionando después de instalarlo. |
| P04 | 1 · Seguridad | Completar pruebas de supervisor | Rechazo de PIN incorrecto y venta con PIN correcto ya informados; faltan concurrencia, espera/límites de intentos, permiso ligado a solicitud original y usos restantes en el piloto. |
| P05 | 1 · Seguridad | Cerrar aceptación de anulación atómica | Caso efectivo/caja original abierta confirmado; faltan pago mixto, fiado, caja original cerrada, lotes y reintento concurrente en Supabase real. |
| P06 | 1 · Seguridad | Implementar devolución parcial transaccional y conciliación antigua | Auditoría local realizada: escrituras separadas, lectura previa falla abierta, reintegro puede fallar sin impedir éxito y receta actual. Sustituir por backend atómico/idempotente con datos históricos, permisos y aceptación concurrente. Conciliar tickets antiguos sin inventar snapshots. |
| P07 | 1 · Auditoría | Definir retención y operación de auditorías | Establecer responsables, acceso, conservación y comprobación remota de precio, descuento, anulación y apertura manual del cajón. |
| P08 | Checkout | Validar pérdida de conexión y dos equipos | Ensayar preparación, confirmación, cancelación y respuesta perdida sin duplicar venta, pago, stock o deuda. |
| P09 | Checkout | Aceptar recuperación sin copia local | Aplicar el paso 53 antes de desplegar `checkout-manual`. Acción del dueño implementada en Caja y Turno; probar en navegador/Supabase con JWT real, respuesta perdida, cancelación concurrente y operador/caja originales. No crear otra venta ni volver a cobrar. |
| P10 | 2 · Periféricos | Validar impresoras y cajón físicos | Matriz por modelo/COM/USB: permiso denegado, desconexión, reimpresión, pago mixto y pulso único sólo tras efectivo confirmado. |
| P11 | 2 · Periféricos | Completar canal por driver de Windows | Diálogo del navegador ya disponible con window.print y ajuste de contenedores para ticket largo. Configurar despliegue controlado y comprobar driver, márgenes, paginación y salida real; no hay confirmación ni impresión silenciosa. |
| P12 | 2 · Periféricos | Probar lector, balanza y cámara móvil | Ensayar dispositivos reales, Safari/iOS, cancelar/reabrir, permisos y entrada manual de peso. |
| P13 | 3 · Respaldo | Confirmar migraciones de respaldo vigentes | Verificar snapshot/configuración y pasos 49–50 de relaciones/combos en el entorno de ensayo/remoto. Git push no aplica SQL. |
| P14 | 3 · Respaldo | Restaurar una copia real en entorno aislado | Control final de productos y lotes implementado. Exportar, descifrar, importar y comparar conteos, demás relaciones, saldos, costos privados, configuración y recetas. No ensayar sobre el comercio operativo. |
| P15 | 3 · Respaldo | Completar respaldo de base y recuperación | Probar pg_dump/pg_restore real y Storage; cubrir historial de ventas/caja y módulos excluidos del JSON operativo. |
| P16 | 3 · Respaldo | Automatizar copias externas y retención | Definir destino, cifrado, programación, rotación y alertas; copia IndexedDB y recordatorio no sustituyen esta estrategia. |
| P17 | 3 · Respaldo | Comprobar fallos de almacenamiento y cierre | Piloto con cuota agotada, perfil borrado, descarga fallida y cierre pendiente; el respaldo no debe alterar la caja. |
| P18 | 4 · Mermas | Validar operaciones remotas concurrentes | Comprobar FEFO, lote específico, costos históricos, idempotencia, cancelación y conciliación de stock contra kardex. |
| P19 | 4 · Mermas | Aceptar reporte de bajas completo | Comparar período argentino y costos conocidos/desconocidos con datos reales; conservar distinción de estimación a costo frente a contabilidad fiscal. |
| P20 | 5 · Multirrubro | Pilotar capacidades por rubro | Cambio de rubro con datos existentes y combinaciones de pesables, envases, lotes y servicios sin pérdida de atributos. |
| P21 | 5 · Multirrubro | Aceptar circuitos comerciales especializados | Verificar servicios, dietética/bazar y electrónica con usuarios reales, importación, reportes y continuidad offline. |
| P22 | 7 · Escritorio/quiosco | Preparar entrega de instalación lista para usar | Definir PWA/instalador soportado, acceso directo, configuración inicial, arranque, actualización y procedimiento de soporte. |
| P23 | 7 · Escritorio/quiosco | Resolver persistencia y recuperación del puesto | Edge kiosk usa InPrivate: probar login, permisos y cobros pendientes tras cierre/reinicio; decidir perfil/despliegue compatible antes de activarlo. |
| P24 | 7 · Escritorio/quiosco | Probar Windows administrado en piloto | Assigned Access/salida de emergencia, cierre inesperado, reconexión, pantalla y recuperación. El lanzador no bloquea Windows ni relanza Edge. |

### Trabajo pausado por decisión del usuario

- **Point y QR integrados (fase 6):** no activar ni desplegar como parte del
  trabajo actual. Si se retoma, requiere cuenta/terminal elegible, sandbox,
  backend, secretos, webhook, conciliación y aceptación de estados inciertos.
  El cobro manual con posnet continúa siendo una ruta independiente.

## Registro de tareas realizadas

- [x] Base SQL privada para cálculo acumulado de reintegro histórico sin exceso
  por redondeo. Doce pruebas PostgreSQL aprobadas. Falta integrar autorización,
  importes netos históricos, bloqueos y efectos atómicos: P06 sigue abierto.

- [x] Devolución parcial bloquea entrada inválida/duplicada y falla de lectura
  de devoluciones anteriores antes de escribir. Doce pruebas del store aprobadas;
  atomicidad, cálculo autoritativo y permisos backend siguen pendientes (P06).

- [x] Auditoría de devolución parcial identifica límites de validación,
  persistencia, reintegro y compensación. [Hallazgos](docs/auditoria-devolucion-parcial.md).
  Implementación transaccional y permisos remotos permanecen pendientes (P06).

- [x] Respaldo PostgreSQL conserva manifiesto SHA256 y comprobador local antes
  del ensayo de recuperación. 14 pruebas Windows aprobadas; no sustituye
  dump/restore real, cifrado ni almacenamiento externo confiable (P15–P16).

- [x] Impresión manual libera límites de altura/recorte de la vista previa y
  máximo de ancho del ticket, restaurando contenedores al finalizar. Dos pruebas
  DOM aprobadas; impresión de tickets largos con driver real pendiente (P11).

- [x] Diagnóstico paso 53 contrastado con la migración real y su reaplicación:
  permiso PUBLIC por columna detectado y eliminado. 77 pruebas SQL aprobadas;
  aceptación remota de instalación y recuperación sigue abierta (P09).

- [x] Diagnóstico de catálogo del paso 53, sólo lectura: objetos, RLS, contexto,
  permisos por tabla/columna, roles y políticas adicionales. Ocho pruebas PostgreSQL locales y build
  aprobados; resultado remoto aún pendiente y no sustituye recuperación JWT.

- [x] Verificador de recetas rechaza duplicados y cantidades esperadas inválidas,
  incluso si coinciden con la respuesta. 76 pruebas dirigidas aprobadas.

- [x] Resumen de restauración muestra las colecciones comprobadas en servidor
  (productos, lotes, promociones y recetas), sin afirmar comprobaciones omitidas
  o fallidas. 43 pruebas dirigidas aprobadas. Suite global anterior: `eafbdd9`.

- [x] Validación global sobre `eafbdd9`: 1.448 pruebas/151 archivos aprobados
  en 141,44 segundos y build con código 0. Incluye las nuevas comprobaciones de
  restauración; no sustituye aceptación JWT, ensayo aislado ni hardware.

- [x] Comparación final de recetas de combos recuperados: IDs destino,
  cantidades y eliminación de receta al convertir a físico. 69 pruebas
  dirigidas aprobadas; aceptación de restauración real pendiente (P14).

- [x] Verificación persistida de promociones 4.0: condiciones, descuentos,
  relaciones y componentes JSON. Incluye copias sólo de promociones.
  60 pruebas dirigidas aprobadas; restauración real aún pendiente (P14).

- [x] Verificación persistida de lotes en respaldos 4.0: producto destino,
  vencimiento, número, cantidades y actividad. Una diferencia evita la
  desactivación del modo Reemplazo. 51 pruebas dirigidas y build aprobados.
  Las escrituras anteriores no se revierten: el ensayo aislado sigue pendiente.

Las casillas marcadas indican entregables implementados o evidencia recibida,
no aceptación completa de toda la fase. Los enlaces llevan al detalle de
alcance, instalación y limitaciones.

| Hecho | Entregable realizado | Evidencia y alcance |
| --- | --- | --- |
| [x] | Costos privados y protección de perfiles | Migraciones/consultas que separan costos del acceso de cajeros y protegen rol e identidad. [Guía de seguridad](docs/verificacion-seguridad-postgresql.md). API con JWT real pendiente (P02). |
| [x] | Herramienta de lectura de costos por API | GET con identidad Auth verificada, perfil CAJERO/comercio esperado, control de filas privadas y paginación del costo público. [Guía](docs/comprobar-costos-api-cajero.md). Pruebas HTTP simuladas; ejecución real pendiente (P02). |
| [x] | Auditoría de precios y motivo de cambio | Funciones, guardado y consulta de auditoría implementados. [Motivo de precio](docs/motivo-cambio-precio.md), [consulta comercial](docs/auditoria-comercial-consulta.md). |
| [x] | PIN de supervisor y umbral configurable | Backend, espera progresiva, auditoría y política congelada en checkout. [Política](docs/supervisor-politica-descuento.md), [espera](docs/supervisor-pin-espera.md). |
| [x] | Venta de Lucía autorizada en caja compartida | Evidencia del usuario: ef754442…, $2.240, umbral 15, requiere supervisor y cierre confirmado, pagos $2.240. PIN incorrecto rechazado; correcto aceptado. [Aceptación remota](docs/aceptacion-remota-checkout-2026-10-08.md). |
| [x] | Recuperación del pendiente EBF2345B | Evidencia recibida: $3.020, COMPLETADA, cierre confirmado y sin cancelación; conservar identificador, no volver a cobrar. [Registro](docs/aceptacion-remota-checkout-2026-10-08.md). |
| [x] | Checkout transaccional y cola de solicitudes | Preparación/cierre idempotente, caja compartida, recuperación y cancelación implementados y probados localmente. [Servidor](docs/checkout-manual-servidor.md), [cola](docs/checkout-manual-cola-local.md). |
| [x] | Restricciones de escritura de ventas, pasos 47–48 | Protección de tickets preparados y revocación de escritura anónima, incluidos permisos por columna. Diagnósticos remotos aportados por el usuario; aceptación JWT pendiente. [Inmutabilidad](docs/checkout-manual-inmutabilidad.md). |
| [x] | Bloqueo de INSERT directo del cajero, paso 52 | Migración y diagnóstico publicados. Usuario confirmó `paso_52_instalado=true`, RLS y política correcta en ventas/detalles/pagos. [Guía](docs/ventas-cajero-solo-backend.md). |
| [x] | Anulación atómica, paso 51 | Restitución histórica de stock/lotes/costos, cuenta corriente, reintegro e idempotencia con auditoría única. [Detalle](docs/anulacion-venta-atomica.md). |
| [x] | Anulación remota de EF754442 | Usuario confirmó ANULADA, registro atómico, una auditoría, pagos $2.240 conservados, cantidades restituidas y cero egresos adicionales en caja original abierta. No acredita los demás casos (P05). |
| [x] | Diseño de tickets interno y ARCA | Estructura de supermercado compartida, cantidad/precio/importe y promociones; botones Facturar/Ver/Reimprimir/Devolución separados. [Comprobantes](docs/redisenio-comprobantes-2026-10-08.md). Impresión física pendiente. |
| [x] | Panel de pendientes remotos discreto | Revisión plegada en Caja para dueño; aviso de cobros locales sólo cuando existen pendientes. Recuperación conectada; aceptación remota pendiente (P09). |
| [x] | Identidad estable al recuperar entradas remotas | Rechaza dueño sin identidad de autenticación y descarta respuesta si cambian identidad, perfil, rol, actividad o comercio durante la consulta. Seis regresiones cubren la lectura. |
| [x] | Base SQL de recuperación por dueño comprobada | Preparación del cajero → recuperación por dueño → cierre backend → reintento: conserva vendedor y aplica stock/fiado una vez. 76 pruebas SQL aprobadas; aceptación JWT pendiente (P09). |
| [x] | Recuperar cobro original desde Caja y Turno | Formulario del dueño con pagos originales y declaración de cobro/fiado recibido, reenvío de la misma entrada, bloqueo ante cancelación local y reintento sin nuevo cobro. 92 pruebas dirigidas/3 archivos y build aprobados; piloto remoto pendiente. |
| [x] | Auditoría transaccional de recuperación por dueño | Paso 53 y adaptador backend guardan identidad del dueño separada del vendedor original, distinguen cierre previo y evitan auditorías duplicadas. Fallo de auditoría revierte venta/stock/fiado. Aplicación SQL y despliegue Edge pendientes. |
| [x] | Selección de impresora y cajón separados | Prueba sin pulso, apertura automática opt-in tras efectivo confirmado y apertura manual auditada. [Cajón](docs/apertura-manual-cajon.md). Hardware pendiente. |
| [x] | Mejoras del lector por cámara | Implementación y regresiones locales de apertura/cierre y fallback. [Lector móvil](docs/lector-camara-movil.md). Dispositivos reales pendientes. |
| [x] | Respaldo operativo 4.0 y cifrado | Snapshot, configuración pública, validación, compatibilidad 2/3 y cifrado; excluye secretos y no incluye todo el historial. [Alcance](docs/respaldo-ampliado.md). |
| [x] | Restauración de relaciones y combos | Snapshot de componentes y recuperación validada, reglas de cantidad, verificación final de productos antes de reemplazo. [Combos](docs/respaldo-relaciones-y-combos.md), [productos](docs/verificacion-productos-restaurados.md). Ensayo real pendiente. |
| [x] | Respaldo local al cierre y recordatorio externo | Copia por sesión en IndexedDB y marca de exportación externa. [Cierre](docs/respaldo-arqueo-cierre-local.md), [recordatorio](docs/recordatorio-respaldo-externo.md). No sustituye copia externa. |
| [x] | Script de respaldo PostgreSQL Windows | Archivo custom, comprobación pg_restore, SHA256 y manejo de credenciales/errores; pruebas con comandos simulados. [Guía](docs/respaldo-postgresql-windows.md). Dump/restore real pendiente. |
| [x] | Mermas, FEFO e idempotencia de stock | Operaciones transaccionales, motivos, lote y costo histórico privado; pendientes consultables/reintentables. [Verificación](docs/verificacion-mermas-postgresql.md). |
| [x] | Reporte de bajas por período | Agregación SQL autorizada, costos desconocidos diferenciados y fechas argentinas. [Reporte](docs/verificacion-resumen-bajas-stock.md). |
| [x] | Capacidades multirrubro y pesables | Preferencias independientes y preservación de atributos; ingreso de peso aunque balanza esté desactivada. [Pesables](docs/verificacion-multirrubro-pesables.md). |
| [x] | Servicios y pantallas por rubro | Circuitos y catálogos implementados; servicios offline conservan concepto. [Servicios](docs/verificacion-servicios-y-diseno-reportes.md), [offline](docs/verificacion-servicios-offline.md), [electrónica](docs/electronica-comercial.md). Piloto pendiente. |
| [x] | Lanzador HTTPS para Edge y guía de quiosco | Validación de URL y parámetros; rechazo de localhost/puerto Vite/credenciales con diez pruebas Windows sin abrir Edge. [Guía](docs/despliegue-kiosco-windows.md). Instalación física pendiente. |
| [x] | Publicación de entregables en Git | Cambios anteriores publicados en `origin/master`; cada commit conserva su evidencia local. Publicación Git no aplica SQL ni prueba el despliegue Vercel. |
| [x] | P25 · Validación global sobre e9079de | `npm run test`: 1.386 pruebas/148 archivos aprobados en 120,76 s; `npm run build`: código 0. Se mantiene el aviso de chunks mayores a 500 kB. No acredita pruebas remotas ni físicas. |

### Registro de verificaciones

- **Última suite completa registrada:** 1.448 pruebas aprobadas en 151 archivos
  sobre `eafbdd9`, en 141,44 segundos; compilación aprobada. Incluye recuperación
  desde Caja, auditoría del paso 53, comprobador API de costos y controles finales
  de lotes, promociones y recetas. Repetir al introducir cambios de código.
- **Suite anterior:** 1.386 pruebas/148 archivos sobre `e9079de`, 120,76 segundos.
- **Comprobador API de costos:** 13 pruebas con HTTP simulado y build aprobados;
  la ejecución con JWT real sigue pendiente.
- **Auditoría de recuperación (paso 53):** 113 pruebas dirigidas en dos archivos
  y build aprobados; aplicación SQL y despliegue Edge todavía sin confirmar.
- **Suite completa anterior:** 1.372 pruebas/147 archivos en `6bcffab`,
  conservada como evidencia histórica.
- **Anulación/checkout:** 116 pruebas dirigidas y build aprobados antes de
  publicar `686fa24`.
- **Diagnóstico paso 52:** 17 pruebas dirigidas y build aprobados antes de
  publicar `fda6ca4`; resultado remoto positivo recibido del usuario después.
- **Lanzador Windows:** diez pruebas de PowerShell aprobadas sin abrir un
  navegador real. No equivalen a una prueba de kiosk o periféricos.
- **Recuperación remota:** 13 pruebas dirigidas en tres archivos aprobadas
  después de la suite completa, incluidas seis de cambio de sesión. Repetir
  validación global cuando se complete el siguiente circuito de recuperación.
- **Límite general:** el plan sigue abierto. Las migraciones confirmadas por
  catálogo no sustituyen JWT/API, restauración aislada, concurrencia ni hardware.

## Evaluación original — 05/10/2026

El plan original cubre problemas reales del mostrador y tiene una buena intención de activación voluntaria. Sin embargo, mezcla mejoras de UX con cambios de seguridad y pagos que requieren backend, da por existentes capacidades no verificadas, y pone tareas grandes en plazos de 1–3 días sin contemplar migraciones, pruebas en hardware ni despliegue.

El repositorio ya contiene (baseline verificado en esta ejecución):

- `src/lib/escposPrinter.ts`: impresión ESC/POS por Web Serial y pulso de cajón. Esto no equivale a una configuración silenciosa ya lista: todavía solicita puerto y tiene que validarse el flujo de permisos, dispositivos y errores.
- `src/lib/backupUtils.ts`: respaldo/restauración JSON con productos, categorías, clientes, proveedores, promociones y lotes. No es un backup integral: no incluye historial contable completo ni una estrategia de copia local al cierre.
- `src/hooks/useTenantConfig.ts`: capacidades por rubro, hoy limitadas a KIOSCO, FOTOCOPIADORA_LIBRERIA y GENERAL. Balanza, vencimientos y envases se habilitan actualmente solo para KIOSCO.
- `public/manifest.json`: PWA existente, configurada en `fullscreen`; no es un modo de bloqueo de Windows.
- La anulación de venta, movimientos de stock/caja, devoluciones, `ROTURA` y `VENCIMIENTO` ya aparecen en la aplicación/modelos. Antes de crear módulos, hay que cerrar brechas y auditar las reglas SQL.

La suite local terminó con **325 tests pasando en 15 archivos**. Por lo tanto, la afirmación de 352 tests del plan original no coincide con el checkout revisado. `npm run build` también terminó correctamente; mostró únicamente el aviso existente de bundle principal >500 kB. La compatibilidad de cada impresora/terminal todavía requiere hardware real.

## Cambios imprescindibles al diseño original

1. **PIN no es una frontera de seguridad.** Ocultar costo en React solo mejora la interfaz; si el cajero puede consultar `productos.precio_costo`, el dato sigue expuesto. Aplicar autorización en PostgreSQL/RLS o mediante funciones backend con identidad verificada. Para aprobar una acción sensible, preferir reautenticación del dueño/supervisor o PIN con hash, salt, límite de intentos, espera progresiva y auditoría. Nunca guardar PIN en texto plano ni confiar en un `rol` enviado desde el cliente.
2. **Mercado Pago no debe llamarse desde el navegador con Access Token.** Un token de cuenta en frontend queda expuesto. Point/QR requieren un servicio backend/Edge Function que almacene secretos, cree la operación con referencia idempotente, valide notificaciones firmadas y consulte el estado del proveedor. La venta no se confirma por una respuesta visual del cliente. Documentar requisitos por modelo de terminal y cuenta antes de comprometer alcance.
3. **Impresión y cajón son canales separados.** Web Serial necesita gesto del usuario, origen seguro y permisos; no garantiza conexión silenciosa persistente en todos los equipos. ESC/POS por puerto COM no equivale a imprimir a través del driver de Windows. `--kiosk-printing` es una configuración del navegador/launcher, no una API de la PWA. Probar por modelo de impresora, sistema operativo y transporte; mantener ticket en pantalla e impresión manual como fallback. No pedir permisos de puerto durante el cobro.
4. **No interceptar Ctrl+W, Alt+F4 ni prometer impedir F11/F5 desde la web.** El navegador/Windows conserva esos atajos. El modo quiosco requiere política y configuración del dispositivo (Edge/Assigned Access o shell administrado); documentar salida de soporte y recuperación. La web solo puede avisar sobre cambios/recarga cuando el navegador lo permita.
5. **No eliminar productos del catálogo maestro según rubro.** Presentar sugerencias/categorías por rubro y permitir personalización. Un negocio multirrubro puede vender cerveza, alimento por peso y artículos no perecederos. Configurar capacidades independientes por comercio y por producto, no inferir reglas rígidas del nombre del rubro.
6. **La merma es movimiento de inventario, no automáticamente asiento contable.** Guardar tipo, cantidad, lote, costo congelado al registrar, usuario, fecha, motivo y evidencia/notas. Exponerla en reportes de gestión; rotular “estimación a costo” y validar con contador antes de llamarla pérdida contable o modificar resultado fiscal. Diferenciar merma, robo, consumo interno y ajuste de conteo.
7. **El backup local en IndexedDB no es respaldo seguro por sí solo.** Puede perderse junto con el disco, borrado del navegador o perfil. Definir exportación externa/copia cifrada, retención, versión de esquema, restauración comprobada e indicador de última copia. Excluir secretos, tokens y sesiones; proteger datos personales y verificar permisos. Respaldo del frontend no sustituye backup administrado de PostgreSQL.

## Plan de implementación recomendado

### Fase 0 — Descubrimiento y decisiones de producto

- Confirmar cliente objetivo y despliegue: web multi-tenant actual, terminales Windows soportadas, periféricos y si el producto se venderá como SaaS o licencia instalada.
- Inventariar tablas, políticas RLS, migraciones aplicadas, permisos por rol, pruebas existentes y caminos offline. Auditar expresamente lectura de costo y actualización/anulación de ventas.
- Definir responsables de credenciales, soporte, recuperación de cuenta, retención de datos y versión mínima de navegador.
- Aceptación: matriz de capacidades por rubro/producto; matriz de rol × acción; lista de hardware real; estados actuales de build y tests medidos.

### Fase 1 — Seguridad y auditoría de acciones (prioridad alta)

- Aplicar menor privilegio para costos, márgenes y acciones críticas en RLS/backend; revisar consultas de Catálogo, Stock y Reportes además de la UI.
- Registrar actor, autorización, motivo, entidad y marca temporal para anulaciones, cambios de precio, descuentos excepcionales y apertura manual de cajón. Preservar el historial; evitar borrados físicos.
- Reutilizar el flujo de anulación/devolución existente. Introducir umbral de descuento configurable con permiso del dueño y registrar el valor aprobado.
- Criterio: las pruebas de API/RLS demuestran que un cajero no obtiene costos ni modifica/anula ventas sin autorización, incluso llamando directamente a Supabase.

### Fase 2 — Mostrador y periféricos (prioridad alta)

- Aprovechar `escposPrinter.ts`; separar selección/permiso del dispositivo, configuración por puesto y envío de ticket/pulso. Persistir solo preferencias no sensibles; usar `getPorts()` únicamente para dispositivos autorizados.
- Agregar prueba de hardware en Configuración y estado claro: listo, sin permiso, desconectado o error. En pago, fallo de impresora nunca revierte ni bloquea una venta confirmada.
- Apertura automática solo después de confirmar pago en efectivo (o componente en efectivo), con protección anti doble-disparo. Nunca disparar al reintentar impresión.
- Añadir canal de impresión por driver solo como despliegue controlado con Edge/Chromium kiosk printing; no presentarlo como Web Serial.
- Criterio: matriz de prueba en modelos objetivo, permiso denegado, desconexión, reintento, pago mixto, venta offline y venta sin hardware.

### Fase 3 — Respaldo y recuperación (prioridad alta)

- Extender backup versionado con configuración no secreta y datos necesarios para restaurar; decidir explícitamente inclusión de ventas y movimientos por tamaño/privacidad.
- Definir exportación, cifrado opcional/obligatorio según datos, retención, detección de backup externo descargado y flujo de restauración con vista previa y validación.
- Snapshot local al cierre es best-effort y no debe retrasar ni impedir cerrar caja. Cola/reintento y cuota de almacenamiento explícitos.
- Criterio: restaurar en comercio de prueba, comparar conteos/saldos y verificar que un fallo de almacenamiento no altera cierre ni ventas.

### Fase 4 — Mermas y fidelidad de stock

- Ampliar el modelo/migración de movimientos con motivos inequívocos sin invalidar registros antiguos. Asociar lote cuando aplique y registrar costo unitario de referencia al momento del movimiento.
- Integrar el flujo en Stock y reportes. No mezclar mermas con faltantes de efectivo o ventas; cualquier asiento contable queda sujeto a definición contable.
- Criterio: stock y lote FEFO se actualizan atómicamente; historial auditable; costo histórico permanece aunque luego cambie el costo del producto.

### Fase 5 — Capacidades multirrubro

- Expandir `RubroComercio` mediante migración compatible y valores por defecto para comercios existentes. Capacidades configurables: envases, pesables, lotes/vencimientos, servicios rápidos.
- Mantener atributos por producto como fuente de verdad operativa; capacidades del rubro guían UI y configuración inicial, sin ocultar inventario ni borrar datos.
- Actualizar menú lateral, POS, importadores, reportes y tests para cada combinación. Probar cambio de rubro en un comercio con datos existentes.

### Fase 6 — Pagos integrados (iniciativa separada)

- Primero prototipo técnico con sandbox y terminal/cuenta elegibles. Diseñar Edge Function/backend, secretos, idempotencia, webhook verificado, conciliación, cancelación y estados inciertos.
- Mantener el flujo manual actual siempre disponible; no confirmar venta integrada hasta resultado verificado y conciliable. Si el proveedor queda en estado desconocido, bloquear doble cobro y ofrecer consulta/reintento seguro.
- QR dinámico y Point se estiman y aceptan por separado; no asumir que comparten endpoints ni disponibilidad.
- Criterio: pruebas sandbox de aprobado, rechazado, timeout, webhook duplicado/tardío, cancelación y recuperación sin duplicar ventas/cargos.

### Fase 7 — Despliegue quiosco Windows

- Documentar instalación/actualización, acceso directo, arranque, perfil de navegador, impresión y salida de emergencia. No incluir launcher que abra `localhost:5173` como producto final; eso es servidor de desarrollo. Apuntar a URL de producción o instalador/runtime soportado.
- Mantener PWA como instalación cómoda, pero describir límites frente al modo kiosk administrado. Verificar pantalla, reconexión, actualización y restauración tras cierre inesperado.

## Secuencia y estimación

Orden sugerido: Fase 0 → Seguridad → Periféricos → Backup/recuperación → Mermas → Multirrubro → despliegue por piloto. Mercado Pago se ejecuta como proyecto paralelo solo tras validar backend, cuenta y terminal.

No fijar días calendario todavía. Estimar cada fase después de descubrir migraciones y probar hardware; reservar tiempo de piloto con comercios, correcciones y despliegue. El cronograma original de 13 días omite aprobaciones de proveedor, RLS/migraciones, QA de dispositivos, restauración y soporte.

## Puerta de salida por fase

- Build y suite existentes medidos antes/después; agregar pruebas para reglas nuevas y de regresión. No asumir el conteo de tests del documento original.
- SQL/migraciones revisadas y aplicables a datos existentes, con fallback/rollback documentado cuando corresponda.
- Flujos críticos verificados online y offline sin duplicar venta, stock, pago, impresión ni apertura de cajón.
- Permisos verificados en base de datos/backend, no solo por ocultamiento de componentes.
- Piloto controlado y criterios de soporte antes de activar por defecto. Integraciones nuevas permanecen opt-in hasta completar validación.

## Veredicto

La dirección general es buena, pero el plan original no debe ejecutarse tal cual. Recomiendo aprobar primero descubrimiento y seguridad; aprovechar los módulos existentes; corregir el diseño de MP, PIN, quiosco y backups; y dividir el alcance por puertas de aceptación verificables. El orden pone primero protección de datos y continuidad de caja, deja pagos integrados como iniciativa dependiente de backend/proveedor y pospone multirrubro hasta tener un modelo flexible de capacidades.

## Historial de implementación secuencial

Estas notas conservan las verificaciones y pendientes de cada momento. Para el
estado vigente, consultar los dos registros del inicio del documento.

El trabajo posterior sobre el checkout añadió estas piezas, sin afirmar que ya estén activas en producción:

- **Seguridad y auditoría (parcial):** frontend deja de pedir costos en consultas de cajeros; costos privados se cargan solo para dueño/superadmin; caché pública se limpia y exportaciones propietarias usan la tabla privada. La migración de costos corrige el alta con FK diferida y permite guardar costo cero. `supabase_fase_seguridad_perfiles.sql` impide elevar rol/privilegios desde un perfil ordinario y asociar una identidad de autenticación a dos perfiles. La anulación exige motivo, conserva identidad de sesión en auditoría y protege actor/fecha frente a cambios posteriores. `supabase_fase_auditoria_precios.sql` restringe cambios de precio de catálogo y registra valores anterior/nuevo. El guardado del catálogo deja de presentar rechazos de permisos como éxito o modificar su caché ante esos rechazos. Las pruebas SQL ejecutan funciones/políticas reales sobre PostgreSQL local en memoria. Requiere aplicar SQL en orden y validar con usuarios reales/PostgREST; siguen pendientes descuentos excepcionales, justificación específica de precios, apertura manual del cajón y consulta de auditoría desde UI. Ver alcance y orden en `docs/verificacion-seguridad-postgresql.md`.
- **Periféricos (parcial):** selección de impresora en Ajustes, prueba de impresión sin abrir cajón, evita seleccionar el primer puerto de forma arbitraria y agrega apertura automática opt-in después de pagos confirmados con efectivo. Faltan las pruebas en cada modelo de impresora/cajón y no está implementado canal por driver de Windows.
- **Backup (parcial):** formato 3.0 declara su alcance, sigue aceptando 2.0 y rechaza versiones futuras. `supabase_fase_backup_integral.sql` obtiene las seis colecciones y los costos privados en un único snapshot SQL STABLE, autorizado por rol y comercio; sustituye consultas que podían truncarse por límites de filas. La descarga verifica formato, conteos, comercio y alcance antes de guardar/cifrar; ante errores o función no instalada no genera una copia parcial. Incluye catálogo, categorías, clientes, proveedores, promociones, lotes y costos; excluye ventas, movimientos de caja y credenciales. Permite cifrado AES-GCM con clave derivada PBKDF2 y exige contraseña para validar/restaurar. Excel maestro sigue siendo una exportación legible sensible. Requiere aplicar la nueva migración para generar copias. Faltan configuración no secreta, revisión de relaciones entre módulos, copias externas automáticas, retención y restauración comprobada con el esquema completo. Ver `docs/verificacion-respaldo-snapshot.md`.
- **Mermas (parcial):** motivos diferenciados en UI y migración `supabase_fase_mermas_trazables.sql` para congelar costo unitario desde nuevos movimientos y asociar lote en bajas por vencimiento. Una RPC combina en transacción el movimiento manual, el stock y los lotes (FEFO/baja identificada). Los registros históricos conservan costo NULL cuando no existe evidencia; falta validación en una base de prueba real.
- **Multirrubro (parcial):** configuración independiente de envases, balanza, vencimientos y servicios rápidos con defaults compatibles por rubro. Requiere `supabase_fase_capacidades_multirrubro.sql` antes del despliegue.
- **Quiosco Windows (parcial):** se agregó un lanzador HTTPS de Edge y una guía de piloto. Assigned Access, recuperación/reinicio de Edge y validación de permisos Web Serial quedan a cargo del despliegue de cada dispositivo; el modo kiosco Edge usa una sesión InPrivate, así que hay que confirmar persistencia de login/periféricos tras reinicios.

Última verificación registrada durante estos cambios: **473 tests pasando en 32 archivos** y build exitoso (`tsc -b && vite build`), con el aviso existente de chunk principal mayor a 500 kB. Incluye 28 pruebas SQL de seguridad, 9 SQL de respaldo, 8 de descarga del snapshot, 21 de restauración, 3 de identidad reproducible y 3 de paginación, 3 del guardado del catálogo y 3 de cifrado. Las pruebas SQL usan esquema mínimo y emulación de identidad; falta validar JWT/PostgREST y el esquema completo de Supabase. El lanzador PowerShell pasó análisis sintáctico; no se verificó hardware real ni se aplicaron las migraciones SQL remotas. Pagos integrados (fase 6) sigue pendiente; para pagos se necesita decidir Point/QR, una cuenta/terminal sandbox elegible y backend Edge Function desplegable. El objetivo completo y las fases siguen abiertos hasta cumplir sus puertas de aceptación.

La restauración ahora muestra los errores parciales en el modal, conserva el resumen de cambios ya aplicados y omite la desactivación del modo reemplazo si la recuperación previa falla. No garantiza todavía una transacción ni recuperación idempotente; la fase permanece abierta. Los detalles y límites están en docs/verificacion-respaldo-snapshot.md.

Promociones y lotes usan identidad estable para reintentos y confirmación de ID. La promoción restaura campos del esquema vigente y remapea sus referencias. Falta comprobar este flujo en PostgreSQL/PostgREST real y cubrir combos, concurrencia y recuperación completa.

Se integraron los cambios vigentes de origin/master (ARCA, realtime y rotación), se conservó Vitest 5 del remoto y se adaptó RotacionTab a costos privados. Guía de aplicación SQL: docs/aplicar-migraciones-supabase.md. La publicación Git no aplica migraciones a la base remota; el objetivo completo sigue abierto.

Mermas: 15 pruebas SQL locales validan FEFO, lote específico, costo histórico, ajustes, permisos y rollback ante fallas de kardex. Se corrigieron lotes en ajustes negativos, precisión de cantidades y ejecución del backend de servicio. Reaplicar supabase_fase_mermas_trazables.sql si se instaló una versión anterior; ver docs/verificacion-mermas-postgresql.md. Falta concurrencia, idempotencia, revisión de permisos y validación remota.

Stock: nueva RPC registrar_movimiento_stock_idempotente y tabla de operaciones protegida. Reintentar exactamente la solicitud pendiente conserva el UUID local y devuelve el movimiento original. Requiere supabase_fase_stock_idempotente.sql después de mermas. 17 pruebas SQL de stock y 3 de identidad local; faltan concurrencia real, conciliación de pendientes y permisos de costos históricos. Estos cambios todavía no se publicaron ni se aplicaron en Supabase.

Solicitudes de stock pendientes: se bloquean cambios de parámetros del mismo producto mientras la identidad siga abierta, la firma no depende del orden de campos y las fallas de almacenamiento/corrupción detienen el envío con mensajes claros. Cuatro casos reprodujeron fallas antes de la corrección. Falta la vista de conciliación y consulta remota; estos cambios continúan locales a la espera de la autorización de publicación pendiente.

Stock pendiente: pantalla para consultar, reenviar solicitud original y cancelar con reserva atómica de identidad en servidor. La ausencia de operación no elimina el registro local; cancelar una operación aplicada devuelve su resultado sin revertirla. 20 pruebas SQL de stock y 5 de componente de pendientes. Reaplicar supabase_fase_stock_idempotente.sql para agregar resolver_operacion_stock; falta validación remota y concurrencia real. 473 pruebas y build aprobados; publicación aún pendiente de autorización.

Actualización: 480 pruebas en 33 archivos y build aprobados. Costos históricos de movimientos trasladados a una tabla privada con lectura RLS para dueño/superadmin; los cajeros no consultan esa relación ni reciben la columna pública con costos. La migración preserva snapshots conocidos y deja desconocidos como NULL. Stock presenta estimación a costo por movimiento para roles autorizados. Requiere aplicar supabase_fase_costos_movimientos_privados.sql después de mermas; la aplicación remota de esta nueva migración no está confirmada. Se mantienen pendientes reportes agregados, concurrencia real y validación con JWT/PostgREST.

Corrección de Reportes en b922db7: consultas de ventas seleccionan usuario:usuarios!usuario_id(nombre) para evitar ambigüedad tras agregar anulada_por. Comprende historial diario, balance, devoluciones y exportaciones. No modifica ventas guardadas ni requiere otra migración; falta publicar y verificar en producción. El usuario informó haber aplicado los SQL anteriores, sin lista de versiones ni validación remota de políticas.

Bajas de stock: el historial presenta al dueño/superadmin un resumen por motivo de los movimientos cargados y filtrados, con estimaciones históricas conocidas y conteo de costos faltantes. No mezcla ventas, compras, devoluciones ni ajustes; advierte carga parcial. Ajustes históricos se presentan como cantidad registrada para no confundir conteos absolutos con variaciones. Validación: 492 pruebas en 36 archivos y build aprobados. Ver docs/verificacion-resumen-bajas-stock.md. No requiere SQL adicional; sigue pendiente el reporte del período completo en servidor, la publicación de esta UI y el piloto real. La fase y el objetivo completo permanecen abiertos.

Reporte completo de bajas: nueva pestaña en Reportes con rango Desde/Hasta y cálculo SQL autorizado para dueño/superadmin. La función resumir_bajas_stock agrega todas las bajas del período sin límite REST de filas; usa días argentinos y snapshots privados, distingue costos faltantes y cero real, excluye ajustes/ventas y no modifica el resultado fiscal. Nueva migración supabase_fase_reporte_bajas_stock.sql (paso 11). Las pruebas SQL verifican 1202 bajas, límites del día, snapshot conservado, permisos y cifras inválidas. UI descarta respuestas tardías, permite reintentar errores y no presenta ceros cuando falla. Publicación y validación remota pendientes; el objetivo completo permanece abierto.

Multirrubro/pesables: corregidas tres entradas del POS que agregaban una unidad entera al desactivar balanza. Los productos es_pesable siempre solicitan peso; la capacidad controla lectura USB/Serial y etiquetas de peso. El modal conserva ingreso manual y oculta USB si está desactivado. Ajustes aclara esta regla. Cinco regresiones nuevas; 515 pruebas en 39 archivos y build aprobados. No requiere SQL nuevo; falta publicación y piloto. Ver docs/verificacion-multirrubro-pesables.md. La fase completa y el objetivo permanecen abiertos.

Catálogo/multirrubro: corregido el guardado que borraba atributos de peso, envase y vencimiento al desactivar módulos. Dos regresiones reprodujeron pérdida de KG/PLU, depósito y alerta; ahora conserva atributos y cantidades fraccionarias. 517 pruebas en 40 archivos y build aprobados. Sin SQL adicional. Publicación y piloto pendientes. Servicios rápidos actualmente solo persiste la preferencia: aún no hay panel operativo conectado a tieneServiciosRapidos; su implementación sigue pendiente.
