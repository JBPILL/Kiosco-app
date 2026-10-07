# Cliente de PIN de supervisor

El servicio `src/lib/supervisorPinClient.ts` consulta el estado, configura el PIN
como dueño y solicita autorización de descuento sobre la entrada original.
El permiso recibido se guarda mediante la cola durable existente. No guarda el
PIN, no altera la venta y no confirma el cobro por sí mismo.

Comprueba operador, comercio activo y JWT antes del envío, y revalida la sesión
después de cada llamada remota. Los errores remotos son genéricos para no copiar
datos sensibles. El servidor sigue siendo la autoridad de roles y permisos.

El formulario del dueño está integrado en Seguridad y Caja. Usa campos ocultos,
confirmación de 4 a 6 dígitos y limpia ambos campos después de cada envío.
Cuatro pruebas del componente cubren rol, ceros iniciales, confirmación y errores.

La cola de pendientes ofrece autorización para descuentos del operador original,
sin cancelación en curso. El modal limpia el PIN después de cada intento y guarda
el permiso antes de reintentar la solicitud original. No genera otra venta.

El cliente cuenta con pruebas de identidad JWT, cambios de sesión durante las
esperas, confirmación de PIN, autorización ligada a la entrada original,
respuestas malformadas y privacidad de errores. Estas pruebas usan transporte
simulado; no prueban un despliegue de Supabase.

Pendiente: autorización antes del cobro físico en PaymentModal,
prueba real de Edge Functions y validación del flujo completo en navegador.

## Autoevaluación de esta fase

| Criterio | Nota | Evidencia y mejora pendiente |
|---|---|---|
| Exactitud | 4 | Contrato contrastado con supervisorPinHttp; falta ejecución remota. |
| Completitud | 3 | Servicio implementado; faltan formularios y pruebas específicas. |
| Claridad | 4 | Funciones separadas por acción; falta documentación visual del flujo. |
| Utilidad | 3 | Permiso conectado a la cola; aún no accesible desde la interfaz. |
| Concisión | 4 | Un módulo sin persistencia de PIN; revisar extracción de contexto compartido al integrar UI. |

Promedio: 3,6/5. Prioridad siguiente: pruebas de sesión y respuestas, formularios
compactos y prueba del cobro protegido. Esta fase no completa el plan general.
