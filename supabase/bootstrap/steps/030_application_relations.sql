-- Application relations required by enabled strict-pilot screens.
-- Deliberately excludes commercial admin, fiscal integrations, Point and partial returns.
BEGIN;

ALTER TABLE public.kioscos
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS rubro text NOT NULL DEFAULT 'KIOSCO',
  ADD COLUMN IF NOT EXISTS equipos_comercio jsonb,
  ADD COLUMN IF NOT EXISTS arqueo_ciego_obligatorio boolean NOT NULL DEFAULT true;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS proveedor_id uuid;
ALTER TABLE public.auditoria_operaciones ADD COLUMN IF NOT EXISTS detalles jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 180),
  contacto_nombre text,
  telefono text,
  email text,
  cuit text,
  dias_visita text,
  cbu_alias text,
  saldo_pendiente numeric(12,2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  activo boolean NOT NULL DEFAULT true,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,kiosco_id)
);
CREATE INDEX proveedores_kiosco_idx ON public.proveedores(kiosco_id,activo,nombre);
ALTER TABLE public.productos ADD CONSTRAINT productos_proveedor_fk
  FOREIGN KEY (proveedor_id,kiosco_id) REFERENCES public.proveedores(id,kiosco_id) ON DELETE RESTRICT;

CREATE TABLE public.compras_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  nro_comprobante text,
  fecha timestamptz NOT NULL DEFAULT now(),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  estado text NOT NULL DEFAULT 'RECIBIDA' CHECK (estado IN ('RECIBIDA','ANULADA')),
  medio_pago text NOT NULL DEFAULT 'EFECTIVO' CHECK (medio_pago IN ('EFECTIVO','TRANSFERENCIA','CUENTA_CORRIENTE')),
  pagado_en_caja boolean NOT NULL DEFAULT false,
  sesion_caja_id uuid REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  notas text,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (proveedor_id,kiosco_id) REFERENCES public.proveedores(id,kiosco_id)
);
CREATE INDEX compras_proveedor_kiosco_fecha_idx ON public.compras_proveedor(kiosco_id,fecha DESC);
CREATE INDEX compras_proveedor_proveedor_fecha_idx ON public.compras_proveedor(proveedor_id,fecha DESC);

CREATE TABLE public.detalles_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras_proveedor(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  precio_costo_unitario numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo_unitario >= 0),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0)
);
CREATE INDEX detalles_compra_compra_idx ON public.detalles_compra(compra_id);
CREATE INDEX detalles_compra_producto_idx ON public.detalles_compra(producto_id);

CREATE TABLE public.pagos_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  proveedor_id uuid NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  medio_pago text NOT NULL DEFAULT 'EFECTIVO' CHECK (medio_pago IN ('EFECTIVO','TRANSFERENCIA','OTRO')),
  saldo_anterior numeric(12,2) NOT NULL DEFAULT 0,
  saldo_nuevo numeric(12,2) NOT NULL DEFAULT 0,
  pagado_en_caja boolean NOT NULL DEFAULT false,
  sesion_caja_id uuid REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  comprobante_ref text,
  notas text,
  estado text NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','ANULADO')),
  FOREIGN KEY (proveedor_id,kiosco_id) REFERENCES public.proveedores(id,kiosco_id)
);
CREATE INDEX pagos_proveedor_kiosco_fecha_idx ON public.pagos_proveedor(kiosco_id,fecha DESC);
CREATE INDEX pagos_proveedor_proveedor_fecha_idx ON public.pagos_proveedor(proveedor_id,fecha DESC);

CREATE TABLE public.tickets_soporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid REFERENCES public.kioscos(id) ON DELETE SET NULL,
  kiosco_nombre text NOT NULL DEFAULT '',
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  usuario_nombre text NOT NULL DEFAULT '',
  usuario_telefono text,
  usuario_email text,
  usuario_rol text NOT NULL DEFAULT 'CAJERO',
  tipo text NOT NULL DEFAULT 'CONSULTA' CHECK (tipo IN ('ERROR','CONSULTA','SUGERENCIA','FACTURACION','URGENTE')),
  modulo text NOT NULL DEFAULT 'General',
  mensaje text NOT NULL CHECK (length(btrim(mensaje)) BETWEEN 1 AND 8000),
  datos_diagnostico jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROCESO','RESUELTO')),
  respuesta_admin text,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_soporte_kiosco_fecha_idx ON public.tickets_soporte(kiosco_id,fecha_creacion DESC);

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets_soporte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proveedores,public.compras_proveedor,public.detalles_compra,public.pagos_proveedor,public.tickets_soporte FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
