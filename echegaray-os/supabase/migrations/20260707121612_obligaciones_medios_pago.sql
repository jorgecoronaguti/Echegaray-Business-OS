-- PRP-010: Obligaciones y Medios de Pago.
-- Verificación puntual confirmó: "Flujo de Caja - Cash Flow" > pestaña "Compras" ya
-- distingue Total/Parcial + Monto Pagado/Parcial + Tipo pago (pagos parciales reales
-- hoy); pestaña "RESUMEN" tiene deudas por proveedor + cheques emitidos (proveedor +
-- fecha de pago + monto, SIN número/emisión/vencimiento separados); cero evidencia de
-- echeq; cero evidencia real de tarjeta como medio de pago de compras; obligaciones
-- generales sin proveedor/obra confirmadas (ARCA, Sindicatos, Sueldos).

-- Obligación = compromiso financiero exigible (total o parcialmente pendiente),
-- distinto de Compra (proceso comercial) y de Costo Real (impacto económico/devengado).
-- Sirve también como unidad de "cuota/vencimiento": una obligación en 3 cuotas se
-- modela como 3 filas de `obligaciones` compartiendo compra_id/costo_real_id, cada una
-- con su propio monto y vencimiento — no hace falta una tabla "cuotas" separada.
create table obligaciones (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) on delete restrict,
  proveedor_id uuid references proveedores(id) on delete restrict,
  -- Trazabilidad opcional hacia el origen, sin duplicar esas tablas.
  compra_id uuid references compras(id) on delete set null,
  costo_real_id uuid references costos_reales(id) on delete set null,

  concepto text not null,
  monto_total numeric(14,2) not null check (monto_total > 0),
  fecha_origen date not null,
  -- Nullable deliberado: el objetivo funcional pide poder alertar "obligación sin
  -- fecha de vencimiento" — si fuera NOT NULL esa alerta nunca podría dispararse.
  fecha_vencimiento date,

  fuente_legacy text not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index obligaciones_obra_idx on obligaciones(obra_id);
create index obligaciones_proveedor_idx on obligaciones(proveedor_id);
create index obligaciones_vencimiento_idx on obligaciones(fecha_vencimiento);

alter table obligaciones enable row level security;
create policy "authenticated_full_access" on obligaciones
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.obligaciones to authenticated;
create trigger obligaciones_set_updated_at before update on obligaciones
  for each row execute function set_updated_at();

-- Aplicación de Pago = única relación genuinamente muchos-a-muchos de esta capacidad:
-- un pago (movimiento_caja de tipo pago) puede saldar VARIAS obligaciones a la vez
-- (pago agrupado a un mismo proveedor), y una obligación puede recibir VARIOS pagos
-- (pagos parciales). No se puede resolver con una FK simple de un lado — hace falta
-- una tabla de unión con su propio monto_aplicado (un pago puede cubrir solo una
-- parte de una obligación, o repartirse entre varias).
create table aplicaciones_pago (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references obligaciones(id) on delete restrict,
  movimiento_caja_id uuid not null references movimientos_caja(id) on delete restrict,
  monto_aplicado numeric(14,2) not null check (monto_aplicado > 0),
  notas text,
  created_at timestamptz not null default now(),

  -- Evita insertar dos veces exactamente el mismo vínculo (doble aplicación literal).
  unique (obligacion_id, movimiento_caja_id)
);

create index aplicaciones_pago_obligacion_idx on aplicaciones_pago(obligacion_id);
create index aplicaciones_pago_movimiento_idx on aplicaciones_pago(movimiento_caja_id);

