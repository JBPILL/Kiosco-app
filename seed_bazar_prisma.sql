-- ==============================================================================
-- SEED COMPLETO: BAZAR Y HOGAR PRISMA - ALPASO POS
-- ==============================================================================
-- Ejecutá este script en el SQL Editor de tu panel de Supabase.
-- Genera un comercio tipo BAZAR Y REGALERÍA con catálogo completo:
--   1. Cocina y Vajilla (Platos cerámicos, vasos Rigolleau, copas, tazas, cubiertos)
--   2. Utensilios y Cocción (Sartenes teflón, ollas, asaderas, espátulas, batidores)
--   3. Repostería y Moldes (Moldes torta, budineras, mangas silicona, balanza digital)
--   4. Termos, Mates y Bebidas (Termos Stanley/Lumilagro, mates térmicos, bombillas alpaca)
--   5. Conservación y Herméticos (Contenedores herméticos x varios tamaños, frascos vidrio)
--   6. Organización y Limpieza (Cajas organizadoras 10L/20L/35L, canastos simil ratán)
--   7. Decoración y Regalería (Portarretratos, velas soja aromáticas, difusores, relojes)
--   8. Baño y Textiles (Dispensers jabonera, cortinas baño, toallones, repasadores)
--   9. Costos privados blindados en public.producto_costos (compatible con RLS)
--  10. Sets y Combos listos para el Punto de Venta
--  11. Promociones automáticas por volumen y porcentaje
--  12. Usuario de Acceso Demo listo:
--      Email: bazar.prisma.demo@gmail.com
--      Clave: BazarPrisma2026!
-- ==============================================================================

-- Limpiar demo previa si ya existiera para evitar duplicados
DO $$
DECLARE
  v_old_kiosco_id UUID;
BEGIN
  SELECT id INTO v_old_kiosco_id FROM public.kioscos WHERE nombre = 'Bazar y Hogar Prisma' LIMIT 1;
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
  cat_combos UUID := gen_random_uuid();
  cat_vajilla UUID := gen_random_uuid();
  cat_utensilios UUID := gen_random_uuid();
  cat_reposteria UUID := gen_random_uuid();
  cat_mate UUID := gen_random_uuid();
  cat_conservacion UUID := gen_random_uuid();
  cat_organizacion UUID := gen_random_uuid();
  cat_decoracion UUID := gen_random_uuid();
  cat_bano UUID := gen_random_uuid();

  -- IDs de productos clave para combos y promociones
  p_plato_playo UUID := gen_random_uuid();
  p_plato_hondo UUID := gen_random_uuid();
  p_plato_postre UUID := gen_random_uuid();
  p_taza_mug UUID := gen_random_uuid();
  p_vaso_rigolleau UUID := gen_random_uuid();
  p_copa_vino UUID := gen_random_uuid();
  p_jarra_vidrio UUID := gen_random_uuid();
  p_cubiertos_24 UUID := gen_random_uuid();

  p_sarten_24 UUID := gen_random_uuid();
  p_cacerola_20 UUID := gen_random_uuid();
  p_espatula_silicona UUID := gen_random_uuid();
  p_batidor UUID := gen_random_uuid();
  p_tabla_bambu UUID := gen_random_uuid();
  p_pelapapas UUID := gen_random_uuid();
  p_rallador UUID := gen_random_uuid();

  p_molde_torta UUID := gen_random_uuid();
  p_budinera UUID := gen_random_uuid();
  p_balanza_cocina UUID := gen_random_uuid();
  p_manga_reposteria UUID := gen_random_uuid();
  p_palo_amasar UUID := gen_random_uuid();

  p_termo_acero UUID := gen_random_uuid();
  p_termo_lumilagro UUID := gen_random_uuid();
  p_mate_termico UUID := gen_random_uuid();
  p_bombilla_alpaca UUID := gen_random_uuid();
  p_set_latas UUID := gen_random_uuid();
  p_azucarera UUID := gen_random_uuid();

  p_hermetico_1l UUID := gen_random_uuid();
  p_hermetico_2l UUID := gen_random_uuid();
  p_frasco_bambu UUID := gen_random_uuid();
  p_botella_sport UUID := gen_random_uuid();

  p_caja_org_20l UUID := gen_random_uuid();
  p_caja_org_10l UUID := gen_random_uuid();
  p_canasto_ratan UUID := gen_random_uuid();
  p_org_cubiertos UUID := gen_random_uuid();
  p_cesto_vaiven UUID := gen_random_uuid();

  p_vela_soja UUID := gen_random_uuid();
  p_difusor UUID := gen_random_uuid();
  p_portarretrato UUID := gen_random_uuid();
  p_florero UUID := gen_random_uuid();
  p_reloj_pared UUID := gen_random_uuid();

  p_set_bano UUID := gen_random_uuid();
  p_cortina_bano UUID := gen_random_uuid();
  p_alfombra_bano UUID := gen_random_uuid();
  p_repasadores_x3 UUID := gen_random_uuid();

  -- Combos
  p_combo_set_matero UUID := gen_random_uuid();
  p_combo_reposteria UUID := gen_random_uuid();
  p_combo_desayuno UUID := gen_random_uuid();
  p_combo_cocina UUID := gen_random_uuid();

