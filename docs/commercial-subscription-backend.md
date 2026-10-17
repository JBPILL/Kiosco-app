# Administración comercial: instalación y operación

Este módulo es opcional y separado del baseline F6 y del PR #1. La rama nace de
master 41bebe9; no incorpora los commits de hardening/next-operational-block.
No se aplicó SQL remoto ni se desplegó ninguna función durante su implementación.

## Autoridad y datos

El backend comprueba un perfil activo asociado a auth.uid(). Sólo el SuperAdmin
real administra planes, configuración, comercios, estados y renovaciones. El
Dueño consulta su propia suscripción, plan, pagos e instrucciones; Cajero y Visor
reciben únicamente el estado operativo de su comercio. No se acepta un tenant
elegido por el navegador para esas lecturas. Un plan faltante se muestra como
no disponible; no se inventa precio ni vigencia.

Las tablas comerciales tienen RLS y carecen de DML para las API públicas.
Se revocan permisos heredados de tablas, columnas, vistas y funciones antiguas.
La excepción de service_role para insertar/vincular perfiles ordinarios conserva
el provisioning de personal existente; nunca entrega esa clave al navegador.
Las funciones internas de la saga sólo son ejecutables por service_role.

Las RPC públicas son renovar_suscripcion_comercial, cambiar_estado_comercial,
cambiar_plan_comercial, actualizar_plan, guardar_configuracion_comercial,
editar_comercio_comercial, leer_configuracion_comercial,
obtener_mi_suscripcion_comercial, leer_administracion_comercial y
obtener_estado_operativo_comercial.

Cada mutación registra actor, operación, solicitud y resultado. Repetir ID y
cuerpo recupera el ACK; cambiar el cuerpo se rechaza. Renovación, pago, extensión
por meses calendario y auditoría se confirman en una transacción. Se aceptan
meses 1–12 e importes finitos no negativos con hasta dos decimales.

## Estados y recuperación

ACTIVO permite escritura operativa. SOLO_LECTURA y SUSPENDIDO la rechazan en
backend, incluido checkout, aunque el navegador omita el guard. Suspensión domina;
sin cobertura o con vencimiento se aplica sólo lectura, sin gracia automática.
La fecha comercial usa Argentina. Renovar no levanta una suspensión manual.
Las consultas autorizadas, login, reportes, backups y recuperación siguen
disponibles. Los replays de checkout conservan su contrato previo: no se promete
recuperación cuando ese contrato original rechaza el estado administrativo.

provision-commerce valida JWT, SuperAdmin en DB, CORS y cuerpo exacto acotado.
Reserva una operación antes de Auth Admin y sólo crea un Dueño ordinario. El
servidor genera los IDs del comercio/perfil. La finalización SQL es atómica.
La contraseña no se persiste en navegador, logs ni auditoría; la reserva privada
contiene un hash del cuerpo. En un reintento debe ingresarse la misma contraseña.

Un rollback inequívoco permite compensar sólo después de reclamar la operación
y confirmar que no hubo commit. UNCERTAIN conserva la identidad; TAINTED requiere
conciliación humana. No borrar usuarios ni repetir altas a ciegas. El operador
debe comprobar la reserva, el resultado SQL y la marca de operación en Auth
antes de decidir una reparación autorizada. Un PASS existente recupera el ACK.

## Instalación autorizada: Staging antes de Production

1. Obtener autorización para el destino concreto y verificar su identidad sin
   imprimir credenciales. Crear y verificar un backup externo recuperable.
   Inspeccionar el esquema real, columnas heredadas y suscripciones duplicadas.
   Resolver explícitamente planes/cobertura de comercios existentes; no inventar
   datos para superar la migración. Un error SQL detiene la instalación.
2. Verificar `node supabase/bootstrap/verify-manifest.mjs --check`. Sobre un
   baseline endurecido existente, aplicar completo
   `supabase_fase_comercial_suscripciones.sql`, que usa una sola transacción.
   Nunca reinstalar el baseline en una base con datos. En una instalación nueva,
   completar primero los 43 SQL base y 900; después aplicar los tres archivos
   opcionales de `supabase/bootstrap/commercial/` en orden. No ejecutar ambas rutas.
   El manifest declara automaticInstall=false; los importadores F6 no activan
   este módulo. Los checksums actuales corresponden a bytes versionados en Git;
   .gitattributes evita conversiones SQL dependientes de Windows. No cambia el
   contenido fuente de los 43 SQL base ni las evidencias históricas.
3. Verificar ACL/RLS y utilizar un SuperAdmin previamente autorizado. No existe
   alta de SuperAdmin por esta Edge. Configurar planes y cobertura reales mediante
   las RPC antes de habilitar operaciones; ausencia de suscripción falla cerrada.
