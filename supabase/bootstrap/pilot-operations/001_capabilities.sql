-- Operator-controlled opt-in. Installation never enables a financial capability.
BEGIN;
CREATE TABLE IF NOT EXISTS public.piloto_operaciones_capacidades (
  kiosco_id uuid PRIMARY KEY REFERENCES public.kioscos(id),
  envases boolean NOT NULL DEFAULT false,
  devoluciones_efectivo boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.piloto_operaciones_capacidades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.piloto_operaciones_capacidades FROM PUBLIC,anon,authenticated,service_role;
REVOKE SELECT(kiosco_id,envases,devoluciones_efectivo,actualizado_en),
  INSERT(kiosco_id,envases,devoluciones_efectivo,actualizado_en),
  UPDATE(kiosco_id,envases,devoluciones_efectivo,actualizado_en),
  REFERENCES(kiosco_id,envases,devoluciones_efectivo,actualizado_en)
  ON public.piloto_operaciones_capacidades FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(r,'public.piloto_operaciones_capacidades','INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(r,'public.piloto_operaciones_capacidades','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Acceso heredado al gate del piloto: %',r;
    END IF;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.exigir_capacidad_operativa_piloto(p_kiosco_id uuid,p_capacidad text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE capacidades public.piloto_operaciones_capacidades%ROWTYPE; habilitada boolean;
BEGIN
  SELECT * INTO capacidades FROM public.piloto_operaciones_capacidades WHERE kiosco_id=p_kiosco_id FOR SHARE;
  habilitada:=CASE p_capacidad WHEN 'ENVASES' THEN capacidades.envases
    WHEN 'DEVOLUCIONES_EFECTIVO' THEN capacidades.devoluciones_efectivo ELSE false END;
  IF capacidades.kiosco_id IS NULL OR habilitada IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Módulo operativo no habilitado para el comercio' USING ERRCODE='42501';
  END IF;
END $$;
ALTER FUNCTION public.exigir_capacidad_operativa_piloto(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.exigir_capacidad_operativa_piloto(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
