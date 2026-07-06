-- PRP-001 / Fase 1: Caja Operativa — modelo de movimientos de caja
-- Decisión de arquitectura: una sola tabla `movimientos_caja` (no cobros/pagos separados).
-- Ver .claude/PRPs/PRP-001-fundacion-flujo-de-caja.md y skill cash-flow-operativo.

create table if not exists movimientos_caja (
  id uuid primary key default gen_random_uuid(),

  tipo text not null check (tipo in ('cobro', 'pago')),
  estado text not null check (estado in ('proyectado', 'real')),

  monto numeric(14,2) not null check (monto > 0),
  cuenta_financiera_id uuid not null references cuentas_financieras(id) on delete restrict,

  fecha_esperada date not null,
  fecha_real date,

  -- Contraparte: cobro exige cliente+obra; pago exige proveedor (obra opcional,
  -- para permitir gastos generales/administrativos sin obra asociada).
  cliente_id uuid references clientes(id) on delete restrict,
  proveedor_id uuid references proveedores(id) on delete restrict,
  obra_id uuid references obras(id) on delete restrict,

  concepto text not null,

  -- De qué fuente vino este dato, para poder reconciliar con los sistemas actuales
  -- durante la transición (cash-flow-operativo: "evitar doble conteo entre fuentes").
  origen text not null default 'manual' check (origen in ('manual', 'flujo_caja_sheet', 'control_gastos')),

  -- Texto libre para agrupar pagos/cobros parciales contra la misma obligación
  -- (no se modela Factura/Certificado todavía — fuera de alcance de este incremento).
  referencia_externa text,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint movimientos_caja_contraparte_check check (
    (tipo = 'cobro' and cliente_id is not null and obra_id is not null and proveedor_id is null)
    or
    (tipo = 'pago' and proveedor_id is not null and cliente_id is null)
  ),

  constraint movimientos_caja_fecha_real_check check (
    (estado = 'real' and fecha_real is not null)
    or
    (estado = 'proyectado')
  )
);

create index if not exists movimientos_caja_cuenta_fecha_idx
  on movimientos_caja(cuenta_financiera_id, fecha_esperada);
create index if not exists movimientos_caja_obra_idx on movimientos_caja(obra_id);
create index if not exists movimientos_caja_cliente_idx on movimientos_caja(cliente_id);
create index if not exists movimientos_caja_proveedor_idx on movimientos_caja(proveedor_id);

alter table movimientos_caja enable row level security;

create policy "authenticated_full_access" on movimientos_caja
  for all to authenticated using (true) with check (true);

-- GRANT explícito: sin esto, la policy de arriba no alcanza (lección de PRP-001 Fundación).
grant select, insert, update, delete on public.movimientos_caja to authenticated;

create trigger movimientos_caja_set_updated_at before update on movimientos_caja
  for each row execute function set_updated_at();
