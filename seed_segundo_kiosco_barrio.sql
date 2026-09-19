-- ==============================================================================
-- SEED COMPLETO: SEGUNDO KIOSCO DE BARRIO ("SAN CAYETANO") - KIOSKOPOS
-- ==============================================================================
-- Ejecutá este script en el SQL Editor de tu panel de Supabase.
-- Genera un comercio completo con catálogo integral y todas las opciones activas:
-- 1. Kiosco & Almacén de Barrio "San Cayetano"
-- 2. Envases Retornables (Cerveza Quilmes 1L, Coca 1.5L Vidrio, Sifón de soda, etc.)
-- 3. Productos Perecederos con Alertas Preventivas (sándwiches, lácteos, prepizzas)
-- 4. Semáforo de Lotes de Vencimiento (vencidos, críticos, próximos y vigentes)
-- 5. Productos Pesables de Balanza (Queso cremoso, jamón, salame, pan francés, con PLU)
-- 6. Golosinas, alfajores y cigarrillos con códigos de barras y favoritos
-- 7. Combos integrados con ingredientes automáticos en combo_items
-- 8. Promociones automáticas (2x1, 2da al 50%, volumen)
-- 9. Directorio de Proveedores con deudas de compras y visitas
-- 10. Clientes de Barrio con cuentas corrientes (fiado, límite y saldos deudores)
-- 11. Turno de Caja Abierto con fondo de $30.000 listo para vender
--
-- Credenciales de Acceso:
-- Email: kioscodebarrio.demo@gmail.com
-- Clave: KioskoDemo2026!
-- ==============================================================================

-- 1. Limpiar demo previa si ya existiera para evitar duplicados
DO $$
DECLARE
  v_old_kiosco_id UUID;
BEGIN
  SELECT id INTO v_old_kiosco_id FROM public.kioscos WHERE nombre = 'Kiosco & Almacén San Cayetano' LIMIT 1;
  IF v_old_kiosco_id IS NOT NULL THEN
    BEGIN
      PERFORM public.admin_eliminar_kiosco(v_old_kiosco_id);
    EXCEPTION WHEN OTHERS THEN
      DELETE FROM public.kioscos WHERE id = v_old_kiosco_id;
    END;
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

  -- Proveedores
  prov_quilmes UUID := gen_random_uuid();
  prov_lacteos UUID := gen_random_uuid();
  prov_arcor UUID := gen_random_uuid();
  prov_tabaco UUID := gen_random_uuid();

  -- Categorías
  cat_bebidas UUID := gen_random_uuid();
  cat_fiambreria UUID := gen_random_uuid();
  cat_golosinas UUID := gen_random_uuid();
  cat_almacen UUID := gen_random_uuid();
  cat_cigarrillos UUID := gen_random_uuid();
  cat_combos UUID := gen_random_uuid();
  cat_limpieza UUID := gen_random_uuid();

  -- IDs de Productos Clave
  p_quilmes_1l UUID := gen_random_uuid();
  p_coca_15l_vidrio UUID := gen_random_uuid();
  p_brahma_1l UUID := gen_random_uuid();
  p_sifon_soda UUID := gen_random_uuid();
  p_corona_330 UUID := gen_random_uuid();
  p_fernet_750 UUID := gen_random_uuid();
  p_coca_225 UUID := gen_random_uuid();
  p_hielo_2k UUID := gen_random_uuid();
  p_cindor_200 UUID := gen_random_uuid();

  p_sandwich_miga UUID := gen_random_uuid();
  p_yogur_frutilla UUID := gen_random_uuid();
  p_leche_sachet UUID := gen_random_uuid();
  p_prepizza UUID := gen_random_uuid();
  p_alfajor_maicena UUID := gen_random_uuid();
  p_tarta_jyq UUID := gen_random_uuid();

  p_queso_cremoso UUID := gen_random_uuid();
  p_jamon_cocido UUID := gen_random_uuid();
  p_queso_tybo UUID := gen_random_uuid();
  p_salame UUID := gen_random_uuid();
  p_pan_frances UUID := gen_random_uuid();
  p_mani_suelto UUID := gen_random_uuid();

  p_alf_capitan UUID := gen_random_uuid();
  p_alf_rasta UUID := gen_random_uuid();
  p_alf_guaymallen UUID := gen_random_uuid();
  p_lays_140 UUID := gen_random_uuid();
  p_doritos UUID := gen_random_uuid();
  p_cofler_block UUID := gen_random_uuid();
  p_pico_dulce UUID := gen_random_uuid();
  p_turron_arcor UUID := gen_random_uuid();
  p_sonrisas UUID := gen_random_uuid();
  p_beldent UUID := gen_random_uuid();

  p_marlboro_box UUID := gen_random_uuid();
  p_lucky_box UUID := gen_random_uuid();
  p_philip_box UUID := gen_random_uuid();
  p_tabaco_cerrito UUID := gen_random_uuid();
  p_papelillos_ocb UUID := gen_random_uuid();
  p_clipper UUID := gen_random_uuid();

  -- Combos
  p_combo_picada UUID := gen_random_uuid();
  p_combo_merienda UUID := gen_random_uuid();
  p_combo_sandwiches UUID := gen_random_uuid();
  p_combo_fernet UUID := gen_random_uuid();

