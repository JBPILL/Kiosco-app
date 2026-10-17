# Venta confirmada y carga de Reportes

## Diagnóstico y corrección

El usuario informó ticket confirmado e historial POS visible, aproximadamente
$5350 en efectivo a las 15:19. La lectura autorizada de Production con JWT del
Dueño confirmó una venta COMPLETADA por $5350, EFECTIVO, a las 15:17:53 de Argentina
(18:17:53 UTC). No se repitió checkout ni se modificaron datos.

Las consultas originales de Ventas Diarias y Balance devolvieron 42703:
`column ventas.afip_cae does not exist`. El bootstrap del piloto estricto no
incluye las columnas fiscales. No era una venta perdida ni un problema de fechas.

Las proyecciones omiten exclusivamente los campos fiscales cuando el flag estricto
está activo. Las instalaciones completas conservan los campos históricos y el
comportamiento anterior. También se corrige la proyección anidada del comprobante
en devoluciones del Balance. No se habilita AFIP/WSFE ni se cambia el esquema.

Una segunda lectura con las proyecciones corregidas, mismo tenant y JWT del Dueño,
recuperó la venta sin errores en ambas consultas. Las claves y JWT se usaron sólo
en memoria, con cierre de la sesión de comprobación; no se imprimieron secretos.

## Validación

- Dirigidos Reportes/proyección: 26 PASS / 2 archivos.
- Suite final: 1860 PASS / 1 skipped / 196 archivos, 261,09 s, maxWorkers=2.
- Build final PASS: TypeScript + Vite, 610 módulos.
- Diff de trabajo e índice PASS. Escaneo: 1069 textos y 14 binarios omitidos,
  mismos 44 candidatos conocidos de fixtures/ejemplos, sin nuevos candidatos;
  historial fuera de alcance. Advertencias no bloqueantes de sourcemaps del SDK.
- Audit de producción: cero vulnerabilidades; no se ejecutó audit fix.
- No se aplicó SQL, no se desplegaron funciones ni se tocó .env.local.