BEGIN

  -- Configurar contexto de servicio si la sesión lo soporta
  BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 1. CREAR O IDENTIFICAR AUTH USER
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'bazar.prisma.demo@gmail.com'
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
      'bazar.prisma.demo@gmail.com',
      crypt('BazarPrisma2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre":"Mariana Gómez"}',
      now(), now(),
      'authenticated', 'authenticated', '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_auth_user_id,
      v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id::text, 'email', 'bazar.prisma.demo@gmail.com'),
      'email',
      v_auth_user_id::text,
      now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET 
      email_confirmed_at = now(),
      encrypted_password = crypt('BazarPrisma2026!', gen_salt('bf')),
      confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_new = COALESCE(email_change_token_new, '')
    WHERE id = v_auth_user_id;
  END IF;

  -- 2. BUSCAR O ASIGNAR PLAN ACTIVO
  SELECT id INTO v_plan_id
  FROM public.planes
  WHERE nombre != '__CONFIG_SISTEMA__' AND activo = true
  ORDER BY precio_mensual DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.planes (id, nombre, precio_mensual, max_usuarios, descripcion, activo)
    VALUES (gen_random_uuid(), 'Plan Bazar Pro', 50000, 5, 'Plan completo para comercios de bazar, regalería y artículos del hogar', true)
    RETURNING id INTO v_plan_id;
  END IF;

  -- 3. CREAR KIOSCO / COMERCIO
  INSERT INTO public.kioscos (
    id, nombre, direccion, telefono, estado_suscripcion, fecha_creacion, rubro,
    cuit, iibb, condicion_iva, afip_punto_venta, afip_habilitado, afip_entorno, afip_alicuota_iva,
    capacidades_operativas, arqueo_ciego_obligatorio
  ) VALUES (
    v_kiosco_id,
    'Bazar y Hogar Prisma',
    'Pellegrini 380, Corrientes Capital',
    '3794123890',
    'ACTIVO',
    now(),
    'BAZAR',
    '27358901234',
    '27358901234',
    'MONOTRIBUTO',
    2,
    false,
    'HOMOLOGACION',
    21,
    jsonb_build_object(
      'balanza', false,
      'vencimientos', false,
      'envases', false,
      'serviciosRapidos', false
    ),
    false
  );

  -- 4. VINCULAR USUARIO DUEÑO
  DELETE FROM public.usuarios WHERE auth_user_id = v_auth_user_id;
  INSERT INTO public.usuarios (
    id, auth_user_id, kiosco_id, nombre, email, rol, activo, es_superadmin
  ) VALUES (
    v_usuario_id,
    v_auth_user_id,
    v_kiosco_id,
    'Mariana Gómez (Dueña)',
    'bazar.prisma.demo@gmail.com',
    'DUEÑO',
    true,
    false
  );

  -- 5. SUSCRIPCIÓN ACTIVA POR 365 DÍAS
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

  -- 6. CREAR CATEGORÍAS
  INSERT INTO public.categorias (id, kiosco_id, nombre, color, orden) VALUES
    (cat_combos, v_kiosco_id, 'Sets y Promociones', '#6366f1', 1),
    (cat_vajilla, v_kiosco_id, 'Cocina y Vajilla', '#3b82f6', 2),
    (cat_utensilios, v_kiosco_id, 'Utensilios y Cocción', '#f59e0b', 3),
    (cat_reposteria, v_kiosco_id, 'Repostería y Moldes', '#ec4899', 4),
    (cat_mate, v_kiosco_id, 'Termos, Mates y Bebidas', '#10b981', 5),
    (cat_conservacion, v_kiosco_id, 'Conservación y Herméticos', '#06b6d4', 6),
    (cat_organizacion, v_kiosco_id, 'Organización y Limpieza', '#8b5cf6', 7),
    (cat_decoracion, v_kiosco_id, 'Decoración y Regalería', '#f97316', 8),
    (cat_bano, v_kiosco_id, 'Baño y Textiles', '#14b8a6', 9);

  -- 7. INSERTAR CATÁLOGO DE PRODUCTOS (precio_costo en 0 para cumplir con trg_proteger_costo_producto)

  -- --- 7.1 COCINA Y VAJILLA ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_plato_playo, v_kiosco_id, cat_vajilla, '7792001001014', 'Plato Playo Cerámica Esmaltada 26 cm Blanco/Gris', 0, 4900, 48, 12, true, true, false, 'UN'),
    (p_plato_hondo, v_kiosco_id, cat_vajilla, '7792001001021', 'Plato Hondo Cerámica Esmaltada 22 cm', 0, 4600, 36, 10, false, true, false, 'UN'),
    (p_plato_postre, v_kiosco_id, cat_vajilla, '7792001001038', 'Plato de Postre Cerámica 19 cm', 0, 3800, 40, 10, true, true, false, 'UN'),
    (p_taza_mug, v_kiosco_id, cat_vajilla, '7792001001045', 'Taza Mug Cerámica Nórdica 350 ml', 0, 3500, 50, 12, true, true, false, 'UN'),
    (p_vaso_rigolleau, v_kiosco_id, cat_vajilla, '7792001001052', 'Vaso de Vidrio Rigolleau Oslo 400 ml', 0, 1400, 72, 18, true, true, false, 'UN'),
    (p_copa_vino, v_kiosco_id, cat_vajilla, '7792001001069', 'Copa de Vino Cristal Rigolleau 450 ml', 0, 3300, 36, 8, false, true, false, 'UN'),
    (p_jarra_vidrio, v_kiosco_id, cat_vajilla, '7792001001076', 'Jarra de Vidrio con Tapa Bambú 1.5 Litros', 0, 8500, 18, 4, false, true, false, 'UN'),
    (p_cubiertos_24, v_kiosco_id, cat_vajilla, '7792001001083', 'Juego de Cubiertos Tramontina New Kolor 24 Piezas', 0, 18900, 20, 5, true, true, false, 'UN');

  -- --- 7.2 UTENSILIOS Y COCCIÓN ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_sarten_24, v_kiosco_id, cat_utensilios, '7792002001013', 'Sartén Teflón Antiadherente 24 cm Mango Soft Touch', 0, 21500, 16, 4, true, true, false, 'UN'),
    (p_cacerola_20, v_kiosco_id, cat_utensilios, '7792002001020', 'Cacerola con Tapa de Vidrio Templado 20 cm', 0, 27900, 12, 3, false, true, false, 'UN'),
    (p_espatula_silicona, v_kiosco_id, cat_utensilios, '7792002001037', 'Espátula de Silicona con Mango de Madera Haya', 0, 2900, 35, 8, true, true, false, 'UN'),
    (p_batidor, v_kiosco_id, cat_utensilios, '7792002001044', 'Batidor Manual de Alambre Acero Inoxidable 25 cm', 0, 2500, 30, 6, false, true, false, 'UN'),
    (p_tabla_bambu, v_kiosco_id, cat_utensilios, '7792002001051', 'Tabla para Cortar y Picar de Bambú 34x24 cm', 0, 6500, 22, 5, true, true, false, 'UN'),
    (p_pelapapas, v_kiosco_id, cat_utensilios, '7792002001068', 'Pelapapas Dentado Acero Inoxidable', 0, 1900, 40, 10, false, true, false, 'UN'),
    (p_rallador, v_kiosco_id, cat_utensilios, '7792002001075', 'Rallador Cuatro Caras de Acero Inoxidable 22 cm', 0, 5400, 20, 5, false, true, false, 'UN');

  -- --- 7.3 REPOSTERÍA Y MOLDES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_molde_torta, v_kiosco_id, cat_reposteria, '7792003001012', 'Molde para Torta Desmontable Antiadherente 26 cm', 0, 8900, 18, 4, true, true, false, 'UN'),
    (p_budinera, v_kiosco_id, cat_reposteria, '7792003001029', 'Budinera de Teflón Antiadherente 28 cm', 0, 6900, 20, 5, false, true, false, 'UN'),
    (p_balanza_cocina, v_kiosco_id, cat_reposteria, '7792003001036', 'Balanza Digital de Cocina Precisión 1g a 5kg', 0, 9900, 25, 5, true, true, false, 'UN'),
    (p_manga_reposteria, v_kiosco_id, cat_reposteria, '7792003001043', 'Manga Repostería Siliconada con 6 Picos de Acero', 0, 4900, 25, 6, false, true, false, 'UN'),
    (p_palo_amasar, v_kiosco_id, cat_reposteria, '7792003001050', 'Palo de Amasar Giratorio Antiadherente 40 cm', 0, 5900, 15, 3, false, true, false, 'UN');

  -- --- 7.4 TERMOS, MATES Y BEBIDAS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_termo_acero, v_kiosco_id, cat_mate, '7792004001011', 'Termo de Acero Inoxidable Doble Capa 1 Litro', 0, 26900, 20, 5, true, true, false, 'UN'),
    (p_termo_lumilagro, v_kiosco_id, cat_mate, '7792004001028', 'Termo Lumilagro Luminox Acero Inoxidable 1L', 0, 24500, 18, 4, false, true, false, 'UN'),
    (p_mate_termico, v_kiosco_id, cat_mate, '7792004001035', 'Mate Térmico Acero Inoxidable Doble Capa', 0, 7900, 35, 8, true, true, false, 'UN'),
    (p_bombilla_alpaca, v_kiosco_id, cat_mate, '7792004001042', 'Bombilla de Alpaca Cincelada con Resorte Desarmable', 0, 5500, 40, 10, true, true, false, 'UN'),
    (p_set_latas, v_kiosco_id, cat_mate, '7792004001059', 'Set Matero Lata Yerbera y Azucarera con Pico Vertedor', 0, 7400, 24, 6, false, true, false, 'UN'),
    (p_azucarera, v_kiosco_id, cat_mate, '7792004001066', 'Azucarera de Cerámica con Tapa de Madera y Cuchara', 0, 4300, 20, 5, false, true, false, 'UN');

  -- --- 7.5 CONSERVACIÓN Y HERMÉTICOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_hermetico_1l, v_kiosco_id, cat_conservacion, '7792005001010', 'Contenedor Hermético Rectangular 1 Litro con Traba', 0, 3700, 45, 10, true, true, false, 'UN'),
    (p_hermetico_2l, v_kiosco_id, cat_conservacion, '7792005001027', 'Contenedor Hermético Rectangular 2 Litros con Traba', 0, 4900, 30, 8, false, true, false, 'UN'),
    (p_frasco_bambu, v_kiosco_id, cat_conservacion, '7792005001034', 'Frasco de Vidrio con Tapa de Bambú Hermética 1000 ml', 0, 5400, 28, 6, true, true, false, 'UN'),
    (p_botella_sport, v_kiosco_id, cat_conservacion, '7792005001041', 'Botella Deportiva Reutilizable Libre BPA 750 ml', 0, 4600, 35, 8, false, true, false, 'UN');

  -- --- 7.6 ORGANIZACIÓN Y LIMPIEZA ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_caja_org_20l, v_kiosco_id, cat_organizacion, '7792006001019', 'Caja Organizadora Plástica Transparente 20 Litros con Traba', 0, 7900, 24, 6, true, true, false, 'UN'),
    (p_caja_org_10l, v_kiosco_id, cat_organizacion, '7792006001026', 'Caja Organizadora Plástica Transparente 10 Litros', 0, 5800, 30, 8, false, true, false, 'UN'),
    (p_canasto_ratan, v_kiosco_id, cat_organizacion, '7792006001033', 'Canasto Organizador Calado Símil Ratán Mediano', 0, 4100, 32, 8, true, true, false, 'UN'),
    (p_org_cubiertos, v_kiosco_id, cat_organizacion, '7792006001040', 'Organizador de Cubiertos para Cajón 5 Divisiones', 0, 4900, 20, 5, false, true, false, 'UN'),
    (p_cesto_vaiven, v_kiosco_id, cat_organizacion, '7792006001057', 'Cesto de Residuos Vaivén 12 Litros Blanco/Gris', 0, 6900, 16, 4, false, true, false, 'UN');

  -- --- 7.7 DECORACIÓN Y REGALERÍA ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_vela_soja, v_kiosco_id, cat_decoracion, '7792007001018', 'Vela de Soja Aromática en Vaso de Vidrio 200 g', 0, 4900, 40, 10, true, true, false, 'UN'),
    (p_difusor, v_kiosco_id, cat_decoracion, '7792007001025', 'Difusor Aromático Ambiental con Varillas 125 ml', 0, 4500, 35, 8, true, true, false, 'UN'),
    (p_portarretrato, v_kiosco_id, cat_decoracion, '7792007001032', 'Portarretrato Madera Nórdica 13x18 cm', 0, 4000, 25, 6, false, true, false, 'UN'),
    (p_florero, v_kiosco_id, cat_decoracion, '7792007001049', 'Florero de Vidrio Labrado Estilo Vintage', 0, 5900, 18, 4, false, true, false, 'UN'),
    (p_reloj_pared, v_kiosco_id, cat_decoracion, '7792007001056', 'Reloj de Pared Minimalista Silencioso 30 cm', 0, 11000, 14, 3, true, true, false, 'UN');

  -- --- 7.8 BAÑO Y TEXTILES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_set_bano, v_kiosco_id, cat_bano, '7792008001017', 'Set de Baño Cerámica Dispenser + Jabonera + Vaso', 0, 10500, 20, 5, true, true, false, 'UN'),
    (p_cortina_bano, v_kiosco_id, cat_bano, '7792008001024', 'Cortina de Baño Teflón Antihongos Estampada', 0, 8500, 22, 5, false, true, false, 'UN'),
    (p_alfombra_bano, v_kiosco_id, cat_bano, '7792008001031', 'Alfombra de Baño Chenille Extra Suave 40x60 cm', 0, 6000, 25, 6, true, true, false, 'UN'),
    (p_repasadores_x3, v_kiosco_id, cat_bano, '7792008001048', 'Juego de Repasadores Algodón Nido de Abeja x 3', 0, 4900, 30, 8, true, true, false, 'UN');

  -- 8. INSERTAR COSTOS REALES EN PUBLIC.PRODUCTO_COSTOS (Protegido por RLS para el Dueño)
  IF to_regclass('public.producto_costos') IS NOT NULL THEN
    INSERT INTO public.producto_costos (producto_id, kiosco_id, precio_costo) VALUES
      (p_plato_playo, v_kiosco_id, 3200),
      (p_plato_hondo, v_kiosco_id, 3000),
      (p_plato_postre, v_kiosco_id, 2400),
      (p_taza_mug, v_kiosco_id, 2200),
      (p_vaso_rigolleau, v_kiosco_id, 900),
      (p_copa_vino, v_kiosco_id, 2100),
      (p_jarra_vidrio, v_kiosco_id, 5500),
      (p_cubiertos_24, v_kiosco_id, 12500),
      (p_sarten_24, v_kiosco_id, 14000),
      (p_cacerola_20, v_kiosco_id, 18500),
      (p_espatula_silicona, v_kiosco_id, 1800),
      (p_batidor, v_kiosco_id, 1600),
      (p_tabla_bambu, v_kiosco_id, 4200),
      (p_pelapapas, v_kiosco_id, 1200),
      (p_rallador, v_kiosco_id, 3500),
      (p_molde_torta, v_kiosco_id, 5800),
      (p_budinera, v_kiosco_id, 4500),
      (p_balanza_cocina, v_kiosco_id, 6500),
      (p_manga_reposteria, v_kiosco_id, 3200),
      (p_palo_amasar, v_kiosco_id, 3800),
      (p_termo_acero, v_kiosco_id, 18000),
      (p_termo_lumilagro, v_kiosco_id, 16500),
      (p_mate_termico, v_kiosco_id, 5200),
      (p_bombilla_alpaca, v_kiosco_id, 3500),
      (p_set_latas, v_kiosco_id, 4800),
      (p_azucarera, v_kiosco_id, 2800),
      (p_hermetico_1l, v_kiosco_id, 2400),
      (p_hermetico_2l, v_kiosco_id, 3200),
      (p_frasco_bambu, v_kiosco_id, 3500),
      (p_botella_sport, v_kiosco_id, 3000),
      (p_caja_org_20l, v_kiosco_id, 5200),
      (p_caja_org_10l, v_kiosco_id, 3800),
      (p_canasto_ratan, v_kiosco_id, 2600),
      (p_org_cubiertos, v_kiosco_id, 3200),
      (p_cesto_vaiven, v_kiosco_id, 4500),
      (p_vela_soja, v_kiosco_id, 3200),
      (p_difusor, v_kiosco_id, 2900),
      (p_portarretrato, v_kiosco_id, 2600),
      (p_florero, v_kiosco_id, 3800),
      (p_reloj_pared, v_kiosco_id, 7200),
      (p_set_bano, v_kiosco_id, 6800),
      (p_cortina_bano, v_kiosco_id, 5500),
      (p_alfombra_bano, v_kiosco_id, 3900),
      (p_repasadores_x3, v_kiosco_id, 3200)
    ON CONFLICT (producto_id) DO UPDATE
    SET precio_costo = EXCLUDED.precio_costo,
        kiosco_id = EXCLUDED.kiosco_id,
        fecha_actualizacion = now();
  END IF;

  -- 9. PRODUCTOS TIPO COMBO (ES_COMBO = TRUE)
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida, es_combo) VALUES
    (p_combo_set_matero, v_kiosco_id, cat_combos, 'COMBO-SET-MATERO', 'Set Matero Argentino (Termo Acero 1L + Mate Térmico + Bombilla Alpaca)', 0, 36000, 999, 1, true, true, false, 'UN', true),
    (p_combo_reposteria, v_kiosco_id, cat_combos, 'COMBO-REPOSTERIA', 'Set Repostería Inicial (Molde Torta 26cm + Balanza Cocina + Espátula + Batidor)', 0, 21500, 999, 1, true, true, false, 'UN', true),
    (p_combo_desayuno, v_kiosco_id, cat_combos, 'COMBO-DESAYUNO-X2', 'Set Desayuno Nórdico x2 (2 Tazas Mug + 2 Platos Postre + 1 Azucarera)', 0, 16500, 999, 1, true, true, false, 'UN', true),
    (p_combo_cocina, v_kiosco_id, cat_combos, 'COMBO-COCINA-CHEF', 'Set Cocina Esencial (Sartén Teflón 24cm + Tabla Bambú + Espátula Silicona)', 0, 27500, 999, 1, true, true, false, 'UN', true);

  -- 10. COMPONENTES DE CADA COMBO
  -- Set Matero
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_set_matero, p_termo_acero, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_set_matero, p_mate_termico, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_set_matero, p_bombilla_alpaca, 1);

  -- Set Repostería
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_reposteria, p_molde_torta, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_reposteria, p_balanza_cocina, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_reposteria, p_espatula_silicona, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_reposteria, p_batidor, 1);

  -- Set Desayuno
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_desayuno, p_taza_mug, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_desayuno, p_plato_postre, 2),
    (gen_random_uuid(), v_kiosco_id, p_combo_desayuno, p_azucarera, 1);

  -- Set Cocina
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_cocina, p_sarten_24, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_cocina, p_tabla_bambu, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_cocina, p_espatula_silicona, 1);

  -- 11. CREAR PROMOCIONES AUTOMÁTICAS
  INSERT INTO public.promociones (
    id, kiosco_id, nombre, tipo, producto_id, cantidad_minima, cantidad_paga, descuento_porcentaje, precio_unitario_promo, activo
  ) VALUES
    -- Promo 6 Vasos Rigolleau x $6.000 ($1.000 c/u en vez de $1.400)
    (gen_random_uuid(), v_kiosco_id, 'Promo 6 Vasos Rigolleau', 'VOLUMEN', p_vaso_rigolleau, 6, NULL, NULL, 1000.0, true),
    -- 15% OFF en Cajas Organizadoras llevando 3 o más
    (gen_random_uuid(), v_kiosco_id, '15% OFF en Cajas 20L (Llevando 3+)', 'PORCENTAJE', p_caja_org_20l, 3, NULL, 15, NULL, true),
    -- 2da unidad al 50% en Velas Aromáticas de Soja
    (gen_random_uuid(), v_kiosco_id, '2da al 50% en Velas Aromáticas', 'PORCENTAJE', p_vela_soja, 2, NULL, 25, NULL, true);

  -- 12. INICIALIZAR CAJA CON FONDO INICIAL ($30.000)
  IF to_regclass('public.sesiones_caja') IS NOT NULL THEN
    INSERT INTO public.sesiones_caja (
      id, kiosco_id, usuario_id, monto_inicial, fecha_apertura, estado
    ) VALUES (
      gen_random_uuid(),
      v_kiosco_id,
      v_usuario_id,
      30000,
      now(),
      'ABIERTA'
    );
  END IF;

  RAISE NOTICE '¡Bazar y Hogar Prisma creado con éxito! Kiosco ID: %', v_kiosco_id;

END;
$$;