BEGIN

  -- 1. BUSCAR O CREAR EL USUARIO AUTH
  SELECT id INTO v_auth_user_id 
  FROM auth.users 
  WHERE email = 'kioscodebarrio.demo@gmail.com' 
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_auth_user_id,
      'authenticated',
      'authenticated',
      'kioscodebarrio.demo@gmail.com',
      crypt('KioskoDemo2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nombre":"Juan Pérez"}'::jsonb,
      now(),
      now()
    );
  ELSE
    UPDATE auth.users 
    SET encrypted_password = crypt('KioskoDemo2026!', gen_salt('bf')),
        email_confirmed_at = now()
    WHERE id = v_auth_user_id;
  END IF;

  -- 2. BUSCAR O CREAR PLAN PRO
  SELECT id INTO v_plan_id 
  FROM public.planes 
  WHERE nombre != '__CONFIG_SISTEMA__' AND activo = true
  ORDER BY precio_mensual DESC 
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.planes (id, nombre, precio_mensual, max_usuarios, descripcion, activo)
    VALUES (gen_random_uuid(), 'Plan Kiosco Pro', 50000, 5, 'Plan completo con POS, combos y control de stock', true)
    RETURNING id INTO v_plan_id;
  END IF;

  -- 3. CREAR EL KIOSCO
  INSERT INTO public.kioscos (
    id, nombre, direccion, telefono, estado_suscripcion, fecha_creacion
  ) VALUES (
    v_kiosco_id,
    'Kiosco & Almacén San Cayetano',
    'Av. Belgrano 2450, Barrio Norte',
    '11 4455-6677',
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
    'Juan Pérez (Dueño)',
    'kioscodebarrio.demo@gmail.com',
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

  -- 6. CREAR PROVEEDORES DEL KIOSCO
  INSERT INTO public.proveedores (id, kiosco_id, nombre, contacto_nombre, telefono, email, cuit, dias_visita, cbu_alias, saldo_pendiente, activo) VALUES
    (prov_quilmes, v_kiosco_id, 'Distribuidora Bebidas & Cervezas del Plata', 'Roberto', '1133221100', 'pedidos@bebidasplata.com', '30-71234567-8', 'Martes y Jueves', 'DISTRIBUIDORA.PLATA', 45000, true),
    (prov_lacteos, v_kiosco_id, 'Lácteos y Fiambres San Javier', 'Marcelo', '1155442211', 'lacteos.sanjavier@gmail.com', '30-68998877-4', 'Lunes y Viernes', 'LACTEOS.SANJAVIER', 18500, true),
    (prov_arcor, v_kiosco_id, 'Arcor & Golosinas Mayorista Central', 'Esteban', '1177889900', 'ventas@arcorcentral.com', '30-50123987-9', 'Miércoles', 'ARCOR.CENTRAL.MP', 0, true),
    (prov_tabaco, v_kiosco_id, 'Tabacos y Varios del Sur', 'Darío', '1166778899', 'tabacosdelsur@gmail.com', '20-29112233-4', 'Jueves', 'TABACOS.SUR.PAGO', 12000, true);

  -- 7. CREAR CATEGORÍAS
  INSERT INTO public.categorias (id, kiosco_id, nombre, color, orden) VALUES
    (cat_combos, v_kiosco_id, 'Combos del Kiosco', '#8b5cf6', 1),
    (cat_bebidas, v_kiosco_id, 'Bebidas y Cervezas (Retornables)', '#3b82f6', 2),
    (cat_fiambreria, v_kiosco_id, 'Fiambrería y Balanza', '#eab308', 3),
    (cat_golosinas, v_kiosco_id, 'Golosinas, Alfajores y Snacks', '#ec4899', 4),
    (cat_almacen, v_kiosco_id, 'Almacén y Panificados', '#10b981', 5),
    (cat_cigarrillos, v_kiosco_id, 'Cigarrillos y Tabaco', '#64748b', 6),
    (cat_limpieza, v_kiosco_id, 'Limpieza y Kiosco Diario', '#06b6d4', 7);

  -- 8. PRODUCTOS DEL CATÁLOGO

  -- 8.1 BEBIDAS Y RETORNABLES
  INSERT INTO public.productos (
    id, kiosco_id, categoria_id, proveedor_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_retornable, precio_envase, nombre_envase
  ) VALUES
    (p_quilmes_1l, v_kiosco_id, cat_bebidas, prov_quilmes, '7792798000014', 'Cerveza Quilmes Clásica 1 Litro Vidrio', 1900, 2800, 48, 12, true, true, true, 1500, '1LT'),
    (p_coca_15l_vidrio, v_kiosco_id, cat_bebidas, prov_quilmes, '7790895000508', 'Coca-Cola Sabor Original 1.5 Lts Vidrio', 2100, 3000, 36, 10, true, true, true, 2000, '1.5LTS'),
    (p_brahma_1l, v_kiosco_id, cat_bebidas, prov_quilmes, '7792798000021', 'Cerveza Brahma Chopp 1 Litro Vidrio', 1800, 2700, 30, 8, false, true, true, 1500, '1LT'),
    (p_sifon_soda, v_kiosco_id, cat_bebidas, prov_quilmes, '7798003001008', 'Sifón de Soda Ivess 1.5 Lts Retornable', 1200, 1800, 25, 6, true, true, true, 1200, 'SIFON'),
    (p_corona_330, v_kiosco_id, cat_bebidas, prov_quilmes, '7501064191421', 'Cerveza Corona 330 ml Porrón Descartable', 1700, 2500, 40, 8, false, true, false, 0, ''),
    (p_fernet_750, v_kiosco_id, cat_bebidas, prov_quilmes, '7790950000028', 'Fernet Branca 750 ml', 10500, 14900, 20, 4, true, true, false, 0, ''),
    (p_coca_225, v_kiosco_id, cat_bebidas, prov_quilmes, '7790895000997', 'Coca-Cola Sabor Original 2.25 Lts PET', 2700, 3900, 40, 10, true, true, false, 0, ''),
    (p_hielo_2k, v_kiosco_id, cat_bebidas, prov_quilmes, '7798003000018', 'Bolsa de Hielo Rolito 2 Kg', 1000, 1600, 25, 5, false, true, false, 0, ''),
    (p_cindor_200, v_kiosco_id, cat_bebidas, prov_lacteos, '7790080010053', 'Chocolatada Cindor 200 ml con Sorbetín', 850, 1300, 35, 8, true, true, false, 0, '');

  -- 8.2 PERECEDEROS CON CONTROL DE VENCIMIENTO
  INSERT INTO public.productos (
    id, kiosco_id, categoria_id, proveedor_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, requiere_vencimiento, dias_alerta_vencimiento
  ) VALUES
    (p_sandwich_miga, v_kiosco_id, cat_almacen, prov_lacteos, '7798004000116', 'Sándwiches de Miga Triples Jamón y Queso (x 2 un)', 2200, 3200, 12, 4, true, true, true, 3),
    (p_yogur_frutilla, v_kiosco_id, cat_almacen, prov_lacteos, '7790080010046', 'Yogur Firme La Serenísima Frutilla 120g', 700, 1100, 24, 6, false, true, true, 5),
    (p_leche_sachet, v_kiosco_id, cat_almacen, prov_lacteos, '7790080010015', 'Leche Entera La Serenísima Sachet 1L', 1100, 1600, 30, 8, true, true, true, 7),
    (p_prepizza, v_kiosco_id, cat_almacen, prov_lacteos, '7798004000123', 'Prepizza Casera con Muzzarella Gratinada', 2500, 3800, 10, 3, false, true, true, 4),
    (p_alfajor_maicena, v_kiosco_id, cat_golosinas, prov_arcor, '7798004000130', 'Alfajor Artesanal de Maicena y Coco', 650, 1000, 20, 5, false, true, true, 10),
    (p_tarta_jyq, v_kiosco_id, cat_almacen, prov_lacteos, '7798004000147', 'Tarta Individual de Jamón y Queso Horneada', 2400, 3600, 8, 2, false, true, true, 3);

  -- 8.3 PESABLES / BALANZA (KG Y PLU)
  INSERT INTO public.productos (
    id, kiosco_id, categoria_id, proveedor_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_pesable, unidad_medida, plu_balanza
  ) VALUES
    (p_queso_cremoso, v_kiosco_id, cat_fiambreria, prov_lacteos, '7798004000031', 'Queso Cremoso La Paulina (Kg)', 8200, 11800, 22.5, 5, true, true, true, 'KG', '0101'),
    (p_jamon_cocido, v_kiosco_id, cat_fiambreria, prov_lacteos, '7798004000017', 'Jamón Cocido Especial Paladini (Kg)', 10500, 15200, 14.8, 3, true, true, true, 'KG', '0102'),
    (p_queso_tybo, v_kiosco_id, cat_fiambreria, prov_lacteos, '7798004000048', 'Queso Barra Tybo Fiambrero (Kg)', 9800, 13900, 18.2, 4, false, true, true, 'KG', '0103'),
    (p_salame, v_kiosco_id, cat_fiambreria, prov_lacteos, '7798004000055', 'Salame Casero Picado Fino Colonia (Kg)', 13000, 18500, 8.5, 2, false, true, true, 'KG', '0104'),
    (p_pan_frances, v_kiosco_id, cat_almacen, NULL, '7798004000154', 'Pan Francés Fresco de Panadería (Kg)', 1600, 2400, 35.0, 8, true, true, true, 'KG', '0105'),
    (p_mani_suelto, v_kiosco_id, cat_golosinas, prov_arcor, '7798004000161', 'Maní Salado Pelado Suelto (Kg)', 3500, 5200, 12.0, 3, false, true, true, 'KG', '0106');

  -- 8.4 GOLOSINAS, ALFAJORES Y SNACKS
  INSERT INTO public.productos (
    id, kiosco_id, categoria_id, proveedor_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo
  ) VALUES
    (p_alf_capitan, v_kiosco_id, cat_golosinas, prov_arcor, '7798009000018', 'Alfajor Capitán del Espacio Triple Chocolate', 950, 1400, 60, 15, true, true),
    (p_alf_rasta, v_kiosco_id, cat_golosinas, prov_arcor, '7798009000025', 'Alfajor Rasta Negro con Dulce de Leche', 1100, 1600, 50, 15, true, true),
    (p_alf_guaymallen, v_kiosco_id, cat_golosinas, prov_arcor, '7790580111205', 'Alfajor Guaymallén Triple Blanco', 500, 750, 70, 20, false, true),
    (p_lays_140, v_kiosco_id, cat_golosinas, prov_arcor, '7790310984505', 'Papas Fritas Lays Clásicas 140g', 2100, 3000, 28, 8, true, true),
    (p_doritos, v_kiosco_id, cat_golosinas, prov_arcor, '7790310984604', 'Doritos Mega Queso 130g', 2300, 3300, 22, 6, false, true),
    (p_cofler_block, v_kiosco_id, cat_golosinas, prov_arcor, '7790070031105', 'Chocolate Cofler Block con Maní 38g', 900, 1350, 45, 10, true, true),
    (p_pico_dulce, v_kiosco_id, cat_golosinas, prov_arcor, '7798009000032', 'Chupetín Pico Dulce Frutal', 180, 300, 150, 30, false, true),
    (p_turron_arcor, v_kiosco_id, cat_golosinas, prov_arcor, '7798009000049', 'Turrón Arcor Maní con Oblea 25g', 220, 350, 120, 25, false, true),
    (p_sonrisas, v_kiosco_id, cat_golosinas, prov_arcor, '7790070412102', 'Galletitas Sonrisas Frambuesa 118g', 900, 1350, 35, 8, false, true),
    (p_beldent, v_kiosco_id, cat_golosinas, prov_arcor, '7790580111502', 'Chicles Beldent Menta Fuerte 8 pastillas', 450, 650, 60, 15, false, true);

  -- 8.5 CIGARRILLOS Y TABACO
  INSERT INTO public.productos (
    id, kiosco_id, categoria_id, proveedor_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo
  ) VALUES
    (p_marlboro_box, v_kiosco_id, cat_cigarrillos, prov_tabaco, '7791234567890', 'Marlboro Red Box 20', 3100, 3800, 40, 10, true, true),
    (p_lucky_box, v_kiosco_id, cat_cigarrillos, prov_tabaco, '7791234567892', 'Lucky Strike Red Box 20', 2800, 3500, 30, 8, true, true),
    (p_philip_box, v_kiosco_id, cat_cigarrillos, prov_tabaco, '7791234567891', 'Philip Morris Box 20', 2700, 3300, 35, 8, false, true),
    (p_tabaco_cerrito, v_kiosco_id, cat_cigarrillos, prov_tabaco, '7798009000063', 'Tabaco Cerrito Rubio Fino 40g', 3200, 4500, 20, 5, false, true),
    (p_papelillos_ocb, v_kiosco_id, cat_cigarrillos, prov_tabaco, '7798009000070', 'Papelillos OCB Premium 1 1/4', 700, 1100, 50, 10, false, true),
    (p_clipper, v_kiosco_id, cat_cigarrillos, prov_tabaco, '7798009000087', 'Encendedor Clipper Recargable Clásico', 1400, 2200, 35, 8, true, true);

  -- 8.6 COMBOS (PRODUCTOS COMPUESTOS ES_COMBO = TRUE)
  INSERT INTO public.productos (
    id, kiosco_id, categoria_id, proveedor_id, codigo_barras, descripcion, precio_costo, precio_venta, stock_actual, stock_minimo, es_favorito, activo, es_combo
  ) VALUES
    (p_combo_picada, v_kiosco_id, cat_combos, NULL, 'COMBO-PICADA-VECINO', 'Combo Picada Vecinal (1 Quilmes 1L + 250g Queso Tybo + 200g Salame + 1 Papas Lays)', 8600, 10900, 999, 1, true, true, true),
    (p_combo_merienda, v_kiosco_id, cat_combos, NULL, 'COMBO-MERIENDA-ESCOLAR', 'Combo Merienda Escolar (1 Chocolatada Cindor + 1 Alfajor Capitán del Espacio)', 1800, 2400, 999, 1, true, true, true),
    (p_combo_sandwiches, v_kiosco_id, cat_combos, NULL, 'COMBO-SANDWICHES-CASEROS', 'Combo Sándwiches Caseros (1kg Pan Francés + 250g Jamón + 250g Queso Cremoso)', 6250, 8500, 999, 1, true, true, true),
    (p_combo_fernet, v_kiosco_id, cat_combos, NULL, 'COMBO-FERNET-FIESTA', 'Combo Fernet Fiesta (1 Fernet Branca 750ml + 1 Coca 2.25L + 1 Bolsa Hielo 2kg)', 14200, 18900, 999, 1, true, true, true);

  -- 9. ASOCIAR INGREDIENTES A CADA COMBO EN COMBO_ITEMS
  -- Combo Picada: 1 Quilmes 1L + 0.25kg Tybo + 0.20kg Salame + 1 Papas Lays 140g
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_quilmes_1l, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_queso_tybo, 0.25),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_salame, 0.20),
    (gen_random_uuid(), v_kiosco_id, p_combo_picada, p_lays_140, 1);

  -- Combo Merienda: 1 Cindor + 1 Capitán del Espacio
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_merienda, p_cindor_200, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_merienda, p_alf_capitan, 1);

  -- Combo Sándwiches: 1kg Pan Francés + 0.25kg Jamón Cocido + 0.25kg Queso Cremoso
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_pan_frances, 1.0),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_jamon_cocido, 0.25),
    (gen_random_uuid(), v_kiosco_id, p_combo_sandwiches, p_queso_cremoso, 0.25);

  -- Combo Fernet: 1 Fernet + 1 Coca 2.25L + 1 Hielo
  INSERT INTO public.combo_items (id, kiosco_id, combo_producto_id, componente_producto_id, cantidad) VALUES
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_fernet_750, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_coca_225, 1),
    (gen_random_uuid(), v_kiosco_id, p_combo_fernet, p_hielo_2k, 1);

  -- 10. LOTES FÍSICOS DE VENCIMIENTO (PARA ACTIVAR EL SEMÁFORO DE VENCIMIENTOS)
  IF to_regclass('public.lotes_producto') IS NOT NULL THEN
    INSERT INTO public.lotes_producto (
      id, kiosco_id, producto_id, numero_lote, fecha_vencimiento, cantidad_inicial, cantidad_actual, fecha_ingreso, activo
    ) VALUES
      -- LOTE VENCIDO HACE 1 DÍA (ROJO - Para probar dar de baja)
      (gen_random_uuid(), v_kiosco_id, p_sandwich_miga, 'LOTE-MIGA-VENCIDO', CURRENT_DATE - INTERVAL '1 day', 2, 2, now() - INTERVAL '3 days', true),
      -- LOTE CRÍTICO QUE VENCE EN 2 DÍAS (ÁMBAR - Críticos)
      (gen_random_uuid(), v_kiosco_id, p_sandwich_miga, 'LOTE-MIGA-FRESCO', CURRENT_DATE + INTERVAL '2 days', 10, 10, now(), true),
      -- LOTE PRÓXIMO QUE VENCE EN 4 DÍAS (AMARILLO - Próximos)
      (gen_random_uuid(), v_kiosco_id, p_prepizza, 'LOTE-PREPIZZA', CURRENT_DATE + INTERVAL '4 days', 10, 10, now(), true),
      -- LOTE PRÓXIMO QUE VENCE EN 5 DÍAS (AMARILLO - Próximos)
      (gen_random_uuid(), v_kiosco_id, p_yogur_frutilla, 'LOTE-YOGUR-ILOLAY', CURRENT_DATE + INTERVAL '5 days', 24, 24, now(), true),
      -- LOTE VIGENTE QUE VENCE EN 14 DÍAS (VERDE - Vigentes)
      (gen_random_uuid(), v_kiosco_id, p_leche_sachet, 'LOTE-LECHE-SERENISIMA', CURRENT_DATE + INTERVAL '14 days', 30, 30, now(), true);
  END IF;

  -- 11. PROMOCIONES AUTOMÁTICAS
  IF to_regclass('public.promociones') IS NOT NULL THEN
    INSERT INTO public.promociones (
      id, kiosco_id, nombre, tipo, producto_id, cantidad_minima, cantidad_paga, descuento_porcentaje, precio_unitario_promo, activo
    ) VALUES
      -- 2x1 en Alfajor Rasta Negro
      (gen_random_uuid(), v_kiosco_id, 'Promo 2x1 Alfajor Rasta Negro', 'NXM', p_alf_rasta, 2, 1, NULL, NULL, true),
      -- 2da unidad al 50% en Cerveza Corona
      (gen_random_uuid(), v_kiosco_id, '2da unidad al 50% Cerveza Corona 330ml', 'PORCENTAJE', p_corona_330, 2, NULL, 25, NULL, true);
  END IF;

  -- 12. CLIENTES DE BARRIO CON CUENTA CORRIENTE (FIADOS)
  IF to_regclass('public.clientes') IS NOT NULL THEN
    INSERT INTO public.clientes (
      id, kiosco_id, nombre, telefono, dni_cuit, direccion, email, limite_credito, saldo_deudor, activo, notas
    ) VALUES
      (gen_random_uuid(), v_kiosco_id, 'Don Carlos (Taller Mecánico)', '1144556677', '28455123', 'Av. Belgrano 2410', 'taller.carlos@gmail.com', 60000, 14500, true, 'Vecino del taller. Paga todos los viernes a última hora.'),
      (gen_random_uuid(), v_kiosco_id, 'Doña Rosa (Vecina del 2° B)', '1122338899', NULL, 'Belgrano 2450 2° B', NULL, 40000, 0, true, 'Jubilada, compra diario y abona al cobrar los días 8.'),
      (gen_random_uuid(), v_kiosco_id, 'Lucas (Estudiante universitario)', '1199887766', '42110998', 'Calle 14 N° 850', 'lucas.est@hotmail.com', 15000, 4200, true, 'Fía galletitas y fotocopias. Avisarle por WhatsApp.');
  END IF;

  -- 13. CAJA ABIERTA CON FONDO INICIAL DE $30.000
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

  RAISE NOTICE '¡Kiosco & Almacén San Cayetano creado con éxito! Kiosco ID: %', v_kiosco_id;

END;
$$;
