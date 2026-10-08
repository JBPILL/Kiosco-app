-- Base de cálculo privada. No habilita todavía el circuito de devolución parcial.
BEGIN;
CREATE OR REPLACE FUNCTION public.calcular_reintegro_detalle_historico(
  p_cantidad_original numeric,p_importe_original numeric,p_cantidad_previa numeric,p_cantidad_nueva numeric
) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_cantidad_original IS NULL OR p_importe_original IS NULL OR p_cantidad_previa IS NULL OR p_cantidad_nueva IS NULL
    OR p_cantidad_original::text IN ('NaN','Infinity','-Infinity')
    OR p_importe_original::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad_previa::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad_nueva::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad_original<=0 OR p_importe_original<0 OR p_cantidad_previa<0 OR p_cantidad_nueva<=0
    OR p_cantidad_previa+p_cantidad_nueva>p_cantidad_original
    OR round(p_cantidad_original,3)<>p_cantidad_original
    OR round(p_cantidad_previa,3)<>p_cantidad_previa
    OR round(p_cantidad_nueva,3)<>p_cantidad_nueva
    OR round(p_importe_original,2)<>p_importe_original THEN
    RAISE EXCEPTION 'Cantidad o importe histórico de devolución inválido';
  END IF;
  RETURN round(p_importe_original*(p_cantidad_previa+p_cantidad_nueva)/p_cantidad_original,2)
    -round(p_importe_original*p_cantidad_previa/p_cantidad_original,2);
END $$;
REVOKE ALL ON FUNCTION public.calcular_reintegro_detalle_historico(numeric,numeric,numeric,numeric)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.distribuir_importes_historicos_devolucion(p_total numeric,p_detalles jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE d jsonb; peso numeric; suma numeric:=0; acumulado numeric:=0; previo numeric:=0;
  importe numeric; ids text[]:=ARRAY[]::text[]; resultado jsonb:='[]'::jsonb;
BEGIN
  IF p_total IS NULL OR p_total::text IN ('NaN','Infinity','-Infinity') OR p_total<0 OR round(p_total,2)<>p_total
    OR jsonb_typeof(p_detalles) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Importes históricos inválidos'; END IF;
  IF jsonb_array_length(p_detalles)=0 OR jsonb_array_length(p_detalles)>500 THEN RAISE EXCEPTION 'Detalles históricos inválidos'; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(p_detalles) LOOP
    IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
      OR coalesce(btrim(d->>'id'),'')='' OR (d->>'id')=ANY(ids)
      OR jsonb_typeof(d->'subtotal') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Detalle histórico inválido'; END IF;
    peso:=(d->>'subtotal')::numeric;
    IF peso<0 OR round(peso,2)<>peso THEN RAISE EXCEPTION 'Subtotal histórico inválido'; END IF;
    ids:=array_append(ids,d->>'id'); suma:=suma+peso;
  END LOOP;
  IF suma=0 AND p_total>0 THEN RAISE EXCEPTION 'No se puede distribuir un importe sin subtotales históricos'; END IF;
  -- Orden estable: no cambia la asignación al reordenar el snapshot.
  FOR d IN SELECT value FROM jsonb_array_elements(p_detalles) ORDER BY value->>'id' COLLATE "C" LOOP
    acumulado:=acumulado+(d->>'subtotal')::numeric;
    importe:=CASE WHEN suma=0 THEN 0 ELSE round(p_total*acumulado/suma,2) END;
    resultado:=resultado||jsonb_build_array(jsonb_build_object('detalle_id',d->>'id','importe_neto',importe-previo));
    previo:=importe;
  END LOOP;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.distribuir_importes_historicos_devolucion(numeric,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
-- El llamador obtiene historia y cantidades previas bajo bloqueo de la venta.
-- Esta función no autentica, no lee tablas y no confirma efectos financieros.
CREATE OR REPLACE FUNCTION public.preparar_reintegros_historicos(
  p_total numeric,p_detalles jsonb,p_items jsonb,p_previos jsonb
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE d jsonb; item jsonb; anterior jsonb; netos jsonb; original jsonb;
  ids text[]:=ARRAY[]::text[]; solicitados text[]:=ARRAY[]::text[];
  previos_ids text[]:=ARRAY[]::text[]; cantidad numeric; previa numeric; importe numeric;
  resultado jsonb:='[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_detalles) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_previos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Historia de devolución inválida';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 OR jsonb_array_length(p_previos)>500 THEN
    RAISE EXCEPTION 'Historia de devolución inválida';
  END IF;
  netos:=public.distribuir_importes_historicos_devolucion(p_total,p_detalles);
  FOR d IN SELECT value FROM jsonb_array_elements(p_detalles) LOOP
    IF jsonb_typeof(d->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Historia de devolución inválida'; END IF;
    cantidad:=(d->>'cantidad')::numeric;
    IF cantidad<=0 OR cantidad>999999 OR round(cantidad,3)<>cantidad THEN RAISE EXCEPTION 'Historia de devolución inválida'; END IF;
    ids:=array_append(ids,d->>'id');
  END LOOP;
  FOR anterior IN SELECT value FROM jsonb_array_elements(p_previos) LOOP
    IF jsonb_typeof(anterior) IS DISTINCT FROM 'object'
      OR jsonb_typeof(anterior->'detalle_id') IS DISTINCT FROM 'string'
      OR NOT (anterior->>'detalle_id')=ANY(ids)
      OR (anterior->>'detalle_id')=ANY(previos_ids)
      OR jsonb_typeof(anterior->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Historia de devolución inválida'; END IF;
    previa:=(anterior->>'cantidad')::numeric;
    SELECT value INTO original FROM jsonb_array_elements(p_detalles) WHERE value->>'id'=anterior->>'detalle_id';
    IF previa<0 OR previa>(original->>'cantidad')::numeric OR round(previa,3)<>previa THEN RAISE EXCEPTION 'Historia de devolución inválida'; END IF;
    previos_ids:=array_append(previos_ids,anterior->>'detalle_id');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'detalleId' COLLATE "C" LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(item->'detalleId') IS DISTINCT FROM 'string'
      OR NOT (item->>'detalleId')=ANY(ids)
      OR (item->>'detalleId')=ANY(solicitados)
      OR jsonb_typeof(item->'cantidad') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Historia de devolución inválida'; END IF;
    solicitados:=array_append(solicitados,item->>'detalleId');
    SELECT value INTO original FROM jsonb_array_elements(p_detalles) WHERE value->>'id'=item->>'detalleId';
    SELECT (value->>'importe_neto')::numeric INTO importe FROM jsonb_array_elements(netos) WHERE value->>'detalle_id'=item->>'detalleId';
    SELECT coalesce(sum((value->>'cantidad')::numeric),0) INTO previa FROM jsonb_array_elements(p_previos) WHERE value->>'detalle_id'=item->>'detalleId';
    cantidad:=(item->>'cantidad')::numeric;
    importe:=public.calcular_reintegro_detalle_historico((original->>'cantidad')::numeric,importe,previa,cantidad);
    resultado:=resultado||jsonb_build_array(jsonb_build_object('detalle_id',item->>'detalleId','cantidad',cantidad,'importe',importe));
  END LOOP;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.preparar_reintegros_historicos(numeric,jsonb,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
