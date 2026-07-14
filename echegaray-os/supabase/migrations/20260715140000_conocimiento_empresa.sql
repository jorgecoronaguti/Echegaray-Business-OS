-- ============================================================================
-- CEREBRO — Base de conocimiento de la empresa. Aditivo y reversible.
-- ----------------------------------------------------------------------------
-- Memoria organizacional que ACUMULA: cada conclusión que el OS confirma en sus
-- rondas autónomas se guarda acá, deduplicada por 'clave' (afirmación normalizada).
-- Si vuelve a aparecer, sube veces_confirmado (más confianza), no se duplica. Se
-- re-inyecta en cada ronda para que el Director razone con TODO lo que ya sabe, en
-- vez de re-descubrirlo. Es la diferencia entre 21 analistas sueltos y un cerebro.
--
-- Rollback: drop table public.conocimiento_empresa.
-- ============================================================================
create table if not exists public.conocimiento_empresa (
  id               uuid primary key default gen_random_uuid(),
  area             text not null default 'direccion',
  afirmacion       text not null,
  clave            text not null unique,       -- afirmación normalizada (dedup)
  confianza        text not null default 'media',
  veces_confirmado int  not null default 1,
  vigente          boolean not null default true,
  origen_task_id   uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.conocimiento_empresa is
  'Memoria organizacional acumulada del OS: conclusiones confirmadas ronda a ronda, deduplicadas por clave.';

create index if not exists conocimiento_empresa_rank_idx
  on public.conocimiento_empresa (vigente, veces_confirmado desc, updated_at desc);

alter table public.conocimiento_empresa enable row level security;

drop policy if exists conocimiento_empresa_select on public.conocimiento_empresa;
create policy conocimiento_empresa_select on public.conocimiento_empresa
  for select to authenticated using (true);

grant select on public.conocimiento_empresa to authenticated;
