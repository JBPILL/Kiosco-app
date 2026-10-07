-- Aplicar después de supabase_fase_backup_integral.sql y las columnas fiscales.
BEGIN;
ALTER TABLE public.kioscos ADD COLUMN IF NOT EXISTS arqueo_ciego_obligatorio boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.generar_snapshot_backup_ampliado(p_kiosco_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE base jsonb; configuracion jsonb; saldos jsonb;
BEGIN
 base := public.generar_snapshot_backup(p_kiosco_id);
 SELECT COALESCE(jsonb_object_agg(e.key,e.value),'{}'::jsonb) INTO configuracion
 FROM public.kioscos k CROSS JOIN LATERAL jsonb_each(to_jsonb(k)) e
 WHERE k.id=p_kiosco_id AND e.key=ANY(ARRAY['nombre','direccion','telefono','rubro','capacidades_operativas','equipos_comercio','cuit','iibb','inicio_actividades','condicion_iva','afip_punto_venta','afip_habilitado','afip_entorno','afip_alicuota_iva','arqueo_ciego_obligatorio']);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(base->'clientes') c WHERE jsonb_typeof(c->'saldo_deudor') IS DISTINCT FROM 'number')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(base->'proveedores') p WHERE jsonb_typeof(p->'saldo_pendiente') IS DISTINCT FROM 'number') THEN
  RAISE EXCEPTION 'El snapshot contiene saldos incompletos.' USING ERRCODE='22023';
 END IF;
 saldos := jsonb_build_object(
 'clientes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c->'id','saldo_deudor',c->'saldo_deudor')),'[]'::jsonb) FROM jsonb_array_elements(base->'clientes') c),
 'proveedores',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p->'id','saldo_pendiente',p->'saldo_pendiente')),'[]'::jsonb) FROM jsonb_array_elements(base->'proveedores') p));
 RETURN base || jsonb_build_object('version','4.0','configuracion_comercio',configuracion,'saldos_snapshot',saldos,
 'contenido',(base->'contenido') || jsonb_build_object('incluyeConfiguracion',true,'incluyeSaldos',true));
