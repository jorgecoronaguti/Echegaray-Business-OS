-- PRP-006: Gestión Integral de Adicionales.
-- Una fila = un adicional con TODO su historial de etapas como columnas fecha+monto
-- nullable, no un `estado` enum lineal. Es deliberado: el objetivo explícito de esta
-- capacidad es poder detectar secuencias FUERA de orden (ej. "ejecutado sin cotizar"),
-- algo que un enum lineal (que solo permite un estado "actual") no puede representar.

create table adicionales (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,

  concepto text not null,
  origen text not null,
  detectado_por text not null,
  fecha_deteccion date not null,

  fecha_cotizacion date,
  monto_cotizado numeric(14,2),

  fecha_aprobacion date,
  monto_aprobado numeric(14,2),

  fecha_ejecucion date,

  fecha_facturacion date,
  monto_facturado numeric(14,2),
  referencia_factura text,

  fecha_cobranza date,
  monto_cobrado numeric(14,2),
  -- Vínculo opcional con el movimiento de caja que efectivamente cobró este adicional
  -- (mismo patrón que costos_reales -> movimientos_caja de tipo pago, PRP-004, acá
  -- espejado hacia tipo cobro).
  movimiento_caja_id uuid references movimientos_caja(id) on delete set null,

  -- "Frenado" no se puede derivar de las fechas (un adicional recién detectado no está
  -- frenado, solo es temprano) — es un juicio humano explícito, con motivo obligatorio.
  frenado boolean not null default false,
  motivo_frenado text,

  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint adicionales_monto_cotizado_check check (monto_cotizado is null or monto_cotizado > 0),
  constraint adicionales_monto_aprobado_check check (monto_aprobado is null or monto_aprobado > 0),
  constraint adicionales_monto_facturado_check check (monto_facturado is null or monto_facturado > 0),
  constraint adicionales_monto_cobrado_check check (monto_cobrado is null or monto_cobrado > 0),

  -- Fecha y monto de cada etapa viajan juntos (ejecución no tiene monto propio).
  -- Notar que NO hay constraint de orden entre etapas (ej. no se exige que
  -- fecha_cotizacion exista para poder cargar fecha_ejecucion) — permitir el desorden
  -- es lo que hace posible la alerta "ejecutado sin cotizar".
  constraint adicionales_cotizacion_par_check check ((fecha_cotizacion is null) = (monto_cotizado is null)),
  constraint adicionales_aprobacion_par_check check ((fecha_aprobacion is null) = (monto_aprobado is null)),
  constraint adicionales_facturacion_par_check check ((fecha_facturacion is null) = (monto_facturado is null)),
  constraint adicionales_cobranza_par_check check ((fecha_cobranza is null) = (monto_cobrado is null)),

  constraint adicionales_frenado_motivo_check check (not frenado or motivo_frenado is not null)
);

create index adicionales_obra_idx on adicionales(obra_id);
create index adicionales_frenado_idx on adicionales(obra_id) where frenado = true;

-- Un movimiento de caja liquida como máximo un adicional (evita doble conteo, mismo
-- principio que costos_reales_movimiento_caja_unico).
create unique index adicionales_movimiento_caja_unico
  on adicionales(movimiento_caja_id) where movimiento_caja_id is not null;

-- Regla de dominio (trigger, no CHECK, porque valida otra tabla): si un adicional se
-- vincula a un movimiento de caja, ese movimiento tiene que ser un cobro (no un pago).
create or replace function adicionales_valida_movimiento_cobro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text;
begin
  if new.movimiento_caja_id is not null then
    select tipo into v_tipo from public.movimientos_caja where id = new.movimiento_caja_id;
    if v_tipo is distinct from 'cobro' then
      raise exception 'adicionales.movimiento_caja_id debe referenciar un movimiento de tipo cobro';
    end if;
  end if;
  return new;
end;
$$;

create trigger adicionales_valida_movimiento_cobro before insert or update on adicionales
  for each row execute function adicionales_valida_movimiento_cobro();

alter table adicionales enable row level security;

create policy "authenticated_full_access" on adicionales
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.adicionales to authenticated;

create trigger adicionales_set_updated_at before update on adicionales
  for each row execute function set_updated_at();
