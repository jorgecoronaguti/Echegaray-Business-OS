-- EL DETALLE EN BLANCO DE CADA RECIBO DE SUELDO: horas, valor hora de la categoría, bruto, descuentos, neto.
--
-- Dueño, 14/09/2026: el sueldo de un obrero tiene dos partes. BLANCO es el recibo (horas × valor hora
-- de la categoría, al banco); NEGRO son las horas que el recibo no cubre, a otro valor, en efectivo.
-- `nomina_recibo_neto` sólo guarda el neto: sin horas ni valor hora no se puede calcular cuántas horas
-- quedan para la parte en efectivo. Esta tabla es lo que el cuadro nuevo lee; su forma es un contrato.
--
-- La carga es de `orquestador/scripts/recibos-detalle-importar.mjs`, leída del PDF del estudio, una
-- fila por (cuil, periodo). El período usa el formato de `nomina_recibo_neto` ('Q1-08/2026'), salvo la
-- liquidación final, que acá lleva el mes: 'FINAL-08/2026'.
--
-- ═══ QUIÉN LEE Y QUIÉN ESCRIBE ═══
--
-- Lee quien liquida sueldos (`liquida_sueldos()`), la misma puerta que `persona_tarifa`: es sueldo de
-- personas. Escribe SÓLO la clave de servicio, desde el importador. `authenticated` no escribe: el
-- recibo es del estudio, no se corrige desde la web.

create table if not exists public.recibo_sueldo_linea (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid references public.personas(id),
  cuil            text not null,
  periodo         text not null,
  categoria       text,
  valor_hora      numeric,
  horas_normales  numeric,
  horas_feriado   numeric,
  horas_otras     numeric,
  horas_blanco    numeric not null,
  bruto           numeric,
  descuentos      numeric,
  neto            numeric not null,
  drive_file_id   text,
  fuente          text not null,
  cargado_en      timestamptz not null default now(),
  unique (cuil, periodo)
);

create index if not exists recibo_sueldo_linea_persona on public.recibo_sueldo_linea (persona_id, periodo);

comment on table public.recibo_sueldo_linea is
  'Parte en blanco de cada recibo de sueldo, leída del PDF del estudio: horas (normales, feriado, otras), valor hora, bruto, descuentos y neto. Una fila por (cuil, periodo). La carga es del importador recibos-detalle-importar.mjs.';

alter table public.recibo_sueldo_linea enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'recibo_sueldo_linea' and policyname = 'recibo_sueldo_linea_lee_admin') then
    create policy recibo_sueldo_linea_lee_admin on public.recibo_sueldo_linea
      for select to authenticated using ((select public.liquida_sueldos()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'recibo_sueldo_linea' and policyname = 'recibo_sueldo_linea_srv') then
    create policy recibo_sueldo_linea_srv on public.recibo_sueldo_linea
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.recibo_sueldo_linea to authenticated;
grant all on public.recibo_sueldo_linea to service_role;
revoke insert, update, delete on public.recibo_sueldo_linea from authenticated;
