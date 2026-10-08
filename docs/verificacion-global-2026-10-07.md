# Verificación global — 7 de octubre de 2026

## Resultado reproducible

Actualización del 08/10 sobre `0091e12` más el ajuste de timeout de las dos
pruebas de permisos de identidad: 1279 pruebas en 140 archivos pasaron en
123,29 segundos. La ejecución anterior tuvo 1278 aprobadas y una prueba SQL
agotó su límite de 5 segundos; se amplió a 30 segundos sin cambiar aserciones.
`npm run build` terminó con código 0 y el aviso conocido de chunks grandes.
La evidencia remota aportada por el usuario de checkout con PIN y recuperación
está en `docs/aceptacion-remota-checkout-2026-10-08.md`; no sustituye permisos
de API con JWT reales, restauración aislada o prueba de hardware.

Autoevaluación de esta validación: precisión 4 (salidas medidas, contexto local);
integridad 3 (aceptaciones externas pendientes); claridad 4 (fallo inicial y
repetición registrados); utilidad 4 (evidencia reproducible publicada);
concisión 4 (resumen y referencias). Media 3,8. Prioridades: comprobar costos
con rol remoto y preparar la restauración real en un entorno aislado.

Actualización del 8 de octubre sobre eabbf5d: npm run test aprobó 1271 pruebas en 137 archivos, sin fallos, en 127,63 segundos. Incluye consulta comercial y apertura manual auditada del cajón. npm run build terminó con código 0 y el aviso conocido de chunks grandes. El usuario informó haber aplicado todos los SQL enviados; el funcionamiento remoto, permisos con JWT reales y hardware no se han comprobado desde esta sesión.


Actualización del 8 de octubre: sobre `013a5fb`, `npm run test` aprobó **1238
pruebas en 134 archivos**, sin fallos, en **103,41 segundos**. Incluye los motivos
de precio, importación/restauración/siembra y recuperación de artículos libres
y altas offline. La compilación de esa revisión también aprobó; se conserva el
aviso de chunks grandes. SQL 39 y la activación coordinada siguen pendientes
de aplicación y piloto remotos.

Sobre el código de `8591815`, `npm run test` aprobó **1202 pruebas en 131
archivos**, sin fallos, en **104,35 segundos**. Incluye el umbral configurable,
su política congelada en el checkout, la auditoría de cambios y los casos de
cierre/reapertura de cámara. `npm run build` sobre ese mismo código terminó
con código 0 en la fase anterior, con el aviso conocido de chunks grandes.
Esta regresión no sustituye las comprobaciones remotas ni la matriz física.

Verificación anterior sobre el código de `bb77177`: `npm run test` aprobó
**1159 pruebas en 126 archivos**, sin fallos, en **117,05 segundos**.
`npm run build` también terminó con código 0. Incluye las mejoras del lector
móvil, espera progresiva y aislamiento de auditoría del supervisor. Conserva el
aviso de bundle mayor a 500 kB. No demuestra compatibilidad física de cámaras,
aplicación de SQL, despliegue Edge ni validación con JWT/PostgREST reales.

Actualización tras integrar PIN y escritura atómica del permiso: `npm run test`
aprobó **1115 pruebas en 118 archivos**, sin fallos, en 89,03 segundos. La primera
ejecución detectó dos mocks de sesión obsoletos en recuperación de PaymentModal;
se corrigieron para admitir el selector reactivo y se repitió la suite completa.
`npm run build` también aprobó. Se mantiene el aviso conocido de paquetes grandes.
Esta ejecución no verifica navegador, hardware, JWT/PostgREST ni SQL remoto.

Sobre el código del commit `82998d0`, `npm run test` terminó con **984 pruebas aprobadas en 110 archivos**, sin fallos, en 80,89 segundos. La compilación `npm run build` de esa fase también aprobó; conserva el aviso de paquetes mayores de 500 kB. Esta evidencia es local y no demuestra el estado del despliegue ni del SQL remoto.

La suite incluye los módulos de cobro manual, cancelación durable, conciliación, caja, respaldo/restauración, stock, reportes y multirrubro. El conteo original de 352 pruebas es histórico: no describe esta versión. Una suite verde tampoco prueba requisitos que aún no tienen implementación o cobertura.

## Puertas que permanecen abiertas

| Requisito del plan revisado | Evidencia actual y trabajo pendiente |
| --- | --- |
| Seguridad del supervisor | Backend con hash y pepper versionado, límites persistentes, espera progresiva, auditoría del dueño y permiso de descuento vinculado al cuerpo original. Umbral configurable integrado en Configuración, cobro y servidor con política congelada; cambios visibles en auditoría (SQL 36–38). Faltan retención, otras acciones protegidas y validación remota/en navegador. |
| Cobro manual y cancelación entre equipos | SQL y cola local cubiertos por pruebas. Falta instalar/verificar las migraciones con JWT/PostgREST reales y piloto concurrente con dos equipos. |
| Seguridad de costos y permisos | Hay migraciones y pruebas SQL locales. Falta auditar todas las políticas efectivamente instaladas y retirar vías de escritura antiguas cuando corresponda. |
| Respaldo integral | Hay respaldo ampliado, restauración y copia local al cierre con pruebas. Falta restauración comprobada en comercio de ensayo con conteos y saldos reales. |
| Mermas y lotes | Hay operaciones idempotentes y costos históricos privados probados localmente. Falta concurrencia y conciliación con la instancia remota. |
| Multirrubro | Configuración por capacidades y pantallas presentes. Falta piloto con datos y sesiones reales de cada rubro. |
| Periféricos | Código de detección e impresión disponible. Falta matriz de impresoras, lectores y cajón físicos; no se presume compatibilidad por la suite. |
| Quiosco Windows | Existe lanzador y documentación. Falta validar instalación, salida de soporte y recuperación en el equipo del comercio. |
| Point/QR integrados | Pausados por decisión del usuario. Se mantiene cobro manual mediante posnet; no se activan ni se declaran aceptados. |

## Próxima implementación

Completar las acciones protegidas restantes del supervisor y validar el umbral
configurable con despliegue coordinado en ensayo.
El descuento ya usa autorización de servidor vinculada a la entrada original;
la validación remota, las interacciones en navegador y los pilotos siguen siendo
puertas independientes. Ver `docs/supervisor-pin-cliente.md`.

## Autoevaluación

| Eje | Puntaje | Evidencia y mejora |
| --- | --- | --- |
| Precisión | 4/5 | Resultado completo del comando; falta ejecución remota. |
| Completitud | 3/5 | Regresión global comprobada; quedan los requisitos de la tabla. |
| Claridad | 4/5 | Se separa evidencia local de puertas pendientes; todavía falta un inventario remoto. |
| Utilidad | 4/5 | Comando y commit reproducibles; el piloto requiere equipos y cuentas reales. |
| Concisión | 4/5 | Una tabla concentra pendientes; se conserva detalle suficiente para retomar. |

Promedio: **3,8/5**. Mejoras prioritarias: completar las acciones y configuración del supervisor, verificar SQL remoto y realizar pilotos. La evaluación mantiene explícito que el plan general no está terminado; el usuario debería coincidir con esa conclusión.
