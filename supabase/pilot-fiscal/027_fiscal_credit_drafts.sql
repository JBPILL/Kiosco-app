-- Borradores NC y saldo privado. NO habilita envío, devolución, caja o stock.
-- Requiere 001–026 compatibles. Instalación remota con autorización específica.
BEGIN;
CREATE OR REPLACE FUNCTION public.fiscal_nc_decimal(p_valor jsonb,p_precision integer DEFAULT 2)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$ BEGIN
 IF p_precision IS NULL OR p_precision NOT IN (2,3,4) OR jsonb_typeof(p_valor) IS DISTINCT FROM 'string'
  OR (p_valor#>>'{}') !~ ('^(0|[1-9][0-9]{0,9})\.[0-9]{'||p_precision||'}$') THEN
  RAISE EXCEPTION 'Decimal NC inválido.' USING ERRCODE='22023'; END IF;
 RETURN (p_valor#>>'{}')::numeric;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_nc_texto(p_valor jsonb,p_limite integer)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$ BEGIN
 IF jsonb_typeof(p_valor) IS DISTINCT FROM 'string' OR btrim(p_valor#>>'{}')='' OR char_length(p_valor#>>'{}')>p_limite
  OR (p_valor#>>'{}') ~ ('['||chr(1)||'-'||chr(31)||chr(127)||'-'||chr(159)||']') THEN
  RAISE EXCEPTION 'Texto NC inválido.' USING ERRCODE='22023'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_nc_tributo_clave(p_valor jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT public.fiscal_json_canonico_homologacion(jsonb_build_array(p_valor->'id',p_valor->'descripcion',p_valor->'alicuota'))
$$;
CREATE OR REPLACE FUNCTION public.fiscal_validar_borrador_nc(p_datos jsonb,p_fuente jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb:=p_fuente#>'{constancia,solicitud,solicitud}'; esperado jsonb; x jsonb; original jsonb; campo text;
 total numeric; suma numeric:=0; ids text[]; orden text[]; tributo text; base numeric; importe numeric;
BEGIN
 PERFORM public.checkout_objeto(p_datos,ARRAY['version','solicitud_id','fecha','motivo','condicion_iva_receptor','lineas','importes','iva','tributos','clase','entorno','tipo_nota_credito','origen']);
 IF p_datos->'version' IS DISTINCT FROM '1'::jsonb OR p_datos->'clase' IS DISTINCT FROM '"DEVOLUCION"'::jsonb
  OR p_datos->'entorno' IS DISTINCT FROM '"HOMOLOGACION"'::jsonb
  OR jsonb_typeof(p_datos->'solicitud_id') IS DISTINCT FROM 'string'
  OR (p_datos->>'solicitud_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_datos->'tipo_nota_credito' IS DISTINCT FROM to_jsonb(CASE (cuerpo->>'tipoComprobante')::integer WHEN 1 THEN 3 WHEN 6 THEN 8 WHEN 11 THEN 13 END)
  OR jsonb_typeof(p_datos->'condicion_iva_receptor') IS DISTINCT FROM 'number'
  OR (p_datos->>'condicion_iva_receptor') !~ '^[1-9][0-9]*$' OR (p_datos->>'condicion_iva_receptor')::numeric>2147483647 THEN
  RAISE EXCEPTION 'Identidad NC inválida.' USING ERRCODE='22023'; END IF;
 esperado:=jsonb_build_object('venta_id',p_fuente->'venta_id','operacion_id',p_fuente->'operacion_id',
  'solicitud_sha256',p_fuente#>'{constancia,solicitud,sha256}','presentacion_sha256',p_fuente#>'{hechos,presentacion_sha256}',
  'cae',p_fuente#>'{constancia,autorizacion,cae}','cuit',cuerpo->'cuitEmisor','tipo',cuerpo->'tipoComprobante',
  'punto_venta',cuerpo->'puntoVenta','numero',cuerpo->'numero','fecha',cuerpo->'fecha',
  'tipo_documento_receptor',cuerpo->'tipoDocumento','numero_documento_receptor',cuerpo->'numeroDocumento');
 IF p_datos->'origen' IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'Factura NC distinta.' USING ERRCODE='22023'; END IF;
 PERFORM public.fiscal_nc_texto(p_datos->'motivo',120);
 IF jsonb_typeof(p_datos->'fecha') IS DISTINCT FROM 'string' OR (p_datos->>'fecha') !~ '^[0-9]{8}$'
  OR to_char(to_date(p_datos->>'fecha','YYYYMMDD'),'YYYYMMDD') IS DISTINCT FROM p_datos->>'fecha'
  OR p_datos->>'fecha'<cuerpo->>'fecha' OR p_datos->>'fecha'>to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') THEN
  RAISE EXCEPTION 'Fecha NC inválida.' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_datos->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'lineas') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(p_datos->'iva') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'iva')>100
  OR jsonb_typeof(p_datos->'tributos') IS DISTINCT FROM 'array' OR jsonb_array_length(p_datos->'tributos')>100 THEN
  RAISE EXCEPTION 'Detalle NC inválido.' USING ERRCODE='22023'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_datos->'lineas') LOOP
  PERFORM public.checkout_objeto(x,ARRAY['detalle_id','cantidad','importe','reingresa_stock']);
  IF jsonb_typeof(x->'detalle_id') IS DISTINCT FROM 'string' OR (x->>'detalle_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR jsonb_typeof(x->'reingresa_stock') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Detalle NC inválido.' USING ERRCODE='22023'; END IF;
  SELECT value INTO original FROM jsonb_array_elements(p_fuente#>'{contexto,lineas}') WHERE value->>'detalle_id'=x->>'detalle_id';
  IF original IS NULL OR public.fiscal_nc_decimal(x->'cantidad',3)<=0 OR public.fiscal_nc_decimal(x->'cantidad',3)>(original->>'cantidad')::numeric
   OR public.fiscal_nc_decimal(x->'importe')>(original->>'subtotal')::numeric THEN RAISE EXCEPTION 'Detalle NC fuera de factura.' USING ERRCODE='22023'; END IF;
  suma:=suma+public.fiscal_nc_decimal(x->'importe');
 END LOOP;
 SELECT array_agg(e->>'detalle_id' ORDER BY n),array_agg(DISTINCT e->>'detalle_id' COLLATE "C" ORDER BY e->>'detalle_id' COLLATE "C") INTO ids,orden
  FROM jsonb_array_elements(p_datos->'lineas') WITH ORDINALITY t(e,n);
 IF ids IS DISTINCT FROM orden THEN RAISE EXCEPTION 'Orden NC inválido.' USING ERRCODE='22023'; END IF;
 PERFORM public.checkout_objeto(p_datos->'importes',ARRAY['total','neto','iva','noGravado','exento','tributos']);
 total:=public.fiscal_nc_decimal(p_datos#>'{importes,total}');
 IF total<=0 OR total<>suma THEN RAISE EXCEPTION 'Total NC distinto de renglones.' USING ERRCODE='22023'; END IF;
 suma:=0;
 FOREACH campo IN ARRAY ARRAY['total','neto','iva','noGravado','exento','tributos'] LOOP
  importe:=public.fiscal_nc_decimal(p_datos->'importes'->campo);
  IF importe>(cuerpo->'importes'->>campo)::numeric THEN RAISE EXCEPTION 'Importe NC supera factura.' USING ERRCODE='22023'; END IF;
  IF campo<>'total' THEN suma:=suma+importe; END IF;
 END LOOP;
 IF suma<>total THEN RAISE EXCEPTION 'Suma fiscal NC inválida.' USING ERRCODE='22023'; END IF;
 suma:=0;base:=0;
 FOR x IN SELECT value FROM jsonb_array_elements(p_datos->'iva') LOOP
  PERFORM public.checkout_objeto(x,ARRAY['id','base','importe']);
  IF jsonb_typeof(x->'id') IS DISTINCT FROM 'number' OR (x->>'id') !~ '^[1-9][0-9]*$' OR (x->>'id')::numeric>2147483647 THEN RAISE EXCEPTION 'IVA NC inválido.' USING ERRCODE='22023'; END IF;
  SELECT value INTO original FROM jsonb_array_elements(cuerpo->'iva') WHERE value->'id'=x->'id';
  IF original IS NULL OR public.fiscal_nc_decimal(x->'base')>(original->>'base')::numeric OR public.fiscal_nc_decimal(x->'importe')>(original->>'importe')::numeric THEN RAISE EXCEPTION 'IVA NC fuera de factura.' USING ERRCODE='22023'; END IF;
  suma:=suma+public.fiscal_nc_decimal(x->'importe');base:=base+public.fiscal_nc_decimal(x->'base');
 END LOOP;
 SELECT array_agg((e->>'id')::integer ORDER BY n)::text[],array_agg(DISTINCT (e->>'id')::integer ORDER BY (e->>'id')::integer)::text[] INTO ids,orden FROM jsonb_array_elements(p_datos->'iva') WITH ORDINALITY t(e,n);
 IF ids IS DISTINCT FROM orden OR suma<>(p_datos#>>'{importes,iva}')::numeric
  OR (CASE WHEN cuerpo->'tipoComprobante'='11'::jsonb THEN jsonb_array_length(p_datos->'iva')<>0 OR suma<>0 ELSE base<>(p_datos#>>'{importes,neto}')::numeric END) THEN RAISE EXCEPTION 'Suma IVA NC inválida.' USING ERRCODE='22023'; END IF;
 suma:=0;
 FOR x IN SELECT value FROM jsonb_array_elements(p_datos->'tributos') LOOP
  PERFORM public.checkout_objeto(x,ARRAY['id','descripcion','base','alicuota','importe']);
  PERFORM public.fiscal_nc_texto(x->'descripcion',80);
  PERFORM public.fiscal_nc_decimal(x->'alicuota',4);
  IF jsonb_typeof(x->'id') IS DISTINCT FROM 'number' OR (x->>'id') !~ '^[1-9][0-9]*$' OR (x->>'id')::numeric>2147483647
   OR (x->>'alicuota') !~ '^(0|[1-9][0-9]{0,2})\.[0-9]{2}00$' THEN RAISE EXCEPTION 'Tributo NC inválido.' USING ERRCODE='22023'; END IF;
  tributo:=public.fiscal_nc_tributo_clave(x);
  SELECT sum((e->>'base')::numeric),sum((e->>'importe')::numeric) INTO base,importe FROM jsonb_array_elements(cuerpo->'tributos') e WHERE public.fiscal_nc_tributo_clave(e)=tributo;
  IF base IS NULL OR public.fiscal_nc_decimal(x->'base')>base OR public.fiscal_nc_decimal(x->'importe')>importe THEN RAISE EXCEPTION 'Tributo NC fuera de factura.' USING ERRCODE='22023'; END IF;
  suma:=suma+public.fiscal_nc_decimal(x->'importe');
 END LOOP;
 SELECT array_agg(public.fiscal_nc_tributo_clave(e) ORDER BY n),array_agg(DISTINCT public.fiscal_nc_tributo_clave(e) COLLATE "C" ORDER BY public.fiscal_nc_tributo_clave(e) COLLATE "C") INTO ids,orden FROM jsonb_array_elements(p_datos->'tributos') WITH ORDINALITY t(e,n);
 IF ids IS DISTINCT FROM orden OR suma<>(p_datos#>>'{importes,tributos}')::numeric THEN RAISE EXCEPTION 'Suma tributos NC inválida.' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_nc_decimal(jsonb,integer),public.fiscal_nc_texto(jsonb,integer),public.fiscal_nc_tributo_clave(jsonb),public.fiscal_validar_borrador_nc(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.fiscal_nc_borradores_homologacion (
 id uuid PRIMARY KEY, operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id),
 actor_auth_id uuid NOT NULL, secuencia integer NOT NULL CHECK(secuencia>0),
 canonico text NOT NULL CHECK(octet_length(canonico)<=60000), datos jsonb NOT NULL,
 propuesta_sha256 text NOT NULL CHECK(propuesta_sha256=encode(sha256(convert_to(canonico,'UTF8')),'hex')),
 credencial_id uuid NOT NULL, certificado_sha256 text NOT NULL CHECK(certificado_sha256 ~ '^[0-9a-f]{64}$'), emisor_revision integer NOT NULL CHECK(emisor_revision>0),
 punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 99998), parametros_revision integer NOT NULL REFERENCES public.fiscal_parametros_homologacion(revision),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(operacion_origen_id,secuencia),
 CHECK(jsonb_typeof(datos)='object' AND datos=canonico::jsonb AND id=(datos->>'solicitud_id')::uuid)
);
CREATE TABLE IF NOT EXISTS public.fiscal_nc_cancelaciones_homologacion (
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_borradores_homologacion(id), actor_auth_id uuid NOT NULL,
 propuesta_sha256 text NOT NULL, creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['fiscal_nc_borradores_homologacion','fiscal_nc_cancelaciones_homologacion'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
  SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en NC.'; END IF;
  END LOOP;
  EXECUTE format('DROP TRIGGER IF EXISTS fiscal_nc_inmutable ON public.%I',tabla);
  EXECUTE format('CREATE TRIGGER fiscal_nc_inmutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable()',tabla);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_nc_ack(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('version',1,'entorno','HOMOLOGACION','solicitud_id',b.id,'venta_id',b.datos#>'{origen,venta_id}',
 'operacion_origen_id',b.operacion_origen_id,'propuesta_sha256',b.propuesta_sha256,
 'estado',CASE WHEN EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion c WHERE c.solicitud_id=b.id) THEN 'CANCELADA' ELSE 'SALDO_RESERVADO_NO_EMITIR' END,
 'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false) FROM public.fiscal_nc_borradores_homologacion b WHERE b.id=p_id
$$;
REVOKE ALL ON FUNCTION public.fiscal_nc_ack(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guardar_borrador_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_canonico text,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE fuente jsonb; datos jsonb; cuerpo jsonb; x jsonb; original jsonb; previo jsonb; campo text; clave text; caso_id uuid;
 anterior public.fiscal_nc_borradores_homologacion%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE; parametros public.fiscal_parametros_homologacion%ROWTYPE;
 venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE; cantidad numeric; importe numeric; base numeric; previo_importe numeric; secuencia integer;
BEGIN
 fuente:=public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 IF p_canonico IS NULL OR octet_length(p_canonico)>60000 OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$'
  OR p_sha IS DISTINCT FROM encode(sha256(convert_to(p_canonico,'UTF8')),'hex') THEN RAISE EXCEPTION 'Canónico NC inválido.' USING ERRCODE='22023'; END IF;
 datos:=p_canonico::jsonb;
 IF p_canonico IS DISTINCT FROM public.fiscal_json_canonico_homologacion(datos) OR jsonb_typeof(datos->'solicitud_id') IS DISTINCT FROM 'string'
  OR (datos->>'solicitud_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Canónico NC inválido.' USING ERRCODE='22023'; END IF;
 caso_id:=(datos->>'solicitud_id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||caso_id::text,0));
 SELECT * INTO anterior FROM public.fiscal_nc_borradores_homologacion b WHERE b.id=caso_id FOR SHARE;
 IF FOUND THEN
  IF anterior.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR anterior.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id
   OR anterior.propuesta_sha256 IS DISTINCT FROM p_sha OR anterior.canonico IS DISTINCT FROM p_canonico THEN RAISE EXCEPTION 'Conservar identidad NC original.' USING ERRCODE='22023'; END IF;
  RETURN public.fiscal_nc_ack(caso_id);
 END IF;
 PERFORM public.fiscal_validar_borrador_nc(datos,fuente);
 SELECT * INTO venta FROM public.ventas WHERE public.ventas.id=p_venta_id;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE public.fiscal_operaciones_homologacion.id=p_operacion_origen_id;
 cuerpo:=fuente#>'{constancia,solicitud,solicitud}';
 IF venta.estado IS DISTINCT FROM 'COMPLETADA' OR venta.total IS DISTINCT FROM (cuerpo#>>'{importes,total}')::numeric
  OR op.venta_snapshot->'detalles' IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.detalles_venta d WHERE d.venta_id=p_venta_id)
  OR EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=p_venta_id) THEN RAISE EXCEPTION 'Historia comercial NC incompatible.' USING ERRCODE='22023'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=op.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.cuit_emisor IS DISTINCT FROM cuerpo->>'cuitEmisor' OR emisor.punto_venta>99998 THEN RAISE EXCEPTION 'Emisor NC no disponible.' USING ERRCODE='42501'; END IF;
 SELECT * INTO parametros FROM public.fiscal_parametros_homologacion WHERE habilitado AND consultado_en<=clock_timestamp() AND vence_en>clock_timestamp() ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF NOT FOUND OR parametros.consultado_en>clock_timestamp() OR parametros.vence_en<=clock_timestamp()
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parametros.condiciones) c WHERE c->'id'=datos->'condicion_iva_receptor')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(datos->'iva') i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parametros.alicuotas) a WHERE a->'id'=i->'id')) THEN RAISE EXCEPTION 'Parámetros NC no disponibles.' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(b.datos),'[]'::jsonb) INTO previo FROM public.fiscal_nc_borradores_homologacion b
  WHERE b.operacion_origen_id=p_operacion_origen_id AND NOT EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion c WHERE c.solicitud_id=b.id);
 FOREACH campo IN ARRAY ARRAY['total','neto','iva','noGravado','exento','tributos'] LOOP
  SELECT coalesce(sum((p->'importes'->>campo)::numeric),0) INTO importe FROM jsonb_array_elements(previo) p;
  IF importe+(datos->'importes'->>campo)::numeric>(cuerpo->'importes'->>campo)::numeric THEN RAISE EXCEPTION 'Saldo fiscal NC insuficiente.' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(datos->'lineas') LOOP
  SELECT value INTO original FROM jsonb_array_elements(fuente#>'{contexto,lineas}') WHERE value->>'detalle_id'=x->>'detalle_id';
  SELECT coalesce(sum((l->>'cantidad')::numeric),0),coalesce(sum((l->>'importe')::numeric),0) INTO cantidad,importe
   FROM jsonb_array_elements(previo) p CROSS JOIN LATERAL jsonb_array_elements(p->'lineas') l WHERE l->>'detalle_id'=x->>'detalle_id';
  IF cantidad+(x->>'cantidad')::numeric>(original->>'cantidad')::numeric OR importe+(x->>'importe')::numeric>(original->>'subtotal')::numeric
   OR (x->>'importe')::numeric IS DISTINCT FROM round((original->>'subtotal')::numeric*(cantidad+(x->>'cantidad')::numeric)/(original->>'cantidad')::numeric,2)-round((original->>'subtotal')::numeric*cantidad/(original->>'cantidad')::numeric,2) THEN RAISE EXCEPTION 'Saldo o reparto comercial NC distinto.' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(datos->'iva') LOOP
  SELECT value INTO original FROM jsonb_array_elements(cuerpo->'iva') WHERE value->'id'=x->'id';
  SELECT coalesce(sum((l->>'base')::numeric),0),coalesce(sum((l->>'importe')::numeric),0) INTO base,importe FROM jsonb_array_elements(previo) p CROSS JOIN LATERAL jsonb_array_elements(p->'iva') l WHERE l->'id'=x->'id';
  IF base+(x->>'base')::numeric>(original->>'base')::numeric OR importe+(x->>'importe')::numeric>(original->>'importe')::numeric THEN RAISE EXCEPTION 'Saldo IVA NC insuficiente.' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(datos->'tributos') LOOP
  clave:=public.fiscal_nc_tributo_clave(x);
  SELECT sum((l->>'base')::numeric),sum((l->>'importe')::numeric) INTO cantidad,importe FROM jsonb_array_elements(cuerpo->'tributos') l WHERE public.fiscal_nc_tributo_clave(l)=clave;
  SELECT coalesce(sum((l->>'base')::numeric),0),coalesce(sum((l->>'importe')::numeric),0) INTO base,previo_importe FROM jsonb_array_elements(previo) p CROSS JOIN LATERAL jsonb_array_elements(p->'tributos') l WHERE public.fiscal_nc_tributo_clave(l)=clave;
  IF base+(x->>'base')::numeric>cantidad OR previo_importe+(x->>'importe')::numeric>importe THEN RAISE EXCEPTION 'Saldo tributo NC insuficiente.' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT coalesce(max(b.secuencia),0)+1 INTO secuencia FROM public.fiscal_nc_borradores_homologacion b WHERE b.operacion_origen_id=p_operacion_origen_id;
 INSERT INTO public.fiscal_nc_borradores_homologacion(id,operacion_origen_id,actor_auth_id,secuencia,canonico,datos,propuesta_sha256,credencial_id,certificado_sha256,emisor_revision,punto_venta,parametros_revision)
  VALUES(caso_id,p_operacion_origen_id,p_actor_auth_id,secuencia,p_canonico,datos,p_sha,emisor.credencial_id,emisor.certificado_sha256,emisor.revision,emisor.punto_venta,parametros.revision);
 RETURN public.fiscal_nc_ack(caso_id);
END $$;
CREATE OR REPLACE FUNCTION public.cargar_borrador_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caso public.fiscal_nc_borradores_homologacion%ROWTYPE;
BEGIN
 PERFORM public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id THEN RAISE EXCEPTION 'Consulta NC no autorizada.' USING ERRCODE='42501'; END IF;
 RETURN public.fiscal_nc_ack(p_id);
END $$;
CREATE OR REPLACE FUNCTION public.cancelar_borrador_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caso public.fiscal_nc_borradores_homologacion%ROWTYPE;
BEGIN
 PERFORM public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||p_id::text,0));
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF NOT FOUND OR caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR caso.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Cancelación NC no autorizada.' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion WHERE solicitud_id=p_id) THEN RETURN public.fiscal_nc_ack(p_id); END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_borradores_homologacion b WHERE b.operacion_origen_id=p_operacion_origen_id AND b.secuencia>caso.secuencia
  AND NOT EXISTS(SELECT 1 FROM public.fiscal_nc_cancelaciones_homologacion c WHERE c.solicitud_id=b.id)) THEN RAISE EXCEPTION 'Cancelar primero borradores NC posteriores.' USING ERRCODE='55000'; END IF;
 INSERT INTO public.fiscal_nc_cancelaciones_homologacion(solicitud_id,actor_auth_id,propuesta_sha256) VALUES(p_id,p_actor_auth_id,p_sha);
 RETURN public.fiscal_nc_ack(p_id);
END $$;
REVOKE ALL ON FUNCTION public.guardar_borrador_nc_homologacion(uuid,uuid,uuid,text,text),public.cargar_borrador_nc_homologacion(uuid,uuid,uuid,uuid),public.cancelar_borrador_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.guardar_borrador_nc_homologacion(uuid,uuid,uuid,text,text),public.cargar_borrador_nc_homologacion(uuid,uuid,uuid,uuid),public.cancelar_borrador_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
