-- Base privada del reemplazo transaccional. No habilita aún la devolución.
-- No revoca permisos del circuito antiguo. Aplicar junto con la futura RPC.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_identidad_comercio_devolucion_idx
  ON public.ventas(id,kiosco_id);
CREATE TABLE IF NOT EXISTS public.devoluciones_parciales_atomicas (
  id uuid PRIMARY KEY,
  venta_id uuid NOT NULL,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  solicitud jsonb NOT NULL,
  resultado jsonb NOT NULL,
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(venta_id,kiosco_id) REFERENCES public.ventas(id,kiosco_id),
  CHECK ((jsonb_typeof(solicitud)='object'
    AND solicitud->>'id'=id::text AND solicitud->>'ventaId'=venta_id::text
    AND solicitud->'version'='1'::jsonb AND jsonb_typeof(solicitud->'items')='array') IS TRUE),
  CHECK ((jsonb_typeof(resultado)='object'
    AND resultado->>'id'=id::text AND resultado->>'venta_id'=venta_id::text
    AND resultado->>'kiosco_id'=kiosco_id::text
    AND jsonb_typeof(resultado->'detalles')='array'
    AND jsonb_typeof(resultado->'monto_total')='number') IS TRUE)
);
CREATE INDEX IF NOT EXISTS devoluciones_parciales_venta_idx
  ON public.devoluciones_parciales_atomicas(venta_id);
ALTER TABLE public.devoluciones_parciales_atomicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.devoluciones_parciales_atomicas FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE columnas text; rol text;
BEGIN
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas
    FROM pg_attribute WHERE attrelid='public.devoluciones_parciales_atomicas'::regclass
      AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s)
    ON TABLE public.devoluciones_parciales_atomicas FROM PUBLIC,anon,authenticated,service_role',
    columnas,columnas,columnas,columnas);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(rol,'public.devoluciones_parciales_atomicas','INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(rol,'public.devoluciones_parciales_atomicas','INSERT,UPDATE')
      OR has_table_privilege(rol,'public.devoluciones_parciales_atomicas','SELECT')
      OR has_any_column_privilege(rol,'public.devoluciones_parciales_atomicas','SELECT') THEN
      RAISE EXCEPTION 'El rol % conserva acceso heredado en devoluciones; revisar membresías.',rol;
    END IF;
  END LOOP;
END $$;
-- Sin políticas ni grants: sólo la RPC propietaria futura escribirá el resultado
-- una vez confirmados cabecera, detalles, stock, finanzas y auditoría en su TX.
COMMIT;
