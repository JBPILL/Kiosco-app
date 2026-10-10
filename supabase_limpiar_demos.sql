-- ==============================================================================
-- LIMPIEZA DE DEMOS CORRUPTOS - Ejecutar ANTES de re-ejecutar los seeds
-- ==============================================================================
-- Este script elimina los comercios demo que fueron creados sin usuario auth
-- válido, permitiendo re-ejecutar los seeds actualizados.
-- ==============================================================================

-- Limpiar Kiosco Don Pedro (si existe)
DO $$
DECLARE
  v_old_id UUID;
BEGIN
  SELECT id INTO v_old_id FROM public.kioscos WHERE nombre = 'Kiosco y Almacén Don Pedro' LIMIT 1;
  IF v_old_id IS NOT NULL THEN
    -- Limpiar datos asociados en orden de dependencias
    DELETE FROM public.combo_items WHERE kiosco_id = v_old_id;
    DELETE FROM public.promociones WHERE kiosco_id = v_old_id;
    DELETE FROM public.movimientos_stock WHERE kiosco_id = v_old_id;
    DELETE FROM public.productos WHERE kiosco_id = v_old_id;
    DELETE FROM public.categorias WHERE kiosco_id = v_old_id;
    DELETE FROM public.sesiones_caja WHERE kiosco_id = v_old_id;
    DELETE FROM public.suscripciones WHERE kiosco_id = v_old_id;
    DELETE FROM public.usuarios WHERE kiosco_id = v_old_id;
    DELETE FROM public.kioscos WHERE id = v_old_id;
    RAISE NOTICE 'Kiosco Don Pedro eliminado correctamente (ID: %)', v_old_id;
  ELSE
    RAISE NOTICE 'Kiosco Don Pedro no encontrado, nada que limpiar.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Intentar con admin_eliminar_kiosco si existe
  BEGIN
    PERFORM public.admin_eliminar_kiosco(v_old_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error limpiando Don Pedro: %. Intentá eliminar manualmente.', SQLERRM;
  END;
END;
$$;

-- Limpiar usuario auth huérfano de Don Pedro
DELETE FROM auth.identities WHERE identity_data->>'email' = 'kiosco.don.pedro@gmail.com';
DELETE FROM auth.users WHERE email = 'kiosco.don.pedro@gmail.com';

-- Limpiar Librería Sol (si existe)
DO $$
DECLARE
  v_old_id UUID;
BEGIN
  SELECT id INTO v_old_id FROM public.kioscos WHERE nombre = 'Librería y Papelera Sol' LIMIT 1;
  IF v_old_id IS NOT NULL THEN
    DELETE FROM public.combo_items WHERE kiosco_id = v_old_id;
    DELETE FROM public.promociones WHERE kiosco_id = v_old_id;
    DELETE FROM public.movimientos_stock WHERE kiosco_id = v_old_id;
    DELETE FROM public.productos WHERE kiosco_id = v_old_id;
    DELETE FROM public.categorias WHERE kiosco_id = v_old_id;
    DELETE FROM public.sesiones_caja WHERE kiosco_id = v_old_id;
    DELETE FROM public.suscripciones WHERE kiosco_id = v_old_id;
    DELETE FROM public.usuarios WHERE kiosco_id = v_old_id;
    DELETE FROM public.kioscos WHERE id = v_old_id;
    RAISE NOTICE 'Librería Sol eliminada correctamente (ID: %)', v_old_id;
  ELSE
    RAISE NOTICE 'Librería Sol no encontrada, nada que limpiar.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM public.admin_eliminar_kiosco(v_old_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error limpiando Librería Sol: %. Intentá eliminar manualmente.', SQLERRM;
  END;
END;
$$;

-- Limpiar usuario auth huérfano de Librería Sol
DELETE FROM auth.identities WHERE identity_data->>'email' = 'libreria.sol.demo@gmail.com';
DELETE FROM auth.users WHERE email = 'libreria.sol.demo@gmail.com';

-- Limpiar Veterinaria Huellas (si existe)
DO $$
DECLARE
  v_old_id UUID;
BEGIN
  SELECT id INTO v_old_id FROM public.kioscos WHERE nombre = 'Veterinaria y Pet Shop Huellas' LIMIT 1;
  IF v_old_id IS NOT NULL THEN
    DELETE FROM public.combo_items WHERE kiosco_id = v_old_id;
    DELETE FROM public.promociones WHERE kiosco_id = v_old_id;
    DELETE FROM public.movimientos_stock WHERE kiosco_id = v_old_id;
    DELETE FROM public.productos WHERE kiosco_id = v_old_id;
    DELETE FROM public.categorias WHERE kiosco_id = v_old_id;
    DELETE FROM public.sesiones_caja WHERE kiosco_id = v_old_id;
    DELETE FROM public.suscripciones WHERE kiosco_id = v_old_id;
    DELETE FROM public.usuarios WHERE kiosco_id = v_old_id;
    DELETE FROM public.kioscos WHERE id = v_old_id;
    RAISE NOTICE 'Veterinaria Huellas eliminada correctamente (ID: %)', v_old_id;
  ELSE
    RAISE NOTICE 'Veterinaria Huellas no encontrada, nada que limpiar.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM public.admin_eliminar_kiosco(v_old_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error limpiando Veterinaria Huellas: %. Intentá eliminar manualmente.', SQLERRM;
  END;
END;
$$;

-- Limpiar usuario auth huérfano de Veterinaria Huellas
DELETE FROM auth.identities WHERE identity_data->>'email' = 'veterinaria.huellas.demo@gmail.com';
DELETE FROM auth.users WHERE email = 'veterinaria.huellas.demo@gmail.com';

-- Limpiar Bazar Prisma (si existe)
DO $$
DECLARE
  v_old_id UUID;
BEGIN
  SELECT id INTO v_old_id FROM public.kioscos WHERE nombre = 'Bazar y Hogar Prisma' LIMIT 1;
  IF v_old_id IS NOT NULL THEN
    DELETE FROM public.combo_items WHERE kiosco_id = v_old_id;
    DELETE FROM public.promociones WHERE kiosco_id = v_old_id;
    DELETE FROM public.movimientos_stock WHERE kiosco_id = v_old_id;
    DELETE FROM public.productos WHERE kiosco_id = v_old_id;
    DELETE FROM public.categorias WHERE kiosco_id = v_old_id;
    DELETE FROM public.sesiones_caja WHERE kiosco_id = v_old_id;
    DELETE FROM public.suscripciones WHERE kiosco_id = v_old_id;
    DELETE FROM public.usuarios WHERE kiosco_id = v_old_id;
    DELETE FROM public.kioscos WHERE id = v_old_id;
    RAISE NOTICE 'Bazar Prisma eliminado correctamente (ID: %)', v_old_id;
  ELSE
    RAISE NOTICE 'Bazar Prisma no encontrado, nada que limpiar.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM public.admin_eliminar_kiosco(v_old_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error limpiando Bazar Prisma: %. Intentá eliminar manualmente.', SQLERRM;
  END;
END;
$$;

-- Limpiar usuario auth huérfano de Bazar Prisma
DELETE FROM auth.identities WHERE identity_data->>'email' = 'bazar.prisma.demo@gmail.com';
DELETE FROM auth.users WHERE email = 'bazar.prisma.demo@gmail.com';

-- Limpiar usuarios públicos huérfanos (sin kiosco)
DELETE FROM public.usuarios WHERE email = 'kiosco.don.pedro@gmail.com' AND kiosco_id IS NULL;
DELETE FROM public.usuarios WHERE email = 'libreria.sol.demo@gmail.com' AND kiosco_id IS NULL;
DELETE FROM public.usuarios WHERE email = 'veterinaria.huellas.demo@gmail.com' AND kiosco_id IS NULL;
DELETE FROM public.usuarios WHERE email = 'bazar.prisma.demo@gmail.com' AND kiosco_id IS NULL;

RAISE NOTICE '¡Limpieza completada! Ahora podés ejecutar los seeds actualizados.';