END;
$$;
REVOKE ALL ON FUNCTION public.generar_snapshot_backup_ampliado(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.generar_snapshot_backup_ampliado(uuid) TO authenticated,service_role;

-- Restauración parcial deliberada: fiscal habilitado, equipos y capacidades se configuran localmente.
-- El rubro se exige como identidad y nunca se modifica.
CREATE OR REPLACE FUNCTION public.restaurar_configuracion_backup(p_kiosco_id uuid,p_configuracion jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE perfil public.usuarios%ROWTYPE; comercio public.kioscos%ROWTYPE; clave text; valor jsonb; resultado jsonb;
BEGIN
 BEGIN
  SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR UPDATE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
 END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
  RAISE EXCEPTION 'Solo el dueño del mismo comercio puede restaurar.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO comercio FROM public.kioscos WHERE id=p_kiosco_id FOR UPDATE;
 IF NOT FOUND OR comercio.estado_suscripcion IS DISTINCT FROM 'ACTIVO' THEN
  RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_configuracion) IS DISTINCT FROM 'object' OR jsonb_typeof(p_configuracion->'rubro') IS DISTINCT FROM 'string'
 OR p_configuracion->>'rubro' IS DISTINCT FROM comercio.rubro THEN
  RAISE EXCEPTION 'Configuración o rubro incompatible.' USING ERRCODE='22023';
 END IF;
 FOR clave,valor IN SELECT * FROM jsonb_each(p_configuracion) LOOP
  IF clave <> ALL(ARRAY['rubro','nombre','direccion','telefono','cuit','iibb','inicio_actividades','condicion_iva','afip_punto_venta','afip_alicuota_iva','arqueo_ciego_obligatorio']) THEN
   RAISE EXCEPTION 'Campo no restaurable: %',clave USING ERRCODE='22023';
  END IF;
  IF clave=ANY(ARRAY['nombre','direccion','telefono','cuit','iibb','inicio_actividades','condicion_iva']) THEN
   IF jsonb_typeof(valor) NOT IN ('string','null') OR (clave='nombre' AND (valor='null'::jsonb OR length(btrim(valor#>>'{}'))=0))
   OR length(valor#>>'{}')>(CASE WHEN clave='direccion' THEN 500 WHEN clave='nombre' THEN 160 ELSE 120 END) THEN
    RAISE EXCEPTION 'Texto inválido: %',clave USING ERRCODE='22023';
   END IF;
   IF clave='cuit' AND valor<>'null'::jsonb AND (valor#>>'{}')<>'' AND (valor#>>'{}') !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'CUIT inválido.' USING ERRCODE='22023';
   END IF;
   IF clave='condicion_iva' AND valor<>'null'::jsonb AND (valor#>>'{}') NOT IN ('MONOTRIBUTO','RESPONSABLE_INSCRIPTO','EXENTO') THEN
    RAISE EXCEPTION 'Condición IVA inválida.' USING ERRCODE='22023';
   END IF;
   IF clave='inicio_actividades' AND valor<>'null'::jsonb AND (valor#>>'{}')<>'' THEN
    IF (valor#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Fecha inválida.' USING ERRCODE='22023'; END IF;
    PERFORM (valor#>>'{}')::date;
   END IF;
  ELSIF clave='afip_punto_venta' AND valor<>'null'::jsonb THEN
   IF jsonb_typeof(valor)<>'number' OR (valor#>>'{}')::numeric NOT BETWEEN 1 AND 99999
   OR trunc((valor#>>'{}')::numeric)<>(valor#>>'{}')::numeric THEN RAISE EXCEPTION 'Punto de venta inválido.' USING ERRCODE='22023'; END IF;
  ELSIF clave='afip_alicuota_iva' AND valor<>'null'::jsonb THEN
   IF jsonb_typeof(valor)<>'number' OR (valor#>>'{}')::numeric NOT IN (10.5,21) THEN RAISE EXCEPTION 'Alícuota inválida.' USING ERRCODE='22023'; END IF;
  ELSIF clave='arqueo_ciego_obligatorio' AND jsonb_typeof(valor)<>'boolean' THEN
   RAISE EXCEPTION 'Arqueo inválido.' USING ERRCODE='22023';
  END IF;
 END LOOP;
 UPDATE public.kioscos SET
 nombre=CASE WHEN p_configuracion?'nombre' THEN p_configuracion->>'nombre' ELSE nombre END,
 direccion=CASE WHEN p_configuracion?'direccion' THEN p_configuracion->>'direccion' ELSE direccion END,
 telefono=CASE WHEN p_configuracion?'telefono' THEN p_configuracion->>'telefono' ELSE telefono END,
 cuit=CASE WHEN p_configuracion?'cuit' THEN p_configuracion->>'cuit' ELSE cuit END,
 iibb=CASE WHEN p_configuracion?'iibb' THEN p_configuracion->>'iibb' ELSE iibb END,
 inicio_actividades=CASE WHEN p_configuracion?'inicio_actividades' THEN p_configuracion->>'inicio_actividades' ELSE inicio_actividades END,
 condicion_iva=CASE WHEN p_configuracion?'condicion_iva' THEN p_configuracion->>'condicion_iva' ELSE condicion_iva END,
 afip_punto_venta=CASE WHEN p_configuracion?'afip_punto_venta' THEN (p_configuracion->>'afip_punto_venta')::integer ELSE afip_punto_venta END,
 afip_alicuota_iva=CASE WHEN p_configuracion?'afip_alicuota_iva' THEN (p_configuracion->>'afip_alicuota_iva')::numeric ELSE afip_alicuota_iva END,
 arqueo_ciego_obligatorio=CASE WHEN p_configuracion?'arqueo_ciego_obligatorio' THEN (p_configuracion->>'arqueo_ciego_obligatorio')::boolean ELSE arqueo_ciego_obligatorio END
 WHERE id=p_kiosco_id;
 SELECT COALESCE(jsonb_object_agg(e.key,e.value),'{}'::jsonb) INTO resultado FROM public.kioscos k
 CROSS JOIN LATERAL jsonb_each(to_jsonb(k)) e WHERE k.id=p_kiosco_id AND e.key=ANY(ARRAY['rubro','nombre','direccion','telefono','cuit','iibb','inicio_actividades','condicion_iva','afip_punto_venta','afip_alicuota_iva','arqueo_ciego_obligatorio']);
 RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.restaurar_configuracion_backup(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_configuracion_backup(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
