# Respaldo y recuperación del piloto (20/10/2026)

## Objetivo
Avanzar P13/P14 tras los ensayos de recuperación de cobros, sin confundir el
snapshot operativo con un respaldo PostgreSQL completo. Impresora y Point
continúan diferidos al final por el usuario.

## Progreso y evidencia
- [x] Revisadas generación, alcance 4.0, validación de relaciones y restauración.
- [x] 113 pruebas existentes PASS en seis archivos: exportación, cifrado,
      relaciones, restauración, verificación e integración ampliada; 3.85 s.
- [x] RPC generar_snapshot_backup_ampliado con JWT Dueño real del comercio
      aislado de Staging devuelve 4.0 para el comercio correcto. Conteos
      coinciden: 7 productos y cero categorías, clientes, proveedores,
      promociones y lotes. Colecciones con kiosco_id pertenecen al comercio.
- [x] Alcance declara incluyeCredenciales=false. Snapshot completo sólo en
      memoria, sin exportarlo a disco ni imprimir datos privados. No se ejecuta
      restauración ni SQL remoto. Runner externo: ../verify-backup-snapshot-staging.cjs.
- [ ] Ensayo de exportar/cifrar/descifrar/restaurar a destino aislado, con datos
      representativos y comparación completa de relaciones, costos y saldos.
- [ ] Respaldo completo PostgreSQL/Storage y destino/retención externos (P15/P16).

## Límites y resultado
Las colecciones vacías no prueban relaciones complejas, saldos ni combos: no hay
combos activos que permitan acreditar el paso de restauración de recetas.
La disponibilidad de la RPC 4.0 no demuestra equivalencia de todas las funciones
SQL instaladas ni una restauración remota. P13/P14 continúan abiertos.
No se guardaron claves, tokens, JWT, contraseñas ni snapshot privado en archivos.
No hubo cambios de aplicación, despliegue, merge ni acceso a Production.

## Ensayo remoto y defecto detectado (20/10/2026)
Destino nuevo y separado creado mediante provision-commerce, Dueño ordinario y
plan de ensayo $0. El código real de backupUtils exporta/cifra/descifra en memoria,
pero la restauración falla: las siete inserciones directas a productos reciben
permission denied. Cero productos escritos; origen sin cambios; destino suspendido.
Diario externo backup-restore-staging-journal.json; no repetir provisioning.

Corrección prevista: catálogo strict mediante RPC autorizada, IDs de producto
reproducibles y operación durable por registro, sin habilitar DML. Evitar que
descripciones duplicadas colapsen registros. Validar ACK y mantener solicitudes
inciertas. Detectar antes de escribir colecciones/campos sin contrato strict
de restauración; no omitirlos ni declarar éxito parcial. Flujo legacy intacto.
Pruebas de regresión, build, reensayo del mismo destino y suspensión final.

## Corrección y reensayo (20/10/2026)
- [x] Catálogo/categorías strict usan RPC con identidad reproducible y operación
      durable por registro. No fusiona dos productos sólo por igual descripción.
      Mantiene stock, costo, precio, actividad y favoritos y verifica snapshot.
- [x] Sesión original antes/después de la RPC; ACK ajeno/ausente, almacenamiento
      fallido y respuesta incierta no se convierten en éxito ni nueva operación.
- [x] 89 pruebas dirigidas PASS en cinco archivos; build 632 módulos PASS.
- [x] Reensayo real del código final: 7 productos restaurados/verificados. Nueva
      ejecución actualiza 7 y crea 0, conserva origen y recuento de destino.
      Origen sólo leído, claves/contraseña de cifrado en memoria; destino nuevo
      suspendido al terminar. No se reutiliza ni altera un comercio anterior.
- [x] SQL histórico: 43 archivos intactos. Scan 1135 textos, 14 binarios omitidos,
      mismos 46 candidatos conocidos; npm audit --omit=dev: 0 vulnerabilidades.
- [x] Suite completa final: 2101 PASS / 1 skipped / 219 archivos, 201.41 s,
      --maxWorkers=4. Evidencia ../pilot-backup-strict-post-review-suite.log.
      Código cerrado en 6763ea2; publicación normal en la rama del PR #3.

No se activa restauración integral en la UI: su bloqueo strict se conserva.
REEMPLAZO y colecciones sin contrato strict (clientes/proveedores/promociones/
lotes/asociación a proveedor) se rechazan antes de escribir. Categorías y combos
requieren todavía un ensayo representativo de relaciones, además de las pruebas
locales. P14 continúa abierto; no es una restauración PostgreSQL completa.
La primera suite global coincidió con cambios a archivos: falló una prueba de
sesión y no se cuenta como PASS. Se repite con los archivos estabilizados.

Resultado de este bloque: motor de restauración del catálogo estricto corregido
y ensayado con JWT real, cifrado/descifrado en memoria, verificación posterior y
repetición sin duplicados. Destino suspendido. El flujo integral en UI conserva
su gate; P14 y los módulos de respaldo completo no se declaran terminados.
Sin cambios de SQL, dependencias, permisos remotos, master ni Production; no se
necesita activar/deployar una UI nueva para publicar esta preparación técnica.
