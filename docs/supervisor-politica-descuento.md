# Umbral de descuento por comercio

## Estado

El paso 36, `supabase_fase_supervisor_politica_descuento.sql`, incorpora
almacenamiento privado de una política y sus cambios. **Todavía no está integrado
con el cobro ni tiene formulario**: el sistema continúa usando el 15% fijo.
Aplicar esta migración no cambia por sí solo la regla comercial actual.

El dueño activo configura un porcentaje entre 0 y 100 con hasta dos decimales.
La identidad y el comercio se resuelven desde auth.uid(), sin parámetros de actor
o comercio. El cajero sólo puede consultar la política propia. Sin configuración,
la consulta devuelve 15 y revisión 0. Cada cambio incrementa revisión y registra
valor anterior/nuevo, actor y fecha en la misma transacción. No borra historial.
Las tablas no conceden escritura directa a clientes ni al servidor de cotización.

## Integración pendiente

1. Leer la política autoritativa en la cotización de servidor y congelar umbral,
   revisión y decisión junto con la entrada original de cada cobro.
2. Definir comprobación SQL de nuevas preparaciones y compatibilidad con las
   históricas: un cambio de política no debe reescribir una decisión pendiente.
3. Conectar configuración exclusiva del dueño y consulta para el formulario de
   cobro. Una política local desactualizada no debe permitir saltar la aprobación.
4. Ampliar la consulta de auditoría para incluir cambios de política y validar
   sesiones reales, concurrencia y reintentos antes de activar.

No se debe sustituir únicamente el 15 en React: servidor y PostgreSQL deben
aplicar la misma política a la solicitud original. No habilitar esta funcionalidad
como terminada hasta integrar y comprobar el circuito completo.

## Evidencia local

Pruebas PostgreSQL en memoria: default, propietario y comercio, registro de
cambios, límites, cajero, inactividad, anonimato, identidad ambigua, reejecución y
rechazo de escritura directa. No hay comprobación remota de JWT/PostgREST ni
concurrencia entre conexiones reales.

Autoevaluación: precisión 4 (reglas SQL probadas; falta instancia remota),
completitud 3 (base privada lista; circuito comercial pendiente), claridad 4
(estado y dependencias explícitos), utilidad 4 (RPC aplicables; no cambia cobro
aún), concisión 4 (una migración; conserva pasos de integración). Promedio 3,8/5.
Prioridad siguiente: integrar cotización y preparación con política congelada.
