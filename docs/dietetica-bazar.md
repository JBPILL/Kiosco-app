# Dietética y Bazar

## Habilitación

1. Ejecutá `supabase_fase_dietetica_bazar.sql` después del paso 22 de migraciones.
2. En Superadministración, seleccioná Dietética o Bazar al crear o editar el comercio.
3. Al cambiar realmente el rubro, el servidor aplica sus capacidades iniciales.
   Guardar el mismo rubro conserva las preferencias elegidas por el dueño.
4. En Catálogo, abrí la importación del catálogo maestro y seleccioná sus categorías.
5. Configurá costos, precios, existencias reales y activá los productos que vas a vender.

La migración es reaplicable. Su ejecución no cambia los rubros actuales, no borra
productos ni modifica el stock. No se aplicó remotamente desde Codex.

## Capacidades iniciales

| Rubro | Envases | Balanza | Lotes y vencimientos | Fotocopias e impresiones |
|---|---|---|---|---|
| Dietética | No | Sí | Sí | No |
| Bazar | No | No | No | No |

El dueño puede adaptar estas capacidades en Configuración. Los artículos que ya
existían se conservan aunque cambie el rubro; el sistema no los elimina ni los
convierte de unidad a peso automáticamente.

## Catálogos

- Dietética: 86 artículos en 11 categorías, con 56 de granel en KG y 30 envasados
  por unidad. Todos incluyen seguimiento de lotes y alerta inicial de 30 días.
- Bazar: 120 artículos en 10 categorías por unidad, sin pesaje ni vencimientos.
- Ambos usan códigos internos `DIE-` y `BAZ-`, sin códigos EAN inventados.
  Se importan inactivos, con precios y existencias en cero. La importación omite
  los códigos existentes, incluso si el producto actual está inactivo.

En Dietética, 250 gramos se registran como 0,250 KG. El costo y precio de los
artículos de granel deben configurarse por kilogramo, y los lotes se ingresan en
esa misma unidad. Los productos envasados siguen descontando unidades completas.

Las plantillas no incluyen cervezas, cigarrillos ni envases retornables. No
certifican atributos nutricionales: verificá la descripción contra el producto
real y su etiqueta antes de activarlo.

## Validación de esta fase

Suite local: 810 pruebas aprobadas en 93 archivos. Compilación TypeScript/Vite
sin errores. Las pruebas específicas comprueban catálogos, cantidades y unidades,
capacidades y etiquetas, conservación de preferencias, trigger SQL reaplicable
y aceptación de los rubros en el respaldo ampliado. No se verificó todavía la
instalación en Supabase ni un mostrador con balanza física.

Evaluación: precisión 4/5 (contratos probados, falta ensayo físico);
completitud 4/5 (rubros implementados, habilitación remota pendiente);
claridad 4/5 (unidades y defaults documentados, falta guía visual);
accionabilidad 4/5 (SQL y pasos disponibles, aplicación remota manual);
concisión 4/5 (guía breve, evaluación añade detalle). Promedio: 4/5.
Prioridad de validación pendiente: aplicar SQL en ensayo y verificar una venta
de granel y otra por unidad con el catálogo configurado por el comercio.