-- Trigger (no CHECK): valida contra otras tablas y contra otras filas de esta misma
-- tabla — un CHECK no puede sumar filas hermanas. Dos garantías estructurales pedidas
-- explícitamente: (1) nunca aplicar más de lo que debe una obligación; (2) nunca
-- aplicar de un pago más de lo que ese pago realmente vale; (3) el pago vinculado
-- siempre debe ser de tipo 'pago', nunca 'cobro'.
create or replace function aplicaciones_pago_valida_montos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo_movimiento text;
  v_monto_obligacion numeric;
  v_aplicado_obligacion numeric;
  v_monto_movimiento numeric;
  v_aplicado_movimiento numeric;
begin
  select tipo, monto into v_tipo_movimiento, v_monto_movimiento
    from public.movimientos_caja where id = new.movimiento_caja_id;

  if v_tipo_movimiento is distinct from 'pago' then
    raise exception 'aplicaciones_pago.movimiento_caja_id debe referenciar un movimiento de tipo pago';
  end if;

  select monto_total into v_monto_obligacion from public.obligaciones where id = new.obligacion_id;

  select coalesce(sum(monto_aplicado), 0) into v_aplicado_obligacion
    from public.aplicaciones_pago
    where obligacion_id = new.obligacion_id and id is distinct from new.id;
  if v_aplicado_obligacion + new.monto_aplicado > v_monto_obligacion then
    raise exception 'La aplicación supera el monto total de la obligación (aplicado %, nuevo %, total %)',
      v_aplicado_obligacion, new.monto_aplicado, v_monto_obligacion;
  end if;

  select coalesce(sum(monto_aplicado), 0) into v_aplicado_movimiento
    from public.aplicaciones_pago
    where movimiento_caja_id = new.movimiento_caja_id and id is distinct from new.id;
  if v_aplicado_movimiento + new.monto_aplicado > v_monto_movimiento then
    raise exception 'La aplicación supera el monto del movimiento de caja (aplicado %, nuevo %, monto %)',
      v_aplicado_movimiento, new.monto_aplicado, v_monto_movimiento;
  end if;

  return new;
end;
$$;

create trigger aplicaciones_pago_valida_montos before insert or update on aplicaciones_pago
  for each row execute function aplicaciones_pago_valida_montos();

alter table aplicaciones_pago enable row level security;
create policy "authenticated_full_access" on aplicaciones_pago
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.aplicaciones_pago to authenticated;

-- Medio de pago: el ciclo emisión→vencimiento→débito de un cheque/echeq YA lo
-- representa movimientos_caja.estado (proyectado/real) desde PRP-001 — no se crea una
-- tabla "instrumentos_pago" que lo duplicaría. Solo se agrega la clasificación del
-- medio y una referencia libre (n° de cheque/echeq/comprobante), que es lo único que
-- la evidencia real (Flujo de Caja) sostiene hoy.
alter table movimientos_caja add column medio_pago text
  check (medio_pago is null or medio_pago in ('efectivo', 'transferencia', 'debito', 'tarjeta', 'cheque', 'echeq', 'otro'));
alter table movimientos_caja add column referencia_instrumento text;

-- Vista derivada (no tabla): saldo pendiente por obligación, agregando las
-- aplicaciones_pago vinculadas. security_invoker = true obligatorio (mismo gotcha de
-- PRP-005/007/008/009).
create view obligacion_resumen
with (security_invoker = true)
as
select
  o.id as obligacion_id,
  o.obra_id,
  o.proveedor_id,
  o.compra_id,
  o.costo_real_id,
  o.concepto,
  o.monto_total,
  o.fecha_origen,
  o.fecha_vencimiento,
  coalesce(ap.monto_pagado, 0) as monto_pagado,
  (o.monto_total - coalesce(ap.monto_pagado, 0)) as saldo_pendiente,
  coalesce(ap.cantidad_aplicaciones, 0) as cantidad_aplicaciones
from obligaciones o
left join lateral (
  select sum(monto_aplicado) as monto_pagado, count(*) as cantidad_aplicaciones
  from aplicaciones_pago where aplicaciones_pago.obligacion_id = o.id
) ap on true;

grant select on public.obligacion_resumen to authenticated;
