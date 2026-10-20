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
