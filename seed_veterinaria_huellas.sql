-- ==============================================================================
-- SEED COMPLETO: VETERINARIA Y PET SHOP HUELLAS - ALPASO POS
-- ==============================================================================
-- Ejecutá este script en el SQL Editor de tu panel de Supabase.
-- Genera un comercio tipo VETERINARIA Y PET SHOP con catálogo completo:
--   1. Alimentos para Perros (Royal Canin, Pro Plan, Dog Chow, Pedigree)
--   2. Alimentos para Gatos (Royal Canin, Cat Chow, Whiskas, Excellent)
--   3. Alimentos a Granel (x Kg fraccionables con balanza decimal)
--   4. Farmacia y Antiparasitarios (Nexgard, Bravecto, Pipetas Frontline, Power, Seresto)
--   5. Higiene y Peluquería (Shampoos pulguicidas, acondicionadores, cardinas, cortaúñas)
--   6. Paseo, Collares y Correas (Pretales reforzados, correas retráctiles, collares)
--   7. Juguetes y Rascadores (Pelotas caucho, mordillos, rascador con cueva para gatos)
--   8. Premios y Snacks (Dentastix, golosinas para perro y gato)
--   9. Servicios Veterinarios (Consultas clínicas, vacunación, baño y peluquería canina)
--  10. Combos listos para el Punto de Venta
--  11. Promociones automáticas
--  12. Usuario de Acceso Demo listo:
--      Email: veterinaria.huellas.demo@gmail.com
--      Clave: VeterinariaHuellas2026!
-- ==============================================================================

-- Limpiar demo previa si ya existiera para evitar duplicados
DO $$
DECLARE
  v_old_kiosco_id UUID;
BEGIN
  SELECT id INTO v_old_kiosco_id FROM public.kioscos WHERE nombre = 'Veterinaria y Pet Shop Huellas' LIMIT 1;
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
  cat_perros UUID := gen_random_uuid();
  cat_gatos UUID := gen_random_uuid();
  cat_granel UUID := gen_random_uuid();
  cat_farmacia UUID := gen_random_uuid();
  cat_higiene UUID := gen_random_uuid();
  cat_paseo UUID := gen_random_uuid();
  cat_juguetes UUID := gen_random_uuid();
  cat_snacks UUID := gen_random_uuid();
  cat_servicios UUID := gen_random_uuid();

  -- IDs de productos clave para combos y promociones
  p_proplan_adulto_15k UUID := gen_random_uuid();
  p_dogchow_adulto_3k UUID := gen_random_uuid();
  p_dogchow_cachorro_3k UUID := gen_random_uuid();
  p_catchow_adulto_3k UUID := gen_random_uuid();
  p_whiskas_sobre UUID := gen_random_uuid();
  p_pedigree_sobre UUID := gen_random_uuid();
  p_granel_perro_adulto UUID := gen_random_uuid();
  p_granel_gato_adulto UUID := gen_random_uuid();
  p_nexgard_10_20k UUID := gen_random_uuid();
  p_bravecto_10_20k UUID := gen_random_uuid();
  p_pipeta_power UUID := gen_random_uuid();
  p_shampoo_osspret UUID := gen_random_uuid();
  p_cardina UUID := gen_random_uuid();
  p_piedras_sanitarias UUID := gen_random_uuid();
  p_pelota_mordillo UUID := gen_random_uuid();
  p_rascador_carton UUID := gen_random_uuid();
  p_snack_dentastix UUID := gen_random_uuid();

  -- Combos
  p_combo_cachorro_full UUID := gen_random_uuid();
  p_combo_spa_canino UUID := gen_random_uuid();
  p_combo_gatito_feliz UUID := gen_random_uuid();
  p_combo_proteccion_total UUID := gen_random_uuid();

