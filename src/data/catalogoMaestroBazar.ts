import type { ProductoMaestro } from './catalogoMaestroArgentino'

/** Plantilla por unidad: sin alimentos, lotes, retornables ni precios inventados. */
const grupos: ReadonlyArray<{ codigo: string; categoria: string; articulos: readonly string[] }> = [
  { codigo: 'VAJ', categoria: 'Cocina y Vajilla', articulos: [
    'Plato playo de cerámica', 'Plato hondo de cerámica', 'Plato de postre de cerámica',
    'Taza de cerámica', 'Mug de cerámica', 'Vaso de vidrio', 'Copa de vidrio', 'Jarra de vidrio',
    'Ensaladera', 'Fuente para servir', 'Bowl de cerámica', 'Juego de cubiertos 24 piezas',
  ] },
  { codigo: 'COC', categoria: 'Utensilios de cocina', articulos: [
    'Espátula de silicona', 'Cucharón', 'Batidor manual', 'Pelapapas', 'Rallador', 'Colador',
    'Tabla para cortar', 'Cuchillo de cocina', 'Abrelatas', 'Sacacorchos', 'Pinza de cocina',
    'Juego de cucharas medidoras',
  ] },
  { codigo: 'HOR', categoria: 'Cocción y repostería', articulos: [
    'Olla con tapa', 'Sartén', 'Cacerola', 'Asadera', 'Budinera', 'Molde para torta',
    'Molde para muffins', 'Manga de repostería', 'Juego de picos de repostería',
    'Palo de amasar', 'Rejilla para enfriar', 'Espátula de repostería',
  ] },
  { codigo: 'ORG', categoria: 'Organización y Limpieza', articulos: [
    'Caja organizadora pequeña', 'Caja organizadora mediana', 'Caja organizadora grande',
    'Canasto organizador', 'Organizador de cajón', 'Cesto de residuos', 'Balde plástico',
    'Escoba', 'Pala para residuos', 'Secador de piso', 'Cepillo de limpieza', 'Trapo de piso',
  ] },
  { codigo: 'CON', categoria: 'Conservación y recipientes', articulos: [
    'Recipiente hermético 500 ml', 'Recipiente hermético 1 l', 'Recipiente hermético 2 l',
    'Frasco de vidrio 500 ml', 'Frasco de vidrio 1 l', 'Botella reutilizable 750 ml',
    'Termo 1 l', 'Mate', 'Bombilla', 'Lunchera', 'Bolsa térmica', 'Cubetera',
  ] },
  { codigo: 'DEC', categoria: 'Decoración y Regalería', articulos: [
    'Portarretrato pequeño', 'Portarretrato mediano', 'Florero de vidrio', 'Florero de cerámica',
    'Reloj de pared', 'Espejo decorativo', 'Almohadón decorativo', 'Adorno de mesa',
    'Vela decorativa', 'Portavelas', 'Caja de regalo', 'Bolsa de regalo',
  ] },
  { codigo: 'BAN', categoria: 'Baño', articulos: [
    'Jabonera', 'Dispensador de jabón', 'Portacepillos', 'Cortina de baño', 'Alfombra de baño',
    'Toalla de mano', 'Toallón', 'Cepillo de baño', 'Cesto para ropa', 'Organizador de baño',
    'Ganchos para toallas', 'Portarrollos',
  ] },
  { codigo: 'TEX', categoria: 'Textiles del hogar', articulos: [
    'Mantel rectangular', 'Mantel redondo', 'Individual de mesa', 'Repasador', 'Delantal de cocina',
    'Manopla para horno', 'Agarradera', 'Camino de mesa', 'Funda de almohadón',
    'Manta liviana', 'Servilleta de tela', 'Paño de microfibra',
  ] },
  { codigo: 'JUG', categoria: 'Juguetería', articulos: [
    'Pelota de juguete', 'Rompecabezas', 'Juego de bloques', 'Auto de juguete', 'Muñeca',
    'Juego de mesa', 'Masa para modelar', 'Set de playa', 'Burbujero', 'Yo-yo',
    'Juego de cartas', 'Peluche',
  ] },
  { codigo: 'JAR', categoria: 'Jardín y exteriores', articulos: [
    'Maceta pequeña', 'Maceta mediana', 'Maceta grande', 'Plato para maceta', 'Regadera',
    'Pulverizador manual', 'Pala de jardín', 'Rastrillo de jardín', 'Guantes de jardín',
    'Tutor para planta', 'Silla plegable', 'Mantel plástico para exterior',
  ] },
]

export const CATALOGO_MAESTRO_BAZAR: ProductoMaestro[] = grupos.flatMap(({ codigo, categoria, articulos }) =>
  articulos.map((descripcion, indice) => ({
    codigo_barras: `BAZ-${codigo}-${String(indice + 1).padStart(3, '0')}`,
    descripcion, categoria_nombre: categoria, unidad_medida: 'UN' as const,
    es_pesable: false, requiere_vencimiento: false, dias_alerta_vencimiento: 30,
    precio_costo_ref: 0, precio_venta_sugerido: 0, stock_inicial_sugerido: 0,
  })),
)
