-- KioskoPOS canonical bootstrap: domain schema for the manual checkout pilot.
-- Apply once to an empty Supabase project after reviewing README.md.
-- This is a baseline, not an incremental migration. Supabase Auth owns auth.users.
BEGIN;

CREATE TABLE public.kioscos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  estado_suscripcion text NOT NULL DEFAULT 'ACTIVO'
    CHECK (estado_suscripcion IN ('ACTIVO','SOLO_LECTURA','SUSPENDIDO')),
  capacidades_operativas jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha_creacion timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  email text,
  rol text NOT NULL CHECK (rol IN ('DUEÑO','CAJERO','VISOR')),
  activo boolean NOT NULL DEFAULT true,
  es_superadmin boolean NOT NULL DEFAULT false,
  fecha_creacion timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usuarios_kiosco_activo_idx ON public.usuarios(kiosco_id,activo);

CREATE TABLE public.categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  orden integer NOT NULL DEFAULT 0,
  UNIQUE (id,kiosco_id)
);

CREATE TABLE public.productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  codigo_barras text,
  descripcion text NOT NULL,
  precio_costo numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  precio_venta numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_venta >= 0),
  stock_actual numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  es_favorito boolean NOT NULL DEFAULT false,
  es_pesable boolean NOT NULL DEFAULT false,
  unidad_medida text NOT NULL DEFAULT 'UN',
  plu_balanza text,
  es_combo boolean NOT NULL DEFAULT false,
  es_retornable boolean NOT NULL DEFAULT false,
  precio_envase numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_envase >= 0),
  nombre_envase text,
  requiere_vencimiento boolean NOT NULL DEFAULT false,
  dias_alerta_vencimiento integer NOT NULL DEFAULT 15 CHECK (dias_alerta_vencimiento >= 0),
  activo boolean NOT NULL DEFAULT true,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,kiosco_id),
  FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL
);
CREATE INDEX productos_kiosco_activo_idx ON public.productos(kiosco_id,activo);
CREATE INDEX productos_plu_idx ON public.productos(kiosco_id,plu_balanza) WHERE plu_balanza IS NOT NULL;

-- Physical combo recipe. `promociones.items_combo` is separate JSON data for offers.
CREATE TABLE public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  combo_producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  componente_producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (combo_producto_id,componente_producto_id),
  CHECK (combo_producto_id <> componente_producto_id)
);
CREATE INDEX combo_items_kiosco_idx ON public.combo_items(kiosco_id);
CREATE INDEX combo_items_combo_idx ON public.combo_items(combo_producto_id);
CREATE INDEX combo_items_component_idx ON public.combo_items(componente_producto_id);

CREATE TABLE public.promociones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('NXM','VOLUMEN','PORCENTAJE','COMBO')),
  producto_id uuid REFERENCES public.productos(id) ON DELETE CASCADE,
  categoria_id uuid REFERENCES public.categorias(id) ON DELETE SET NULL,
  cantidad_minima numeric(12,3) NOT NULL DEFAULT 1 CHECK (cantidad_minima > 0),
  cantidad_paga numeric(12,3),
  precio_unitario_promo numeric(12,2),
  descuento_porcentaje numeric(5,2) CHECK (descuento_porcentaje BETWEEN 0 AND 100),
  precio_combo numeric(12,2),
  items_combo jsonb,
  dias_semana integer[],
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promociones_kiosco_activo_idx ON public.promociones(kiosco_id,activo);

CREATE TABLE public.lotes_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  numero_lote text,
  fecha_vencimiento date NOT NULL,
  cantidad_inicial numeric(12,3) NOT NULL CHECK (cantidad_inicial >= 0),
  cantidad_actual numeric(12,3) NOT NULL CHECK (cantidad_actual >= 0),
  fecha_ingreso timestamptz NOT NULL DEFAULT now(),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (id,producto_id,kiosco_id)
);
CREATE INDEX lotes_fefo_idx ON public.lotes_producto(kiosco_id,producto_id,activo,fecha_vencimiento,fecha_ingreso);

CREATE TABLE public.sesiones_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  fecha_apertura timestamptz NOT NULL DEFAULT now(),
  fecha_cierre timestamptz,
  monto_inicial numeric(12,2) NOT NULL DEFAULT 0 CHECK (monto_inicial >= 0),
  monto_final_declarado numeric(12,2),
  monto_final_sistema numeric(12,2),
  diferencia numeric(12,2),
  estado text NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','CERRADA')),
  notas_cierre text,
  CHECK ((estado='ABIERTA' AND fecha_cierre IS NULL) OR (estado='CERRADA' AND fecha_cierre IS NOT NULL))
);
CREATE INDEX sesiones_caja_kiosco_estado_idx ON public.sesiones_caja(kiosco_id,estado);

CREATE TABLE public.movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  sesion_caja_id uuid NOT NULL REFERENCES public.sesiones_caja(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  tipo text NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
  motivo text NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  descripcion text NOT NULL,
  fecha_hora timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_caja_sesion_fecha_idx ON public.movimientos_caja(sesion_caja_id,fecha_hora);

CREATE TABLE public.ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  sesion_caja_id uuid REFERENCES public.sesiones_caja(id) ON DELETE SET NULL,
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  estado text NOT NULL DEFAULT 'COMPLETADA' CHECK (estado IN ('COMPLETADA','ANULADA')),
  notas text,
  sincronizado boolean NOT NULL DEFAULT true,
  motivo_anulacion text,
  anulada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  anulada_en timestamptz,
  CHECK ((estado='ANULADA' AND anulada_en IS NOT NULL) OR estado='COMPLETADA')
);
CREATE INDEX ventas_kiosco_fecha_idx ON public.ventas(kiosco_id,fecha_hora DESC);

