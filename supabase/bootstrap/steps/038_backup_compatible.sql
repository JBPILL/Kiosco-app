-- Strict-pilot compatible backup extension. Fiscal/ARCA fields are deliberately omitted.
BEGIN;

CREATE OR REPLACE FUNCTION public.generar_snapshot_backup_ampliado(p_kiosco_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE base jsonb; configuracion jsonb;
BEGIN
  base := public.generar_snapshot_backup(p_kiosco_id);
  SELECT COALESCE(jsonb_object_agg(e.key,e.value),'{}'::jsonb) INTO configuracion
  FROM public.kioscos k CROSS JOIN LATERAL jsonb_each(to_jsonb(k)) e
  WHERE k.id=p_kiosco_id AND e.key=ANY(ARRAY['nombre','direccion','telefono','rubro','capacidades_operativas','equipos_comercio','arqueo_ciego_obligatorio']);
  RETURN base || jsonb_build_object('version','4.0','configuracion_comercio',configuracion,
    'saldos_snapshot',jsonb_build_object(
      'clientes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'saldo_deudor',c.saldo_deudor)),'[]'::jsonb) FROM public.clientes c WHERE c.kiosco_id=p_kiosco_id),
      'proveedores',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'saldo_pendiente',p.saldo_pendiente)),'[]'::jsonb) FROM public.proveedores p WHERE p.kiosco_id=p_kiosco_id)),
    'contenido',(base->'contenido') || jsonb_build_object('incluyeConfiguracion',true,'incluyeSaldos',true));
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_configuracion_backup(p_kiosco_id uuid,p_configuracion jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; comercio public.kioscos%ROWTYPE; clave text; valor jsonb;
BEGIN
  SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR UPDATE;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
    RAISE EXCEPTION 'Solo el dueño del mismo comercio puede restaurar.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO comercio FROM public.kioscos WHERE id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND OR comercio.estado_suscripcion IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_configuracion) IS DISTINCT FROM 'object' OR p_configuracion->>'rubro' IS DISTINCT FROM comercio.rubro THEN
    RAISE EXCEPTION 'Configuración o rubro incompatible.' USING ERRCODE='22023';
  END IF;
  FOR clave,valor IN SELECT * FROM jsonb_each(p_configuracion) LOOP
    IF clave <> ALL(ARRAY['rubro','nombre','direccion','telefono','equipos_comercio','capacidades_operativas','arqueo_ciego_obligatorio']) THEN
      RAISE EXCEPTION 'Campo no restaurable: %',clave USING ERRCODE='22023';
    END IF;
  END LOOP;
  UPDATE public.kioscos SET
    nombre=coalesce(p_configuracion->>'nombre',nombre),
    direccion=CASE WHEN p_configuracion?'direccion' THEN p_configuracion->>'direccion' ELSE direccion END,
    telefono=CASE WHEN p_configuracion?'telefono' THEN p_configuracion->>'telefono' ELSE telefono END,
    equipos_comercio=CASE WHEN p_configuracion?'equipos_comercio' THEN p_configuracion->'equipos_comercio' ELSE equipos_comercio END,
    capacidades_operativas=CASE WHEN p_configuracion?'capacidades_operativas' THEN p_configuracion->'capacidades_operativas' ELSE capacidades_operativas END,
    arqueo_ciego_obligatorio=CASE WHEN p_configuracion?'arqueo_ciego_obligatorio' THEN (p_configuracion->>'arqueo_ciego_obligatorio')::boolean ELSE arqueo_ciego_obligatorio END
  WHERE id=p_kiosco_id;
  RETURN p_configuracion;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_snapshot_backup_ampliado(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restaurar_configuracion_backup(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.generar_snapshot_backup_ampliado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_configuracion_backup(uuid,jsonb) TO authenticated;
COMMIT;
