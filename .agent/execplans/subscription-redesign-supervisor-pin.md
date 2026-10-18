# Panel de suscripción y reparación del PIN de supervisor

## Objetivo y orden autorizado
Rediseñar Administración comercial, publicar mediante push normal a master y
después corregir el guardado de PIN. PR #1 permanece sin merge. Base: master
0fa1c98, checkout limpio, rama fix/subscription-panel-supervisor-pin.

## Alcance
- Panel responsive con jerarquía de plan/precio/estado, fechas, historial vacío
  y datos de regularización; temas claro/oscuro y accesibilidad.
- Conservar lecturas reales, permisos, errores, reintentos y descarte de respuestas
  de otra identidad. Fechas comerciales DATE sin desplazamiento por zona horaria.
- Diagnosticar cliente → Edge supervisor-pin → secretos/RPC/ACL; mínima corrección
  respaldada por evidencia. Nunca leer/imprimir PIN, hashes ni peppers.
- No rotar secretos ni sobrescribir PIN existente sin evidencia/autorización.
- Sin AFIP/WSFE/Point ni cambios al checkout o a la lógica comercial.

## Validación y publicación
Tests de componente, cliente y servidor afectados; build, diff/índice y escaneo
sin valores. Verificación visual del panel publicado y pruebas PIN en Staging
con fixture aislado antes de reparar Production. La elección y el guardado del
PIN real corresponden al usuario, mediante el formulario seguro.

## Progreso
- [x] Instrucciones, skills y código actual inspeccionados.
- [x] Rediseño, tests y push normal a master; despliegue y captura verificados.
- [x] Causa del PIN confirmada y configuración del servicio reparada; guardado real confirmado por el Dueño y ESTADO autenticado configurado=true.
- [x] Publicación y verificación del código sin secretos; cierre documental separado.

## Resultado final
Panel publicado en master; e85b3d8 contiene el rediseño y 2044cd0 elimina el
botón duplicado usando la recarga general. Production tenía secretos del PIN
inválidos, no un fallo de conexión o de SQL. Readiness volvió a HTTP 200 después
de inicializar los secretos con guardas de cero PIN existentes. El Dueño configuró su PIN desde el formulario, sin compartirlo; una lectura
autenticada posterior confirmó configurado=true.
El informe actualizado está en docs/supervisor-pin-peripheral-validation-2026-10-17.md.
SheetJS CE 0.20.3 oficial conserva XLS/XLSX y audit reporta cero vulnerabilidades
production. El ensayo del cuadro completo no resolvió la captura: el usuario
usa iPhone 17 con Brave y confirma POS operativo. Ahora se comparte lector/visor
POS en modo captura de texto sin producto/ticket. Se agrega edición cómoda del
cero en cantidades opcionales, sin cambiar el modelo por foco. Impresora no
disponible; aceptación física del nuevo lector pendiente tras publicación.

## Continuación 17/10/2026
- Panel publicado en master e85b3d8; botón duplicado retirado en 2044cd0.
- PIN: readiness Staging 200, Production 503 PIN_CONFIGURACION_NO_DISPONIBLE.
  Diagnóstico Production READ ONLY: cero PIN existentes; RPC/ACL alcanza escritura
  bloqueada por transacción de lectura. No hay que cambiar SQL ni reducir PBKDF2.
- Reparar exclusivamente secretos supervisor en Production si guardas previas
  confirman configuración inválida y cero hashes; no imprimir ni persistir valores.
- Excel: evaluar SheetJS CE 0.20.3 oficial, mantener XLS/XLSX, probar importación
  con números, ceros iniciales, encabezado corporativo, rechazo de reportes y CSV.
- Ensayo de cámara con el usuario pendiente. Impresora no disponible: pendiente
  físico explícito; suite/build no lo sustituyen.


## Ensayo recibido y siguiente validación
- El usuario confirma PIN guardado; Production ESTADO 200 configurado=true.
- Cámara POS lee en el mismo celular; captura en Crear producto muestra imagen
  pero no leía. Corrección candidata: decodificar cuadro completo sin recorte.
- El formulario ahora cierra la cámara al cerrarse; captura sólo rellena código,
  sin guardar producto automáticamente. Dirigidos cámara/formulario: 25 PASS.
- Suite antes del ajuste de cámara: 1844 PASS / 1 skipped / 193 archivos.
  Suite final con el ajuste: 1847 PASS / 1 skipped / 193 archivos, 282,98 s.
  Build final PASS, 608 módulos. Audit 0; diff/índice PASS; secret scan sin candidatos nuevos.
- Impresora no disponible: mantener ensayo físico pendiente.

- Push normal de código confirmado en origin/master df34059: PIN 0d8032b,
  SheetJS fcf5a7c y cámara df34059. Ambos checks Vercel success en ese commit;
  HTTP público confirma SheetJS 0.20.3 en Production. Cierre documental separado.

- Aceptación final de servicio: PIN real configurado por usuario y estado remoto
  true. Pendiente sólo repetición óptica de cámara Crear producto y ensayo de
  impresora, no disponible. PR #1 permanece abierto y sin merge.


