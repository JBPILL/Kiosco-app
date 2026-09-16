-- ==============================================================================
-- SEED COMPLETO: MAXIKIOSCO & HELADERÍA MARCHELO - KIOSKOPOS
-- ==============================================================================
-- Ejecutá este script en el SQL Editor de tu panel de Supabase.
-- Genera un comercio completo con catálogo integral:
-- 1. Heladería Marchelo (potes de 1kg, 1/2kg, 1/4kg, bombones, palitos, cucuruchos)
-- 2. Panizados La Reina (milanesas de pollo y carne, medallones, patitas, etc.)
-- 3. Gaseosas, Cervezas y Bebidas (Coca-Cola, Sprite, Quilmes, Fernet, etc.)
-- 4. Almacén y Comestibles (fideos, arroz, aceite, yerba, galletitas, etc.)
-- 5. Fiambrería y Pesables (jamón cocido, queso cremoso, barra tybo, salame)
-- 6. Golosinas, Chocolates y Snacks (alfajores, papas Lays, etc.)
-- 7. Cigarrillos y Varios
-- 8. Combos listos para el Punto de Venta (Combo Fernetazo, Cena La Reina, Picada, Merienda)
-- 9. Promociones automáticas (2x1, 2da al 50%, 3 latas con descuento)
-- 10. Usuario de Acceso Demo listo:
--     Email: maxikiosco.demo@gmail.com
--     Clave: KioskoDemo2026!
-- ==============================================================================

-- Limpiar demo previa si ya existiera para evitar duplicados
DO $$
DECLARE
  v_old_kiosco_id UUID;
