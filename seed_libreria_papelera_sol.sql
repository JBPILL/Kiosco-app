-- ==============================================================================
-- SEED COMPLETO: LIBRERÍA Y PAPELERA SOL - KIOSKOPOS
-- ==============================================================================
-- Ejecutá este script en el SQL Editor de tu panel de Supabase.
-- Genera un comercio tipo LIBRERÍA con catálogo integral:
--   1. Cuadernos y Carpetas (Rivadavia, Éxito, Gloria, carpetas N°3/N°6)
--   2. Útiles Escolares (reglas, compás, escuadra, goma, sacapuntas, tijera)
--   3. Escritura (biromes, marcadores, resaltadores, corrector, lápices)
--   4. Papelería y Hojas (resmas A4, cartulinas, papel glasé, sobres, afiche)
--   5. Arte y Manualidades (témpera, acuarela, pincel, plastilina, goma eva)
--   6. Tecnología y Accesorios (pendrives, auriculares, mouse, cables, pilas)
--   7. Cartuchería e Impresión (cartuchos HP, Epson, toner, hojas foto)
--   8. Mochilas y Accesorios (mochilas, cartucheras, luncheras, set escolar)
--   9. Combos listos para el Punto de Venta
--  10. Promociones automáticas
--  11. Usuario de Acceso Demo listo:
--      Email: libreria.sol.demo@gmail.com
--      Clave: LibreriaSol2026!
-- ==============================================================================

-- Limpiar demo previa si ya existiera para evitar duplicados
DO $$
DECLARE
  v_old_kiosco_id UUID;
BEGIN
  SELECT id INTO v_old_kiosco_id FROM public.kioscos WHERE nombre = 'Librería y Papelera Sol' LIMIT 1;
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
  cat_cuadernos UUID := gen_random_uuid();
  cat_utiles UUID := gen_random_uuid();
  cat_escritura UUID := gen_random_uuid();
  cat_papeleria UUID := gen_random_uuid();
  cat_arte UUID := gen_random_uuid();
  cat_tecnologia UUID := gen_random_uuid();
  cat_cartucheria UUID := gen_random_uuid();
  cat_mochilas UUID := gen_random_uuid();
  cat_combos UUID := gen_random_uuid();

  -- IDs de productos clave para combos y promociones
  -- Cuadernos
  p_cuad_riv_48 UUID := gen_random_uuid();
  p_cuad_riv_98 UUID := gen_random_uuid();
  p_cuad_glo_48 UUID := gen_random_uuid();
  p_cuad_espiral_80 UUID := gen_random_uuid();
  p_carpeta_n3 UUID := gen_random_uuid();
  p_carpeta_n6 UUID := gen_random_uuid();

  -- Útiles Escolares
  p_regla_20 UUID := gen_random_uuid();
  p_compas UUID := gen_random_uuid();
  p_escuadra UUID := gen_random_uuid();
  p_goma_faber UUID := gen_random_uuid();
  p_sacapuntas UUID := gen_random_uuid();
  p_tijera_escolar UUID := gen_random_uuid();
  p_plasticola UUID := gen_random_uuid();
  p_voligoma UUID := gen_random_uuid();

  -- Escritura
  p_bic_cristal UUID := gen_random_uuid();
  p_bic_azul UUID := gen_random_uuid();
  p_lapiz_hb UUID := gen_random_uuid();
  p_marcador_edding UUID := gen_random_uuid();
  p_resaltador UUID := gen_random_uuid();
  p_corrector_liquid UUID := gen_random_uuid();
  p_lapices_12 UUID := gen_random_uuid();
  p_fibras_12 UUID := gen_random_uuid();

  -- Papelería
  p_resma_a4 UUID := gen_random_uuid();
  p_cartulina UUID := gen_random_uuid();
  p_papel_glase UUID := gen_random_uuid();
  p_afiche UUID := gen_random_uuid();
  p_sobre_manila UUID := gen_random_uuid();

  -- Arte
  p_tempera_6 UUID := gen_random_uuid();
  p_acuarela_12 UUID := gen_random_uuid();
  p_pincel_set UUID := gen_random_uuid();
  p_plastilina UUID := gen_random_uuid();
  p_goma_eva UUID := gen_random_uuid();

  -- Tecnología
  p_pendrive_32 UUID := gen_random_uuid();
  p_auriculares UUID := gen_random_uuid();
  p_mouse UUID := gen_random_uuid();
  p_pilas_aa UUID := gen_random_uuid();
  p_cable_usbc UUID := gen_random_uuid();

  -- Cartuchería
  p_cartucho_hp664 UUID := gen_random_uuid();
  p_cartucho_epson UUID := gen_random_uuid();
  p_toner_hp UUID := gen_random_uuid();
  p_hojas_foto UUID := gen_random_uuid();

  -- Mochilas
  p_mochila_escolar UUID := gen_random_uuid();
  p_cartuchera UUID := gen_random_uuid();
  p_lunchera UUID := gen_random_uuid();

  -- IDs de combos
  p_combo_vuelta_clases UUID := gen_random_uuid();
  p_combo_escritorio UUID := gen_random_uuid();
  p_combo_arte_kids UUID := gen_random_uuid();
  p_combo_impresion UUID := gen_random_uuid();
  p_combo_escolar_completo UUID := gen_random_uuid();

