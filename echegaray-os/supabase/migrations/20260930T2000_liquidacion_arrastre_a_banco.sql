-- LO QUE UN RECIBO DEJÓ SIN PAGAR POR BANCO Y SE PAGA POR BANCO EN OTRA QUINCENA (dueño, 30/09/2026).
--
-- «quiero que pongas lo que resta pagarle por recibo según las transferencias de la quincena pagada, como parte de lo
-- que se debería pagar por banco en esta quincena, sumándose a lo que se calcula hoy». La Q1-09 se pagó con 12
-- transferencias de $200.000 y recibos de $216.558,72 / $254.580,48: la diferencia ya se entregó en efectivo, pero
-- para el estudio el neto del recibo tiene que haber salido por banco. La Q2-09 la reclasifica: banco += resta,
-- efectivo −= resta, total igual.
--
-- Por qué una tabla y no una columna de `liquidacion_linea`: la línea guardada existe sólo para quien tiene algo
-- escrito a mano (8 de 15 obreros en Q2-09), y `por_banco_manual` es el NETO del recibo (entra al modelo del blanco):
-- escribir ahí el arrastre cambiaría el recibo estimado y el total. `persona_adelanto` y `nomina_adelanto` restan de
-- la cadena; esto la redistribuye. Una fila por persona, quincena y motivo; la de origen (`periodo_origen`) la
-- lee la quincena anterior para decir «resta → arrastrada a la 16–30/09».

create table if not exists public.liquidacion_arrastre (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references public.personas(id),
  -- El `desde` de la quincena que lo paga (`liquidacion_quincena.desde`): se cruza por fecha, no por id, porque la
  -- cabecera de la quincena puede no existir todavía cuando se carga.
  desde           date not null,
  importe         numeric(14,2) not null,
  motivo          text not null,
  periodo_origen  text not null,
  -- De dónde sale la cifra: neto del recibo, lo transferido y la referencia de cada fuente.
  evidencia       jsonb not null default '{}'::jsonb,
  cargado_en      timestamptz not null default now(),

  constraint liquidacion_arrastre_positivo check (importe > 0),
  constraint liquidacion_arrastre_con_motivo check (length(btrim(motivo)) > 0),
  constraint liquidacion_arrastre_periodo check (periodo_origen ~ '^Q[12]-[0-9]{2}/[0-9]{4}$'),
  constraint liquidacion_arrastre_unico unique (persona_id, desde, periodo_origen)
);

create index if not exists liquidacion_arrastre_desde on public.liquidacion_arrastre (desde);

alter table public.liquidacion_arrastre enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_arrastre' and policyname='liquidacion_arrastre_lee_admin') then
    create policy liquidacion_arrastre_lee_admin on public.liquidacion_arrastre
      for select to authenticated using (liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_arrastre' and policyname='liquidacion_arrastre_srv') then
    create policy liquidacion_arrastre_srv on public.liquidacion_arrastre
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- Sólo lectura desde la app: la carga es un script con evidencia, no una celda editable.
grant select on public.liquidacion_arrastre to authenticated;
grant all on public.liquidacion_arrastre to service_role;
revoke insert, update, delete on public.liquidacion_arrastre from authenticated;

comment on table public.liquidacion_arrastre is
  'Resta de un recibo que no salió por banco en su quincena y se suma al banco de otra (desde), bajando el efectivo en lo mismo: el total no cambia.';
