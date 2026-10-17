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

Los planes se desactivan, no se borran. La eliminación destructiva de comercios
queda fuera del flujo. Cambiar email Auth requiere un procedimiento separado;
no basta editar el perfil. No se habilitan AFIP/WSFE, Point, devoluciones ni envases.
El riesgo preexistente de xlsx (dos avisos HIGH, sin fix automático) sigue abierto;
no se ejecuta audit fix. SQL remoto, despliegue, pruebas JWT reales, concurrencia
hospedada y ensayo físico de cámara/impresora son gates posteriores autorizados.
