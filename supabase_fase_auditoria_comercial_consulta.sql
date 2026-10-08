-- Paso 40. Consulta acotada de anulaciones y cambios de precio.
-- Requiere las migraciones de auditoría 04 y 05; compatible con motivos del 39.
BEGIN;
CREATE INDEX IF NOT EXISTS auditoria_comercial_comercio_fecha_idx
  ON public.auditoria_operaciones(kiosco_id,creado_en DESC,id DESC);

CREATE OR REPLACE FUNCTION public.consultar_auditoria_comercial(p_limite integer DEFAULT 50)
RETURNS TABLE(id uuid,fecha timestamptz,accion text,entidad text,entidad_id uuid,
  motivo text,actor_auth_id uuid,actor_rol text,detalles jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(auth.role()='authenticated',false) THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios
      WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' OR v_actor.kiosco_id IS NULL THEN
    RAISE EXCEPTION 'Sólo el dueño consulta auditoría' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite<1 OR p_limite>100 THEN
    RAISE EXCEPTION 'Límite inválido' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT a.id,a.creado_en,a.accion,a.entidad,a.entidad_id,
    a.motivo,a.actor_auth_id,a.actor_rol,
    CASE WHEN a.accion='PRECIO_VENTA_MODIFICADO' THEN
      jsonb_build_object('precio_anterior',a.detalles->'precio_anterior','precio_nuevo',a.detalles->'precio_nuevo')
      ELSE '{}'::jsonb END
    FROM public.auditoria_operaciones a
    WHERE a.kiosco_id=v_actor.kiosco_id
      AND ((a.accion='PRECIO_VENTA_MODIFICADO' AND a.entidad='productos')
        OR (a.accion='VENTA_ANULADA' AND a.entidad='ventas'))
    ORDER BY a.creado_en DESC,a.id DESC LIMIT p_limite;
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_auditoria_comercial(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_auditoria_comercial(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