BEGIN

  -- 1. IDENTIFICAR O ASOCIAR AUTH USER ID
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = 'libreria.sol.demo@gmail.com'
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := 'b1bd2139-9ef4-55b3-a4e8-d3a26c6e9423'::UUID;
  END IF;

  -- Auto-confirmar el email del usuario demo
  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE email = 'libreria.sol.demo@gmail.com';

  -- 2. BUSCAR O ASIGNAR PLAN ACTIVO
  SELECT id INTO v_plan_id
  FROM public.planes
  WHERE nombre != '__CONFIG_SISTEMA__' AND activo = true
  ORDER BY precio_mensual DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.planes (id, nombre, precio_mensual, max_usuarios, descripcion, activo)
    VALUES (gen_random_uuid(), 'Plan Librería Pro', 50000, 5, 'Plan completo para librerías con POS, combos y reportes', true)
    RETURNING id INTO v_plan_id;
  END IF;

  -- 3. CREAR KIOSCO (tipo librería)
  INSERT INTO public.kioscos (
    id, nombre, direccion, telefono, estado_suscripcion, fecha_creacion, rubro
  ) VALUES (
    v_kiosco_id,
    'Librería y Papelera Sol',
    'Av. 9 de Julio 835, Corrientes Capital',
    '3794562810',
    'ACTIVO',
    now(),
    'FOTOCOPIADORA_LIBRERIA'
  );

  -- 4. VINCULAR USUARIO DUEÑO
  DELETE FROM public.usuarios WHERE auth_user_id = v_auth_user_id;
  INSERT INTO public.usuarios (
    id, auth_user_id, kiosco_id, nombre, email, rol, activo, es_superadmin
  ) VALUES (
    v_usuario_id,
    v_auth_user_id,
    v_kiosco_id,
    'Lucía Fernández (Dueña)',
    'libreria.sol.demo@gmail.com',
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

  -- 6. CREAR CATEGORÍAS DE LA LIBRERÍA
  INSERT INTO public.categorias (id, kiosco_id, nombre, color, orden) VALUES
    (cat_combos, v_kiosco_id, 'Combos y Promociones', '#8b5cf6', 1),
    (cat_cuadernos, v_kiosco_id, 'Cuadernos y Carpetas', '#3b82f6', 2),
    (cat_utiles, v_kiosco_id, 'Útiles Escolares', '#10b981', 3),
    (cat_escritura, v_kiosco_id, 'Escritura', '#f59e0b', 4),
    (cat_papeleria, v_kiosco_id, 'Papelería y Hojas', '#6366f1', 5),
    (cat_arte, v_kiosco_id, 'Arte y Manualidades', '#ec4899', 6),
    (cat_tecnologia, v_kiosco_id, 'Tecnología y Accesorios', '#06b6d4', 7),
    (cat_cartucheria, v_kiosco_id, 'Cartuchería e Impresión', '#64748b', 8),
    (cat_mochilas, v_kiosco_id, 'Mochilas y Accesorios', '#f97316', 9);

  -- 7. INSERTAR CATÁLOGO DE PRODUCTOS

  -- --- 7.1 CUADERNOS Y CARPETAS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_cuad_riv_48, v_kiosco_id, cat_cuadernos, '7790001000010', 'Cuaderno Rivadavia Tapa Dura 48 Hojas Rayado', 1800, 2800, 60, 15, true, true, false, 'UN'),
    (p_cuad_riv_98, v_kiosco_id, cat_cuadernos, '7790001000027', 'Cuaderno Rivadavia Tapa Dura 98 Hojas Rayado', 2600, 4000, 45, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000034', 'Cuaderno Rivadavia Tapa Dura 48 Hojas Cuadriculado', 1800, 2800, 55, 12, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000041', 'Cuaderno Rivadavia Tapa Dura 98 Hojas Cuadriculado', 2600, 4000, 40, 10, false, true, false, 'UN'),
    (p_cuad_glo_48, v_kiosco_id, cat_cuadernos, '7790001000058', 'Cuaderno Gloria Tapa Flexible 48 Hojas Rayado', 1200, 1900, 80, 20, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000065', 'Cuaderno Gloria Tapa Flexible 84 Hojas Rayado', 1700, 2600, 50, 12, false, true, false, 'UN'),
    (p_cuad_espiral_80, v_kiosco_id, cat_cuadernos, '7790001000072', 'Cuaderno Éxito Espiral Universitario 80 Hojas', 2200, 3500, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000089', 'Cuaderno Éxito Espiral Universitario 120 Hojas', 3000, 4800, 30, 8, false, true, false, 'UN'),
    (p_carpeta_n3, v_kiosco_id, cat_cuadernos, '7790001000096', 'Carpeta Escolar N°3 con Ganchos Avios', 3500, 5500, 35, 8, true, true, false, 'UN'),
    (p_carpeta_n6, v_kiosco_id, cat_cuadernos, '7790001000102', 'Carpeta N°6 Oficio Fibra Negra con Ganchos', 5200, 8000, 25, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000119', 'Repuesto Hojas Rivadavia N°3 Rayadas x 480 Hojas', 2800, 4200, 30, 6, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000126', 'Repuesto Hojas N°3 Cuadriculadas x 480 Hojas', 2800, 4200, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cuadernos, '7790001000133', 'Cuaderno de Comunicaciones Éxito', 1400, 2200, 40, 10, false, true, false, 'UN');

  -- --- 7.2 ÚTILES ESCOLARES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_regla_20, v_kiosco_id, cat_utiles, '7790002000019', 'Regla Plástica Transparente 20 cm Maped', 450, 700, 80, 20, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_utiles, '7790002000026', 'Regla Plástica Transparente 30 cm Maped', 550, 850, 60, 15, false, true, false, 'UN'),
    (p_compas, v_kiosco_id, cat_utiles, '7790002000033', 'Compás Escolar Metálico Pizzini c/Lápiz', 2200, 3500, 30, 8, true, true, false, 'UN'),
    (p_escuadra, v_kiosco_id, cat_utiles, '7790002000040', 'Juego de Geometría Maped (Escuadra + Transportador + Regla)', 1800, 2900, 25, 6, true, true, false, 'UN'),
    (p_goma_faber, v_kiosco_id, cat_utiles, '7790002000057', 'Goma de Borrar Faber-Castell Dust Free', 320, 500, 100, 25, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_utiles, '7790002000064', 'Goma de Borrar Pelikan WS30 Blanca', 250, 400, 80, 20, false, true, false, 'UN'),
    (p_sacapuntas, v_kiosco_id, cat_utiles, '7790002000071', 'Sacapuntas Metálico Simball Simple', 300, 500, 90, 20, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_utiles, '7790002000088', 'Sacapuntas con Depósito Maped Doble', 800, 1300, 40, 10, false, true, false, 'UN'),
    (p_tijera_escolar, v_kiosco_id, cat_utiles, '7790002000095', 'Tijera Escolar Punta Redonda 13 cm Maped', 1200, 1900, 35, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_utiles, '7790002000101', 'Tijera Multiuso Adulto 21 cm Pizzini', 2500, 3800, 20, 5, false, true, false, 'UN'),
    (p_plasticola, v_kiosco_id, cat_utiles, '7790002000118', 'Adhesivo Vinílico Plasticola 40g', 450, 700, 70, 15, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_utiles, '7790002000125', 'Adhesivo Vinílico Plasticola 250g', 1200, 1900, 30, 8, false, true, false, 'UN'),
    (p_voligoma, v_kiosco_id, cat_utiles, '7790002000132', 'Voligoma Transparente 30 ml', 350, 550, 60, 15, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_utiles, '7790002000149', 'Cinta Scotch Transparente 12mm x 25m', 500, 800, 50, 12, false, true, false, 'UN');

  -- --- 7.3 ESCRITURA ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_bic_cristal, v_kiosco_id, cat_escritura, '7790003000018', 'Bolígrafo BIC Cristal Azul Punta Media', 350, 550, 120, 30, true, true, false, 'UN'),
    (p_bic_azul, v_kiosco_id, cat_escritura, '7790003000025', 'Bolígrafo BIC Cristal Negro Punta Media', 350, 550, 100, 25, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000032', 'Bolígrafo BIC Cristal Rojo Punta Media', 350, 550, 60, 15, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000049', 'Bolígrafo Simball Trimax x 1 Azul', 250, 400, 80, 20, false, true, false, 'UN'),
    (p_lapiz_hb, v_kiosco_id, cat_escritura, '7790003000056', 'Lápiz Grafito HB N°2 Faber-Castell c/Goma', 280, 450, 100, 25, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000063', 'Lápiz Grafito 2B Staedtler Noris', 350, 550, 60, 15, false, true, false, 'UN'),
    (p_marcador_edding, v_kiosco_id, cat_escritura, '7790003000070', 'Marcador Permanente Edding 400 Negro', 1200, 1900, 40, 10, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000087', 'Marcador Pizarra Blanca Edding 660 Negro', 1400, 2200, 30, 8, false, true, false, 'UN'),
    (p_resaltador, v_kiosco_id, cat_escritura, '7790003000094', 'Resaltador Filgo Textliner Amarillo', 600, 950, 50, 12, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000100', 'Resaltador Filgo Textliner Verde', 600, 950, 40, 10, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000117', 'Resaltador Filgo Textliner Rosa', 600, 950, 40, 10, false, true, false, 'UN'),
    (p_corrector_liquid, v_kiosco_id, cat_escritura, '7790003000124', 'Corrector Líquido Liquid Paper 20 ml', 850, 1350, 35, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000131', 'Corrector en Cinta Paper Mate 5mm x 6m', 1100, 1700, 25, 6, false, true, false, 'UN'),
    (p_lapices_12, v_kiosco_id, cat_escritura, '7790003000148', 'Lápices de Colores Faber-Castell x 12 Largos', 2800, 4500, 35, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000155', 'Lápices de Colores Faber-Castell x 24 Largos', 5200, 8000, 20, 5, false, true, false, 'UN'),
    (p_fibras_12, v_kiosco_id, cat_escritura, '7790003000162', 'Fibras Filgo Peps x 12 Colores Punta Fina', 2500, 4000, 30, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_escritura, '7790003000179', 'Fibras Edding Funtastics x 10 Colores', 3200, 5000, 20, 5, false, true, false, 'UN');

  -- --- 7.4 PAPELERÍA Y HOJAS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_resma_a4, v_kiosco_id, cat_papeleria, '7790004000017', 'Resma A4 Autor 75g 500 Hojas', 5500, 8500, 40, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_papeleria, '7790004000024', 'Resma A4 Ledesma 80g 500 Hojas', 6200, 9500, 30, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_papeleria, '7790004000031', 'Resma Oficio Autor 75g 500 Hojas', 6000, 9200, 20, 5, false, true, false, 'UN'),
    (p_cartulina, v_kiosco_id, cat_papeleria, '7790004000048', 'Cartulina Color Surtido 50x65 cm (unidad)', 180, 300, 200, 40, true, true, false, 'UN'),
    (p_papel_glase, v_kiosco_id, cat_papeleria, '7790004000055', 'Papel Glasé 10x10 cm x 100 Hojas Surtidas', 600, 950, 40, 10, true, true, false, 'UN'),
    (p_afiche, v_kiosco_id, cat_papeleria, '7790004000062', 'Afiche Liso Color 70x100 cm (unidad)', 250, 400, 150, 30, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_papeleria, '7790004000079', 'Papel Crepé Color 50x200 cm (unidad)', 350, 550, 80, 15, false, true, false, 'UN'),
    (p_sobre_manila, v_kiosco_id, cat_papeleria, '7790004000086', 'Sobre Manila Oficio Marrón (x 10 unidades)', 800, 1300, 30, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_papeleria, '7790004000093', 'Papel Contac Transparente Autoadhesivo Rollo 1m', 1800, 2800, 20, 5, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_papeleria, '7790004000109', 'Block de Dibujo Canson N°5 x 20 Hojas Blancas', 1200, 1900, 35, 8, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_papeleria, '7790004000116', 'Block de Dibujo Canson N°6 x 20 Hojas Blancas', 1500, 2400, 25, 6, false, true, false, 'UN');

  -- --- 7.5 ARTE Y MANUALIDADES ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_tempera_6, v_kiosco_id, cat_arte, '7790005000016', 'Témperas Alba x 6 Colores Básicos (8ml c/u)', 2200, 3500, 30, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_arte, '7790005000023', 'Témperas Alba x 12 Colores (8ml c/u)', 4200, 6500, 20, 5, false, true, false, 'UN'),
    (p_acuarela_12, v_kiosco_id, cat_arte, '7790005000030', 'Acuarelas Escolares Alba x 12 Pastillas + Pincel', 2800, 4500, 25, 6, true, true, false, 'UN'),
    (p_pincel_set, v_kiosco_id, cat_arte, '7790005000047', 'Set de Pinceles Escolares Condor x 6 Surtidos', 1800, 2800, 20, 5, true, true, false, 'UN'),
    (p_plastilina, v_kiosco_id, cat_arte, '7790005000054', 'Plastilina Simball x 12 Barras Colores Surtidos', 1500, 2400, 30, 8, true, true, false, 'UN'),
    (p_goma_eva, v_kiosco_id, cat_arte, '7790005000061', 'Goma Eva Lisa Color 40x60 cm (unidad)', 400, 650, 100, 20, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_arte, '7790005000078', 'Goma Eva con Glitter 40x60 cm (unidad)', 650, 1000, 60, 12, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_arte, '7790005000085', 'Masa para Modelar DAS Blanca 500g', 2800, 4500, 15, 4, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_arte, '7790005000092', 'Crayones de Cera Jovi x 12 Colores', 1800, 2900, 25, 6, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_arte, '7790005000108', 'Tiza Blanca Escolar Caja x 12', 500, 800, 40, 10, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_arte, '7790005000115', 'Tiza Color Surtida Caja x 12', 650, 1000, 35, 8, false, true, false, 'UN');

  -- --- 7.6 TECNOLOGÍA Y ACCESORIOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_pendrive_32, v_kiosco_id, cat_tecnologia, '7790006000015', 'Pendrive Kingston 32 GB USB 3.0', 5500, 8500, 15, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000022', 'Pendrive Kingston 64 GB USB 3.0', 8000, 12500, 10, 2, false, true, false, 'UN'),
    (p_auriculares, v_kiosco_id, cat_tecnologia, '7790006000039', 'Auriculares In-Ear con Micrófono Noga', 2200, 3500, 20, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000046', 'Auriculares Vincha On-Ear Noga NG-X10', 5800, 9000, 10, 3, false, true, false, 'UN'),
    (p_mouse, v_kiosco_id, cat_tecnologia, '7790006000053', 'Mouse Óptico USB Logitech M90', 6500, 10000, 12, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000060', 'Mouse Inalámbrico Logitech M185', 10000, 15500, 8, 2, false, true, false, 'UN'),
    (p_pilas_aa, v_kiosco_id, cat_tecnologia, '7790006000077', 'Pilas Duracell AA x 4 Unidades', 2200, 3500, 30, 8, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000084', 'Pilas Duracell AAA x 4 Unidades', 2200, 3500, 25, 6, false, true, false, 'UN'),
    (p_cable_usbc, v_kiosco_id, cat_tecnologia, '7790006000091', 'Cable USB-C a USB-C 1 metro', 2500, 3800, 15, 4, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000107', 'Cable Lightning a USB-A 1 metro', 2800, 4200, 12, 3, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000114', 'Calculadora Científica Casio FX-82LA X', 18000, 28000, 8, 2, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_tecnologia, '7790006000121', 'Calculadora de Escritorio Casio MX-12B', 8500, 13000, 10, 3, false, true, false, 'UN');

  -- --- 7.7 CARTUCHERÍA E IMPRESIÓN ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_cartucho_hp664, v_kiosco_id, cat_cartucheria, '7790007000014', 'Cartucho HP 664 Negro Original', 8500, 13000, 10, 2, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cartucheria, '7790007000021', 'Cartucho HP 664 Tricolor Original', 9500, 14500, 8, 2, false, true, false, 'UN'),
    (p_cartucho_epson, v_kiosco_id, cat_cartucheria, '7790007000038', 'Tinta Epson T544 Negro 65ml Original', 5500, 8500, 12, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cartucheria, '7790007000045', 'Tinta Epson T544 Cyan 65ml Original', 5500, 8500, 8, 2, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cartucheria, '7790007000052', 'Tinta Epson T544 Magenta 65ml Original', 5500, 8500, 8, 2, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cartucheria, '7790007000069', 'Tinta Epson T544 Yellow 65ml Original', 5500, 8500, 8, 2, false, true, false, 'UN'),
    (p_toner_hp, v_kiosco_id, cat_cartucheria, '7790007000076', 'Toner HP 85A Negro Original CE285A', 32000, 48000, 5, 1, true, true, false, 'UN'),
    (p_hojas_foto, v_kiosco_id, cat_cartucheria, '7790007000083', 'Papel Fotográfico Glossy A4 200g x 20 Hojas', 2800, 4500, 20, 5, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_cartucheria, '7790007000090', 'Papel Fotográfico Glossy 10x15 cm x 100 Hojas', 3500, 5500, 15, 3, false, true, false, 'UN');

  -- --- 7.8 MOCHILAS Y ACCESORIOS ---
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida) VALUES
    (p_mochila_escolar, v_kiosco_id, cat_mochilas, '7790008000013', 'Mochila Escolar 17" Totto Diseño Clásico', 22000, 35000, 12, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_mochilas, '7790008000020', 'Mochila Escolar 16" Top3 con Carro', 28000, 42000, 8, 2, false, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_mochilas, '7790008000037', 'Mochila Escolar Jardín 12" con Diseño Infantil', 12000, 19000, 10, 3, false, true, false, 'UN'),
    (p_cartuchera, v_kiosco_id, cat_mochilas, '7790008000044', 'Cartuchera 2 Pisos con Cierre Totto', 6500, 10000, 15, 4, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_mochilas, '7790008000051', 'Cartuchera de Tela Simple 1 Cierre', 2500, 4000, 25, 6, false, true, false, 'UN'),
    (p_lunchera, v_kiosco_id, cat_mochilas, '7790008000068', 'Lunchera Térmica con Cierre y Asa', 5800, 9000, 10, 3, true, true, false, 'UN'),
    (gen_random_uuid(), v_kiosco_id, cat_mochilas, '7790008000075', 'Botella de Agua Escolar 500ml con Pico', 3200, 5000, 15, 4, false, true, false, 'UN');

  -- 8. PRODUCTOS TIPO COMBO (ES_COMBO = TRUE)
  INSERT INTO public.productos (id, kiosco_id, categoria_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida, es_combo) VALUES
    (p_combo_vuelta_clases, v_kiosco_id, cat_combos, 'COMBO-VUELTA-CLASES', 'Combo Vuelta a Clases (Cuaderno Riv 48h + Lápices x12 + Goma + Sacapuntas + Plasticola)', 5650, 7500, 999, 1, true, true, false, 'UN', true),
    (p_combo_escritorio, v_kiosco_id, cat_combos, 'COMBO-ESCRITORIO', 'Combo Escritorio (Resma A4 + 3 BIC Cristal + Resaltador + Corrector)', 7250, 9500, 999, 1, true, true, false, 'UN', true),
    (p_combo_arte_kids, v_kiosco_id, cat_combos, 'COMBO-ARTE-KIDS', 'Combo Arte Kids (Témperas x6 + Pinceles x6 + Papel Glasé)', 6100, 8000, 999, 1, true, true, false, 'UN', true),
    (p_combo_impresion, v_kiosco_id, cat_combos, 'COMBO-IMPRESION', 'Combo Impresión (Cartucho HP664 Negro + Resma A4 + Hojas Foto)', 16800, 22000, 999, 1, true, true, false, 'UN', true),
    (p_combo_escolar_completo, v_kiosco_id, cat_combos, 'COMBO-ESCOLAR-FULL', 'Combo Escolar Completo (Mochila + Cartuchera + Cuaderno Riv 98h + Lápices x12 + Fibras x12)', 35700, 45000, 999, 1, true, true, false, 'UN', true);

  -- 9. COMPONENTES DE CADA COMBO
  -- Combo Vuelta a Clases: 1 Cuaderno Riv 48h + 1 Lápices x12 + 1 Goma + 1 Sacapuntas + 1 Plasticola
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_vuelta_clases, p_cuad_riv_48, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_vuelta_clases, p_lapices_12, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_vuelta_clases, p_goma_faber, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_vuelta_clases, p_sacapuntas, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_vuelta_clases, p_plasticola, 1);

  -- Combo Escritorio: 1 Resma A4 + 3 BIC Cristal + 1 Resaltador + 1 Corrector
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_escritorio, p_resma_a4, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_escritorio, p_bic_cristal, 3),
    (gen_random_uuid(), v_kiosco_id, p_combo_escritorio, p_resaltador, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_escritorio, p_corrector_liquid, 1);

  -- Combo Arte Kids: 1 Témperas x6 + 1 Set Pinceles + 1 Papel Glasé
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_arte_kids, p_tempera_6, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_arte_kids, p_pincel_set, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_arte_kids, p_papel_glase, 1);

  -- Combo Impresión: 1 Cartucho HP664 + 1 Resma A4 + 1 Hojas Foto
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_impresion, p_cartucho_hp664, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_impresion, p_resma_a4, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_impresion, p_hojas_foto, 1);

  -- Combo Escolar Completo: 1 Mochila + 1 Cartuchera + 1 Cuaderno Riv 98h + 1 Lápices x12 + 1 Fibras x12
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_escolar_completo, p_mochila_escolar, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_escolar_completo, p_cartuchera, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_escolar_completo, p_cuad_riv_98, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_escolar_completo, p_lapices_12, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_escolar_completo, p_fibras_12, 1);

  -- 10. CREAR PROMOCIONES AUTOMÁTICAS
  INSERT INTO public.promociones (
    id, kiosco_id, nombre, tipo, producto_id, cantidad_minima, cantidad_paga, descuento_porcentaje, precio_unitario_promo, activo
  ) VALUES
    -- 2x1 en Bolígrafos BIC Cristal Azul
    (gen_random_uuid(), v_kiosco_id, 'Promo 2x1 BIC Cristal Azul', 'NXM', p_bic_cristal, 2, 1, NULL, NULL, true),
    -- 2da unidad al 50% en Cuaderno Gloria 48h (descuento acumulado 25%)
    (gen_random_uuid(), v_kiosco_id, '2da al 50% Cuaderno Gloria 48h', 'PORCENTAJE', p_cuad_glo_48, 2, NULL, 25, NULL, true),
    -- 10% OFF en Resma A4 llevando 3+
    (gen_random_uuid(), v_kiosco_id, '10% OFF Resma A4 (Llevando 3+)', 'PORCENTAJE', p_resma_a4, 3, NULL, 10, NULL, true),
    -- Promo 3 Cartulinas x $700 ($233 c/u en vez de $300)
    (gen_random_uuid(), v_kiosco_id, 'Promo 3 Cartulinas x $700', 'VOLUMEN', p_cartulina, 3, NULL, NULL, 233.33, true),
    -- 15% OFF en Goma Eva llevando 5+
    (gen_random_uuid(), v_kiosco_id, '15% OFF Goma Eva (Llevando 5+)', 'PORCENTAJE', p_goma_eva, 5, NULL, 15, NULL, true);

  -- 11. INICIALIZAR CAJA CON FONDO INICIAL
  IF to_regclass('public.sesiones_caja') IS NOT NULL THEN
    INSERT INTO public.sesiones_caja (
      id, kiosco_id, usuario_id, monto_inicial, fecha_apertura, estado
    ) VALUES (
      gen_random_uuid(),
      v_kiosco_id,
      v_usuario_id,
      15000,
      now(),
      'ABIERTA'
    );
  END IF;

  RAISE NOTICE '¡Librería y Papelera Sol creada con éxito! Kiosco ID: %', v_kiosco_id;

END;
$$;
