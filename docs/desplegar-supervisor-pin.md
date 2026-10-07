# Edge Function de supervisor

## Estado

`supervisor-pin` incorpora configuración del PIN por el dueño, consulta de existencia y emisión de permisos para descuentos. No está desplegada por el push a GitHub. El backend y la cola del cliente ya transmiten el permiso separado mediante `x-supervisor-autorizacion`; faltan la petición del permiso desde el cliente y la interfaz. Instalar esta función no habilita por sí solo descuentos extraordinarios para el cajero.

## Requisitos

- Proyecto de ensayo con las migraciones de checkout manual y supervisor instaladas en el orden de `docs/sql-pendientes-2026-10-07.md`, hasta el archivo 33.
- Sesión real de Supabase Auth y un único perfil activo asociado a esa identidad.
- `CHECKOUT_ALLOWED_ORIGINS`: orígenes exactos permitidos, separados por coma.
- `SUPERVISOR_PIN_PEPPER_VERSION`: identificador de la versión actual, por ejemplo `1`.
- `SUPERVISOR_PIN_PEPPERS_JSON`: objeto JSON que asocia versiones a secretos aleatorios de 32 bytes codificados como 64 caracteres hexadecimales.

Los peppers pertenecen a los secretos del servidor. No son el PIN elegido por el dueño. No los pongas en variables `VITE_`, código, SQL, capturas o logs. No existe valor predeterminado. Conservá las versiones anteriores mientras sus hashes sigan en uso; retirar una versión impide verificar esos PIN y requiere volver a configurarlos.

Guardá el archivo de secretos fuera del repositorio, en un lugar protegido. Para generar un pepper con PowerShell 7 y escribirlo sin imprimirlo:

```powershell
$taskPinBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($taskPinBytes)
$taskPinHex = [Convert]::ToHexString($taskPinBytes).ToLowerInvariant()
$taskPinSecretPath = Join-Path $env:TEMP ('supervisor-pin-' + [guid]::NewGuid().ToString() + '.env')
@(
  'SUPERVISOR_PIN_PEPPER_VERSION=1'
  ('SUPERVISOR_PIN_PEPPERS_JSON={"1":"' + $taskPinHex + '"}')
) | Set-Content -LiteralPath $taskPinSecretPath -Encoding utf8
```

La variable `$taskPinSecretPath` contiene la ruta creada. Usá ese archivo para cargar los secretos; no regeneres y reemplaces el pepper de una versión ya utilizada. Agregá el origen permitido mediante el gestor de secretos sin reemplazar los demás orígenes que ya necesite checkout.

## Publicar sólo esta función

Con Supabase CLI autenticada y desde la raíz del repositorio, reemplazá `REFERENCIA_ENSAYO` por el ID del proyecto de ensayo:

```powershell
npx supabase secrets set --env-file $taskPinSecretPath --project-ref REFERENCIA_ENSAYO
npx supabase functions deploy supervisor-pin --project-ref REFERENCIA_ENSAYO
```

No uses un despliegue de todas las funciones: Point sigue pausado. El handler comprueba el token con `auth.getUser`, el perfil, el comercio y el rol. Conservá también la verificación JWT del gateway al desplegar; si una configuración de claves del proyecto la rechaza, diagnosticá el motivo antes de cambiarla. Referencias oficiales: [secretos](https://supabase.com/docs/guides/functions/secrets) y [despliegue](https://supabase.com/docs/guides/functions/deploy).

## Contrato HTTP

Todas las acciones usan POST con sesión Bearer y respuesta `Cache-Control: no-store`.

| Acción | Cuerpo | Resultado |
| --- | --- | --- |
| ESTADO | `{ "accion": "ESTADO" }` | Sólo `{ "configurado": true/false }` del comercio de la sesión. |
| CONFIGURAR | accion, pin y repetirPin | Sólo dueño. PIN como cadena de 4–6 dígitos, conserva ceros iniciales. Devuelve CONFIGURADO después del guardado SQL. |
| AUTORIZAR_DESCUENTO | accion, pin y entrada original del checkout | Actor y comercio deben coincidir con la sesión. Devuelve estado o permiso con vencimiento; no confirma la venta. |

Campos extra, roles o identidades externas se rechazan. La autorización reserva el intento antes de comparar el PIN. Un bloqueo devuelve HTTP 429 y plazo; PIN inválido no emite permisos. Fallos de secretos, configuración o SQL devuelven mensajes genéricos sin sus detalles.

## Ensayo necesario

Validar con sesiones reales de dueño y cajero: dueño configura, cajero no configura, estado no revela hash, PIN correcto emite permiso, PIN incorrecto consume intento, después de cinco reservas fallidas o pendientes el siguiente intento se bloquea, otro comercio/operador se rechaza, cambio de PIN invalida permisos anteriores. Después comprobar el consumo en la transacción financiera cuando se conecte el checkout.

Pruebas locales de HTTP/secretos y criptografía realizadas; Deno, JWT/PostgREST remotos y concurrencia real todavía no comprobados. No registrar el cuerpo de la solicitud: contiene el PIN en tránsito HTTPS.
