# Despacho automático Point en Supabase (ensayo)

Esta fase procesa órdenes existentes y recupera cierres pendientes. No inicia
cobros nuevos. El código de GitHub/Vercel no despliega estas Edge Functions.
Mantené `POINT_PRODUCTION_ENABLED` desactivado hasta completar la interfaz,
el checkout manual/offline transaccional y el ensayo de la terminal real.

## 1. Aplicar la migración

En el proyecto de ensayo, aplicá los pasos anteriores de
`aplicar-migraciones-supabase.md`. Reaplicá el archivo actualizado
`supabase_fase_point_confirmar_venta.sql` del paso 20 y ejecutá
completo `supabase_fase_point_despacho.sql`. No alcanza con actualizar Vercel.
La migración crea trabajos privados y recupera órdenes/recepciones existentes;
no envía solicitudes a Mercado Pago por sí sola.

## 2. Configurar y desplegar las funciones

En **Edge Functions → Secrets**, configurá `POINT_WORKER_SECRET` con una clave
aleatoria de al menos 32 caracteres. Conservá la configuración privada de cuentas
`POINT_ACCOUNTS_JSON` y los secretos de webhook de las fases anteriores.
No copies claves en archivos del repositorio ni variables `VITE_*`.

Desde la carpeta del proyecto, con Supabase CLI autenticada:

```powershell
supabase functions deploy point-process --project-ref TU_PROJECT_REF --no-verify-jwt
supabase functions deploy point-dispatch --project-ref TU_PROJECT_REF --no-verify-jwt
```

Estas dos funciones comprueban su propio `Authorization: Bearer POINT_WORKER_SECRET`.
La opción desactiva la validación JWT de la puerta de entrada para esa clave privada;
no la uses para desplegar otras funciones indiscriminadamente.

## 3. Guardar los datos del programador en Vault

Activá las extensiones `pg_cron` y `pg_net`. En **Vault**, creá estos secretos
mediante el formulario del Dashboard:

| Nombre | Valor |
| --- | --- |
| `point_project_url` | URL HTTPS del proyecto de ensayo, sin barra final |
| `point_publishable_key` | Clave pública del mismo proyecto |
| `point_worker_secret` | La misma clave privada configurada en Edge Functions |

No uses la clave `service_role` como clave pública. No pegues secretos en la
definición del trabajo: se leen desde Vault en cada ejecución.

## 4. Crear el trabajo inicialmente inactivo

En **Integrations → Cron → Jobs**, creá `point-dispatch-every-minute`, con frecuencia
`* * * * *`, tipo **SQL snippet** y el siguiente comando. Dejalo **Inactive**
hasta comprobar el despliegue y los secretos en el proyecto de ensayo.

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets
          where name = 'point_project_url') || '/functions/v1/point-dispatch',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', (select decrypted_secret from vault.decrypted_secrets
               where name = 'point_publishable_key'),
    'Authorization', 'Bearer ' || (select decrypted_secret
               from vault.decrypted_secrets where name = 'point_worker_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
) as request_id;
```

El endpoint elige los trabajos desde la base de datos. El cuerpo no admite IDs,
cuentas, importes ni URLs. Un timeout de HTTP no demuestra que el procesamiento
se haya detenido: el lease y la identidad del cierre permiten recuperar el trabajo.

## 5. Ensayar y observar

Activá el trabajo sólo en ensayo. Revisá **Cron → History**, los logs de la función
y las respuestas en `net._http_response`. Una ejecución SQL correcta de Cron sólo
prueba que encoló la llamada HTTP; comprobá también su estado HTTP y el resultado.

```sql
select id, status_code, timed_out, error_msg
from net._http_response order by id desc limit 20;

select ultimo_resultado, count(*) as trabajos
from public.point_trabajos
where finalizado_at is null
group by ultimo_resultado;

select id, estado, venta_id, revision_pendiente_at
from public.point_intentos
where revision_pendiente_at is not null
   or (estado = 'PAGO_CONFIRMADO' and venta_id is null);
```

Comprobá una orden sin webhook, una recepción huérfana y un cierre que falló
después de verificar el pago. Repetir el proceso debe conservar la misma venta
y no duplicar pagos, movimientos ni deuda. Si aparece una revisión pendiente,
investigá la discrepancia sin cambiar estados manualmente ni volver a cobrar.
Desactivá el trabajo desde Cron para detener futuras invocaciones; las que ya
están ejecutándose pueden terminar.

El ensayo remoto, los secretos y el trabajo no fueron configurados desde Codex.
Fuentes: [programar funciones](https://supabase.com/docs/guides/functions/schedule-functions)
y [gestionar trabajos Cron](https://supabase.com/docs/guides/cron/quickstart).

## Evaluación de esta entrega

Promedio: 3,8/5. Precisión 4/5: 697 pruebas y Deno check aprobados; falta ensayo
remoto. Completitud 3/5: despacho preparado, pero quedan UI, checkout manual/offline
y hardware. Claridad 4/5: orden de SQL y despliegue explícito; los nombres del
Dashboard pueden variar. Accionabilidad 4/5: comandos y diagnóstico listos;
los secretos y la activación requieren el proyecto del usuario. Concisión 4/5:
una guía concentra los pasos, aunque las dependencias requieren consultar la guía
de migraciones. Mejoras prioritarias: ensayo remoto concurrente e integración de
cobro con el checkout transaccional. Esta evaluación no acredita el plan completo;
el usuario puede distinguir implementación local de habilitación real.