CREATE TABLE public.detalles_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.ventas(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  sin_envase boolean NOT NULL DEFAULT false,
  precio_envase_unitario numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_envase_unitario >= 0),
  es_devolucion_envase boolean NOT NULL DEFAULT false
);
CREATE INDEX detalles_venta_venta_idx ON public.detalles_venta(venta_id);

CREATE TABLE public.pagos_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.ventas(id),
  medio_pago text NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  referencia text
);
CREATE INDEX pagos_venta_venta_idx ON public.pagos_venta(venta_id);

CREATE TABLE public.movimientos_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  tipo text NOT NULL CHECK (tipo IN ('INGRESO','EGRESO','AJUSTE')),
  cantidad numeric(12,3) NOT NULL CHECK (cantidad >= 0),
  motivo text NOT NULL,
  notas text,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  lote_producto_id uuid REFERENCES public.lotes_producto(id) ON DELETE SET NULL,
  costo_unitario_referencia numeric(12,2)
);
CREATE INDEX movimientos_stock_venta_idx ON public.movimientos_stock(kiosco_id,motivo,notas);
CREATE INDEX movimientos_stock_lote_idx ON public.movimientos_stock(lote_producto_id) WHERE lote_producto_id IS NOT NULL;

CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  telefono text,
  dni_cuit text,
  direccion text,
  email text,
  limite_credito numeric(12,2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
  saldo_deudor numeric(12,2) NOT NULL DEFAULT 0 CHECK (saldo_deudor >= 0),
  activo boolean NOT NULL DEFAULT true,
  notas text,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,kiosco_id)
);

CREATE TABLE public.movimientos_cuenta_corriente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('CARGO_VENTA','ABONO_PAGO')),
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  medio_pago text,
  saldo_resultante numeric(12,2) NOT NULL,
  notas text,
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX movimientos_cc_cliente_fecha_idx ON public.movimientos_cuenta_corriente(cliente_id,fecha_hora);

-- Kept as a guard target for annulment eligibility. Partial returns are out of pilot scope.
CREATE TABLE public.devoluciones_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.ventas(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.producto_costos (
  producto_id uuid PRIMARY KEY REFERENCES public.productos(id) ON DELETE CASCADE,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  precio_costo numeric(12,2) NOT NULL DEFAULT 0 CHECK (precio_costo >= 0),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.movimiento_stock_costos (
  movimiento_id uuid PRIMARY KEY REFERENCES public.movimientos_stock(id) ON DELETE CASCADE,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  precio_costo numeric(12,2)
);

CREATE TABLE public.auditoria_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  actor_auth_id uuid,
  actor_rol text,
  accion text NOT NULL,
  entidad text NOT NULL,
  entidad_id uuid NOT NULL,
  motivo text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_operaciones_kiosco_fecha_idx ON public.auditoria_operaciones(kiosco_id,creado_en DESC);

CREATE TABLE public.checkout_manuales (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  venta_id uuid UNIQUE REFERENCES public.ventas(id),
  solicitud jsonb NOT NULL,
  resultado jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.checkout_manual_entradas (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  entrada jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  autorizado_por_auth_id uuid NOT NULL,
  requiere_supervisor boolean,
  politica_umbral numeric(5,2),
  politica_revision bigint,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.checkout_manual_cancelaciones (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  entrada jsonb NOT NULL,
  motivo text NOT NULL CHECK (length(motivo) BETWEEN 5 AND 1000),
  resolucion text NOT NULL CHECK (resolucion IN ('NO_COBRADO','REINTEGRADO')),
  referencia text,
  autorizado_por uuid NOT NULL REFERENCES public.usuarios(id),
  autorizado_por_auth_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (resolucion <> 'REINTEGRADO' OR length(trim(coalesce(referencia,''))) BETWEEN 5 AND 500)
);

CREATE TABLE public.anulaciones_venta_atomicas (
  venta_id uuid PRIMARY KEY REFERENCES public.ventas(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  motivo text NOT NULL,
  resultado jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supervisor_politicas (
  kiosco_id uuid PRIMARY KEY REFERENCES public.kioscos(id),
  umbral_descuento numeric(5,2) NOT NULL CHECK (umbral_descuento BETWEEN 0 AND 100),
  revision bigint NOT NULL CHECK (revision > 0),
  actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_auth_id uuid NOT NULL
);
CREATE TABLE public.supervisor_politica_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  umbral_anterior numeric(5,2) NOT NULL,
  umbral_nuevo numeric(5,2) NOT NULL,
  revision bigint NOT NULL,
  fecha timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Fail closed during the ordered bootstrap: do not connect a frontend until
-- 900_final_security.sql installs the reviewed read policies and RPC ACLs.
ALTER TABLE public.kioscos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalles_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_cuenta_corriente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devoluciones_venta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimiento_stock_costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_manual_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_manual_cancelaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anulaciones_venta_atomicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_politicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_politica_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kioscos,public.usuarios,public.categorias,public.productos,
  public.combo_items,public.promociones,public.lotes_producto,public.sesiones_caja,
  public.movimientos_caja,public.ventas,public.detalles_venta,public.pagos_venta,
  public.movimientos_stock,public.clientes,public.movimientos_cuenta_corriente,
  public.devoluciones_venta,public.producto_costos,public.movimiento_stock_costos,
  public.auditoria_operaciones,public.checkout_manuales,public.checkout_manual_entradas,
  public.checkout_manual_cancelaciones,public.anulaciones_venta_atomicas,
  public.supervisor_politicas,public.supervisor_politica_auditoria
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
