# Catálogos comerciales de veterinaria y electrónica

Esta etapa incorpora dos rubros en Super Admin: **Pet Shop y Veterinaria** y
**Electrónica y Celulares**. Veterinaria habilita inicialmente balanza y lotes con
vencimientos; electrónica comienza sin envases, balanza ni servicios de fotocopias.
El dueño puede ajustar las capacidades en Configuración.

## Aplicación

1. Aplicá `supabase_fase_rubros_especializados.sql` en SQL Editor, después de las
   migraciones de rubro y capacidades. Es reaplicable y no cambia comercios al ejecutarlo.
2. Elegí el rubro del comercio en Super Admin. Cambiar realmente el rubro aplica
   sus capacidades iniciales; guardar el mismo conserva las preferencias del dueño.
3. Volvé a ingresar al comercio para actualizar su configuración y abrí Catálogo →
   siembra inicial. Seleccioná las categorías que ofrece el local.
4. Configurá costo, precio y stock reales; activá cada producto cuando esté listo.

Veterinaria contiene 169 artículos en 16 categorías y electrónica 180 en 15.
Son plantillas comerciales genéricas: se importan **inactivas, con costo, precio y
stock en cero**. Los códigos VET-/TEC- son identificadores internos, no códigos EAN
de fabricantes. Podés reemplazarlos por los del proveedor y completar variantes.
Los productos existentes se conservan al volver a importar una plantilla.
Ocho alimentos a granel se venden por kilo. Los 48 alimentos y snacks se crean
con seguimiento de vencimientos y alerta inicial de 30 días, ajustable por producto.
Las fechas y cantidades de cada lote se cargan desde las existencias reales.

## Alcance

Veterinaria utiliza las funciones comerciales existentes de productos pesables,
lotes y vencimientos. No incluye mascotas, turnos ni historias clínicas.
Esta etapa todavía no incorpora seguimiento individual por serie/IMEI, garantías
ni órdenes de reparación para electrónica: esas funciones requieren una siguiente
implementación. La integración automática de Mercado Pago Point sigue pausada;
el cajero confirma el cobro en su terminal y después registra la venta en el POS.
