-- Aplicar después de supabase_rubro_fotocopiadora.sql y la fase de capacidades.
-- El cambio real de rubro aplica sus capacidades iniciales de forma atómica.
-- Guardar el mismo rubro conserva las preferencias configuradas por el dueño.
BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_capacidades_al_cambiar_rubro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.rubro IS DISTINCT FROM OLD.rubro THEN
    NEW.capacidades_operativas := jsonb_build_object(
      'envases', NEW.rubro = 'KIOSCO',
      'balanza', NEW.rubro IN ('KIOSCO', 'PETSHOP_VETERINARIA'),
      'vencimientos', NEW.rubro IN ('KIOSCO', 'PETSHOP_VETERINARIA'),
      'serviciosRapidos', NEW.rubro = 'FOTOCOPIADORA_LIBRERIA'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kioscos_capacidades_cambio_rubro ON public.kioscos;
CREATE TRIGGER kioscos_capacidades_cambio_rubro
BEFORE UPDATE OF rubro ON public.kioscos
FOR EACH ROW EXECUTE FUNCTION public.aplicar_capacidades_al_cambiar_rubro();

COMMENT ON COLUMN public.kioscos.rubro IS
  'Rubro comercial: KIOSCO, FOTOCOPIADORA_LIBRERIA, GENERAL, PETSHOP_VETERINARIA, ELECTRONICA_CELULARES';

COMMIT;
