-- Aplicar después de las fases de política congelada y orden de bloqueos.
-- Vendedor y titular del turno son identidades diferentes. No modifica ventas.
BEGIN;
DO $$
DECLARE
  firmas text[] := ARRAY[
    'public.preparar_checkout_manual(uuid,jsonb,jsonb)',
    'public.confirmar_venta_manual_interna_supervisor(uuid,jsonb)',
    'public.cancelar_checkout_manual(jsonb,text,text,text)'
  ];
  anteriores text[] := ARRAY[
    'WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid AND estado=',
    'WHERE id=caja_id AND kiosco_id=kid AND usuario_id=uid FOR UPDATE',
    'WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid FOR SHARE'
  ];
  nuevos text[] := ARRAY[
    'WHERE id=v_caja AND kiosco_id=v_kid AND estado=',
    'WHERE id=caja_id AND kiosco_id=kid FOR UPDATE',
    'WHERE id=v_caja AND kiosco_id=v_kid FOR SHARE'
  ];
  i integer; funcion regprocedure; definicion text;
BEGIN
  FOR i IN 1..array_length(firmas,1) LOOP
    funcion := to_regprocedure(firmas[i]);
    IF funcion IS NULL THEN
      RAISE EXCEPTION 'Falta prerrequisito: %', firmas[i];
    END IF;
    definicion := pg_get_functiondef(funcion);
    IF strpos(definicion,anteriores[i]) > 0 THEN
      -- Sólo sustituye el predicado del titular. Conserva bloqueos, identidad
      -- del vendedor, comercio, estado, fecha, PIN y permisos de cada función.
      EXECUTE replace(definicion,anteriores[i],nuevos[i]);
    ELSIF strpos(definicion,nuevos[i]) = 0 THEN
      RAISE EXCEPTION 'Definición no reconocida: %; revisar antes de aplicar', firmas[i];
    END IF;
  END LOOP;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
