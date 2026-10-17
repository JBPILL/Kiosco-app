# Validación del PIN y periféricos — 17/10/2026

## PIN de supervisor

Production rechazaba CONFIGURAR porque su configuración del secreto era inválida;
la presencia de los nombres en secrets list no demostraba valores válidos.
El nuevo readiness de ESTADO devuelve 503 con código estático si la protección no
está disponible, en vez de informar engañosamente «Sin configurar». CONFIGURAR
distingue configuración, protección criptográfica y guardado no confirmado sin
exponer mensajes internos, hashes, PIN ni secretos.

Antes de reparar: lectura autenticada en Production, transacción REPEATABLE READ
READ ONLY, transaction_read_only=on, cero registros de PIN; el ensayo de RPC con
material sintético alcanzó la escritura y fue bloqueado por READ ONLY. ACL y RPC
no requerían cambios. Se inicializaron sólo los dos secretos del supervisor con
un valor aleatorio de 32 bytes generado en memoria. Se abortaría si hubiera un
PIN existente o el servicio ya estuviera sano. No se leyó ni sobrescribió un PIN.

Después: JWT real de Dueño, ESTADO HTTP 200 configurado=false tanto en Staging
como en Production. El ensayo previo CONFIGURAR en el comercio aislado autorizado
de Staging devolvió 200 y una lectura posterior confirmó configurado=true; ese
comercio quedó suspendido. No se redujeron las 600.000 iteraciones PBKDF2-SHA256,
no se modificó SQL y sólo se desplegó supervisor-pin, con verificación JWT activa.
Inventario remoto posterior: supervisor-pin ACTIVE v3 en Staging y v5 en
Production, verify_jwt=true en ambos; sin funciones AFIP/WSFE ni Point.

El Dueño eligió y confirmó su PIN real en el formulario y reportó guardado
correcto. La lectura autenticada posterior de ESTADO en Production devolvió
HTTP 200 configurado=true. No se envió ni consultó el PIN desde herramientas. Nunca incluir el PIN en
chat, capturas, logs, repositorio, variables VITE o localStorage.

## Ensayo físico

La suite de cámara/POS verifica permisos, recursos liberados al cerrar y descarte
de respuestas tardías. No reemplaza una lectura óptica real ni acredita integración
de los cambios de producto inactivo del PR #1, que sigue abierto y sin merge. La suite de impresión DOM no acredita salida de papel.

| Equipo | Estado | Comprobación necesaria |
|---|---|---|
| Cámara POS | El usuario confirma lectura en el mismo celular | Faltan registrar dispositivo/navegador y confirmar duplicados y liberación al cerrar. |
| Cámara Crear producto | iPhone 17, Brave; tres productos capturados, pero sólo muy cerca | Lectura auxiliar con detalle nativo; pendiente ensayo de distancia tras publicar. |
| Impresora | No disponible según usuario | Pendiente cuando esté conectada. Registrar modelo, conexión, navegador y formato. |

Para completar cámara, registrar celular/SO/navegador, código de un producto
propio activo y resultado. Tras integrar y autorizar por separado el PR #1, validar también código
inexistente y producto inactivo: el inactivo no debe agregarse al ticket ni abrir
alta; debe pedir reactivación desde Catálogo. No desactivar un
producto operativo sólo para este ensayo. No confirmar ventas ni altas de prueba
en Production.

Cuando esté disponible la impresora: Configuración → prueba de impresión;
verificar ticket de 58/80 mm, sin recorte, márgenes ni escala incorrecta, y
etiquetas en su formato con fondo blanco y tamaño estable de precio/barcode.
Verificar lectura del barcode impreso y salida de varias etiquetas. Cancelar o
desconectar debe informar el fallo sin repetir ventas ni abrir el cajón.
Consultar también `docs/despliegue-kiosco-windows.md`. Hasta entonces el ensayo
físico de impresión permanece abierto, sin presumir compatibilidad por el build.

## Primer ajuste de cámara de Crear producto (ensayo posterior fallido)

El usuario confirmó imagen en vivo y lectura correcta desde la cámara POS del
mismo celular. Ambos usan html5-qrcode; la captura de catálogo limitaba el área
decodificada a una franja. Se elimina ese recorte para incluir códigos largos
que aparecen en el visor. Es una corrección candidata a validar ópticamente:
las pruebas automáticas no reproducen el sensor ni confirman por sí solas la
causa del fallo físico. Se conserva la cámara trasera y selección manual.

Se verifica captura única, preservación de ceros iniciales, rechazo de callbacks
viejos/cerrados, liberación de cámara y reapertura. ProductForm cierra el capturador
al cerrarse y no lo reabre por sorpresa; la captura sólo completa el campo, sin
crear producto ni escribir stock. Dirigidos: 25 PASS en cuatro archivos.

## Validación final y publicación

Código publicado en master mediante push normal, sin merge de PR #1:
- 0d8032b: readiness y errores seguros del servicio PIN, recuperación del estado.
- fcf5a7c: SheetJS CE 0.20.3 oficial fijado con SHA-512, pruebas reales XLS/XLSX.
- df34059: lectura del cuadro completo y cierre del capturador con ProductForm.

