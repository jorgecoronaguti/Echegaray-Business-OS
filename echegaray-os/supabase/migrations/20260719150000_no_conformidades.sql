-- Calidad · No conformidades (área Calidad). El dueño: "no existe, hay que empezar a tenerlo" →
-- greenfield. Una no conformidad es un desvío de calidad detectado en obra (material fuera de
-- especificación, ejecución defectuosa, retrabajo, incumplimiento de pliego). Tratarla como PROCESO:
-- detección → tratamiento → cierre. El KPI de Calidad son las NC ABIERTAS (sobre todo graves/críticas)
-- y el tiempo de cierre. Keyeado al eje canónico. Interno/reversible (patrón adicionales).
-- Todo nullable salvo id/estado/created_at: una NC mínima (qué + gravedad) no debe fallar al registrar.
create table if not exists public.no_conformidades (
  id                 uuid primary key default gen_random_uuid(),
  obra_canonica_id   text references public.obra_canonica(id),
  descripcion        text,                              -- qué pasó
  gravedad           text,                              -- leve | moderada | grave | critica
  tipo               text,                              -- material | ejecucion | documentacion | seguridad (opcional)
  estado             text not null default 'abierta',   -- abierta | en_tratamiento | cerrada
  accion_correctiva  text,
  detectada_por      text,
  fecha_deteccion    date default current_date,
  fecha_cierre       date,
  origen             text default 'os',
  created_at         timestamptz not null default now()
);
create index if not exists no_conformidades_obra_idx on public.no_conformidades(obra_canonica_id);
create index if not exists no_conformidades_estado_idx on public.no_conformidades(estado);

alter table public.no_conformidades enable row level security;
-- RLS consistente: todos leen; dirección/administración/obras gestionan.
drop policy if exists nc_select on public.no_conformidades;
create policy nc_select on public.no_conformidades for select to authenticated using (true);
drop policy if exists nc_insert on public.no_conformidades;
create policy nc_insert on public.no_conformidades for insert to authenticated
  with check (current_rol() = any (array['direccion','administracion','jefe_obra']));
drop policy if exists nc_update on public.no_conformidades;
create policy nc_update on public.no_conformidades for update to authenticated
  using (current_rol() = any (array['direccion','administracion','jefe_obra']));
drop policy if exists nc_delete on public.no_conformidades;
create policy nc_delete on public.no_conformidades for delete to authenticated
  using (current_rol() = any (array['direccion','administracion']));
