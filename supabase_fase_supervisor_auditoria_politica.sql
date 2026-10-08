-- Paso 38. Requiere pasos 35 y 36; amplía auditoría con cambios de política.
BEGIN;
CREATE INDEX IF NOT EXISTS supervisor_politica_comercio_fecha_idx ON public.supervisor_politica_auditoria(kiosco_id,fecha DESC,id DESC);
CREATE INDEX IF NOT EXISTS supervisor_intentos_comercio_fecha_idx ON public.supervisor_pin_intentos(kiosco_id,creado_en DESC,id DESC);
CREATE INDEX IF NOT EXISTS supervisor_config_comercio_fecha_idx ON public.supervisor_pin_config_auditoria(kiosco_id,fecha DESC,id DESC);
CREATE INDEX IF NOT EXISTS supervisor_permisos_comercio_fecha_idx ON public.supervisor_autorizaciones(kiosco_id,creado_en DESC,intento_id DESC);

CREATE OR REPLACE FUNCTION public.consultar_auditoria_supervisor(p_limite integer DEFAULT 50)
RETURNS TABLE(id uuid,fecha timestamptz,evento text,resultado text,accion text,actor_auth_id uuid,revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(auth.role()='authenticated',false) THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Sólo el dueño consulta auditoría' USING ERRCODE='42501'; END IF;
  IF p_limite IS NULL OR p_limite<1 OR p_limite>100 THEN RAISE EXCEPTION 'Límite inválido'; END IF;
  RETURN QUERY
    SELECT e.id,e.fecha,e.evento,e.resultado,e.accion,e.actor_auth_id,e.revision
    FROM (
      SELECT i.id,i.creado_en AS fecha,'INTENTO_PIN'::text AS evento,
        CASE WHEN i.valido THEN 'VALIDO' WHEN i.valido=false THEN 'INVALIDO'
          WHEN i.vence_en<=clock_timestamp() THEN 'VENCIDO' ELSE 'PENDIENTE' END AS resultado,
        coalesce(i.accion,'VERIFICACION') AS accion,i.actor_auth_id,i.revision
      FROM public.supervisor_pin_intentos i WHERE i.kiosco_id=v_actor.kiosco_id
      UNION ALL
      SELECT c.id,c.fecha,'CONFIGURACION_PIN','CONFIGURADO','CONFIGURAR',c.actor_auth_id,c.revision
      FROM public.supervisor_pin_config_auditoria c WHERE c.kiosco_id=v_actor.kiosco_id
      UNION ALL
      -- Identifica el intento, nunca el token de permiso ni el cuerpo comercial.
      SELECT a.intento_id,a.creado_en,'PERMISO',
        CASE WHEN a.consumido_en IS NOT NULL THEN 'CONSUMIDO'
          WHEN a.vence_en<=clock_timestamp() THEN 'VENCIDO' ELSE 'VIGENTE' END,
        a.accion,a.actor_auth_id,a.revision
      FROM public.supervisor_autorizaciones a WHERE a.kiosco_id=v_actor.kiosco_id
      UNION ALL
      SELECT p.id,p.fecha,'POLITICA_DESCUENTO','CONFIGURADO',
        'UMBRAL '||p.umbral_anterior::text||' -> '||p.umbral_nuevo::text,p.actor_auth_id,p.revision
      FROM public.supervisor_politica_auditoria p WHERE p.kiosco_id=v_actor.kiosco_id
    ) e ORDER BY e.fecha DESC,e.id DESC,e.evento LIMIT p_limite;
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_auditoria_supervisor(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_auditoria_supervisor(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
