-- Preparación local incremental PR03. NO instala una pasarela ni habilita emisión.
-- Contexto propuesto por el Dueño; aún no es una solicitud WSFE autorizada.
-- Aplicar sólo después del bootstrap estricto, con autorización de instalación.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_operaciones_homologacion (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  venta_id uuid NOT NULL REFERENCES public.ventas(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  entorno text NOT NULL DEFAULT 'HOMOLOGACION' CHECK (entorno='HOMOLOGACION'),
  estado text NOT NULL DEFAULT 'PREPARADA' CHECK (estado='PREPARADA'),
  contexto jsonb NOT NULL CHECK (jsonb_typeof(contexto)='object'),
  venta_snapshot jsonb NOT NULL CHECK (jsonb_typeof(venta_snapshot)='object'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kiosco_id,venta_id,entorno)
);
ALTER TABLE public.fiscal_operaciones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_operaciones_homologacion FROM PUBLIC,anon,authenticated,service_role;


-- Revocar también privilegios por columna si se reaplica sobre una tabla existente.
DO $$
DECLARE columnas text; rol text;
BEGIN
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
    WHERE attrelid='public.fiscal_operaciones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s)
    ON TABLE public.fiscal_operaciones_homologacion FROM PUBLIC,anon,authenticated,service_role',
    columnas,columnas,columnas,columnas);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(rol,'public.fiscal_operaciones_homologacion','SELECT,INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(rol,'public.fiscal_operaciones_homologacion','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'El rol % conserva privilegios heredados en el diario fiscal.',rol;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.preparar_operacion_fiscal_homologacion(
  p_operacion_id uuid, p_kiosco_id uuid, p_venta_id uuid, p_contexto jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  perfil public.usuarios%ROWTYPE;
  venta public.ventas%ROWTYPE;
  operacion public.fiscal_operaciones_homologacion%ROWTYPE;
  contexto jsonb; snapshot jsonb; detalles jsonb;
  campo text; cuit text; suma integer:=0; digito integer;
  pesos integer[]:=ARRAY[5,4,3,2,7,6,5,4,3,2];
BEGIN
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios
      WHERE auth_user_id=auth.uid() AND activo FOR UPDATE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin
    OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
    RAISE EXCEPTION 'Sólo el dueño del mismo comercio puede preparar fiscalización.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=p_kiosco_id AND estado_suscripcion='ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_venta_id IS NULL
    OR jsonb_typeof(p_contexto) IS DISTINCT FROM 'object' OR octet_length(p_contexto::text)>2000
    OR NOT p_contexto ?& ARRAY['version','cuit_emisor','punto_venta','tipo_comprobante','tipo_doc_receptor','nro_doc_receptor'] THEN
    RAISE EXCEPTION 'Contexto fiscal inválido.' USING ERRCODE='22023';
  END IF;
  FOR campo IN SELECT jsonb_object_keys(p_contexto) LOOP
    IF campo NOT IN ('version','cuit_emisor','punto_venta','tipo_comprobante','tipo_doc_receptor','nro_doc_receptor') THEN
      RAISE EXCEPTION 'Campo fiscal no admitido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_contexto->'version') IS DISTINCT FROM 'number' OR p_contexto->'version'<>'1'::jsonb
    OR jsonb_typeof(p_contexto->'cuit_emisor') IS DISTINCT FROM 'string'
    OR (p_contexto->>'cuit_emisor') !~ '^[0-9]{11}$'
    OR jsonb_typeof(p_contexto->'punto_venta') IS DISTINCT FROM 'number'
    OR (p_contexto->>'punto_venta')::numeric NOT BETWEEN 1 AND 99999
    OR (p_contexto->>'punto_venta')::numeric<>trunc((p_contexto->>'punto_venta')::numeric)
    OR jsonb_typeof(p_contexto->'tipo_comprobante') IS DISTINCT FROM 'number'
    OR p_contexto->'tipo_comprobante' NOT IN ('1'::jsonb,'6'::jsonb,'11'::jsonb)
    OR jsonb_typeof(p_contexto->'tipo_doc_receptor') IS DISTINCT FROM 'number'
    OR p_contexto->'tipo_doc_receptor' NOT IN ('80'::jsonb,'96'::jsonb,'99'::jsonb)
    OR jsonb_typeof(p_contexto->'nro_doc_receptor') IS DISTINCT FROM 'string'
    OR (p_contexto->>'nro_doc_receptor') !~ '^[0-9]{1,11}$' THEN
    RAISE EXCEPTION 'Contexto fiscal inválido.' USING ERRCODE='22023';
  END IF;
  cuit:=p_contexto->>'cuit_emisor';
  FOR i IN 1..10 LOOP suma:=suma+substr(cuit,i,1)::integer*pesos[i]; END LOOP;
  digito:=11-suma%11;
  digito:=CASE digito WHEN 11 THEN 0 WHEN 10 THEN 9 ELSE digito END;
  IF digito<>substr(cuit,11,1)::integer THEN
    RAISE EXCEPTION 'CUIT emisor inválido.' USING ERRCODE='22023';
  END IF;
  -- No confiar en importes, fecha ni pertenencia suministrados por el cliente.
  SELECT * INTO venta FROM public.ventas WHERE id=p_venta_id AND kiosco_id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND OR venta.estado IS DISTINCT FROM 'COMPLETADA' OR venta.total<=0 THEN
    RAISE EXCEPTION 'Se requiere una venta completada propia con importe positivo.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) INTO detalles
    FROM public.detalles_venta d WHERE d.venta_id=venta.id;
  snapshot:=jsonb_build_object('version',1,'venta_id',venta.id,'kiosco_id',venta.kiosco_id,
    'total',venta.total,'fecha_hora',to_char(venta.fecha_hora AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'detalles',detalles);
  contexto:=p_contexto;
  -- Rechazar reutilización de identidad incluso si ya hay otra operación de esta venta.
  PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:operation:'||p_operacion_id::text,0));
  SELECT * INTO operacion FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id FOR UPDATE;
  IF FOUND AND (operacion.kiosco_id IS DISTINCT FROM p_kiosco_id OR operacion.venta_id IS DISTINCT FROM p_venta_id
    OR operacion.contexto IS DISTINCT FROM contexto OR operacion.venta_snapshot IS DISTINCT FROM snapshot) THEN
    RAISE EXCEPTION 'La identidad fiscal ya pertenece a otra solicitud.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.fiscal_operaciones_homologacion(id,kiosco_id,venta_id,usuario_id,contexto,venta_snapshot)
    VALUES(p_operacion_id,p_kiosco_id,p_venta_id,perfil.id,contexto,snapshot) ON CONFLICT DO NOTHING;
  SELECT * INTO operacion FROM public.fiscal_operaciones_homologacion
    WHERE kiosco_id=p_kiosco_id AND venta_id=p_venta_id AND entorno='HOMOLOGACION' AND estado='PREPARADA' FOR UPDATE;
  IF NOT FOUND OR operacion.contexto IS DISTINCT FROM contexto OR operacion.venta_snapshot IS DISTINCT FROM snapshot THEN
    RAISE EXCEPTION 'La venta ya tiene otra solicitud fiscal o cambió su contenido.' USING ERRCODE='22023';
  END IF;
  RETURN jsonb_build_object('id',operacion.id,'kiosco_id',operacion.kiosco_id,'venta_id',operacion.venta_id,
    'entorno',operacion.entorno,'estado',operacion.estado,'emision_habilitada',false);
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb) TO authenticated;
COMMENT ON TABLE public.fiscal_operaciones_homologacion IS
  'PR03 preparado: contexto propuesto y snapshot comercial. Sin numeración, CAE, envío ni credenciales. No desplegado por este archivo.';
COMMIT;
