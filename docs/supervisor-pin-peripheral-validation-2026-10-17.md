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
| Cámara Crear producto | Imagen visible pero no decodificaba, según usuario | Se habilita lectura del cuadro completo; requiere repetir ensayo en el celular tras publicar. |
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

## Ajuste de cámara de Crear producto

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