BEGIN

  -- 1. CREAR O IDENTIFICAR AUTH USER
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'veterinaria.huellas.demo@gmail.com'
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
      'veterinaria.huellas.demo@gmail.com',
      crypt('VeterinariaHuellas2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nombre":"Dr. Marcos Benítez"}',
      now(), now(),
      'authenticated', 'authenticated', '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_auth_user_id,
      v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id::text, 'email', 'veterinaria.huellas.demo@gmail.com'),
      'email',
      v_auth_user_id::text,
      now(), now(), now()
    );
  ELSE
    UPDATE auth.users
    SET 
      email_confirmed_at = now(),
      encrypted_password = crypt('VeterinariaHuellas2026!', gen_salt('bf')),
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
    VALUES (gen_random_uuid(), 'Plan Veterinaria Pro', 55000, 5, 'Plan integral para veterinarias y pet shops con balanza, stock y caja', true)
    RETURNING id INTO v_plan_id;
  END IF;

  -- 3. CREAR KIOSCO / COMERCIO
  INSERT INTO public.kioscos (
    id, nombre, direccion, telefono, estado_suscripcion, fecha_creacion, rubro,
    cuit, iibb, condicion_iva, afip_punto_venta, afip_habilitado, afip_entorno, afip_alicuota_iva,
    capacidades_operativas, arqueo_ciego_obligatorio
  ) VALUES (
    v_kiosco_id,
    'Veterinaria y Pet Shop Huellas',
    'Av. Alvear 1420, Resistencia, Chaco',
    '3624789123',
    'ACTIVO',
    now(),
    'PETSHOP_VETERINARIA',
    '20415005963',
    '20415005963',
    'RESPONSABLE_INSCRIPTO',
    3,
    false,
    'HOMOLOGACION',
    21,
    jsonb_build_object(
      'balanza', true,
      'vencimientos', true,
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
    'Dr. Marcos Benítez (Veterinario)',
    'veterinaria.huellas.demo@gmail.com',
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
    (cat_combos, v_kiosco_id, 'Combos y Promociones', '#6366f1', 1),
    (cat_perros, v_kiosco_id, 'Alimentos para Perros', '#3b82f6', 2),
    (cat_gatos, v_kiosco_id, 'Alimentos para Gatos', '#10b981', 3),
    (cat_granel, v_kiosco_id, 'Alimentos a Granel (x Kg)', '#f59e0b', 4),
    (cat_farmacia, v_kiosco_id, 'Farmacia y Antiparasitarios', '#ef4444', 5),
    (cat_higiene, v_kiosco_id, 'Higiene y Peluquería', '#8b5cf6', 6),
    (cat_paseo, v_kiosco_id, 'Paseo, Collares y Correas', '#06b6d4', 7),
    (cat_juguetes, v_kiosco_id, 'Juguetes y Rascadores', '#ec4899', 8),
    (cat_snacks, v_kiosco_id, 'Premios y Snacks', '#f97316', 9),
    (cat_servicios, v_kiosco_id, 'Servicios Veterinarios', '#14b8a6', 10);

  -- 7. INSERTAR CATÁLOGO DE PRODUCTOS

  -- --- 7.1 ALIMENTOS PARA PERROS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_proplan_adulto_15k, v_kiosco_id, cat_perros, '7791234001010', 'Purina Pro Plan Adulto Raza Mediana 15 kg', 48000, 68000, 15, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_perros, '7791234001027', 'Royal Canin Maxi Adult 15 kg', 52000, 74000, 12, 3, true, true, false, 'UN'),
    (p_dogchow_adulto_3k, v_kiosco_id, cat_perros, '7791234001034', 'Purina Dog Chow Adultos Medianos y Grandes 3 kg', 9500, 13900, 25, 5, true, true, false, 'UN'),
    (p_dogchow_cachorro_3k, v_kiosco_id, cat_perros, '7791234001041', 'Purina Dog Chow Cachorros Todos los Tamaños 3 kg', 10200, 14900, 20, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_perros, '7791234001058', 'Pedigree Adulto Nutrición Completa Carne y Vegetales 3 kg', 8800, 12800, 30, 6, false, true, false, 'UN'),
    (p_pedigree_sobre, v_kiosco_id, cat_perros, '7791234001065', 'Alimento Húmedo Pedigree Sobre Carne en Salsa 100 g', 650, 1000, 80, 20, true, true, false, 'UN');

  -- --- 7.2 ALIMENTOS PARA GATOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_catchow_adulto_3k, v_kiosco_id, cat_gatos, '7791234002017', 'Purina Cat Chow Adultos Pescado 3 kg', 11500, 16800, 22, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_gatos, '7791234002024', 'Purina Cat Chow Adultos Esterilizados 3 kg', 12200, 17800, 18, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_gatos, '7791234002031', 'Royal Canin Fit 32 para Gatos Adultos 2 kg', 18500, 26000, 14, 3, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_gatos, '7791234002048', 'Whiskas Adultos Carne 1 kg', 4200, 6200, 40, 8, true, true, false, 'UN'),
    (p_whiskas_sobre, v_kiosco_id, cat_gatos, '7791234002055', 'Alimento Húmedo Whiskas Sobre Salmón en Salsa 85 g', 700, 1100, 90, 20, true, true, false, 'UN');

  -- --- 7.3 ALIMENTOS A GRANEL (BALANZA / FRACCIONABLE POR KILO) ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_granel_perro_adulto, v_kiosco_id, cat_granel, 'VET-GRA-001', 'Alimento Seco Perro Adulto Premium a Granel (x Kg)', 2200, 3400, 85.5, 15, true, true, true, 'KG'),
    (gen_random_uuid(), v_kiosco_id, cat_granel, 'VET-GRA-002', 'Alimento Seco Perro Cachorro a Granel (x Kg)', 2500, 3900, 60.0, 15, false, true, true, 'KG'),
    (p_granel_gato_adulto, v_kiosco_id, cat_granel, 'VET-GRA-003', 'Alimento Seco Gato Adulto a Granel (x Kg)', 2800, 4300, 50.0, 10, true, true, true, 'KG'),
    (gen_random_uuid(), v_kiosco_id, cat_granel, 'VET-GRA-004', 'Mezcla de Semillas para Aves a Granel (x Kg)', 1500, 2400, 35.0, 8, false, true, true, 'KG');

  -- --- 7.4 FARMACIA Y ANTIPARASITARIOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_nexgard_10_20k, v_kiosco_id, cat_farmacia, '7791234004011', 'Nexgard Spectra Antiparasitario Masticable 10 a 20 kg', 14500, 21000, 25, 5, true, true, false, 'UN'),
    (p_bravecto_10_20k, v_kiosco_id, cat_farmacia, '7791234004028', 'Bravecto Comprimido Antiparasitario 10 a 20 kg (3 meses)', 28000, 39500, 18, 4, true, true, false, 'UN'),
    (p_pipeta_power, v_kiosco_id, cat_farmacia, '7791234004035', 'Pipeta Power Ultra para Perro 11 a 20 kg', 5200, 7800, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_farmacia, '7791234004042', 'Pipeta Frontline Plus para Gato', 5800, 8500, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_farmacia, '7791234004059', 'Collar Antiparasitario Seresto Perro hasta 8 kg (8 meses)', 36000, 49000, 10, 2, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_farmacia, '7791234004066', 'Antiparasitario Interno Total F Comprimidos x 4', 3200, 4900, 35, 8, true, true, false, 'UN');

  -- --- 7.5 HIGIENE Y PELUQUERÍA ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_shampoo_osspret, v_kiosco_id, cat_higiene, '7791234005018', 'Shampoo Pulguicida Osspret Pelo Corto/Largo 250 ml', 3500, 5200, 30, 6, true, true, false, 'UN'),
    (p_cardina, v_kiosco_id, cat_higiene, '7791234005025', 'Cardina Metálica con Puntas Protegidas Tamaño Mediano', 2600, 4100, 20, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_higiene, '7791234005032', 'Alicate Cortaúñas para Perro con Tope de Seguridad', 3100, 4800, 15, 4, false, true, false, 'UN'),
    (p_piedras_sanitarias, v_kiosco_id, cat_higiene, '7791234005049', 'Piedras Sanitarias Absorbentes para Gatos Bolsa 4 kg', 2200, 3500, 60, 15, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_higiene, '7791234005056', 'Toallitas Húmedas para Patas y Pelaje Paquete x 40', 1800, 2800, 35, 8, false, true, false, 'UN');

  -- --- 7.6 PASEO, COLLARES Y CORREAS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (gen_random_uuid(), v_kiosco_id, cat_paseo, '7791234006015', 'Pretal Antitirones Reforzado Talle M Regulable', 5800, 8900, 15, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_paseo, '7791234006022', 'Correa Retráctil 5 Metros para Perro hasta 20 kg', 7200, 11000, 12, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_paseo, '7791234006039', 'Collar Nylon Reforzado con Hebilla Metálica Talle L', 3200, 5000, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_paseo, '7791234006046', 'Chapita Identificatoria Huellita Grabada', 1500, 2500, 40, 10, false, true, false, 'UN');

  -- --- 7.7 JUGUETES Y RASCADORES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_pelota_mordillo, v_kiosco_id, cat_juguetes, '7791234007012', 'Pelota Maciza de Caucho con Púas Masajeadoras', 1900, 3000, 35, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_juguetes, '7791234007029', 'Cuerda Trenzada con Doble Nudo Grande para Morder', 2200, 3500, 25, 6, false, true, false, 'UN'),
    (p_rascador_carton, v_kiosco_id, cat_juguetes, '7791234007036', 'Rascador de Cartón Prensado Ondulado con Catnip', 2800, 4400, 20, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_juguetes, '7791234007043', 'Cañita con Plumas y Cascabel para Gatos', 1400, 2300, 30, 8, false, true, false, 'UN');

  -- --- 7.8 PREMIOS Y SNACKS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_snack_dentastix, v_kiosco_id, cat_snacks, '7791234008019', 'Snack Dental Pedigree Dentastix Razas Medianas x 3 u', 1800, 2800, 45, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_snacks, '7791234008026', 'Golocan Bocaditos Blandos Carne y Pollo 100 g', 1200, 1900, 50, 12, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_snacks, '7791234008033', 'Snack Cremoso Churu para Gatos Atún x 4 tubos', 2900, 4500, 30, 8, true, true, false, 'UN');

  -- --- 7.9 SERVICIOS VETERINARIOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (gen_random_uuid(), v_kiosco_id, cat_servicios, 'VET-SER-001', 'Consulta Médica Veterinaria General', 0, 15000, 9999, 1, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_servicios, 'VET-SER-002', 'Vacunación Séxtuple Canina con Certificado', 5000, 18000, 9999, 1, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_servicios, 'VET-SER-003', 'Vacunación Antirrábica Oficial', 2000, 9000, 9999, 1, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_servicios, 'VET-SER-004', 'Servicio de Baño y Deslanado Canino', 3000, 14000, 9999, 1, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_servicios, 'VET-SER-005', 'Corte Higiénico y Peluquería Canina', 3500, 18000, 9999, 1, false, true, false, 'UN');

  -- 8. PRODUCTOS TIPO COMBO (ES_COMBO = TRUE)
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida, es_combo) VALUES
    (p_combo_cachorro_full, v_kiosco_id, cat_combos, 'COMBO-CACHORRO-FULL', 'Combo Cachorro Protegido (Dog Chow 3kg + Pipeta Power + Pelota Mordillo)', 17300, 23000, 999, 1, true, true, false, 'UN', true),
    (p_combo_spa_canino, v_kiosco_id, cat_combos, 'COMBO-SPA-CANINO', 'Combo Spa Canino (Shampoo Osspret 250ml + Cardina Mediana + Dentastix x3)', 7900, 10500, 999, 1, true, true, false, 'UN', true),
    (p_combo_gatito_feliz, v_kiosco_id, cat_combos, 'COMBO-GATITO-FELIZ', 'Combo Gatito Consentido (Cat Chow 3kg + Piedras 4kg + Rascador Cartón + Sobre Whiskas)', 17200, 23000, 999, 1, true, true, false, 'UN', true),
    (p_combo_proteccion_total, v_kiosco_id, cat_combos, 'COMBO-PROTECCION-TOTAL', 'Combo Protección Total (Pastilla Nexgard Spectra + Shampoo Pulguicida Osspret)', 18000, 24000, 999, 1, true, true, false, 'UN', true);

  -- 9. COMPONENTES DE CADA COMBO
  -- Combo Cachorro Protegido
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_cachorro_full, p_dogchow_cachorro_3k, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_cachorro_full, p_pipeta_power, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_cachorro_full, p_pelota_mordillo, 1);

  -- Combo Spa Canino
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_spa_canino, p_shampoo_osspret, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_spa_canino, p_cardina, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_spa_canino, p_snack_dentastix, 1);

  -- Combo Gatito Consentido
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_gatito_feliz, p_catchow_adulto_3k, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_gatito_feliz, p_piedras_sanitarias, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_gatito_feliz, p_rascador_carton, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_gatito_feliz, p_whiskas_sobre, 1);

  -- Combo Protección Total
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_proteccion_total, p_nexgard_10_20k, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_proteccion_total, p_shampoo_osspret, 1);

  -- 10. CREAR PROMOCIONES AUTOMÁTICAS
  INSERT INTO public.promociones (
    id, kiosco_id, nombre, tipo, producto_id, cantidad_minima, cantidad_paga, descuento_porcentaje, precio_unitario_promo, activo
  ) VALUES
    -- 2x1 en Sobres Whiskas Salmón
    (gen_random_uuid(), v_kiosco_id, 'Promo 2x1 en Sobres Whiskas', 'NXM', p_whiskas_sobre, 2, 1, NULL, NULL, true),
    -- 15% OFF en Piedras Sanitarias llevando 2 o más
    (gen_random_uuid(), v_kiosco_id, '15% OFF Piedras Sanitarias (Llevando 2+)', 'PORCENTAJE', p_piedras_sanitarias, 2, NULL, 15, NULL, true),
    -- 2da unidad al 50% en Snacks Dentastix (25% acumulado)
    (gen_random_uuid(), v_kiosco_id, '2da al 50% en Dentastix Mediano', 'PORCENTAJE', p_snack_dentastix, 2, NULL, 25, NULL, true);

  -- 11. INICIALIZAR CAJA CON FONDO INICIAL ($25.000)
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

  RAISE NOTICE '¡Veterinaria y Pet Shop Huellas creada con éxito! Kiosco ID: %', v_kiosco_id;

END;
$$;