4. Con autorización independiente, desplegar únicamente provision-commerce.
   Mantener verify_jwt=true, secretos sólo en servidor y la allowlist CORS
   CHECKOUT_ALLOWED_ORIGINS del entorno. No desplegar provision-user, checkout,
   AFIP/WSFE ni Point como parte de este bloque.
5. Validar con JWT reales de SuperAdmin, Dueño, Cajero, Visor y otro tenant:
   lecturas propias, denegaciones de RPC/DML directo, los tres estados, checkout,
   login y backups. Simular ACK perdido y confirmar un solo pago/renovación/alta.
   Ensayar concurrencia con PostgreSQL real y Auth/PostgREST hospedados; PGlite
   no sustituye estos controles ni verifica el runtime Deno desplegado.
6. Sólo entonces publicar frontend con VITE_ADMIN_COMERCIAL_HABILITADO=true.
   Su default es false; VITE_KIOSKO_PILOT_STRICT_SCOPE permanece activo.
   Repetir los controles en Staging y autorizar por separado Production.

Desactivar el flag permite retirar la UI sin borrar datos, auditoría ni controles
de backend. No retirar triggers, restaurar backups o eliminar identidades como
rollback automático. No desactivar strict pilot para habilitar lo comercial.

## Límites y riesgos abiertos

### Plan de instalación Production autorizado

`scripts/plan-commercial-production-install.mjs INPUT.json OUTPUT.sql` genera
offline la instalación del módulo comercial sobre el baseline F6 existente de
43 tablas. Sólo admite el ref Production revisado y el SuperAdmin confirmado
ya existente; no crea identidades ni reinstala el baseline. Aborta si encuentra
otra forma de esquema, cobertura distinta o un módulo comercial ya aplicado.
El input autorizado fija monthlyPrice=30000, coverageMonths=1, trialPrice=0 y
trialDays=30. La cobertura del comercio existente dura un mes calendario; el
plan inicial gratuito para nuevas altas se presenta como prueba de 30 días.
Al vencer, requiere seleccionar el plan mensual y renovar por el backend; no
hay cargo automático ni continuidad gratuita implícita. No se registra un pago
recibido al inicializar cobertura. La operación y ambos planes quedan auditados.

El backup privado de Production se restauró y el plan exacto pasó en PostgreSQL
17 local: plan mensual 30000, prueba inicial 0, cobertura un mes calendario y
cero pagos iniciales. Este ensayo no autoriza por sí solo aplicar SQL ni desplegar;
la autorización de integración/activación del usuario es una etapa separada.

### Compatibilidad del Staging pre-030 observado

El preflight autorizado del 17/10 encontró 30 tablas públicas y los 15 triggers
operativos previos; faltan los módulos 030–041, el estado bootstrap y el módulo
comercial. No reinstalar el baseline one-shot ni el paso 042 sobre ese destino.
`scripts/plan-commercial-staging-upgrade.mjs INPUT.json OUTPUT.sql` genera offline
una transacción específica para ese ref y ese estado; no se conecta ni ejecuta.
Valida los hashes canónicos, preserva datos/triggers existentes y agrega los
módulos faltantes con la frontera final de seguridad. Rechaza Production y un
esquema que ya fue actualizado. El alcance de usuarios queda como el baseline
actual: sólo SuperAdmin global sin comercio; personal siempre con comercio.

El input contiene projectRef, adminEmail, planName="Plan de prueba", price=0 y
days=365. El correo debe existir confirmado en Auth y no tener perfil previo.
No contiene contraseña ni tokens. La identidad fue creada por el usuario en
Auth; la transacción crea sólo su perfil administrativo separado, conservando
los perfiles operativos existentes. La cobertura inicial aprobada se registra
en operaciones/auditoría sin inventar un pago. No usar este plan para Production;
requiere inventario y decisión de cobertura propios.

Antes de la ejecución se exportaron esquema y datos a una carpeta privada fuera
del repositorio y se restauraron en PostgreSQL 17 local sin puertos publicados.
El ensayo final sobre la copia real pasó: un SuperAdmin global, dos perfiles
tenant preservados, plan $0 y cobertura 365 días. Los tests sintéticos reproducen
también el NOT NULL heredado de usuarios.kiosco_id, rollback y rechazo de replay.

Los planes se desactivan, no se borran. La eliminación destructiva de comercios
queda fuera del flujo. Cambiar email Auth requiere un procedimiento separado;
no basta editar el perfil. No se habilitan AFIP/WSFE, Point, devoluciones ni envases.
El riesgo preexistente de xlsx (dos avisos HIGH, sin fix automático) sigue abierto;
no se ejecuta audit fix. SQL remoto, despliegue, pruebas JWT reales, concurrencia
hospedada y ensayo físico de cámara/impresora son gates posteriores autorizados.
