-- =============================================================================
-- Costos privados por comercio
-- Aplicar después de supabase_seguridad_roles_rls.sql.
-- Conserva productos.precio_costo como columna de compatibilidad, pero mantiene
-- allí únicamente 0. Los costos reales quedan disponibles para DUEÑO/SUPERADMIN.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.producto_costos (
  producto_id UUID PRIMARY KEY REFERENCES public.productos(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  kiosco_id UUID NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  precio_costo NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El trigger BEFORE registra el costo antes de insertar la fila del producto.
-- Comprobar la FK al COMMIT permite esa escritura atómica sin aceptar huérfanos.
-- ALTER también corrige una instalación previa de esta misma migración.
ALTER TABLE public.producto_costos
  ALTER CONSTRAINT producto_costos_producto_id_fkey DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_producto_costos_kiosco
  ON public.producto_costos (kiosco_id);

ALTER TABLE public.producto_costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "producto_costos_dueno_select" ON public.producto_costos;
CREATE POLICY "producto_costos_dueno_select" ON public.producto_costos
  FOR SELECT TO authenticated
  USING (
    public.auth_es_superadmin()
    OR (
      kiosco_id = public.auth_user_kiosco_id()
      AND public.auth_es_dueno_o_superadmin()
    )
  );

REVOKE ALL ON TABLE public.producto_costos FROM anon, authenticated;
GRANT SELECT ON TABLE public.producto_costos TO authenticated;

-- Idempotente: al volver a aplicar no pisa costos ya migrados con el cero público.
INSERT INTO public.producto_costos (producto_id, kiosco_id, precio_costo)
SELECT p.id, p.kiosco_id, GREATEST(p.precio_costo, 0)
FROM public.productos AS p
WHERE p.precio_costo <> 0
ON CONFLICT (producto_id) DO UPDATE
SET kiosco_id = EXCLUDED.kiosco_id,
    precio_costo = EXCLUDED.precio_costo,
    fecha_actualizacion = now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.productos AS p
    LEFT JOIN public.producto_costos AS pc ON pc.producto_id = p.id
    WHERE p.precio_costo <> 0
      AND (pc.producto_id IS NULL OR pc.precio_costo IS DISTINCT FROM GREATEST(p.precio_costo, 0))
  ) THEN
    RAISE EXCEPTION 'Falló la copia de costos; se cancela la migración sin modificar productos';
  END IF;
END $$;

-- Los costos ya están copiados; vaciar la columna pública antes de instalar el
-- trigger evita depender de claims JWT al ejecutar esta migración administrativa.
UPDATE public.productos
SET precio_costo = 0
WHERE precio_costo <> 0;

-- La tabla de costos no es directamente escribible desde PostgREST. Los clientes
-- actuales siguen escribiendo productos.precio_costo; el trigger deriva ese valor
-- a la tabla protegida y normaliza la columna pública a cero.
CREATE OR REPLACE FUNCTION public.proteger_costo_producto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_costo_cambio NUMERIC(12, 2);
  v_usuario_puede_editar BOOLEAN;
BEGIN
  v_costo_cambio := NEW.precio_costo;
  v_usuario_puede_editar := COALESCE(auth.role() = 'service_role', false)
    OR public.auth_es_superadmin()
    OR (
      public.auth_es_dueno_o_superadmin()
      AND NEW.kiosco_id = public.auth_user_kiosco_id()
    );

  IF TG_OP = 'INSERT' THEN
    IF v_costo_cambio <> 0 AND NOT v_usuario_puede_editar THEN
      RAISE EXCEPTION 'Solo el dueño puede definir el costo del producto'
        USING ERRCODE = '42501';
    END IF;

    IF v_usuario_puede_editar THEN
      INSERT INTO public.producto_costos (producto_id, kiosco_id, precio_costo)
      VALUES (NEW.id, NEW.kiosco_id, v_costo_cambio)
      ON CONFLICT (producto_id) DO UPDATE
      SET kiosco_id = EXCLUDED.kiosco_id,
          precio_costo = EXCLUDED.precio_costo,
          fecha_actualizacion = now();
    END IF;
  ELSIF v_usuario_puede_editar THEN
    -- El trigger se ejecuta cuando UPDATE incluye precio_costo. La columna pública
    -- siempre vale 0; comparar NEW con OLD impediría guardar un costo privado 0.
    INSERT INTO public.producto_costos (producto_id, kiosco_id, precio_costo)
    VALUES (NEW.id, NEW.kiosco_id, v_costo_cambio)
    ON CONFLICT (producto_id) DO UPDATE
    SET kiosco_id = EXCLUDED.kiosco_id,
        precio_costo = EXCLUDED.precio_costo,
        fecha_actualizacion = now();
  ELSIF v_costo_cambio IS DISTINCT FROM OLD.precio_costo THEN
    IF NOT v_usuario_puede_editar THEN
      RAISE EXCEPTION 'Solo el dueño puede modificar el costo del producto'
        USING ERRCODE = '42501';
    END IF;

  END IF;

  NEW.precio_costo := 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_costo_producto ON public.productos;
CREATE TRIGGER trg_proteger_costo_producto
  BEFORE INSERT OR UPDATE OF precio_costo ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_costo_producto();
REVOKE ALL ON FUNCTION public.proteger_costo_producto() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Validación manual posterior a aplicar:
-- 1) Como CAJERO, SELECT precio_costo FROM productos devuelve 0 para todo el kiosco.
-- 2) Como CAJERO, SELECT * FROM producto_costos devuelve cero filas.
-- 3) Como CAJERO, cambiar precio_costo a un valor distinto de 0 falla con 42501.
-- 4) Como DUEÑO, SELECT producto_costos devuelve solo costos del propio kiosco.
-- 5) Como DUEÑO, INSERT/UPDATE productos con precio_costo guarda el real en
--    producto_costos y deja 0 en productos.
-- 6) Como DUEÑO, UPDATE precio_costo = 0 también actualiza el costo privado.
