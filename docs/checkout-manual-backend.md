# Cierre manual: backend autenticado

## Estado

Esta fase agrega `checkout-manual`, una Edge Function que verifica el JWT,
recotiza contra el catálogo del servidor y llama al cierre transaccional privado.
No cobra en un posnet ni necesita credenciales de Mercado Pago.

El POS y la cola offline ahora tienen una conexión opcional a esta función.
Desplegarla por sí sola no cambia el circuito: la activación del frontend y sus
límites están documentados en [checkout-manual-pos.md](checkout-manual-pos.md).

## Aplicar en el proyecto de ensayo

1. Con los SQL anteriores aplicados, ejecutá completo
   `supabase_fase_checkout_manual_backend.sql` en SQL Editor. Requiere el paso 26,
   `supabase_fase_checkout_manual.sql`. Es reaplicable.
2. Desde la carpeta del repositorio, configurá los orígenes permitidos:

   ```powershell
   supabase secrets set CHECKOUT_ALLOWED_ORIGINS="https://TU-DOMINIO,http://localhost:5173" --project-ref TU_PROJECT_REF
   ```

   Reemplazá los ejemplos por el dominio exacto del ensayo y el identificador de
   ese proyecto. No agregues rutas ni una barra final al origen. Incluí localhost
   sólo si vas a ensayar desde Vite.
3. Desplegá la función:

   ```powershell
   supabase functions deploy checkout-manual --project-ref TU_PROJECT_REF --no-verify-jwt
   ```

   La función verifica el token de sesión con `auth.getUser` y exige un perfil
   activo del comercio. `--no-verify-jwt` omite la verificación del gateway;
   no elimina la autenticación implementada en la función. Las peticiones de
   preflight no requieren sesión; los cobros sí.

Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al backend.
No copies la clave de servicio a Vercel ni al navegador. No hacen falta
`POINT_ACCOUNTS_JSON` ni claves de workers para esta función.

Estos pasos no se ejecutaron remotamente desde Codex. Todavía no actives un
frontend que dependa de esta función sin comprobar el despliegue en ensayo.

## Reglas del cierre

- El JWT determina quién autoriza; no se acepta un actor elegido por el cliente.
- Se comparan total, subtotales y receta contra precios y promociones del servidor.
  Un cambio requiere revisión; no se modifica silenciosamente el importe cobrado.
- La preparación conserva el primer snapshot comercial. Un reintento idéntico
  lo recupera antes de volver a consultar precios nuevos.
- Stock, lotes, deuda, pagos y venta se confirman en la transacción del paso 26.
- El cajero admite hasta 15% de descuento manual. Más requiere supervisor y se
  rechaza por ahora: el PIN y su autorización siguen pendientes. El dueño puede
  aplicar los ajustes válidos del circuito comercial.
- Total cero admite el movimiento de stock. Fechas inexistentes, relativas o
  sin zona horaria se rechazan.
- Las respuestas comerciales no contienen costos ni detalles internos de errores.

## Contrato y recuperación

`POST /functions/v1/checkout-manual` usa `Authorization: Bearer TOKEN_DE_SESION`.
El cuerpo está definido en `src/types/checkoutManual.ts`, versión 1, con IDs
estables de venta y pagos, fecha original, ticket y receta esperados.

| Respuesta | Tratamiento requerido en el frontend |
| --- | --- |
| 200 | Validar el resultado y cerrar una sola vez; no descontar stock nuevamente al recuperar un cierre |
| 400 | Conservar la solicitud y revisar su formato |
| 401/403 | Recuperar sesión o permiso; no generar otro cobro |
| 422 | Revisar precios/promociones/receta; no sustituir el ticket cobrado |
| 409/503 o pérdida de conexión | Conservar cuerpo e ID originales y reintentar; no cobrar nuevamente |

Una cabecera antigua sin registro transaccional no se adopta automáticamente.
Caja cerrada, stock o crédito insuficientes requieren conciliación. No cambies
la caja, fecha o identificador para forzar una confirmación.

## Evidencia y pendientes

Las pruebas locales ejecutan el SQL real y cubren preparación durable,
identidad, permisos, cierres y reintentos. Las pruebas del backend cubren
recotización, conflictos, recuperación, descuento, validación y respuestas HTTP.
Deno comprueba los imports y tipos de la Edge Function.

Falta verificar JWT/PostgREST y concurrencia real en Supabase de ensayo.
La conexión opcional del POS y su cola está implementada en la fase siguiente.
Esto no demuestra que el circuito de cobro en producción ya sea transaccional.

Validación local de esta fase: suite completa de **866 pruebas en 95 archivos**
aprobada; `deno check supabase/functions/checkout-manual/index.ts` aprobado.
Compilación `npm run build` aprobada, sin errores TypeScript. Vite mantiene
la advertencia existente por tamaño de algunos chunks.

Evaluación histórica de esta fase de backend: precisión 4/5 (falta JWT remoto); completitud 3/5
(backend preparado, POS y cola sin conexión); claridad 4/5 (contrato y orden
explícitos, falta el flujo completo); accionabilidad 4/5 (SQL y comandos listos,
requieren ejecución en ensayo); concisión 4/5 (guía breve, contrato separado).
Promedio 3,8/5. Prioridad siguiente: reemplazar las escrituras separadas de los
dos caminos del POS y ensayar recuperación de respuestas perdidas. Esta
evaluación cubre esta fase; el plan general sigue pendiente.