## Reapertura de cámara — ensayo del usuario
El cambio del recorte no resolvió el fallo físico. Usuario: iPhone 17, Brave,
imagen nítida/completa; POS lee sin cambiar cámara ni activar luz. No marcar
captura de catálogo como aceptada. Reutilizar directamente lector/visor POS
mediante modo de captura pura; retirar implementación duplicada. El modo captura
debe devolver texto una sola vez y cerrar, sin consultar productos, contexto de
venta ni carrito. Conservar el comportamiento de venta y controles del lector
POS. Validar ambos modos, cierre/reapertura, callbacks tardíos, build y suite;
push normal a master y nueva prueba física. Impresora continúa no disponible.


## Ajuste adicional de cantidades autorizado
El usuario solicita ocultar el cero por defecto al enfocar cantidades, como Stock
actual de Crear producto. Input ocultará sólo un cero numérico controlado,
opcional, editable y nativamente válido, sin llamar onChange ni alterar el modelo.
Al abandonar sin escribir, reaparece cero; al escribir, se conserva el valor nuevo.
No tocar códigos de texto, campos obligatorios ni valores ya inválidos para no
cambiar sus reglas nativas. Probar reemplazo, decimales, blur y no guardar por foco.


## Validación de lector compartido y cantidades
- Dirigidos: 53 PASS / 5 archivos (POS, captura, ciclo de cámara, formulario e Input).
- Suite final: 1853 PASS / 1 skipped / 194 archivos, maxWorkers=2, 260,03 s.
- Build final PASS: 608 módulos; advertencia previa de chunks grandes.
- Diff de trabajo e índice PASS. Secret scan: 1064 textos, 14 binarios omitidos,
  mismos 44 candidatos conocidos, sin coincidencias nuevas; historial no escaneado.
- Sin dependencias nuevas, SQL ni cambios a PIN/secretos. .env.local no tocado.
- Publicación por push normal a master; PR #1 continúa sin merge.
- Aceptación física de cámara compartida pendiente tras desplegar; impresora
  no disponible. Los tests y build no reemplazan esa confirmación.


## Distancia de lectura iPhone — evidencia y plan
Usuario confirma cero editable PASS. Capturas demuestran visor nuevo; luego logra
leer tres productos pero sólo muy cerca. html5-qrcode reduce el recorte nativo al
ancho CSS antes de ZXing (foreverScan); la vista iOS también limitaba su canvas al
ancho CSS. Los PNG comprimidos del usuario no se decodificaron en el ensayo
local; no se afirma que prueben por sí solos la solución. Añadir lectura local
auxiliar iOS sobre los mismos píxeles visibles con detalle nativo (máximo 1280px),
sin ampliar artificialmente, a dos intentos/s y sin solapar decodificaciones.
Pedir resolución HD ideal, respetando deviceId elegido y fallback. Reutilizar
ZXing incluido, sin dependencias nuevas; mantener lector normal y controles de
comercio/ticket. Probar un EAN sintético real que pasa nativo y falla reducido,
resolución/crop, cierre/resultado tardío y cadencia. No almacenar ni enviar frames.
Validar suite/build, push normal master, Vercel y nueva aceptación de distancia.

## Incidente de Reportes — venta confirmada
Se prioriza el error informado durante el ensayo. Lectura con JWT de Dueño en
Production confirma $5350 EFECTIVO COMPLETADA a las 15:17:53 Argentina. Ambas
consultas de Reportes fallaban 42703 por ventas.afip_cae, ausente en piloto
estricto. Omitir únicamente campos fiscales bajo ese flag, preservando el modo
completo y la proyección anidada de devoluciones. Las consultas corregidas ya
recuperan la venta en lectura real. Sin reenvío de checkout ni escrituras remotas.
Evidencia: docs/reportes-venta-confirmada-2026-10-17.md. Dirigidos 26 PASS;
suite final conjunta cámara/Reportes 1860 PASS / 1 skipped / 196 archivos,
261,09 s. Build PASS, 610 módulos. Audit 0 vulnerabilidades. Diff de trabajo e
índice PASS, mismos 44 candidatos conocidos del secret scan sin nuevos secretos.
Commits c1bb52d (cámara) y a4438de (Reportes) publicados por push normal a master;
ambos checks Vercel success. Dominio público sirve index-CrUwLKIA.js, lector HD
HTTP 200 y guard estricto activo en las tres proyecciones corregidas. El usuario
confirmó después que la venta aparece y que la cámara lee mejor sin acercar tanto
los productos. Ambos ensayos quedan aceptados. Impresión sigue pendiente porque
no tiene impresora disponible. PR #1 se conserva sin merge.

## Etiquetas térmicas uniformes — 18/10/2026
Solicitud posterior del usuario: unificar geometría de las etiquetas térmicas.
Vista previa e impresión comparten componente de 48 × 40 mm para rollo 58 y
72 × 40 mm para rollo 80. Página térmica fija, una etiqueta por página, filas
reservadas para textos y opciones; sin cambios en medidas de tickets de venta.
Ver `docs/etiquetas-termicas-uniformes-2026-10-18.md` para evidencia y límites.
El ensayo sobre papel continúa pendiente de disponer de impresora.
