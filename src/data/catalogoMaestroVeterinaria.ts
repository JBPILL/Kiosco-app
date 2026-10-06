import type { ProductoMaestro } from './catalogoMaestroArgentino'

/** Semilla editable: códigos internos, sin EAN de fabricante ni precios de referencia.
 * Los servicios son conceptos comerciales; no incluyen indicaciones clínicas.
 */
const grupos: ReadonlyArray<{ codigo: string; categoria: string; articulos: readonly string[] }> = [
  { codigo: 'GRA', categoria: 'Alimentos a granel', articulos: [
    'Alimento seco a granel para perro cachorro', 'Alimento seco a granel para perro adulto',
    'Alimento seco a granel para perro senior', 'Alimento seco a granel para gato cachorro',
    'Alimento seco a granel para gato adulto', 'Alimento seco a granel para gato esterilizado',
    'Mezcla de semillas a granel para aves', 'Alimento a granel para conejo',
  ] },
  { codigo: 'PER', categoria: 'Alimentos para perros', articulos: [
    'Alimento seco perro cachorro bolsa 1 kg', 'Alimento seco perro cachorro bolsa 3 kg',
    'Alimento seco perro adulto bolsa 1 kg', 'Alimento seco perro adulto bolsa 3 kg',
    'Alimento seco perro adulto bolsa 15 kg', 'Alimento seco perro senior bolsa 3 kg',
    'Alimento seco perro raza pequeña bolsa 3 kg', 'Alimento seco perro raza grande bolsa 15 kg',
    'Alimento húmedo perro sobre 100 g', 'Alimento húmedo perro lata 400 g',
  ] },
  { codigo: 'GAT', categoria: 'Alimentos para gatos', articulos: [
    'Alimento seco gato cachorro bolsa 1 kg', 'Alimento seco gato cachorro bolsa 3 kg',
    'Alimento seco gato adulto bolsa 1 kg', 'Alimento seco gato adulto bolsa 3 kg',
    'Alimento seco gato adulto bolsa 7,5 kg', 'Alimento seco gato senior bolsa 1 kg',
    'Alimento seco gato esterilizado bolsa 1 kg', 'Alimento seco gato esterilizado bolsa 3 kg',
    'Alimento húmedo gato sobre 85 g', 'Alimento húmedo gato lata 156 g',
  ] },
  { codigo: 'EXO', categoria: 'Alimentos para otras mascotas', articulos: [
    'Alimento para conejo bolsa 1 kg', 'Alimento para cobayo bolsa 1 kg',
    'Alimento para hámster bolsa 500 g', 'Heno para pequeños herbívoros bolsa 500 g',
    'Mezcla de semillas para canario bolsa 500 g', 'Mezcla de semillas para periquito bolsa 500 g',
    'Alimento para loro bolsa 1 kg', 'Alimento para peces en escamas pote 50 g',
    'Alimento para peces en gránulos pote 100 g', 'Alimento para tortugas acuáticas pote 100 g',
  ] },
  { codigo: 'PRE', categoria: 'Premios y snacks', articulos: [
    'Galletitas para perro paquete 200 g', 'Bocaditos para perro paquete 100 g',
    'Tiras deshidratadas para perro paquete 100 g', 'Snack dental para perro tamaño pequeño',
    'Snack dental para perro tamaño mediano', 'Snack dental para perro tamaño grande',
    'Premios para gato paquete 60 g', 'Snack cremoso para gato sobre 15 g',
    'Hierba para gatos kit de cultivo', 'Barrita de semillas para aves',
  ] },
  { codigo: 'HIG', categoria: 'Higiene y limpieza de mascotas', articulos: [
    'Shampoo para perros botella 250 ml', 'Shampoo para gatos botella 250 ml',
    'Acondicionador para mascotas botella 250 ml', 'Shampoo seco para mascotas envase 150 ml',
    'Toallitas de higiene para mascotas paquete 40 unidades', 'Bolsas recolectoras rollo 20 unidades',
    'Dispensador de bolsas recolectoras', 'Paños absorbentes paquete 10 unidades',
    'Limpiador de superficies para accesorios de mascotas botella 1 l', 'Cepillo dental para mascotas',
  ] },
  { codigo: 'SAN', categoria: 'Sanitarios y sustratos', articulos: [
    'Piedras sanitarias minerales bolsa 4 kg', 'Piedras sanitarias aglomerantes bolsa 4 kg',
    'Sustrato sanitario de madera bolsa 3 kg', 'Cristales sanitarios bolsa 1,8 kg',
    'Bandeja sanitaria abierta pequeña', 'Bandeja sanitaria abierta grande',
    'Bandeja sanitaria cubierta', 'Pala para piedras sanitarias',
    'Alfombra para salida de bandeja sanitaria', 'Sustrato de papel para pequeños animales bolsa 1 kg',
  ] },
  { codigo: 'PAS', categoria: 'Collares y paseo', articulos: [
    'Collar de nylon talla XS', 'Collar de nylon talla S', 'Collar de nylon talla M', 'Collar de nylon talla L',
    'Collar de gato con cierre de seguridad', 'Correa de nylon 1,5 m', 'Correa de nylon 3 m',
    'Correa retráctil 5 m', 'Arnés talla S', 'Arnés talla M', 'Arnés talla L', 'Chapita identificatoria grabable',
  ] },
  { codigo: 'TRA', categoria: 'Transporte y seguridad de mascotas', articulos: [
    'Transportadora rígida pequeña', 'Transportadora rígida mediana', 'Transportadora rígida grande',
    'Bolso transportador para gato', 'Mochila transportadora para mascota pequeña',
    'Cinturón de seguridad para mascota', 'Protector de asiento para automóvil',
    'Barrera de seguridad para automóvil', 'Bozal tipo canasta tamaño pequeño', 'Bozal tipo canasta tamaño grande',
  ] },
  { codigo: 'DES', categoria: 'Descanso y abrigo', articulos: [
    'Cama acolchada para mascota pequeña', 'Cama acolchada para mascota mediana', 'Cama acolchada para mascota grande',
    'Colchoneta para mascota pequeña', 'Colchoneta para mascota grande', 'Manta para mascota',
    'Cueva de descanso para gato', 'Abrigo para perro talla S', 'Abrigo para perro talla M', 'Abrigo para perro talla L',
  ] },
  { codigo: 'COM', categoria: 'Comederos y bebederos', articulos: [
    'Comedero de acero inoxidable 250 ml', 'Comedero de acero inoxidable 500 ml', 'Comedero de acero inoxidable 1 l',
    'Comedero de cerámica para gato', 'Comedero de alimentación lenta pequeño', 'Comedero de alimentación lenta grande',
    'Bebedero portátil para paseo', 'Fuente de agua para mascotas', 'Filtro de repuesto para fuente de agua',
    'Comedero doble con soporte', 'Bebedero de botella para roedores', 'Tolva de alimento para mascotas',
  ] },
  { codigo: 'JUG', categoria: 'Juguetes y enriquecimiento', articulos: [
    'Pelota de goma para perro', 'Pelota con cuerda para perro', 'Cuerda de juego con nudos',
    'Mordillo de goma tamaño pequeño', 'Mordillo de goma tamaño grande', 'Juguete dispensador de premios',
    'Alfombra olfativa para mascotas', 'Caña de juego para gato', 'Ratón de juguete para gato',
    'Túnel de juego para gato', 'Rascador de cartón', 'Rascador vertical con base',
  ] },
  { codigo: 'PELU', categoria: 'Peluquería y cuidado de accesorios', articulos: [
    'Cepillo de cerdas para mascotas', 'Cardina para mascotas pequeña', 'Cardina para mascotas grande',
    'Peine metálico para mascotas', 'Peine quitapelo', 'Cortauñas para gato', 'Cortauñas para perro',
    'Lima de uñas para mascotas', 'Tijera de peluquería recta', 'Tijera de peluquería curva',
  ] },
  { codigo: 'INS', categoria: 'Insumos de consultorio veterinario', articulos: [
    'Guantes de examen nitrilo talla S caja 100 unidades', 'Guantes de examen nitrilo talla M caja 100 unidades',
    'Guantes de examen nitrilo talla L caja 100 unidades', 'Gasas estériles paquete 10 unidades',
    'Algodón hidrófilo paquete 100 g', 'Venda de gasa rollo 5 cm', 'Venda de gasa rollo 10 cm',
    'Venda cohesiva rollo 5 cm', 'Cinta adhesiva de uso sanitario rollo', 'Campo descartable de consultorio',
    'Recipiente para muestra con tapa', 'Contenedor de residuos punzocortantes',
  ] },
  { codigo: 'EQU', categoria: 'Equipamiento veterinario', articulos: [
    'Collar isabelino talla XS', 'Collar isabelino talla S', 'Collar isabelino talla M', 'Collar isabelino talla L',
    'Termómetro digital de consultorio', 'Estetoscopio de consultorio', 'Balanza para mascotas pequeñas',
    'Balanza de plataforma para mascotas', 'Linterna de examen', 'Manta de contención para gato',
  ] },
  { codigo: 'SER', categoria: 'Servicios veterinarios y de mascotas', articulos: [
    'Consulta veterinaria general', 'Consulta veterinaria de seguimiento', 'Consulta veterinaria a domicilio',
    'Consulta veterinaria fuera de horario', 'Toma de muestra para laboratorio', 'Estudio de laboratorio veterinario',
    'Ecografía veterinaria', 'Radiografía veterinaria', 'Baño de mascota pequeña', 'Baño de mascota grande',
    'Peluquería canina', 'Corte de uñas de mascota', 'Grabado de chapita identificatoria',
  ] },
]

export const CATALOGO_MAESTRO_VETERINARIA: ProductoMaestro[] = grupos.flatMap(({ codigo, categoria, articulos }) =>
  articulos.map((descripcion, indice) => ({
    codigo_barras: `VET-${codigo}-${String(indice + 1).padStart(3, '0')}`,
    descripcion, categoria_nombre: categoria, unidad_medida: codigo === 'GRA' ? 'KG' as const : 'UN' as const,
    ...(codigo === 'GRA' ? { es_pesable: true } : {}),
    ...(['GRA', 'PER', 'GAT', 'EXO', 'PRE'].includes(codigo)
      ? { requiere_vencimiento: true, dias_alerta_vencimiento: 30 } : {}),
    precio_costo_ref: 0, precio_venta_sugerido: 0, stock_inicial_sugerido: 0,
  })),
)
