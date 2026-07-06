-- PRP-007: Ejecución Financiera de la Obra.
-- Certificado = avance de obra certificado contra el CONTRATO BASE (monto_contratado),
-- distinto de Adicionales (que ya tiene su propio ciclo facturación/cobranza, PRP-006).
-- Mismo patrón arquitectónico validado en adicionales: fecha+monto por etapa, sin
-- imponer orden entre ellas — permite representar (no bloquear) certificados sin
-- facturar, facturas sin cobrar, etc., que son justamente las alertas pedidas.

create table certificados (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,

  numero text not null,
  descripcion text,
  fecha_certificacion date not null,
  monto_certificado numeric(14,2) not null check (monto_certificado > 0),

  fecha_facturacion date,
  monto_facturado numeric(14,2),
  referencia_factura text,
  -- Solo se completa cuando se conoce el vencimiento real de la factura (no se fabrica
  -- un plazo estándar tipo "30 días") — habilita la alerta "factura vencida" solo
  -- cuando el dato existe.
  fecha_vencimiento date,

  fecha_cobranza date,
  monto_cobrado numeric(14,2),
  -- Mismo patrón que costos_reales/adicionales -> movimientos_caja: vínculo opcional,
  -- validado por trigger para que sea siempre un cobro, nunca un pago.
  movimiento_caja_id uuid references movimientos_caja(id) on delete set null,

  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint certificados_monto_facturado_positivo check (monto_facturado is null or monto_facturado > 0),
  constraint certificados_monto_cobrado_positivo check (monto_cobrado is null or monto_cobrado > 0),
  constraint certificados_facturacion_par_check check ((fecha_facturacion is null) = (monto_facturado is null)),
  constraint certificados_cobranza_par_check check ((fecha_cobranza is null) = (monto_cobrado is null)),

  unique (obra_id, numero)
);

create index certificados_obra_idx on certificados(obra_id);

create unique index certificados_movimiento_caja_unico
  on certificados(movimiento_caja_id) where movimiento_caja_id is not null;

create or replace function certificados_valida_movimiento_cobro()
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
      raise exception 'certificados.movimiento_caja_id debe referenciar un movimiento de tipo cobro';
    end if;
  end if;
  return new;
end;
$$;

create trigger certificados_valida_movimiento_cobro before insert or update on certificados
  for each row execute function certificados_valida_movimiento_cobro();

alter table certificados enable row level security;

create policy "authenticated_full_access" on certificados
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.certificados to authenticated;

create trigger certificados_set_updated_at before update on certificados
  for each row execute function set_updated_at();

-- Vista derivada (no tabla): Contrato vs Certificado vs Facturado vs Cobrado por obra.
-- security_invoker = true es obligatorio (mismo gotcha que PRP-005) para que respete
-- el RLS de obras/certificados en vez del dueño de la vista.
create view obra_ejecucion_financiera
with (security_invoker = true)
as
select
  o.id as obra_id,
  o.nombre as obra_nombre,
  o.monto_contratado,
  coalesce(c.total_certificado, 0) as total_certificado,
  coalesce(c.total_facturado, 0) as total_facturado,
  coalesce(c.total_cobrado, 0) as total_cobrado,
  (o.monto_contratado - coalesce(c.total_certificado, 0)) as pendiente_certificar,
  (coalesce(c.total_certificado, 0) - coalesce(c.total_facturado, 0)) as pendiente_facturar,
  (coalesce(c.total_facturado, 0) - coalesce(c.total_cobrado, 0)) as pendiente_cobrar,
  case when o.monto_contratado = 0 then null
    else round(coalesce(c.total_cobrado, 0) / o.monto_contratado * 100, 2)
  end as porcentaje_contrato_cobrado
from obras o
left join lateral (
  select
    sum(monto_certificado) as total_certificado,
    sum(monto_facturado) as total_facturado,
    sum(monto_cobrado) as total_cobrado
  from certificados
  where certificados.obra_id = o.id
) c on true;

grant select on public.obra_ejecucion_financiera to authenticated;
