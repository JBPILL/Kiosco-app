-- Contexto NC sólo lectura. Catálogo privado separado, sin filas ni activación.
BEGIN;
CREATE OR REPLACE FUNCTION public.fiscal_fecha_catalogo_nc(p_valor jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE valor text:=p_valor#>>'{}'; BEGIN
 IF jsonb_typeof(p_valor) IS DISTINCT FROM 'string' OR valor !~ '^[0-9]{8}$'
  OR substr(valor,1,4)='0000' OR to_char(to_date(valor,'YYYYMMDD'),'YYYYMMDD') IS DISTINCT FROM valor THEN
  RAISE EXCEPTION 'Fecha de catálogo NC inválida.' USING ERRCODE='22023';
 END IF;
 RETURN valor;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_validar_catalogo_nc(p_tipos jsonb,p_condiciones jsonb,p_alicuotas jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE fila jsonb; codigo jsonb; ids integer[]; tipos integer[]:='{}'; comprobantes integer[]; id integer; grupo integer;
BEGIN
 IF jsonb_typeof(p_tipos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tipos) NOT BETWEEN 1 AND 3
  OR jsonb_typeof(p_condiciones) IS DISTINCT FROM 'array' OR jsonb_array_length(p_condiciones) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(p_alicuotas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_alicuotas)>100 THEN
  RAISE EXCEPTION 'Catálogo NC inválido.' USING ERRCODE='22023';
 END IF;
 FOR grupo IN 1..3 LOOP
  ids:='{}';
  FOR fila IN SELECT value FROM jsonb_array_elements(CASE grupo WHEN 1 THEN p_tipos WHEN 2 THEN p_condiciones ELSE p_alicuotas END) LOOP
   PERFORM public.checkout_objeto(fila,CASE grupo WHEN 1 THEN ARRAY['id','descripcion','desde','hasta'] WHEN 2 THEN ARRAY['id','descripcion','comprobantes'] ELSE ARRAY['id','descripcion'] END);
   IF jsonb_typeof(fila->'id') IS DISTINCT FROM 'number' OR (fila->>'id') !~ '^[1-9][0-9]*$' OR (fila->>'id')::numeric>2147483647 THEN RAISE EXCEPTION 'Código NC inválido.' USING ERRCODE='22023'; END IF;
   id:=(fila->>'id')::integer;
   IF id=ANY(ids) THEN RAISE EXCEPTION 'Código NC repetido.' USING ERRCODE='22023'; END IF;
   ids:=array_append(ids,id);PERFORM public.fiscal_nc_texto(fila->'descripcion',120);
   IF grupo=1 THEN
    IF id NOT IN (3,8,13) THEN RAISE EXCEPTION 'Tipo ajeno al piloto NC.' USING ERRCODE='22023'; END IF;
    tipos:=array_append(tipos,id);PERFORM public.fiscal_fecha_catalogo_nc(fila->'desde');
    IF fila->'hasta'<>'null'::jsonb AND public.fiscal_fecha_catalogo_nc(fila->'hasta')<fila->>'desde' THEN RAISE EXCEPTION 'Vigencia NC inválida.' USING ERRCODE='22023'; END IF;
   ELSIF grupo=2 THEN
    IF jsonb_typeof(fila->'comprobantes') IS DISTINCT FROM 'array' OR jsonb_array_length(fila->'comprobantes') NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'Clase NC inválida.' USING ERRCODE='22023'; END IF;
    comprobantes:='{}';
    FOR codigo IN SELECT value FROM jsonb_array_elements(fila->'comprobantes') LOOP
     IF codigo NOT IN ('3'::jsonb,'8'::jsonb,'13'::jsonb) OR NOT (codigo#>>'{}')::integer=ANY(tipos)
      OR (codigo#>>'{}')::integer=ANY(comprobantes) THEN RAISE EXCEPTION 'Clase NC no acreditada.' USING ERRCODE='22023'; END IF;
     comprobantes:=array_append(comprobantes,(codigo#>>'{}')::integer);
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_fecha_catalogo_nc(jsonb),public.fiscal_validar_catalogo_nc(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS public.fiscal_parametros_nc_homologacion (
 revision integer PRIMARY KEY CHECK(revision>0), tipos jsonb NOT NULL, condiciones jsonb NOT NULL, alicuotas jsonb NOT NULL,
 fuente_sha256 text NOT NULL CHECK(fuente_sha256 ~ '^[0-9a-f]{64}$'),
 consultado_en timestamptz NOT NULL, vence_en timestamptz NOT NULL CHECK(vence_en>consultado_en),
 habilitado boolean NOT NULL DEFAULT false,
 CHECK(public.fiscal_validar_catalogo_nc(tipos,condiciones,alicuotas))
);
ALTER TABLE public.fiscal_parametros_nc_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_parametros_nc_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_parametros_nc_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_parametros_nc_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_parametros_nc_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_parametros_nc_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en catálogo NC.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_parametros_nc_inmutables ON public.fiscal_parametros_nc_homologacion;
CREATE TRIGGER fiscal_parametros_nc_inmutables BEFORE UPDATE OR DELETE ON public.fiscal_parametros_nc_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_parametros_inmutables();

CREATE OR REPLACE FUNCTION public.cargar_contexto_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE original jsonb; comercial jsonb; unidades jsonb; condiciones jsonb; tipo jsonb;
 caso public.fiscal_nc_borradores_homologacion%ROWTYPE; vinculo public.fiscal_nc_comercial_homologacion%ROWTYPE;
 emisor public.fiscal_emisores_homologacion%ROWTYPE; parametros public.fiscal_parametros_nc_homologacion%ROWTYPE;
BEGIN
 original:=public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF NOT FOUND OR caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR caso.propuesta_sha256 IS DISTINCT FROM p_sha
  OR EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion WHERE solicitud_id=p_id) THEN RAISE EXCEPTION 'Caso NC no disponible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO vinculo FROM public.fiscal_nc_comercial_homologacion WHERE solicitud_id=p_id FOR SHARE;
 IF NOT FOUND OR vinculo.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR vinculo.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR vinculo.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Falta vínculo comercial NC.' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM public.pagos_venta WHERE venta_id=p_venta_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.detalles_venta WHERE venta_id=p_venta_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.movimientos_stock WHERE notas='Checkout manual '||p_venta_id::text AND kiosco_id=(SELECT kiosco_id FROM public.ventas WHERE id=p_venta_id) ORDER BY id FOR SHARE NOWAIT;
 comercial:=public.cargar_fuente_comercial_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 unidades:=public.cargar_unidades_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 IF comercial IS DISTINCT FROM vinculo.fuente OR unidades->>'estado' IS DISTINCT FROM 'CAPTURADAS'
  OR unidades#>>'{unidades,sha256}' IS DISTINCT FROM vinculo.unidades_sha256 THEN RAISE EXCEPTION 'Hechos comerciales NC cambiaron.' USING ERRCODE='22023'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=(SELECT kiosco_id FROM public.ventas WHERE id=p_venta_id) AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.cuit_emisor IS DISTINCT FROM original#>>'{constancia,solicitud,solicitud,cuitEmisor}' OR emisor.revision IS DISTINCT FROM caso.emisor_revision
  OR emisor.credencial_id IS DISTINCT FROM caso.credencial_id OR emisor.certificado_sha256 IS DISTINCT FROM caso.certificado_sha256 OR emisor.punto_venta IS DISTINCT FROM caso.punto_venta THEN RAISE EXCEPTION 'Emisor NC cambió.' USING ERRCODE='42501'; END IF;
 SELECT * INTO parametros FROM public.fiscal_parametros_nc_homologacion WHERE habilitado AND consultado_en<=clock_timestamp() AND vence_en>clock_timestamp() ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Catálogo NC no disponible.' USING ERRCODE='55000'; END IF;
 SELECT value INTO tipo FROM jsonb_array_elements(parametros.tipos) WHERE value->'id'=caso.datos->'tipo_nota_credito';
 SELECT jsonb_agg(value ORDER BY (value->>'id')::integer) INTO condiciones FROM jsonb_array_elements(parametros.condiciones) WHERE value->'comprobantes' @> jsonb_build_array(caso.datos->'tipo_nota_credito');
 IF tipo IS NULL OR tipo->>'desde'>caso.datos->>'fecha' OR tipo->'hasta'<>'null'::jsonb AND tipo->>'hasta'<caso.datos->>'fecha'
  OR condiciones IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(condiciones) c WHERE c->'id'=caso.datos->'condicion_iva_receptor')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(caso.datos->'iva') i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parametros.alicuotas) a WHERE a->'id'=i->'id'))
  OR parametros.consultado_en>clock_timestamp() OR parametros.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Parámetros NC incompatibles o vencidos.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,'propuesta_sha256',p_sha,
  'checkout_sha256',comercial->>'checkout_sha256','fuente_comercial_sha256',vinculo.fuente_sha256,'unidades_sha256',vinculo.unidades_sha256,
  'cuit_emisor',emisor.cuit_emisor,'punto_venta',emisor.punto_venta,'revision_emisor',emisor.revision,'revision_parametros',parametros.revision,'tipo_nota_credito',caso.datos->'tipo_nota_credito',
  'condiciones',condiciones,'alicuotas',coalesce((SELECT jsonb_agg(value ORDER BY (value->>'id')::integer) FROM jsonb_array_elements(parametros.alicuotas)),'[]'::jsonb),'emision_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.cargar_contexto_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_contexto_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
