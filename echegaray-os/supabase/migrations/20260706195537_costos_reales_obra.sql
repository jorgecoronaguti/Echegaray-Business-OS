-- PRP-004: Costos Reales de Obra.
-- Registra el costo real devengado/comprometido contra una obra, independiente de
-- si ya impactó caja. Territorio nuevo: CONTROL DE GASTOS.xlsx es un ledger de caja
-- (percibido) sin estado comprometido/pendiente/pagado — no se migra 1:1, se construye
-- la capacidad que hoy no existe en ningún sistema legacy.

create table if not exists costos_reales (
  id uuid primary key default gen_random_uuid(),

  obra_id uuid not null references obras(id) on delete restrict,
  proveedor_id uuid references proveedores(id) on delete restrict,

  concepto text not null,
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null,

  estado text not null default 'pendiente' check (estado in ('comprometido', 'pendiente', 'pagado')),

  -- Vínculo opcional con el movimiento de caja que efectivamente pagó este costo.
  -- Nullable: comprometido/pendiente todavía no tienen movimiento real asociado.
  movimiento_caja_id uuid references movimientos_caja(id) on delete set null,

  fuente_legacy text not null,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un movimiento de caja paga como máximo un costo real (evita doble conteo:
-- dos costos no pueden reclamar el mismo pago).
create unique index if not exists costos_reales_movimiento_caja_unico
  on costos_reales(movimiento_caja_id) where movimiento_caja_id is not null;

create index if not exists costos_reales_obra_idx on costos_reales(obra_id);
create index if not exists costos_reales_proveedor_idx on costos_reales(proveedor_id);
create index if not exists costos_reales_estado_idx on costos_reales(estado);

-- Regla de dominio: si un costo se vincula a un movimiento de caja, ese movimiento
-- tiene que ser un pago (no un cobro) — un CHECK no puede validar otra tabla, así que
-- se aplica con un trigger.
create or replace function costos_reales_valida_movimiento_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text;
begin
  if new.movimiento_caja_id is not null then
    select tipo into v_tipo from public.movimientos_caja where id = new.movimiento_caja_id;
    if v_tipo is distinct from 'pago' then
      raise exception 'costos_reales.movimiento_caja_id debe referenciar un movimiento de tipo pago';
    end if;
  end if;
  return new;
end;
$$;

create trigger costos_reales_valida_movimiento_pago before insert or update on costos_reales
  for each row execute function costos_reales_valida_movimiento_pago();

alter table costos_reales enable row level security;

create policy "authenticated_full_access" on costos_reales
  for all to authenticated using (true) with check (true);

-- GRANT explícito: sin esto, la policy de arriba no alcanza (lección de PRP-001 Fundación).
grant select, insert, update, delete on public.costos_reales to authenticated;

create trigger costos_reales_set_updated_at before update on costos_reales
  for each row execute function set_updated_at();
