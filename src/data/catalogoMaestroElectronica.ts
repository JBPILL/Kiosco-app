import type { ProductoMaestro } from './catalogoMaestroArgentino'

/** Semilla configurable. Códigos TEC internos; verificar modelo y compatibilidad antes de vender.
 * Precios, costos y existencias deben cargarse desde el inventario real del comercio.
 */
const grupos: ReadonlyArray<{ codigo: string; categoria: string; articulos: readonly string[] }> = [
  { codigo: 'CEL', categoria: 'Celulares y tablets', articulos: [
    'Celular Android 64 GB', 'Celular Android 128 GB', 'Celular Android 256 GB',
    'Celular Android 512 GB', 'Celular iOS 128 GB', 'Celular iOS 256 GB',
    'Celular básico con teclado', 'Celular reacondicionado Android 128 GB',
    'Celular reacondicionado iOS 128 GB', 'Tablet Android 64 GB', 'Tablet Android 128 GB', 'Tablet iOS 64 GB',
  ] },
  { codigo: 'CAR', categoria: 'Cargadores y energía', articulos: [
    'Cargador de pared USB-A 5 W', 'Cargador de pared USB-A 12 W', 'Cargador USB-C PD 20 W',
    'Cargador USB-C PD 30 W', 'Cargador USB-C PD 65 W', 'Cargador de automóvil USB-A doble',
    'Cargador de automóvil USB-C PD', 'Base de carga inalámbrica Qi', 'Cargador de notebook universal',
    'Fuente de alimentación 12 V para accesorios', 'Cargador de pilas AA y AAA', 'Estación de carga USB multipuerto',
  ] },
  { codigo: 'CAB', categoria: 'Cables y adaptadores', articulos: [
    'Cable USB-A a USB-C 1 m', 'Cable USB-A a USB-C 2 m', 'Cable USB-C a USB-C 60 W 1 m',
    'Cable USB-C a USB-C 100 W 2 m', 'Cable USB-A a micro USB 1 m', 'Cable USB-A a Lightning 1 m',
    'Cable USB-C a Lightning 1 m', 'Adaptador USB-C a USB-A', 'Adaptador USB-C a audio 3,5 mm',
    'Adaptador Lightning a audio 3,5 mm', 'Cable HDMI 2 m', 'Cable de audio 3,5 mm 1 m',
  ] },
  { codigo: 'PRO', categoria: 'Protección para celulares', articulos: [
    'Funda universal celular hasta 6 pulgadas', 'Funda universal celular hasta 7 pulgadas',
    'Funda sumergible universal para celular', 'Funda tipo billetera universal',
    'Protector de pantalla vidrio templado plano', 'Protector de pantalla vidrio templado curvo',
    'Lámina de hidrogel para pantalla', 'Lámina de privacidad para pantalla', 'Protector de lente de cámara',
    'Funda universal tablet 8 pulgadas', 'Funda universal tablet 10 pulgadas', 'Correa de seguridad para celular',
  ] },
  { codigo: 'SOP', categoria: 'Soportes y accesorios móviles', articulos: [
    'Soporte de escritorio para celular', 'Soporte de escritorio para tablet', 'Soporte de automóvil para rejilla',
    'Soporte de automóvil para parabrisas', 'Soporte para celular de bicicleta', 'Trípode para celular',
    'Aro de luz con soporte de celular', 'Control remoto Bluetooth para cámara', 'Lápiz táctil capacitivo',
    'Anillo adhesivo de sujeción', 'Bolso organizador de accesorios electrónicos', 'Kit de limpieza de pantalla',
  ] },
  { codigo: 'AUD', categoria: 'Audio y auriculares', articulos: [
    'Auriculares con cable conector 3,5 mm', 'Auriculares con cable USB-C', 'Auriculares Bluetooth TWS',
    'Auriculares Bluetooth vincha', 'Auriculares gamer con micrófono', 'Micrófono de solapa 3,5 mm',
    'Micrófono de solapa USB-C', 'Micrófono USB de escritorio', 'Parlante Bluetooth portátil',
    'Parlantes de escritorio USB', 'Barra de sonido', 'Receptor de audio Bluetooth',
  ] },
  { codigo: 'BAT', categoria: 'Baterías y pilas', articulos: [
    'Batería externa 5000 mAh', 'Batería externa 10000 mAh', 'Batería externa 20000 mAh',
    'Pilas alcalinas AA paquete 2 unidades', 'Pilas alcalinas AAA paquete 2 unidades', 'Pila alcalina 9 V',
    'Pila botón CR2032', 'Pila botón CR2025', 'Pilas recargables AA paquete 2 unidades',
    'Pilas recargables AAA paquete 2 unidades', 'Batería de repuesto para celular Android según modelo',
    'Batería de repuesto para celular iOS según modelo',
  ] },
  { codigo: 'ALM', categoria: 'Almacenamiento y memorias', articulos: [
    'Pendrive USB 32 GB', 'Pendrive USB 64 GB', 'Pendrive USB 128 GB', 'Pendrive dual USB-A y USB-C 64 GB',
    'Tarjeta microSD 32 GB', 'Tarjeta microSD 64 GB', 'Tarjeta microSD 128 GB', 'Lector de tarjetas USB',
    'SSD SATA 240 GB', 'SSD SATA 480 GB', 'SSD NVMe 1 TB', 'Disco externo USB 1 TB',
  ] },
  { codigo: 'PER', categoria: 'Periféricos de computación', articulos: [
    'Mouse USB con cable', 'Mouse inalámbrico USB', 'Mouse Bluetooth', 'Teclado USB español',
    'Teclado inalámbrico español', 'Teclado mecánico español', 'Combo teclado y mouse inalámbricos',
    'Alfombrilla para mouse', 'Alfombrilla para mouse extendida', 'Cámara web USB',
    'Hub USB-A 4 puertos', 'Hub USB-C con HDMI',
  ] },
  { codigo: 'RED', categoria: 'Redes y conectividad', articulos: [
    'Router Wi-Fi doble banda', 'Repetidor Wi-Fi', 'Adaptador Wi-Fi USB', 'Adaptador Bluetooth USB',
    'Switch de red 5 puertos', 'Switch de red 8 puertos', 'Cable de red Cat 5e 2 m', 'Cable de red Cat 6 5 m',
    'Conector RJ45 unidad', 'Adaptador USB-C a Ethernet', 'Adaptador USB-A a Ethernet', 'Kit de red mesh 2 nodos',
  ] },
  { codigo: 'REP', categoria: 'Repuestos para celulares', articulos: [
    'Módulo de pantalla Android según modelo', 'Módulo de pantalla iOS según modelo',
    'Conector de carga USB-C según modelo', 'Conector de carga micro USB según modelo',
    'Conector de carga Lightning según modelo', 'Flex de botón de encendido según modelo',
    'Flex de botones de volumen según modelo', 'Cámara frontal según modelo', 'Cámara trasera según modelo',
    'Altavoz de repuesto según modelo', 'Auricular interno de repuesto según modelo', 'Tapa trasera según modelo',
  ] },
  { codigo: 'HER', categoria: 'Herramientas e insumos de reparación', articulos: [
    'Juego de destornilladores de precisión', 'Pinza de precisión', 'Espátula de apertura plástica',
    'Ventosa para apertura de pantalla', 'Manta de trabajo antiestática', 'Pulsera antiestática',
    'Multímetro digital', 'Estación de soldadura', 'Estaño para soldadura rollo', 'Malla desoldante rollo',
    'Alcohol isopropílico envase 250 ml', 'Adhesivo para reparación de dispositivos',
  ] },
  { codigo: 'HOG', categoria: 'Electrónica para el hogar', articulos: [
    'Control remoto universal para TV', 'Control remoto para TV según modelo', 'Dispositivo de streaming HDMI',
    'Cable de alimentación para equipos', 'Prolongador eléctrico 3 tomas', 'Protector de tensión para equipos',
    'UPS para computadora', 'Lámpara LED inteligente', 'Enchufe inteligente Wi-Fi',
    'Cámara de seguridad Wi-Fi interior', 'Cámara de seguridad exterior', 'Sensor de apertura inteligente',
  ] },
  { codigo: 'GAM', categoria: 'Gaming y accesorios', articulos: [
    'Control de juegos USB', 'Control de juegos Bluetooth', 'Soporte para control de juegos',
    'Base de carga para controles', 'Volante para juegos', 'Adaptador de audio para consola',
    'Funda para consola portátil', 'Protector de pantalla para consola portátil',
    'Grip para consola portátil', 'Estuche organizador de juegos', 'Cable HDMI 4K 2 m', 'Soporte para auriculares',
  ] },
  { codigo: 'SER', categoria: 'Servicios técnicos de electrónica', articulos: [
    'Diagnóstico técnico de celular', 'Diagnóstico técnico de tablet', 'Diagnóstico técnico de notebook',
    'Reemplazo de pantalla de celular mano de obra', 'Reemplazo de batería de celular mano de obra',
    'Reemplazo de conector de carga mano de obra', 'Instalación de protector de pantalla',
    'Limpieza técnica de dispositivo', 'Transferencia de datos con autorización del titular',
    'Configuración inicial de dispositivo', 'Configuración de red Wi-Fi', 'Instalación de almacenamiento en computadora mano de obra',
  ] },
]

export const CATALOGO_MAESTRO_ELECTRONICA: ProductoMaestro[] = grupos.flatMap(({ codigo, categoria, articulos }) =>
  articulos.map((descripcion, indice) => ({
    codigo_barras: `TEC-${codigo}-${String(indice + 1).padStart(3, '0')}`,
    descripcion, categoria_nombre: categoria, unidad_medida: 'UN' as const,
    precio_costo_ref: 0, precio_venta_sugerido: 0, stock_inicial_sugerido: 0,
  })),
)
