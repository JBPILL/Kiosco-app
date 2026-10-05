# Pesables al cambiar capacidades del comercio

## Garantía implementada

`productos.es_pesable` conserva la forma de venta del artículo. Desactivar la
capacidad `balanza` no agrega una unidad entera ni cambia sus atributos: favoritos,
códigos de productos en caché y búsqueda remota solicitan peso manual.

La capacidad controla lectura de etiquetas de peso y lectura USB/Serial. El modal
recibe esa configuración, oculta el botón USB cuando está deshabilitada y mantiene
ingreso manual y pesos rápidos. Ajustes explica este alcance.

No requiere nueva migración. Los cambios de configuración existentes dependen de
`supabase_fase_capacidades_multirrubro.sql`, paso 8 de la guía. No altera stock ni
reclasifica productos al guardar capacidades.

## Evidencia local

- Tres regresiones de POS fallaron antes de corregir la selección: favoritos,
  caché y producto remoto omitían el modal con balanza deshabilitada.
- Tras la corrección, la prueba de caché confirma 0,75 kg a $100 = $75 y que el
  modal recibe lectura Serial deshabilitada.
- Una regresión de modal falló porque ofrecía USB con integración deshabilitada.
  Ahora confirma peso rápido manual sin acceder al dispositivo.
- Se conserva el botón USB cuando la capacidad está habilitada y el navegador
  soporta Web Serial. Las pruebas simulan soporte; no certifican hardware.

## Pendientes de la fase

Publicar y comprobar el cambio con productos existentes en comercios de distintos
rubros. Verificar lectura real por modelo, envases, vencimientos, servicios rápidos,
importadores y reportes para las combinaciones del plan. Este cambio no prueba que
la fase multirrubro completa esté terminada.

## Autoevaluación

Exactitud 4/5: regresiones y cálculo de subtotal cubiertos; falta navegador real.
Completitud 4/5 para esta corrección: tres entradas y modal cubiertos; falta piloto.
Claridad 4/5: Ajustes explica el alcance; falta comprobar comprensión con cajeros.
Acción 4/5: código y pruebas listos; publicación pendiente.
Concisión 4/5: reutiliza modal y atributo existente; falta revisar presentación en
pantalla pequeña. Promedio 4/5. Mejoras: piloto con cambios de rubro y hardware real.
