# Promociones y relaciones del respaldo estricto (20/10/2026)

## Objetivo
Continuar P14 con promociones y relaciones categoría/producto/receta, usando las
RPC existentes, sin habilitar DML directo ni restauración integral en la UI.

## Alcance y decisiones
Promociones conservan ID remapeado, parámetros y operación durable hasta ACK
válido de comercio/sesión originales. Reusar guardar_promocion_transaccional.
Comprobar copia y repetición en dos comercios creados exclusivamente para ensayo;
el origen interactivo del usuario no se modifica. Datos de prueba conservados y
comercios suspendidos al terminar. Sin SQL nuevo ni Production.

Clientes, proveedores con saldo, lotes y vínculo producto-proveedor requieren
contratos que todavía no existen para restaurar su foto sin cambiar historia
contable. Permanecen bloqueados antes de escribir. REEMPLAZO e interfaz integral
también bloqueados. No declarar completo el respaldo PostgreSQL.

## Progreso
- [x] Revisión de contratos y límites de saldos/permisos.
- [x] RPC de promociones integrada con identidad durable y ACK de comercio/sesión
      originales. 116 pruebas dirigidas PASS en seis archivos; build 632 módulos
      PASS. Pruebas de composición, días/estado, referencias ajenas y reintento.
- [x] Ensayo real representativo: snapshot 4.0 exportado/cifrado/descifrado en
      memoria; destino nuevo de Staging restaura 10 productos, una categoría,
      cuatro promociones (NXM/VOLUMEN/PORCENTAJE/COMBO) y una receta con componente
      pesable. Verificación del motor: 10 productos, 4 promociones y 1 combo.
- [x] Repetición: 0 productos creados, 10 actualizados, misma categoría y cuatro
      promociones, receta verificada. Ambos comercios de este ensayo suspendidos;
      comercio interactivo del usuario intacto. Sin ventas ni movimientos de caja.
- [x] Suite final: 2104 PASS / 1 skipped / 219 archivos, 198.77 s con cuatro
      workers. Build 632 módulos PASS. Diff trabajo/índice PASS; 43 SQL históricos
      intactos; scan 1136 textos, 14 binarios omitidos, 46 candidatos conocidos.
      npm audit --omit=dev: 0 vulnerabilidades. Publicación normal en PR #3,
      manteniéndolo en borrador y sin merge; sin deploy/activación de UI integral.

## Evidencia y límites
Runners externos: ../seed-backup-relations-staging.cjs y
../test-backup-relations-staging.cjs. Diarios conservan identidades de ensayo en
../backup-relations-seed.json y ../backup-relations-restore-journal.json.
Contraseña de cifrado, claves y JWT sólo en memoria. Ningún snapshot privado se
guarda en disco ni se imprime. No repetir provisioning; reensayo usa --resume.
La verificación integral de clientes/saldos/lotes continúa pendiente. La UI de
restauración integral sigue bloqueada; este ensayo no habilita Production.

## Resultado final
Motor de promociones y relaciones preparado y ensayado con JWT real, incluidas
categoría, receta pesable y repetición sin duplicar. No se amplían permisos ni
se aplica SQL remoto. Clientes/saldos/proveedores/lotes y asociaciones mantienen
su rechazo previo a escritura hasta completar los contratos específicos.
