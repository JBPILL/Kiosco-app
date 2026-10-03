-- ==============================================================================
-- SEED COMPLETO: KIOSCO Y ALMACÉN DON PEDRO - KIOSKOPOS
-- ==============================================================================
-- Ejecutá este script en el SQL Editor de tu panel de Supabase.
-- Genera un comercio tipo KIOSCO tradicional con catálogo integral:
--   1. Golosinas y Alfajores (Jorgelin, Cachafaz, Guaymallén, chicles, caramelos)
--   2. Galletitas y Snacks (Oreo, Pepitos, Lays, Doritos, Cheetos, palitos)
--   3. Bebidas sin Alcohol (gaseosas, aguas, jugos, energizantes)
--   4. Cervezas y Bebidas Alcohólicas (Quilmes, Brahma, Fernet, vinos)
--   5. Almacén Básico (leche, pan, yerba, azúcar, fideos, aceite)
--   6. Fiambrería (jamón, queso cremoso, muzarella, matambre, salame)
--   7. Congelados (empanadas, pizzas congeladas, hamburguesas, helados industriales)
--   8. Cigarrillos, Pilas y Varios (encendedores, carbón, bolsas basura)
--   9. Combos armados para POS
--  10. Promociones automáticas
--  11. Usuario de Acceso Demo listo:
--      Email: kiosco.don.pedro@gmail.com
--      Clave: DonPedro2026!
-- ==============================================================================

-- Limpiar demo previa
DO $$
DECLARE
  v_old_kiosco_id UUID;
BEGIN
  SELECT id INTO v_old_kiosco_id FROM public.kioscos WHERE nombre = 'Kiosco y Almacén Don Pedro' LIMIT 1;
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
  cat_golosinas UUID := gen_random_uuid();
  cat_galletitas UUID := gen_random_uuid();
  cat_bebidas UUID := gen_random_uuid();
  cat_alcohol UUID := gen_random_uuid();
  cat_almacen UUID := gen_random_uuid();
  cat_fiambreria UUID := gen_random_uuid();
  cat_congelados UUID := gen_random_uuid();
  cat_varios UUID := gen_random_uuid();
  cat_combos UUID := gen_random_uuid();

  -- IDs de productos clave para combos y promociones
  -- Golosinas
  p_jorgelin_negro UUID := gen_random_uuid();
  p_jorgelin_blanco UUID := gen_random_uuid();
  p_cachafaz_triple UUID := gen_random_uuid();
  p_guaymallen UUID := gen_random_uuid();
  p_bon_o_bon UUID := gen_random_uuid();
  p_mogul UUID := gen_random_uuid();
  p_flynn_paff UUID := gen_random_uuid();
  p_chicle_beldent UUID := gen_random_uuid();

  -- Galletitas y Snacks
  p_oreo UUID := gen_random_uuid();
  p_pepitos UUID := gen_random_uuid();
  p_toddy UUID := gen_random_uuid();
  p_lays_clasica UUID := gen_random_uuid();
  p_doritos UUID := gen_random_uuid();
  p_cheetos UUID := gen_random_uuid();
  p_palitos_pehuamar UUID := gen_random_uuid();
  p_mani_salado UUID := gen_random_uuid();

  -- Bebidas
  p_coca225 UUID := gen_random_uuid();
  p_coca500 UUID := gen_random_uuid();
  p_coca_lata UUID := gen_random_uuid();
  p_sprite225 UUID := gen_random_uuid();
  p_fanta225 UUID := gen_random_uuid();
  p_agua500 UUID := gen_random_uuid();
  p_speed_can UUID := gen_random_uuid();
  p_jugo_cepita UUID := gen_random_uuid();

  -- Alcohol
  p_quilmes_lata UUID := gen_random_uuid();
  p_brahma_lata UUID := gen_random_uuid();
  p_quilmes1l UUID := gen_random_uuid();
  p_fernet UUID := gen_random_uuid();
  p_vino_toro UUID := gen_random_uuid();
  p_hielo UUID := gen_random_uuid();

  -- Almacén
  p_yerba_playadito UUID := gen_random_uuid();
  p_leche UUID := gen_random_uuid();
  p_pan_lactal UUID := gen_random_uuid();
  p_azucar UUID := gen_random_uuid();
  p_fideos UUID := gen_random_uuid();
  p_aceite UUID := gen_random_uuid();
  p_arroz UUID := gen_random_uuid();

  -- Fiambrería
  p_jamon UUID := gen_random_uuid();
  p_queso_cremoso UUID := gen_random_uuid();
  p_muzarella UUID := gen_random_uuid();
  p_salame UUID := gen_random_uuid();

  -- Congelados
  p_empanadas UUID := gen_random_uuid();
  p_pizza_congelada UUID := gen_random_uuid();
  p_hamburguesas UUID := gen_random_uuid();

  -- Cigarrillos/Varios
  p_marlboro UUID := gen_random_uuid();

  -- IDs de combos
  p_combo_fernet UUID := gen_random_uuid();
  p_combo_picada UUID := gen_random_uuid();
  p_combo_merienda UUID := gen_random_uuid();
  p_combo_birra_amigos UUID := gen_random_uuid();
  p_combo_sandwich UUID := gen_random_uuid();
  p_combo_snack UUID := gen_random_uuid();