Suite sobre el código final: **1847 PASS / 1 skipped / 193 archivos**, 282,98 s,
maxWorkers=2. Build final: **PASS, 608 módulos**, con advertencia previa por
chunks grandes. TypeScript conserva sus controles. Diff de trabajo e índice:
PASS. Secret scan: 1063 textos y 14 binarios omitidos; mismos 44 candidatos
conocidos de fixtures/ejemplos, sin credenciales nuevas detectadas; historial
fuera del alcance. Audit diagnóstico de producción: **0 vulnerabilidades**.
No se ejecutó audit fix. .env.local no se tocó. No se aplicó SQL remoto,
no se desplegó provision-user, AFIP/WSFE ni Point. No hubo merge de PR #1.

Pendiente completar aceptación óptica en Crear producto tras el despliegue y
el ensayo físico de impresora cuando esté disponible. No se consideran PASS
por los tests automatizados.

Ambos checks Vercel del código df34059 terminaron success (kiosco-app y
kiosco-app-staging). HTTP público Production: página, entry y bundle XLSX 200;
el bundle publicado identifica versión 0.20.3. Se pidió repetir el ensayo de
cámara Crear producto en el mismo celular sobre esta versión publicada; el
resultado todavía está pendiente. El PIN real permanece configurado y verificado.


## Segundo ensayo de cámara y corrección posterior

El usuario informó que el cuadro completo tampoco resolvió la lectura en Crear
producto. Dispositivo: iPhone 17 con Brave; imagen nítida y completa; la cámara
POS del mismo celular lee sin cambiar cámara ni activar luz. El primer ajuste
no se considera una solución física validada.

Se retira la implementación duplicada de BarcodeCaptureModal: pasa a usar el
mismo BarcodeScannerModal, visor, configuración, selección de cámara y ciclo
de vida de POS, con un contrato de captura excluyente respecto de venta. En ese
modo se devuelve texto una sola vez y se cierra, antes de consultar identidad,
productos o ticket. La captura no guarda producto ni agrega ítems al carrito.
El cambio requiere un nuevo ensayo físico después de su publicación; la causa
óptica exacta del fallo anterior no se afirmó como demostrada.


## Cantidades con cero por defecto
El usuario pidió poder escribir sobre el cero sin borrarlo primero. Input oculta
el cero numérico opcional y válido mientras se enfoca, sin cambiar el modelo ni
disparar onChange. Si no se escribe, el cero reaparece al salir. Si se escribe,
el valor nuevo se conserva; el cero explícitamente ingresado se muestra. Stock
actual del formulario queda cubierto. No se aplica a códigos de texto, lectura
sola, obligatorios ni valores inválidos para preservar validación nativa.
Se prueban strings/números, decimales, foco/blur, callbacks y no guardar por foco.


Validación de la corrección posterior y cantidades: 53 tests dirigidos PASS en
cinco archivos. Suite final: **1853 PASS / 1 skipped / 194 archivos**, 260,03 s,
maxWorkers=2. Build PASS, 608 módulos. Diff de trabajo e índice PASS; escaneo de
1064 textos conserva los 44 candidatos conocidos (14 binarios e historial fuera
del alcance). No se cambiaron dependencias, secretos ni SQL en esta continuación.
La publicación queda separada en commits de cámara, cantidades y documentación.
El estado óptico de Crear producto sigue pendiente hasta el nuevo ensayo físico.


## Captura lograda y distancia de lectura
El usuario confirmó el cero editable y finalmente capturó tres productos con el
lector compartido, pero debió acercarlos demasiado. Las capturas de pantalla
comprimidas no pudieron decodificarse en el ensayo local y no se usan como prueba
de corrección. Se verificó en el código de html5-qrcode que el canvas de lectura
reduce el recorte del sensor al tamaño CSS; la vista iOS también reducía detalle.

Se añade una lectura auxiliar iOS del canvas que muestra el visor, preservando
píxeles nativos hasta un máximo de 1280 por dimensión, sin ampliar artificialmente.
Se solicitan 1920x1080 como resolución ideal (no obligatoria), respetando cámara
elegida y fallback. Usa el mismo ZXing incluido, sin dependencia nueva ni envío
ni persistencia de imágenes. El lector normal continúa; sus guards de captura
única y cooldown también reciben los resultados HD. Se oculta la guía del SDK
cuando el lector HD está disponible porque ese recorte no coincide con la vista
iOS; se restaura al cerrar. Máximo dos intentos/s, sin solaparse y sin callbacks
después de cerrar o mientras la página está oculta.

Prueba óptica reproducible con EAN-13 sintético: barras a dos píxeles nativos por
módulo se leen en el frame 1280x720; la reducción Lanczos a 390x219 deja de ser
legible. El adaptador aporta únicamente píxeles al canvas y ejecuta ZXing real.
No se agregaron fotos del usuario al repositorio. Falta aceptación física de la
mejora de distancia después de publicar; no se promete distancia fija por tests.
