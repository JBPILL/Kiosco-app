# Comprobar lectura de costos con JWT real

La herramienta `scripts/verificar-costos-cajero.mjs` realiza sólo GET. No
escribe ventas ni modifica permisos y no imprime tokens, valores de costo o
cuerpos de error HTTP. Requiere Node con fetch y AbortSignal.timeout disponibles.

## Configuración local

Configurar estas variables sólo en el proceso local de comprobación:

| Variable | Valor requerido |
| --- | --- |
| KIOSKO_SUPABASE_URL | Origen HTTPS del proyecto, por ejemplo `https://wlqujnwxrmksheubfrha.supabase.co` |
| KIOSKO_SUPABASE_PUBLIC_KEY | Clave pública anon/publishable del mismo proyecto |
| KIOSKO_CAJERO_JWT | Access token vigente de una sesión real de cajero |
| KIOSKO_COMERCIO_ID | UUID del comercio que se pretende comprobar |

No usar la clave service_role ni una sesión del dueño. No pegar JWT, claves
privadas ni contraseñas en el chat, commits o archivos de resultados. Limpiar
las variables de sesión después de la comprobación.

Ejecutar desde el repositorio:

```powershell
node .\scripts\verificar-costos-cajero.mjs
```

Código de salida 0 indica que se verificó la identidad en Auth, existe un
único perfil activo CAJERO del comercio esperado, ninguna fila de las tablas
privadas es visible y todos los productos públicos recorridos tienen costo 0.
Se solicita conteo exacto para no confundir truncamiento con ausencia de filas;
las páginas públicas avanzan por filas recibidas hasta una página vacía.
Tras 100 páginas sin terminar se informa revisión incompleta, no éxito.
Redirects, timeouts, sesión vencida y tablas ausentes fallan la comprobación.

Un código 1 imprime únicamente diagnóstico no confirmado. Revisar la
configuración y permisos localmente; no ampliar grants para obtener éxito.

## Alcance de la aceptación

Antes de interpretar cero filas como una prueba de aislamiento, confirmar
con una sesión de dueño que existen registros de costos en el comercio de
ensayo; una tabla vacía no prueba su política. Ejecutar en un piloto controlado:
las lecturas paginadas no son un snapshot transaccional de todo el catálogo.

La herramienta comprueba lectura por HTTP con identidad verificada. No prueba
INSERT/UPDATE/DELETE, aislamiento de otras acciones, descuentos, firma de webhook
ni cierres de caja. P02 sigue abierto hasta aportar resultados reales y completar
las comprobaciones de escritura y otros roles/comercios.

13 pruebas locales aprobadas y build correcto: respuestas HTTP simuladas para identidad, perfil, exposición,
paginación, ausencia de conteos y rechazo de respuestas inciertas. No se usó
un token real ni se enviaron solicitudes al Supabase remoto en esta ejecución.

Autoevaluación: precisión 4 (aserciones de identidad, conteos y paginación);
completitud 3 (falta JWT real y pruebas de escritura); claridad 4 (alcance y
configuración explícitos); acción 4 (comando ejecutable, credenciales locales
pendientes); concisión 4 (guía sin valores sensibles). P02 no se declara cerrado.