BEGIN
  SELECT id INTO v_old_kiosco_id FROM public.kioscos WHERE nombre = 'Maxikiosco & Heladería Marchelo' LIMIT 1;
  IF v_old_kiosco_id IS NOT NULL THEN
    PERFORM public.admin_eliminar_kiosco(v_old_kiosco_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
DECLARE
  v_kiosco_id UUID := gen_random_uuid();
  v_auth_user_id UUID;
  v_usuario_id UUID := gen_random_uuid();
  v_plan_id UUID;

  -- Categorías
  cat_helados UUID := gen_random_uuid();
  cat_panizados UUID := gen_random_uuid();
  cat_bebidas UUID := gen_random_uuid();
  cat_almacen UUID := gen_random_uuid();
  cat_fiambreria UUID := gen_random_uuid();
  cat_golosinas UUID := gen_random_uuid();
  cat_cigarrillos UUID := gen_random_uuid();
  cat_combos UUID := gen_random_uuid();

  -- IDs de productos clave para los combos y promociones
  p_fernet UUID := gen_random_uuid();
  p_coca225 UUID := gen_random_uuid();
  p_hielo UUID := gen_random_uuid();
  p_coca500 UUID := gen_random_uuid();
  p_coca_lata UUID := gen_random_uuid();
  p_sprite225 UUID := gen_random_uuid();
  p_brahma_lata UUID := gen_random_uuid();
  p_quilmes1l UUID := gen_random_uuid();

  p_marching1k UUID := gen_random_uuid();
  p_marching500 UUID := gen_random_uuid();
  p_marching250 UUID := gen_random_uuid();
  p_cucurucho UUID := gen_random_uuid();
  p_bombon_suizo UUID := gen_random_uuid();
  p_palito_crema UUID := gen_random_uuid();

  p_mila_pollo UUID := gen_random_uuid();
  p_mila_carne UUID := gen_random_uuid();
  p_medallones UUID := gen_random_uuid();
  p_patitas UUID := gen_random_uuid();
  p_bastoncitos UUID := gen_random_uuid();

  p_pan_bimbo UUID := gen_random_uuid();
  p_mayonesa UUID := gen_random_uuid();
  p_jamon_cocido UUID := gen_random_uuid();
  p_queso_tybo UUID := gen_random_uuid();
  p_queso_cremoso UUID := gen_random_uuid();
  p_salame UUID := gen_random_uuid();

  p_alf_jorgito_choc UUID := gen_random_uuid();
  p_alf_jorgito_bla UUID := gen_random_uuid();
  p_alf_guaymallen UUID := gen_random_uuid();
  p_lays140 UUID := gen_random_uuid();
  p_mani UUID := gen_random_uuid();
  p_doritos UUID := gen_random_uuid();

  -- IDs de los productos combo
  p_combo_fernet UUID := gen_random_uuid();
  p_combo_cena_lareina UUID := gen_random_uuid();
  p_combo_sandwiches UUID := gen_random_uuid();
  p_combo_picada UUID := gen_random_uuid();
  p_combo_merienda UUID := gen_random_uuid();
  p_combo_helado_fam UUID := gen_random_uuid();

BEGIN

  -- 1. IDENTIFICAR O ASOCIAR AUTH USER ID
  SELECT id INTO v_auth_user_id 
  FROM auth.users 
  WHERE email = 'maxikiosco.demo@gmail.com' 
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := 'a0ad1038-8df3-44a2-93d7-c2915b5d8312'::UUID;
  END IF;

  -- Auto-confirmar el email del usuario demo para acceso directo sin esperas
  UPDATE auth.users 
  SET email_confirmed_at = now() 
  WHERE email = 'maxikiosco.demo@gmail.com';

  -- 2. BUSCAR O ASIGNAR PLAN ACTIVO
  SELECT id INTO v_plan_id 
  FROM public.planes 
  WHERE nombre != '__CONFIG_SISTEMA__' AND activo = true
  ORDER BY precio_mensual DESC 
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.planes (id, nombre, precio_mensual, max_usuarios, descripcion, activo)
    VALUES (gen_random_uuid(), 'Plan Kiosco Pro', 50000, 5, 'Plan completo con punto de venta, combos y reportes', true)
    RETURNING id INTO v_plan_id;
  END IF;

  -- 3. CREAR KIOSCO
  INSERT INTO public.kioscos (
    id, nombre, direccion, telefono, estado_suscripcion, fecha_creacion
  ) VALUES (
    v_kiosco_id,
    'Maxikiosco & Heladería Marchelo',
    'Av. San Martín 1420, Resistencia, Chaco',
    '3644751119',
    'ACTIVO',
    now()
  );

  -- 4. VINCULAR USUARIO DUEÑO
  DELETE FROM public.usuarios WHERE auth_user_id = v_auth_user_id;
  INSERT INTO public.usuarios (
    id, auth_user_id, kiosco_id, nombre, email, rol, activo, es_superadmin
  ) VALUES (
    v_usuario_id,
    v_auth_user_id,
    v_kiosco_id,
    'Carlos Gómez (Dueño)',
    'maxikiosco.demo@gmail.com',
    'DUEÑO',
    true,
    false
  );

  -- 5. SUSCRIPCIÓN ACTIVA POR 365 DÍAS (NUNCA EXPIRA EN DEMOS)
  INSERT INTO public.suscripciones (
    id, kiosco_id, plan_id, fecha_inicio, fecha_vencimiento, estado
  ) VALUES (
    gen_random_uuid(),
    v_kiosco_id,
    v_plan_id,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '365 days',
    'ACTIVA'
  );

  -- 6. CREAR CATEGORÍAS DEL MAXIKIOSCO
  INSERT INTO public.categorias (id, kiosco_id, nombre, color, orden) VALUES
    (cat_combos, v_kiosco_id, 'Combos y Promociones', '#8b5cf6', 1),
    (cat_helados, v_kiosco_id, 'Helados Marchelo', '#06b6d4', 2),
    (cat_panizados, v_kiosco_id, 'Panizados La Reina', '#f97316', 3),
    (cat_bebidas, v_kiosco_id, 'Gaseosas y Bebidas', '#3b82f6', 4),
    (cat_almacen, v_kiosco_id, 'Almacén y Comestibles', '#10b981', 5),
    (cat_fiambreria, v_kiosco_id, 'Fiambrería y Quesos', '#eab308', 6),
    (cat_golosinas, v_kiosco_id, 'Golosinas y Snacks', '#ec4899', 7),
    (cat_cigarrillos, v_kiosco_id, 'Cigarrillos y Varios', '#64748b', 8);

  -- 7. INSERTAR CATÁLOGO DE PRODUCTOS

  -- --- 7.1 HELADERÍA MARCHELO ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_marching1k, v_kiosco_id, cat_helados, '7798001000010', 'Helado Marchelo Pote 1 Kg (Hasta 4 sabores)', 5800, 9500, 24, 5, true, true, false, 'UN'),
    (p_marching500, v_kiosco_id, cat_helados, '7798001000027', 'Helado Marchelo Pote 1/2 Kg (Hasta 3 sabores)', 3400, 5500, 30, 6, true, true, false, 'UN'),
    (p_marching250, v_kiosco_id, cat_helados, '7798001000034', 'Helado Marchelo Pote 1/4 Kg (Hasta 2 sabores)', 1950, 3200, 40, 8, false, true, false, 'UN'),
    (p_bombon_suizo, v_kiosco_id, cat_helados, '7798001000041', 'Bombón Suizo Marchelo x unidad', 1100, 1800, 35, 6, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_helados, '7798001000058', 'Bombón Escocés Marchelo x unidad', 1100, 1800, 28, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_helados, '7798001000065', 'Palito de Agua Marchelo Frutilla', 500, 900, 50, 10, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_helados, '7798001000072', 'Palito de Agua Marchelo Limón', 500, 900, 45, 10, false, true, false, 'UN'),
    (p_palito_crema, v_kiosco_id, cat_helados, '7798001000089', 'Palito de Crema Marchelo Dulce de Leche', 700, 1200, 40, 8, true, true, false, 'UN'),
    (p_cucurucho, v_kiosco_id, cat_helados, '7798001000096', 'Cucurucho Bañado en Chocolate Marchelo', 1300, 2200, 30, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_helados, '7798001000102', 'Alfajor Helado Marchelo', 1200, 2000, 25, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_helados, '7798001000119', 'Pinta Marchelo Cookies & Cream 500ml', 3800, 6200, 18, 4, false, true, false, 'UN');

  -- --- 7.2 PANIZADOS LA REINA ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_mila_pollo, v_kiosco_id, cat_panizados, '7798002000019', 'Milanesas de Pollo La Reina x 1 Kg', 5200, 7800, 20, 4, true, true, false, 'UN'),
    (p_mila_carne, v_kiosco_id, cat_panizados, '7798002000026', 'Milanesas de Nalga La Reina x 1 Kg', 6700, 9500, 16, 4, true, true, false, 'UN'),
    (p_medallones, v_kiosco_id, cat_panizados, '7798002000033', 'Medallones Pollo Jamón y Queso La Reina x 4 un', 2800, 4200, 25, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_panizados, '7798002000040', 'Medallones de Carne La Reina x 4 un', 2700, 4100, 22, 5, false, true, false, 'UN'),
    (p_patitas, v_kiosco_id, cat_panizados, '7798002000057', 'Patitas de Pollo Crocantes La Reina x 500g', 3000, 4500, 18, 4, false, true, false, 'UN'),
    (p_bastoncitos, v_kiosco_id, cat_panizados, '7798002000064', 'Bastoncitos de Muzzarella Rebozados La Reina x 350g', 3300, 4800, 15, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_panizados, '7798002000071', 'Formitas de Pescado Rebozadas La Reina x 400g', 3100, 4600, 14, 3, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_panizados, '7798002000088', 'Hamburguesas Caseras La Reina x 4 un', 3600, 5200, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_panizados, '7798002000095', 'Empanadas Criollas de Carne La Reina x docena', 5600, 8400, 12, 3, false, true, false, 'UN');

  -- --- 7.3 GASEOSAS Y BEBIDAS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_coca225, v_kiosco_id, cat_bebidas, '7790895000997', 'Coca-Cola Sabor Original 2.25 Lts', 2700, 3800, 48, 12, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895001000', 'Coca-Cola Sin Azúcar 2.25 Lts', 2700, 3800, 36, 10, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895000508', 'Coca-Cola Sabor Original 1.5 Lts', 2000, 2800, 30, 8, false, true, false, 'UN'),
    (p_coca500, v_kiosco_id, cat_bebidas, '7790895000102', 'Coca-Cola Sabor Original 500 ml', 1200, 1800, 50, 12, true, true, false, 'UN'),
    (p_coca_lata, v_kiosco_id, cat_bebidas, '7790895000201', 'Coca-Cola Lata 354 ml', 950, 1400, 60, 15, false, true, false, 'UN'),
    (p_sprite225, v_kiosco_id, cat_bebidas, '7790895002250', 'Sprite Lima-Limón 2.25 Lts', 2500, 3600, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895003257', 'Fanta Naranja 2.25 Lts', 2500, 3600, 25, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7791813423418', 'Pepsi 2.25 Lts', 2200, 3200, 24, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895064500', 'Agua Saborizada Aquarius Manzana 1.5 Lts', 1500, 2200, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790310000014', 'Agua Mineral Villavicencio sin gas 500 ml', 750, 1100, 40, 10, false, true, false, 'UN'),
    (p_quilmes1l, v_kiosco_id, cat_bebidas, '7792798000014', 'Cerveza Quilmes Clásica 1 Litro', 1800, 2600, 36, 12, true, true, false, 'UN'),
    (p_brahma_lata, v_kiosco_id, cat_bebidas, '7792798000472', 'Cerveza Brahma Lata 473 ml', 1100, 1600, 72, 18, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7501064191421', 'Cerveza Corona 330 ml porrón', 1650, 2400, 30, 6, false, true, false, 'UN'),
    (p_fernet, v_kiosco_id, cat_bebidas, '7790950000028', 'Fernet Branca 750 ml', 10500, 14500, 24, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790950000103', 'Gancia Americano 950 ml', 3700, 5200, 15, 3, false, true, false, 'UN'),
    (p_hielo, v_kiosco_id, cat_bebidas, '7798003000018', 'Bolsa de Hielo Rolito 2 Kg', 900, 1500, 30, 5, true, true, false, 'UN');

  -- --- 7.4 ALMACÉN Y COMESTIBLES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790070411853', 'Fideos Guiseros Matarazzo 500g', 1100, 1600, 35, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790070411860', 'Fideos Tallarines Lucchetti 500g', 980, 1400, 30, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790070505101', 'Arroz Doble Carolina Lucchetti 1 Kg', 1650, 2400, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790272001005', 'Aceite de Girasol Natura 900 ml', 1800, 2600, 40, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790387013214', 'Yerba Mate Playadito con Palo 500g', 2200, 3200, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790387011005', 'Yerba Mate Taragüí con Palo 500g', 2000, 2900, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790177000011', 'Azúcar Ledesma clásica 1 Kg', 850, 1200, 50, 12, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790080010015', 'Leche La Serenísima Clásica sachet 1 Lt', 1050, 1500, 30, 8, true, true, false, 'UN'),
    (p_pan_bimbo, v_kiosco_id, cat_almacen, '7790580120108', 'Pan Lactal Bimbo Blanco Chico 400g', 1950, 2800, 20, 5, true, true, false, 'UN'),
    (p_mayonesa, v_kiosco_id, cat_almacen, '7794000592500', 'Mayonesa Hellmann''s clásica Doypack 250g', 1150, 1600, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790040113206', 'Puré de Tomates De la Huerta 520g', 650, 950, 35, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7622210450501', 'Galletitas Oreo Original 118g', 1050, 1500, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790040133402', 'Galletitas Chocolinas 170g', 1200, 1700, 35, 8, false, true, false, 'UN');

  -- --- 7.5 FIAMBRERÍA Y PESABLES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_jamon_cocido, v_kiosco_id, cat_fiambreria, '7798004000017', 'Jamón Cocido Especial Paladini (Kg)', 9800, 14000, 15, 3, true, true, true, 'KG'),
    (gen_random_uuid(), v_kiosco_id, cat_fiambreria, '7798004000024', 'Paleta Cocida Fiambrera (Kg)', 6200, 9000, 20, 4, false, true, true, 'KG'),
    (p_queso_cremoso, v_kiosco_id, cat_fiambreria, '7798004000031', 'Queso Cremoso La Paulina (Kg)', 7800, 11000, 25, 5, true, true, true, 'KG'),
    (p_queso_tybo, v_kiosco_id, cat_fiambreria, '7798004000048', 'Queso Tybo Barra para Sándwich (Kg)', 9500, 13500, 18, 4, true, true, true, 'KG'),
    (p_salame, v_kiosco_id, cat_fiambreria, '7798004000055', 'Salame Tipo Milán Cagnoli (Kg)', 12500, 18000, 10, 2, false, true, true, 'KG');

  -- --- 7.6 GOLOSINAS Y SNACKS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_alf_jorgito_choc, v_kiosco_id, cat_golosinas, '7790580111113', 'Alfajor Jorgito Chocolate negro', 600, 900, 60, 15, true, true, false, 'UN'),
    (p_alf_jorgito_bla, v_kiosco_id, cat_golosinas, '7790580111120', 'Alfajor Jorgito Glaseado Blanco', 600, 900, 50, 15, false, true, false, 'UN'),
    (p_alf_guaymallen, v_kiosco_id, cat_golosinas, '7790580111205', 'Alfajor Guaymallén Triple Chocolate', 500, 750, 70, 20, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580111304', 'Alfajor Havanna 70% Cacao Puro', 1550, 2200, 24, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790070031105', 'Chocolate Cofler Block 38g', 900, 1300, 45, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580111403', 'Bombón Bon o Bon Leche', 300, 450, 80, 20, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580111502', 'Chicles Beldent Menta Fuerte', 450, 650, 60, 15, false, true, false, 'UN'),
    (p_lays140, v_kiosco_id, cat_golosinas, '7790310984505', 'Papas Fritas Lays Clásicas 140g', 1950, 2800, 30, 8, true, true, false, 'UN'),
    (p_doritos, v_kiosco_id, cat_golosinas, '7790310984604', 'Doritos Mega Queso 130g', 2200, 3200, 25, 6, false, true, false, 'UN'),
    (p_mani, v_kiosco_id, cat_golosinas, '7790310984703', 'Maní Salado Pehuamar 120g', 1100, 1600, 30, 6, false, true, false, 'UN');

  -- --- 7.7 CIGARRILLOS Y VARIOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (gen_random_uuid(), v_kiosco_id, cat_cigarrillos, '7791234567890', 'Marlboro Red Box 20', 2900, 3600, 50, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cigarrillos, '7791234567891', 'Philip Morris Box 20', 2600, 3200, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cigarrillos, '070330000001', 'Encendedor Bic Maxi', 1200, 1800, 35, 8, false, true, false, 'UN');

  -- 8. PRODUCTOS TIPO COMBO (ES_COMBO = TRUE)
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida, es_combo) VALUES
    (p_combo_fernet, v_kiosco_id, cat_combos, 'COMBO-FERNETAZO', 'Combo Fernetazo (Branca 750ml + 2 Coca 2.25L + Hielo 2kg)', 16800, 20500, 999, 1, true, true, false, 'UN', true),
    (p_combo_cena_lareina, v_kiosco_id, cat_combos, 'COMBO-LAREINA-FAM', 'Combo Cena La Reina (1kg Mila Pollo + Coca 2.25L + Papas Lays)', 9850, 12500, 999, 1, true, true, false, 'UN', true),
    (p_combo_sandwiches, v_kiosco_id, cat_combos, 'COMBO-SANDWICHES', 'Combo Sándwiches de Miga (Pan Bimbo + 250g Jamón + 250g Queso + Mayo)', 7950, 9500, 999, 1, true, true, false, 'UN', true),
    (p_combo_picada, v_kiosco_id, cat_combos, 'COMBO-PICADA-AMIGOS', 'Combo Picada con Amigos (2 Quilmes 1L + 250g Tybo + 200g Salame + Maní)', 9550, 11900, 999, 1, true, true, false, 'UN', true),
    (p_combo_merienda, v_kiosco_id, cat_combos, 'COMBO-MERIENDA-KIOSCO', 'Combo Merienda (2 Alfajores Jorgito + 1 Coca-Cola 500ml)', 2400, 3000, 999, 1, true, true, false, 'UN', true),
    (p_combo_helado_fam, v_kiosco_id, cat_combos, 'COMBO-HELADO-MARCHELO', 'Combo Helado Marchelo (1kg Helado + 4 Cucuruchos Bañados)', 11000, 15500, 999, 1, true, true, false, 'UN', true);

  -- 9. ASOCIAR INGREDIENTES / COMPONENTES A CADA COMBO EN COMBO_ITEMS
  -- Combo Fernetazo: 1 Fernet + 2 Coca 2.25L + 1 Hielo 2kg
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_fernet, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_coca225, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_hielo, 1);

  -- Combo Cena La Reina: 1 Mila Pollo + 1 Coca 2.25L + 1 Papas Lays 140g
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_cena_lareina, p_mila_pollo, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_cena_lareina, p_coca225, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_cena_lareina, p_lays140, 1);

  -- Combo Sándwiches de Miga: 1 Pan Bimbo + 0.25kg Jamón + 0.25kg Queso Tybo + 1 Mayonesa
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_pan_bimbo, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_jamon_cocido, 0.25),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_queso_tybo, 0.25),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_mayonesa, 1);

  -- Combo Picada Amigos: 2 Quilmes 1L + 0.25kg Tybo + 0.20kg Salame + 1 Maní
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_quilmes1l, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_queso_tybo, 0.25),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_salame, 0.20),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_mani, 1);

  -- Combo Merienda: 2 Alfajor Jorgito + 1 Coca 500ml
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_merienda, p_alf_jorgito_choc, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_merienda, p_coca500, 1);

  -- Combo Helado Marchelo: 1 Pote 1kg + 4 Cucuruchos
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_helado_fam, p_marching1k, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_helado_fam, p_cucurucho, 4);

  -- 10. CREAR PROMOCIONES AUTOMÁTICAS EN TABLA PROMOCIONES
  INSERT INTO public.promociones (
    id, kiosco_id, nombre, tipo, producto_id, cantidad_minima, cantidad_paga, descuento_porcentaje, precio_unitario_promo, activo
  ) VALUES
    -- 2x1 en Alfajor Jorgito Chocolate
    (gen_random_uuid(), v_kiosco_id, 'Promo 2x1 Alfajor Jorgito', 'NXM', p_alf_jorgito_choc, 2, 1, NULL, NULL, true),
    -- 2da unidad al 50% en Helado Marchelo 1/2 Kg (descuento acumulado 25%)
    (gen_random_uuid(), v_kiosco_id, '2da unidad al 50% Helado Marchelo 1/2 Kg', 'PORCENTAJE', p_marching500, 2, NULL, 25, NULL, true),
    -- Promo 3 Latas Cerveza Brahma por $4.000 ($1.333,33 c/u en vez de $1.600)
    (gen_random_uuid(), v_kiosco_id, 'Promo 3 Latas Cerveza Brahma x $4.000', 'VOLUMEN', p_brahma_lata, 3, NULL, NULL, 1333.33, true),
    -- 15% OFF en Medallones La Reina llevando 2 o más cajas
    (gen_random_uuid(), v_kiosco_id, '15% OFF en Medallones La Reina (Llevando 2+)', 'PORCENTAJE', p_medallones, 2, NULL, 15, NULL, true);

  -- 11. INICIALIZAR CAJA CON FONDO INICIAL DE $25.000 PARA OPERAR INMEDIATAMENTE
  IF to_regclass('public.sesiones_caja') IS NOT NULL THEN
    INSERT INTO public.sesiones_caja (
      id, kiosco_id, usuario_id, monto_inicial, fecha_apertura, estado
    ) VALUES (
      gen_random_uuid(),
      v_kiosco_id,
      v_usuario_id,
      25000,
      now(),
      'ABIERTA'
    );
  END IF;

  RAISE NOTICE '¡Maxikiosco & Heladería Marchelo creado con éxito! Kiosco ID: %', v_kiosco_id;

END;
$$;
