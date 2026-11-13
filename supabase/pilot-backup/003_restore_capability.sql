-- Publicar la capacidad sólo después de instalar ambos contratos del módulo.
BEGIN;
CREATE OR REPLACE FUNCTION public.capacidades_restauracion_backup(p_kiosco_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR NOT EXISTS(SELECT 1 FROM public.kioscos WHERE id=p_kiosco_id AND estado_suscripcion='ACTIVO') THEN
    RAISE EXCEPTION 'Sólo el dueño del comercio habilitado puede restaurar.' USING ERRCODE='42501';
  END IF;
  IF to_regprocedure('public.restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb)') IS NULL
    OR to_regprocedure('public.restaurar_producto_backup(uuid,uuid,uuid,jsonb)') IS NULL
    OR to_regprocedure('public.restaurar_lote_backup(uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'El módulo de restauración está incompleto.' USING ERRCODE='55000';
  END IF;
  RETURN jsonb_build_object('version',1,'kiosco_id',p_kiosco_id,
    'modulos',jsonb_build_array('contactos','producto_proveedor','lotes'));
END;
$$;
REVOKE ALL ON FUNCTION public.capacidades_restauracion_backup(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.capacidades_restauracion_backup(uuid) TO authenticated;
COMMIT;
