import type { ProductoMaestro } from './catalogoMaestroArgentino'

/** Plantilla comercial editable. El precio y el stock de granel se expresan por kg. */
const grupos: ReadonlyArray<{ codigo: string; categoria: string; granel?: boolean; articulos: readonly string[] }> = [
  { codigo: 'FRU', categoria: 'Frutos secos a granel', granel: true, articulos: [
    'Almendras naturales a granel', 'Nueces mariposa a granel', 'Avellanas a granel',
    'Castañas de cajú a granel', 'Pistachos a granel', 'Maní pelado natural a granel',
    'Maní tostado sin sal a granel', 'Mix de frutos secos a granel',
  ] },
  { codigo: 'SEM', categoria: 'Semillas a granel', granel: true, articulos: [
    'Semillas de chía a granel', 'Semillas de lino a granel', 'Sésamo blanco a granel',
    'Sésamo negro a granel', 'Semillas de girasol peladas a granel', 'Semillas de zapallo a granel',
    'Mix de semillas a granel', 'Quinoa a granel',
  ] },
  { codigo: 'CER', categoria: 'Cereales y granolas a granel', granel: true, articulos: [
    'Avena arrollada tradicional a granel', 'Avena instantánea a granel', 'Granola con frutas a granel',
    'Granola sin azúcar agregada a granel', 'Copos de maíz a granel', 'Arroz integral a granel',
    'Arroz yamaní a granel', 'Muesli a granel',
  ] },
  { codigo: 'HAR', categoria: 'Harinas a granel', granel: true, articulos: [
    'Harina integral de trigo a granel', 'Harina de avena a granel', 'Harina de arroz a granel',
    'Harina de garbanzo a granel', 'Harina de almendras a granel', 'Harina de coco a granel',
    'Fécula de mandioca a granel', 'Polenta a granel',
  ] },
  { codigo: 'LEG', categoria: 'Legumbres a granel', granel: true, articulos: [
    'Lentejas a granel', 'Garbanzos a granel', 'Porotos negros a granel', 'Porotos blancos a granel',
    'Porotos colorados a granel', 'Arvejas partidas a granel', 'Soja texturizada a granel',
    'Mix de legumbres a granel',
  ] },
  { codigo: 'DES', categoria: 'Frutas deshidratadas a granel', granel: true, articulos: [
    'Pasas de uva rubias a granel', 'Pasas de uva negras a granel', 'Ciruelas deshidratadas a granel',
    'Dátiles a granel', 'Higos secos a granel', 'Damascos deshidratados a granel',
    'Banana deshidratada a granel', 'Coco rallado a granel',
  ] },
  { codigo: 'ESP', categoria: 'Especias y condimentos a granel', granel: true, articulos: [
    'Orégano a granel', 'Pimentón a granel', 'Comino a granel', 'Cúrcuma a granel',
    'Canela molida a granel', 'Pimienta negra a granel', 'Jengibre molido a granel', 'Ajo en polvo a granel',
  ] },
  { codigo: 'INF', categoria: 'Infusiones envasadas', articulos: [
    'Té verde caja 20 saquitos', 'Té negro caja 20 saquitos', 'Manzanilla caja 20 saquitos',
    'Menta caja 20 saquitos', 'Rooibos caja 20 saquitos', 'Té de jengibre caja 20 saquitos',
    'Yerba mate paquete 500 g', 'Cacao amargo paquete 200 g',
  ] },
  { codigo: 'ENV', categoria: 'Alimentos envasados', articulos: [
    'Galletas de arroz paquete 100 g', 'Tostadas integrales paquete 200 g', 'Pasta integral paquete 500 g',
    'Pasta de arroz paquete 500 g', 'Barrita de cereal unidad', 'Barrita de semillas unidad',
    'Chocolate amargo tableta 100 g', 'Mix de frutos secos paquete 200 g',
  ] },
  { codigo: 'UNT', categoria: 'Untables y endulzantes', articulos: [
    'Pasta de maní frasco 350 g', 'Tahini frasco 200 g', 'Miel frasco 500 g',
    'Mermelada frasco 400 g', 'Azúcar mascabo paquete 500 g', 'Stevia líquida botella 100 ml',
    'Aceite de coco frasco 200 ml', 'Aceite de oliva botella 500 ml',
  ] },
  { codigo: 'BEB', categoria: 'Bebidas vegetales', articulos: [
    'Bebida de almendras caja 1 l', 'Bebida de avena caja 1 l', 'Bebida de soja caja 1 l',
    'Bebida de arroz caja 1 l', 'Bebida de coco caja 1 l', 'Bebida de castañas caja 1 l',
  ] },
]

export const CATALOGO_MAESTRO_DIETETICA: ProductoMaestro[] = grupos.flatMap(({ codigo, categoria, granel, articulos }) =>
  articulos.map((descripcion, indice) => ({
    codigo_barras: `DIE-${codigo}-${String(indice + 1).padStart(3, '0')}`,
    descripcion, categoria_nombre: categoria, unidad_medida: granel ? 'KG' as const : 'UN' as const,
    es_pesable: granel === true, requiere_vencimiento: true, dias_alerta_vencimiento: 30,
    precio_costo_ref: 0, precio_venta_sugerido: 0, stock_inicial_sugerido: 0,
  })),
)
