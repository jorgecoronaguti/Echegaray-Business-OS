-- CONTROL DE OBRAS Fase 2 — AVANCE FÍSICO por obra. Espejo en Supabase del tracker real
-- "Avances de Obra" (Drive), leído por el VM vía Service Account (orquestador/lib/avance-fisico.mjs)
-- y sincronizado por scripts/sync-avance-obra.mjs. La web lee de acá (no puede tocar Drive).
-- Una fila por obra (= hoja del tracker). Honesto con la heterogeneidad del archivo: las hojas
-- sin % cargado quedan estructurado=false + motivo, NO se inventa avance. El detalle por
-- actividad (rubro + %) va en JSONB tal como vino del tracker.
create table if not exists public.avance_obra (
  id              uuid primary key default gen_random_uuid(),
  obra            text unique not null,           -- nombre de la hoja del tracker
  estructurado    boolean not null default false, -- true si la hoja tiene % avance cargado
  motivo          text,                            -- por qué no hay avance (si estructurado=false)
  actividades     integer not null default 0,      -- # de actividades con % cargado
  completadas     integer not null default 0,      -- # de actividades al 100%
  avance_promedio integer,                          -- % físico promedio (null si no estructurado)
  detalle         jsonb not null default '[]'::jsonb, -- [{codigo, actividad, pct, estado}]
  fuente          text not null default 'avances_de_obra_drive',
  sincronizado_en timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.avance_obra enable row level security;
create policy avance_obra_select on public.avance_obra for select to authenticated using (true);
create policy avance_obra_upsert on public.avance_obra for insert to authenticated with check (true);
create policy avance_obra_update on public.avance_obra for update to authenticated using (true);
grant select, insert, update on public.avance_obra to authenticated;