BEGIN

  -- 1. CREAR O IDENTIFICAR AUTH USER (auto-provisión completa)
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'kiosco.don.pedro@gmail.com'
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      role, aud, confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      v_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      'kiosco.don.pedro@gmail.com',
      crypt('DonPedro2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre":"Pedro Ramírez"}',
      now(), now(),
      'authenticated', 'authenticated', '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_auth_user_id,
      v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id::text, 'email', 'kiosco.don.pedro@gmail.com'),
      'email',
      v_auth_user_id::text,
      now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET 
      email_confirmed_at = now(),
      encrypted_password = crypt('DonPedro2026!', gen_salt('bf')),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, '')
    WHERE id = v_auth_user_id;
  END IF;

  -- 2. PLAN
  SELECT id INTO v_plan_id
  FROM public.planes
  WHERE nombre != '__CONFIG_SISTEMA__' AND activo = true
  ORDER BY precio_mensual DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.planes (id, nombre, precio_mensual, max_usuarios, descripcion, activo)
    VALUES (gen_random_uuid(), 'Plan Kiosco Pro', 50000, 5, 'Plan completo con POS, combos y reportes', true)
    RETURNING id INTO v_plan_id;
  END IF;

  -- 3. CREAR KIOSCO
  INSERT INTO public.kioscos (
    id, nombre, direccion, telefono, estado_suscripcion, fecha_creacion, rubro
  ) VALUES (
    v_kiosco_id,
    'Kiosco y Almacén Don Pedro',
    'Junín 520, Barranqueras, Chaco',
    '3624893741',
    'ACTIVO',
    now(),
    'KIOSCO'
  );

  -- 4. VINCULAR USUARIO DUEÑO
  DELETE FROM public.usuarios WHERE auth_user_id = v_auth_user_id;
  INSERT INTO public.usuarios (
    id, auth_user_id, kiosco_id, nombre, email, rol, activo, es_superadmin
  ) VALUES (
    v_usuario_id,
    v_auth_user_id,
    v_kiosco_id,
    'Pedro Ramírez (Dueño)',
    'kiosco.don.pedro@gmail.com',
    'DUEÑO',
    true,
    false
  );

  -- 5. SUSCRIPCIÓN
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

  -- 6. CATEGORÍAS
  INSERT INTO public.categorias (id, kiosco_id, nombre, color, orden) VALUES
    (cat_combos, v_kiosco_id, 'Combos y Promociones', '#8b5cf6', 1),
    (cat_golosinas, v_kiosco_id, 'Golosinas y Alfajores', '#ec4899', 2),
    (cat_galletitas, v_kiosco_id, 'Galletitas y Snacks', '#f97316', 3),
    (cat_bebidas, v_kiosco_id, 'Bebidas sin Alcohol', '#3b82f6', 4),
    (cat_alcohol, v_kiosco_id, 'Cervezas y Bebidas Alcohólicas', '#eab308', 5),
    (cat_almacen, v_kiosco_id, 'Almacén Básico', '#10b981', 6),
    (cat_fiambreria, v_kiosco_id, 'Fiambrería y Quesos', '#f59e0b', 7),
    (cat_congelados, v_kiosco_id, 'Congelados', '#06b6d4', 8),
    (cat_varios, v_kiosco_id, 'Cigarrillos, Pilas y Varios', '#64748b', 9);

  -- 7. CATÁLOGO DE PRODUCTOS

  -- --- 7.1 GOLOSINAS Y ALFAJORES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_jorgelin_negro, v_kiosco_id, cat_golosinas, '7790580200012', 'Alfajor Jorgelín Triple Negro', 750, 1100, 50, 12, true, true, false, 'UN'),
    (p_jorgelin_blanco, v_kiosco_id, cat_golosinas, '7790580200029', 'Alfajor Jorgelín Triple Blanco', 750, 1100, 45, 12, false, true, false, 'UN'),
    (p_cachafaz_triple, v_kiosco_id, cat_golosinas, '7790580200036', 'Alfajor Cachafaz Triple de Maicena', 850, 1300, 40, 10, true, true, false, 'UN'),
    (p_guaymallen, v_kiosco_id, cat_golosinas, '7790580200043', 'Alfajor Guaymallén Triple Chocolate', 400, 650, 80, 20, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200050', 'Alfajor Havanna 70% Cacao', 1600, 2400, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200067', 'Alfajor Jorgito Negro', 550, 850, 60, 15, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200074', 'Alfajor Jorgito Blanco', 550, 850, 55, 15, false, true, false, 'UN'),
    (p_bon_o_bon, v_kiosco_id, cat_golosinas, '7790580200081', 'Bombón Bon o Bon Leche x 1', 300, 450, 100, 25, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200098', 'Bombón Bon o Bon Blanco x 1', 300, 450, 80, 20, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200104', 'Chocolate Cofler Block 38g', 900, 1400, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200111', 'Chocolate Milka Oreo 38g', 1100, 1700, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200128', 'Turín Shot 40g', 550, 850, 35, 8, false, true, false, 'UN'),
    (p_mogul, v_kiosco_id, cat_golosinas, '7790580200135', 'Gomitas Mogul Corazones 80g', 700, 1100, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200142', 'Gomitas Mogul Gusanitos 80g', 700, 1100, 35, 8, false, true, false, 'UN'),
    (p_flynn_paff, v_kiosco_id, cat_golosinas, '7790580200159', 'Caramelos Flynn Paff Frutilla x 10', 400, 650, 50, 12, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200166', 'Caramelos Media Hora x 10', 350, 550, 45, 10, false, true, false, 'UN'),
    (p_chicle_beldent, v_kiosco_id, cat_golosinas, '7790580200173', 'Chicles Beldent Menta Fuerte x 1', 400, 650, 70, 18, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_golosinas, '7790580200180', 'Chicles Topline Menta Fuerte x 1', 450, 700, 60, 15, false, true, false, 'UN');

  -- --- 7.2 GALLETITAS Y SNACKS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_oreo, v_kiosco_id, cat_galletitas, '7790580300019', 'Galletitas Oreo Original 118g', 1100, 1700, 35, 8, true, true, false, 'UN'),
    (p_pepitos, v_kiosco_id, cat_galletitas, '7790580300026', 'Galletitas Pepitos con Chips de Chocolate 120g', 1000, 1550, 30, 8, true, true, false, 'UN'),
    (p_toddy, v_kiosco_id, cat_galletitas, '7790580300033', 'Galletitas Toddy Rellena Chocolate 126g', 1050, 1600, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_galletitas, '7790580300040', 'Galletitas Chocolinas 170g', 1200, 1800, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_galletitas, '7790580300057', 'Galletitas Terrabusi Variedad 400g', 2200, 3400, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_galletitas, '7790580300064', 'Criollitas de Agua 100g', 600, 900, 40, 10, false, true, false, 'UN'),
    (p_lays_clasica, v_kiosco_id, cat_galletitas, '7790580300071', 'Papas Fritas Lays Clásicas 150g', 2000, 3100, 25, 6, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_galletitas, '7790580300088', 'Papas Fritas Lays Clásicas 65g', 950, 1500, 40, 10, false, true, false, 'UN'),
    (p_doritos, v_kiosco_id, cat_galletitas, '7790580300095', 'Doritos Mega Queso 130g', 2100, 3200, 20, 5, true, true, false, 'UN'),
    (p_cheetos, v_kiosco_id, cat_galletitas, '7790580300101', 'Cheetos Puff Queso 75g', 1000, 1550, 30, 8, false, true, false, 'UN'),
    (p_palitos_pehuamar, v_kiosco_id, cat_galletitas, '7790580300118', 'Palitos Salados Pehuamar 120g', 1100, 1700, 35, 8, true, true, false, 'UN'),
    (p_mani_salado, v_kiosco_id, cat_galletitas, '7790580300125', 'Maní Salado Pehuamar 120g', 1050, 1600, 30, 8, false, true, false, 'UN');

  -- --- 7.3 BEBIDAS SIN ALCOHOL ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_coca225, v_kiosco_id, cat_bebidas, '7790895000997', 'Coca-Cola Sabor Original 2.25 Lts', 2800, 4000, 48, 12, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895001000', 'Coca-Cola Sin Azúcar 2.25 Lts', 2800, 4000, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895000508', 'Coca-Cola Sabor Original 1.5 Lts', 2100, 3000, 24, 6, false, true, false, 'UN'),
    (p_coca500, v_kiosco_id, cat_bebidas, '7790895000102', 'Coca-Cola Sabor Original 500 ml', 1300, 1900, 50, 12, true, true, false, 'UN'),
    (p_coca_lata, v_kiosco_id, cat_bebidas, '7790895000201', 'Coca-Cola Lata 354 ml', 1000, 1500, 72, 18, true, true, false, 'UN'),
    (p_sprite225, v_kiosco_id, cat_bebidas, '7790895002250', 'Sprite Lima-Limón 2.25 Lts', 2600, 3700, 24, 6, false, true, false, 'UN'),
    (p_fanta225, v_kiosco_id, cat_bebidas, '7790895003257', 'Fanta Naranja 2.25 Lts', 2600, 3700, 20, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7791813423418', 'Pepsi 2.25 Lts', 2300, 3300, 18, 5, false, true, false, 'UN'),
    (p_agua500, v_kiosco_id, cat_bebidas, '7790310000014', 'Agua Mineral Villavicencio sin gas 500 ml', 800, 1200, 48, 12, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790895064500', 'Agua Saborizada Aquarius Manzana 1.5 Lts', 1600, 2300, 20, 5, false, true, false, 'UN'),
    (p_speed_can, v_kiosco_id, cat_bebidas, '7790580300200', 'Speed Max Energizante Lata 473 ml', 1500, 2300, 30, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_bebidas, '7790580300217', 'Gatorade Cool Blue 500 ml', 1400, 2100, 20, 5, false, true, false, 'UN'),
    (p_jugo_cepita, v_kiosco_id, cat_bebidas, '7790580300224', 'Jugo Cepita Del Valle Naranja 1 Lt', 1600, 2400, 20, 5, false, true, false, 'UN');

  -- --- 7.4 CERVEZAS Y BEBIDAS ALCOHÓLICAS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_quilmes_lata, v_kiosco_id, cat_alcohol, '7792798000472', 'Cerveza Quilmes Clásica Lata 473 ml', 1200, 1800, 60, 15, true, true, false, 'UN'),
    (p_brahma_lata, v_kiosco_id, cat_alcohol, '7792798000489', 'Cerveza Brahma Lata 473 ml', 1100, 1650, 72, 18, true, true, false, 'UN'),
    (p_quilmes1l, v_kiosco_id, cat_alcohol, '7792798000014', 'Cerveza Quilmes Clásica 1 Litro', 1900, 2800, 30, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_alcohol, '7792798000496', 'Cerveza Stella Artois Lata 473 ml', 1400, 2100, 36, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_alcohol, '7501064191421', 'Cerveza Corona 330 ml Porrón', 1700, 2500, 24, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_alcohol, '7790580300231', 'Cerveza Andes Rubia 1 Litro', 1800, 2600, 20, 5, false, true, false, 'UN'),
    (p_fernet, v_kiosco_id, cat_alcohol, '7790950000028', 'Fernet Branca 750 ml', 10800, 15000, 20, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_alcohol, '7790950000103', 'Gancia Americano 950 ml', 3800, 5500, 12, 3, false, true, false, 'UN'),
    (p_vino_toro, v_kiosco_id, cat_alcohol, '7790580300248', 'Vino Toro Tinto Brick 1 Lt', 2200, 3200, 15, 4, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_alcohol, '7790580300255', 'Vodka Smirnoff 750 ml', 8500, 12500, 8, 2, false, true, false, 'UN'),
    (p_hielo, v_kiosco_id, cat_alcohol, '7798003000018', 'Bolsa de Hielo Rolito 2 Kg', 950, 1600, 25, 5, true, true, false, 'UN');

  -- --- 7.5 ALMACÉN BÁSICO ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_yerba_playadito, v_kiosco_id, cat_almacen, '7790387013214', 'Yerba Mate Playadito con Palo 500g', 2300, 3400, 35, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790387011005', 'Yerba Mate Taragüí con Palo 500g', 2100, 3100, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790387013221', 'Yerba Mate Playadito con Palo 1 Kg', 4400, 6500, 20, 5, false, true, false, 'UN'),
    (p_leche, v_kiosco_id, cat_almacen, '7790080010015', 'Leche La Serenísima Clásica Sachet 1 Lt', 1100, 1600, 25, 6, true, true, false, 'UN'),
    (p_pan_lactal, v_kiosco_id, cat_almacen, '7790580120108', 'Pan Lactal Bimbo Blanco 400g', 2000, 2900, 15, 4, true, true, false, 'UN'),
    (p_azucar, v_kiosco_id, cat_almacen, '7790177000011', 'Azúcar Ledesma Clásica 1 Kg', 900, 1300, 40, 10, false, true, false, 'UN'),
    (p_fideos, v_kiosco_id, cat_almacen, '7790070411853', 'Fideos Guiseros Matarazzo 500g', 1150, 1700, 30, 8, false, true, false, 'UN'),
    (p_aceite, v_kiosco_id, cat_almacen, '7790272001005', 'Aceite de Girasol Natura 900 ml', 1900, 2800, 30, 8, true, true, false, 'UN'),
    (p_arroz, v_kiosco_id, cat_almacen, '7790070505101', 'Arroz Doble Carolina 1 Kg', 1700, 2500, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7794000592500', 'Mayonesa Hellmann''s Clásica Doypack 250g', 1200, 1700, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790040113206', 'Puré de Tomates De la Huerta 520g', 700, 1050, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790580300262', 'Dulce de Leche La Serenísima 400g', 2500, 3800, 15, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_almacen, '7790580300279', 'Café Instantáneo Nescafé Clásico 100g', 3500, 5200, 12, 3, false, true, false, 'UN');

  -- --- 7.6 FIAMBRERÍA Y QUESOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_jamon, v_kiosco_id, cat_fiambreria, '7798004000017', 'Jamón Cocido Especial Paladini (Kg)', 10200, 14500, 12, 3, true, true, true, 'KG'),
    (gen_random_uuid(), v_kiosco_id, cat_fiambreria, '7798004000024', 'Paleta Cocida Fiambrera (Kg)', 6500, 9500, 15, 3, false, true, true, 'KG'),
    (p_queso_cremoso, v_kiosco_id, cat_fiambreria, '7798004000031', 'Queso Cremoso La Paulina (Kg)', 8200, 11500, 18, 4, true, true, true, 'KG'),
    (p_muzarella, v_kiosco_id, cat_fiambreria, '7798004000100', 'Muzarella en Barra (Kg)', 8500, 12000, 15, 3, true, true, true, 'KG'),
    (gen_random_uuid(), v_kiosco_id, cat_fiambreria, '7798004000048', 'Queso Tybo Barra Sándwich (Kg)', 9800, 14000, 12, 3, false, true, true, 'KG'),
    (p_salame, v_kiosco_id, cat_fiambreria, '7798004000055', 'Salame Tipo Milán Cagnoli (Kg)', 13000, 18500, 8, 2, false, true, true, 'KG'),
    (gen_random_uuid(), v_kiosco_id, cat_fiambreria, '7798004000117', 'Matambre Cocido (Kg)', 14000, 20000, 5, 1, false, true, true, 'KG');

  -- --- 7.7 CONGELADOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_empanadas, v_kiosco_id, cat_congelados, '7790580300286', 'Empanadas Criollas Carne x 12 Unid', 5800, 8500, 15, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_congelados, '7790580300293', 'Empanadas Jamón y Queso x 12 Unid', 5500, 8000, 12, 3, false, true, false, 'UN'),
    (p_pizza_congelada, v_kiosco_id, cat_congelados, '7790580300309', 'Pizza Congelada Muzzarella Grande', 3800, 5800, 10, 3, true, true, false, 'UN'),
    (p_hamburguesas, v_kiosco_id, cat_congelados, '7790580300316', 'Hamburguesas Paty x 4 Unidades', 3500, 5200, 18, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_congelados, '7790580300323', 'Milanesas de Pollo Congeladas x 1 Kg', 5400, 8000, 12, 3, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_congelados, '7790580300330', 'Medallones de Pollo x 4 Unidades', 2900, 4300, 15, 4, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_congelados, '7790580300347', 'Bastoncitos de Pescado x 10 Unidades', 3200, 4800, 10, 3, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_congelados, '7790580300354', 'Helado Frigor Paleta Chocolate x 1', 1400, 2200, 20, 5, true, true, false, 'UN');

  -- --- 7.8 CIGARRILLOS, PILAS Y VARIOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_marlboro, v_kiosco_id, cat_varios, '7791234567890', 'Marlboro Red Box 20', 3000, 3800, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7791234567891', 'Philip Morris Box 20', 2700, 3400, 35, 10, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7791234567892', 'Camel Box 20', 2900, 3600, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '070330000001', 'Encendedor Bic Maxi', 1200, 1800, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7790580300361', 'Pilas Duracell AA x 2', 1200, 1800, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7790580300378', 'Pilas Duracell AAA x 2', 1200, 1800, 18, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7790580300385', 'Bolsa de Carbón Quebracho 3 Kg', 3500, 5500, 8, 2, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7790580300392', 'Bolsa de Basura Residuos 45x60 x 10', 900, 1400, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_varios, '7790580300408', 'Rollo de Cocina Elegante x 3', 1800, 2700, 15, 4, false, true, false, 'UN');

  -- 8. COMBOS
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida, es_combo) VALUES
    (p_combo_fernet, v_kiosco_id, cat_combos, 'COMBO-FERNET-DON-PEDRO', 'Combo Fernetazo (Branca 750ml + 2 Coca 2.25L + Hielo 2kg)', 17400, 21500, 999, 1, true, true, false, 'UN', true),
    (p_combo_picada, v_kiosco_id, cat_combos, 'COMBO-PICADA-DON-PEDRO', 'Combo Picada Amigos (2 Quilmes 1L + Maní + Palitos Pehuamar)', 6550, 8500, 999, 1, true, true, false, 'UN', true),
    (p_combo_merienda, v_kiosco_id, cat_combos, 'COMBO-MERIENDA-DON-PEDRO', 'Combo Merienda (2 Alfajores Jorgelín + 1 Coca-Cola 500ml)', 2600, 3300, 999, 1, true, true, false, 'UN', true),
    (p_combo_birra_amigos, v_kiosco_id, cat_combos, 'COMBO-BIRRA-AMIGOS', 'Combo Birra Amigos (4 Brahma Lata + Doritos + Maní)', 7550, 9800, 999, 1, true, true, false, 'UN', true),
    (p_combo_sandwich, v_kiosco_id, cat_combos, 'COMBO-SANDWICH-RAPIDO', 'Combo Sándwich Rápido (Pan Lactal + 250g Jamón + 250g Queso Cremoso)', 7350, 9000, 999, 1, true, true, false, 'UN', true),
    (p_combo_snack, v_kiosco_id, cat_combos, 'COMBO-SNACK-CINE', 'Combo Snack Cine (Lays + Coca Lata + Bon o Bon)', 4750, 5800, 999, 1, true, true, false, 'UN', true);

  -- 9. COMPONENTES DE COMBOS
  -- Combo Fernetazo
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_fernet, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_coca225, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_hielo, 1);

  -- Combo Picada
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_quilmes1l, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_mani_salado, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_palitos_pehuamar, 1);

  -- Combo Merienda
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_merienda, p_jorgelin_negro, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_merienda, p_coca500, 1);

  -- Combo Birra Amigos
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_birra_amigos, p_brahma_lata, 4),
    (gen_random_uuid(), v_kiosco_id, p_combo_birra_amigos, p_doritos, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_birra_amigos, p_mani_salado, 1);

  -- Combo Sándwich Rápido
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwich, p_pan_lactal, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwich, p_jamon, 0.25),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwich, p_queso_cremoso, 0.25);

  -- Combo Snack Cine
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_snack, p_lays_clasica, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_snack, p_coca_lata, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_snack, p_bon_o_bon, 1);

  -- 10. PROMOCIONES AUTOMÁTICAS
  INSERT INTO public.promociones (
    id, kiosco_id, nombre, tipo, producto_id, cantidad_minima, cantidad_paga, descuento_porcentaje, precio_unitario_promo, activo
  ) VALUES
    -- 2x1 en Alfajor Guaymallén
    (gen_random_uuid(), v_kiosco_id, 'Promo 2x1 Alfajor Guaymallén', 'NXM', p_guaymallen, 2, 1, NULL, NULL, true),
    -- 3 latas Brahma por $4.200 ($1.400 c/u en vez de $1.650)
    (gen_random_uuid(), v_kiosco_id, 'Promo 3 Latas Brahma x $4.200', 'VOLUMEN', p_brahma_lata, 3, NULL, NULL, 1400, true),
    -- 2da unidad al 50% Coca-Cola Lata (acumulado 25%)
    (gen_random_uuid(), v_kiosco_id, '2da al 50% Coca-Cola Lata', 'PORCENTAJE', p_coca_lata, 2, NULL, 25, NULL, true),
    -- 10% OFF en Agua Villavicencio 500ml comprando 4+
    (gen_random_uuid(), v_kiosco_id, '10% OFF Agua Villavicencio (4+)', 'PORCENTAJE', p_agua500, 4, NULL, 10, NULL, true),
    -- 15% OFF en Oreo comprando 3+
    (gen_random_uuid(), v_kiosco_id, '15% OFF Oreo (3+)', 'PORCENTAJE', p_oreo, 3, NULL, 15, NULL, true);

  -- 11. INICIALIZAR CAJA
  IF to_regclass('public.sesiones_caja') IS NOT NULL THEN
    INSERT INTO public.sesiones_caja (
      id, kiosco_id, usuario_id, monto_inicial, fecha_apertura, estado
    ) VALUES (
      gen_random_uuid(),
      v_kiosco_id,
      v_usuario_id,
      20000,
      now(),
      'ABIERTA'
    );
  END IF;

  RAISE NOTICE '¡Kiosco y Almacén Don Pedro creado con éxito! Kiosco ID: %', v_kiosco_id;

END;
$$;
