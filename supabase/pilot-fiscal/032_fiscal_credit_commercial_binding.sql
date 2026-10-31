-- Casos NUEVOS: vínculo comercial privado e inmutable. Sin backfill ni emisión.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_comercial_homologacion (
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_borradores_homologacion(id),
 operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id),
 actor_auth_id uuid NOT NULL, propuesta_sha256 text NOT NULL CHECK(propuesta_sha256 ~ '^[0-9a-f]{64}$'),
 fuente jsonb NOT NULL, fuente_canonico text NOT NULL CHECK(octet_length(fuente_canonico)<=2097152),
 fuente_sha256 text NOT NULL CHECK(fuente_sha256=encode(sha256(convert_to(fuente_canonico,'UTF8')),'hex')),
 unidades_canonico text NOT NULL CHECK(octet_length(unidades_canonico)<=2097152),
 unidades_sha256 text NOT NULL CHECK(unidades_sha256=encode(sha256(convert_to(unidades_canonico,'UTF8')),'hex')),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(fuente=fuente_canonico::jsonb AND fuente->'version'='1'::jsonb AND fuente->>'operacion_origen_id'=operacion_origen_id::text
  AND fuente->>'checkout_sha256'=unidades_canonico::jsonb->>'checkout_sha256'
  AND fuente->>'venta_id'=unidades_canonico::jsonb->>'venta_id')
);
ALTER TABLE public.fiscal_nc_comercial_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_comercial_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_comercial_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_comercial_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_comercial_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_comercial_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en vínculo NC.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_comercial_inmutable ON public.fiscal_nc_comercial_homologacion;
CREATE TRIGGER fiscal_nc_comercial_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_comercial_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

CREATE OR REPLACE FUNCTION public.fiscal_ligar_comercial_nc_homologacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta_uuid uuid; comercial jsonb; evidencia jsonb; unidades jsonb; linea jsonb; original jsonb; metadata jsonb;
 componente jsonb; meta_componente jsonb; cantidad numeric; fisico numeric; n integer; canonico text;
BEGIN
 venta_uuid:=(NEW.datos#>>'{origen,venta_id}')::uuid;
 -- 026 toma los locks de venta/actor/factura usados por la reserva027. Los
 -- registros hijos ya existentes se estabilizan sin invertir espera checkout→venta.
 PERFORM public.cargar_representacion_fiscal_homologacion(NEW.actor_auth_id,venta_uuid,NEW.operacion_origen_id);
 PERFORM 1 FROM public.pagos_venta WHERE pagos_venta.venta_id=venta_uuid ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.detalles_venta WHERE detalles_venta.venta_id=venta_uuid ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.movimientos_stock WHERE notas='Checkout manual '||venta_uuid::text
  AND kiosco_id=(SELECT kiosco_id FROM public.ventas WHERE id=venta_uuid) ORDER BY id FOR SHARE NOWAIT;
 comercial:=public.cargar_fuente_comercial_nc_homologacion(NEW.actor_auth_id,venta_uuid,NEW.operacion_origen_id);
 evidencia:=public.cargar_unidades_nc_homologacion(NEW.actor_auth_id,venta_uuid,NEW.operacion_origen_id);
 IF evidencia->>'estado' IS DISTINCT FROM 'CAPTURADAS' OR evidencia->>'checkout_sha256' IS DISTINCT FROM comercial->>'checkout_sha256'
  OR comercial->>'solicitud_sha256' IS DISTINCT FROM NEW.datos#>>'{origen,solicitud_sha256}' THEN
  RAISE EXCEPTION 'Faltan unidades originales para el caso NC.' USING ERRCODE='55000';
 END IF;
 unidades:=(evidencia#>>'{unidades,canonico}')::jsonb;
 IF jsonb_typeof(unidades->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(unidades->'lineas')<>jsonb_array_length(comercial->'lineas') THEN
  RAISE EXCEPTION 'Metadata NC incompatible.' USING ERRCODE='22023';
 END IF;
 FOR linea IN SELECT value FROM jsonb_array_elements(NEW.datos->'lineas') LOOP
  SELECT value INTO original FROM jsonb_array_elements(comercial->'lineas') WHERE value->>'detalle_id'=linea->>'detalle_id';
  SELECT value INTO metadata FROM jsonb_array_elements(unidades->'lineas') WHERE value->>'detalle_id'=linea->>'detalle_id';
  cantidad:=(linea->>'cantidad')::numeric;
  IF original IS NULL OR metadata IS NULL OR metadata->>'producto_id' IS DISTINCT FROM original->>'producto_id'
   OR metadata->>'tipo' IS DISTINCT FROM original->>'tipo' OR jsonb_typeof(metadata->'es_pesable') IS DISTINCT FROM 'boolean'
   OR metadata->>'unidad_medida' NOT IN ('UN','KG','GR','LT')
   OR (metadata->>'es_pesable')::boolean=false AND cantidad<>trunc(cantidad)
   OR original->>'tipo'='LIBRE' AND (linea->>'reingresa_stock')::boolean
   OR jsonb_array_length(metadata->'componentes')<>jsonb_array_length(original->'componentes') THEN
   RAISE EXCEPTION 'Cantidad o reposición NC incompatible.' USING ERRCODE='22023';
  END IF;
  n:=0;
  FOR componente IN SELECT value FROM jsonb_array_elements(original->'componentes') LOOP
   meta_componente:=metadata->'componentes'->n; n:=n+1;
   fisico:=cantidad*(componente->>'cantidad')::numeric;
   IF meta_componente->>'producto_id' IS DISTINCT FROM componente->>'producto_id'
    OR jsonb_typeof(meta_componente->'es_pesable') IS DISTINCT FROM 'boolean' OR meta_componente->>'unidad_medida' NOT IN ('UN','KG','GR','LT')
    OR ((meta_componente->>'es_pesable')::boolean AND fisico<>trunc(fisico,3))
    OR ((meta_componente->>'es_pesable')::boolean=false AND fisico<>trunc(fisico)) THEN
    RAISE EXCEPTION 'Receta física NC incompatible.' USING ERRCODE='22023';
   END IF;
  END LOOP;
 END LOOP;
 -- Sólo hechos verificados en este instante. Una intención/aplicación futura
 -- deberá revalidar bajo sus locks; ni este registro ni un pago efectivo son permiso.
 canonico:=public.fiscal_json_canonico_homologacion(comercial);
 INSERT INTO public.fiscal_nc_comercial_homologacion(solicitud_id,operacion_origen_id,actor_auth_id,propuesta_sha256,fuente,fuente_canonico,fuente_sha256,unidades_canonico,unidades_sha256)
 VALUES(NEW.id,NEW.operacion_origen_id,NEW.actor_auth_id,NEW.propuesta_sha256,comercial,canonico,encode(sha256(convert_to(canonico,'UTF8')),'hex'),evidencia#>>'{unidades,canonico}',evidencia#>>'{unidades,sha256}');
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_ligar_comercial_nc_homologacion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_nc_ligar_comercial ON public.fiscal_nc_borradores_homologacion;
CREATE TRIGGER fiscal_nc_ligar_comercial AFTER INSERT ON public.fiscal_nc_borradores_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_ligar_comercial_nc_homologacion();
COMMIT;
