-- Módulo aditivo: aplicar sólo después del bootstrap estricto completo.
-- No sustituye ni modifica los 43 archivos del manifiesto histórico.
BEGIN;

CREATE OR REPLACE FUNCTION public.restaurar_contacto_backup(
  p_operacion_id uuid, p_kiosco_id uuid, p_tabla text, p_registro_id uuid, p_datos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  actor_auth uuid:=auth.uid();
  perfil public.usuarios%ROWTYPE;
  operacion public.operaciones_escritura%ROWTYPE;
  cliente public.clientes%ROWTYPE;
  proveedor public.proveedores%ROWTYPE;
  req jsonb; esperado jsonb; persistido jsonb; salida jsonb;
  entrada record; permitidos text[]; creado boolean; saldo numeric;
BEGIN
  BEGIN
    SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=actor_auth AND activo FOR UPDATE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Se requiere un único dueño activo.' USING ERRCODE='42501';
  END;
  IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin
    OR perfil.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
    RAISE EXCEPTION 'Sólo el dueño del mismo comercio puede restaurar contactos.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=p_kiosco_id AND estado_suscripcion='ACTIVO' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  IF p_operacion_id IS NULL OR p_registro_id IS NULL OR p_tabla IS NULL
    OR p_tabla NOT IN ('clientes','proveedores') OR jsonb_typeof(p_datos) IS DISTINCT FROM 'object'
    OR octet_length(p_datos::text)>20000 THEN
    RAISE EXCEPTION 'Solicitud de contacto inválida.' USING ERRCODE='22023';
  END IF;
  permitidos:=CASE WHEN p_tabla='clientes' THEN
    ARRAY['nombre','telefono','dni_cuit','direccion','email','limite_credito','saldo_deudor','activo','notas','puntos_fidelidad']
    ELSE ARRAY['nombre','contacto_nombre','telefono','email','cuit','dias_visita','cbu_alias','saldo_pendiente','activo'] END;
  FOR entrada IN SELECT key,value FROM jsonb_each(p_datos) LOOP
    IF NOT entrada.key=ANY(permitidos) THEN
      RAISE EXCEPTION 'Campo de contacto no admitido.' USING ERRCODE='22023';
    END IF;
    IF entrada.key IN ('limite_credito','saldo_deudor','saldo_pendiente','puntos_fidelidad') THEN
      IF jsonb_typeof(entrada.value) IS DISTINCT FROM 'number'
        OR (entrada.value::text)::numeric<0 OR (entrada.value::text)::numeric>9999999999.99
        OR (entrada.value::text)::numeric<>round((entrada.value::text)::numeric,2) THEN
        RAISE EXCEPTION 'Importe de contacto inválido.' USING ERRCODE='22023';
      END IF;
      -- El esquema estricto no implementa fidelización. No descartar puntos reales.
      IF entrada.key='puntos_fidelidad' AND (entrada.value::text)::numeric<>0 THEN
        RAISE EXCEPTION 'Esta copia contiene puntos de fidelidad sin contrato de restauración.' USING ERRCODE='22023';
      END IF;
    ELSIF entrada.key='activo' THEN
      IF jsonb_typeof(entrada.value) IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'Estado de contacto inválido.' USING ERRCODE='22023';
      END IF;
    ELSIF jsonb_typeof(entrada.value) NOT IN ('string','null') OR length(entrada.value #>> '{}')>2000 THEN
      RAISE EXCEPTION 'Texto de contacto inválido.' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(p_datos->'nombre') IS DISTINCT FROM 'string'
    OR length(btrim(p_datos->>'nombre')) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Nombre de contacto inválido.' USING ERRCODE='22023';
  END IF;

  req:=jsonb_build_object('tabla',p_tabla,'registro_id',p_registro_id,'datos',p_datos,'actor_auth_id',actor_auth);
  INSERT INTO public.operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud)
    VALUES(p_operacion_id,p_kiosco_id,perfil.id,'BACKUP_CONTACTO',req) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO operacion FROM public.operaciones_escritura WHERE id=p_operacion_id FOR UPDATE;
  IF operacion.kiosco_id IS DISTINCT FROM p_kiosco_id OR operacion.usuario_id IS DISTINCT FROM perfil.id
    OR operacion.tipo IS DISTINCT FROM 'BACKUP_CONTACTO' OR operacion.solicitud IS DISTINCT FROM req THEN
    RAISE EXCEPTION 'La operación ya corresponde a otra solicitud.' USING ERRCODE='22023';
  END IF;
  IF operacion.resultado IS NOT NULL THEN RETURN operacion.resultado; END IF;

  IF p_tabla='clientes' THEN
    SELECT * INTO cliente FROM public.clientes WHERE id=p_registro_id FOR UPDATE;
    creado:=NOT FOUND;
    IF NOT creado AND cliente.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
      RAISE EXCEPTION 'Contacto ajeno al comercio.' USING ERRCODE='42501';
    END IF;
    saldo:=CASE WHEN creado THEN coalesce((p_datos->>'saldo_deudor')::numeric,0) ELSE cliente.saldo_deudor END;
    esperado:=jsonb_build_object('nombre',btrim(p_datos->>'nombre'),'telefono',p_datos->>'telefono',
      'dni_cuit',p_datos->>'dni_cuit','direccion',p_datos->>'direccion','email',p_datos->>'email',
      'limite_credito',coalesce((p_datos->>'limite_credito')::numeric,0),'saldo_deudor',saldo,
      'notas',p_datos->>'notas','activo',coalesce((p_datos->>'activo')::boolean,true));
    IF creado THEN
      INSERT INTO public.clientes(id,kiosco_id,nombre,telefono,dni_cuit,direccion,email,limite_credito,saldo_deudor,notas,activo)
      VALUES(p_registro_id,p_kiosco_id,esperado->>'nombre',esperado->>'telefono',esperado->>'dni_cuit',
        esperado->>'direccion',esperado->>'email',(esperado->>'limite_credito')::numeric,saldo,
        esperado->>'notas',(esperado->>'activo')::boolean) RETURNING to_jsonb(clientes.*) INTO persistido;
    ELSE
      UPDATE public.clientes SET nombre=esperado->>'nombre',telefono=esperado->>'telefono',dni_cuit=esperado->>'dni_cuit',
        direccion=esperado->>'direccion',email=esperado->>'email',limite_credito=(esperado->>'limite_credito')::numeric,
        notas=esperado->>'notas',activo=(esperado->>'activo')::boolean
        WHERE id=p_registro_id AND kiosco_id=p_kiosco_id RETURNING to_jsonb(clientes.*) INTO persistido;
    END IF;
  ELSE
    SELECT * INTO proveedor FROM public.proveedores WHERE id=p_registro_id FOR UPDATE;
    creado:=NOT FOUND;
    IF NOT creado AND proveedor.kiosco_id IS DISTINCT FROM p_kiosco_id THEN
      RAISE EXCEPTION 'Contacto ajeno al comercio.' USING ERRCODE='42501';
    END IF;
    saldo:=CASE WHEN creado THEN coalesce((p_datos->>'saldo_pendiente')::numeric,0) ELSE proveedor.saldo_pendiente END;
    esperado:=jsonb_build_object('nombre',btrim(p_datos->>'nombre'),'contacto_nombre',p_datos->>'contacto_nombre',
      'telefono',p_datos->>'telefono','email',p_datos->>'email','cuit',p_datos->>'cuit',
      'dias_visita',p_datos->>'dias_visita','cbu_alias',p_datos->>'cbu_alias','saldo_pendiente',saldo,
      'activo',coalesce((p_datos->>'activo')::boolean,true));
    IF creado THEN
      INSERT INTO public.proveedores(id,kiosco_id,nombre,contacto_nombre,telefono,email,cuit,dias_visita,cbu_alias,saldo_pendiente,activo)
      VALUES(p_registro_id,p_kiosco_id,esperado->>'nombre',esperado->>'contacto_nombre',esperado->>'telefono',
        esperado->>'email',esperado->>'cuit',esperado->>'dias_visita',esperado->>'cbu_alias',saldo,
        (esperado->>'activo')::boolean) RETURNING to_jsonb(proveedores.*) INTO persistido;
    ELSE
      UPDATE public.proveedores SET nombre=esperado->>'nombre',contacto_nombre=esperado->>'contacto_nombre',
        telefono=esperado->>'telefono',email=esperado->>'email',cuit=esperado->>'cuit',
        dias_visita=esperado->>'dias_visita',cbu_alias=esperado->>'cbu_alias',activo=(esperado->>'activo')::boolean
        WHERE id=p_registro_id AND kiosco_id=p_kiosco_id RETURNING to_jsonb(proveedores.*) INTO persistido;
    END IF;
  END IF;
  IF persistido IS NULL OR NOT persistido @> esperado
    OR persistido->>'id' IS DISTINCT FROM p_registro_id::text
    OR persistido->>'kiosco_id' IS DISTINCT FROM p_kiosco_id::text THEN
    RAISE EXCEPTION 'El servidor no confirmó el contacto restaurado.' USING ERRCODE='40001';
  END IF;
  salida:=jsonb_build_object('id',p_registro_id,'kiosco_id',p_kiosco_id,'creado',creado,
    'saldo_conservado',NOT creado,'registro',persistido);
  UPDATE public.operaciones_escritura SET resultado=salida WHERE id=p_operacion_id;
  RETURN salida;
END;
$$;
REVOKE ALL ON FUNCTION public.restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb) TO authenticated;
COMMIT;
