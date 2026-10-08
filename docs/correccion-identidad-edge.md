# Corrección de identidad Edge — SQL44

Evidencia remota del usuario: supervisor-pin pasó OPTIONS204, devolvió Sesión inválida401; Pedro tiene identidad, perfil y comercio activos. Diagnóstico SQL: service_role no tiene SELECT en usuarios/kioscos; capacidades_operativas existe.

Corrección: SQL44 concede SELECT únicamente sobre las columnas de identidad que consulta el backend y USAGE de public. La consulta de usuarios cambia SELECT* por id,auth_user_id,kiosco_id,activo,rol. No modifica los grants de authenticated, RLS ni la verificación JWT. Grants de tabla completos siguen false deliberadamente: comprobar permisos de columna, no has_table_privilege.

Aplicar supabase_fase_lectura_identidad_edge.sql en ensayo, actualizar checkout local con git pull origin master y desplegar npx supabase functions deploy supervisor-pin --project-ref wlqujnwxrmksheubfrha. Luego cerrar sesión, entrar y verificar ESTADO y CONFIGURAR. No activar Point. Si persistiera401, inspeccionar errores de las consultas y la verificación Auth antes de cambiar secretos.

19 pruebas en tres archivos aprobadas, con permisos mínimos PostgreSQL/reaplicación y HTTP/autorización. No prueba despliegue Deno ni éxito remoto. Evaluación: exactitud4 (causa detectada, cierre remoto pendiente), completitud3 (requiere aplicación/redeploy), claridad4 (permisos por columna), acción4 (comandos y SQL concretos), concisión4; promedio3,8. Prioridad: confirmar ESTADO/CONFIGURAR remotos y ampliar diagnóstico seguro de errores de infraestructura.

SQL45: diagnóstico remoto con SELECT de tablas false en productos/promociones/clientes. Concede sólo columnas utilizadas en catálogo, promociones, crédito, componentes y envases. El backend reemplaza SELECT* en promociones/clientes. Actualizar checkout-manual antes de recuperar el mismo cobro; no crear otro intento ni cobrar otra vez. 20 pruebas aprobadas de permisos/autorización. Recuperación remota pendiente: si falla nuevamente, comprobar privilegios de columna y funciones RPC; has_table_privilege puede seguir false por grants de columna.
# Diagnóstico del cierre: 8 de octubre

La captura del usuario muestra cero resultados al filtrar `CHECKOUT_DIAGNOSTICO`.
Esto no identifica la causa ni prueba qué código está desplegado. Se amplió el
diagnóstico a toda la orquestación: autorización, recuperación, política,
cotización, snapshot, preparación y validación de la respuesta del cierre.
Sólo se registra etapa interna y código permitido; nunca solicitudes ni mensajes
de error. Se conserva el error original y no se reintenta el cobro automáticamente.

Validación local: 35 pruebas en dos archivos pasaron. La reproducción remota sigue
pendiente; conservar el identificador del cobro y recuperar la misma solicitud.

Autoevaluación: precisión 4 (pruebas locales, falta evidencia remota); integridad
3 (causa del cierre todavía desconocida); claridad 4 (etapas explícitas, código
genérico para errores sin código); utilidad 4 (despliegue concreto necesario);
concisión 4 (un único punto de captura adicional). Media 3,8. Prioridad: obtener
la etapa del próximo fallo remoto y corregir su causa. El usuario todavía no
puede considerar resuelto el cierre.

