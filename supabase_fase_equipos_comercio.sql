-- Ejecutar antes de publicar el formulario de equipos del comercio.
BEGIN;
ALTER TABLE public.kioscos
  ADD COLUMN IF NOT EXISTS equipos_comercio jsonb;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kioscos'::regclass AND conname = 'kioscos_equipos_comercio_objeto'
  ) THEN
    ALTER TABLE public.kioscos ADD CONSTRAINT kioscos_equipos_comercio_objeto
      CHECK (equipos_comercio IS NULL OR jsonb_typeof(equipos_comercio) = 'object');
  END IF;
END $$;
COMMENT ON COLUMN public.kioscos.equipos_comercio IS
  'Inventario declarado de impresora, lector y terminal Point. No guardar credenciales. No acredita compatibilidad ni conexión.';
COMMIT;
