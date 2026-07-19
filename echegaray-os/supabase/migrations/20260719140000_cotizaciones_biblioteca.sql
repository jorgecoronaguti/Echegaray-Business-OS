-- Comercial · Cotización (PRP aprobado 2026-07-19), Fase 1: BIBLIOTECA VIVA de cotizaciones.
-- Hoy las cotizaciones se arman en el Sheet (APU) y se pisan/pierden — no queda historial de qué se
-- cotizó, a quién, por cuánto, con qué margen, y si se ganó o perdió. Esta tabla acumula ese historial.
-- Es PRE-OBRA (un prospecto no es una obra todavía) → NO se apoya en presupuestos (que es obra ya
-- aceptada, obra_id NOT NULL). Se enlaza opcionalmente a obra_canonica cuando la cotización se GANA y
-- se vuelve obra: ese link es el puente para la Fase 2 (cotizado vs. costo real). El costo real NO se
-- copia acá — vive en costos_obra y la comparación se calcula.
-- Todo nullable salvo id/estado/created_at: una cotización mínima (cliente + monto) no debe fallar.
create table if not exists public.cotizaciones (
  id                uuid primary key default gen_random_uuid(),
  cliente           text,
  obra_nombre       text,
  obra_canonica_id  text references public.obra_canonica(id),
  monto_venta       numeric,            -- precio de venta s/IVA (lo cotizado)
  costo_estimado    numeric,            -- costo del APU (para comparar vs real en Fase 2)
  margen_pct        numeric,            -- margen % con el que se cotizó
  fecha_cotizacion  date default current_date,
  estado            text not null default 'emitida', -- borrador | emitida | ganada | perdida
  notas             text,
  origen            text default 'os',
  created_at        timestamptz not null default now()
);
create index if not exists cotizaciones_obra_canonica_idx on public.cotizaciones(obra_canonica_id);
create index if not exists cotizaciones_estado_idx on public.cotizaciones(estado);
create index if not exists cotizaciones_fecha_idx on public.cotizaciones(fecha_cotizacion);

alter table public.cotizaciones enable row level security;

-- RLS consistente con adicionales: todos leen; dirección/administración/comercial gestionan.
-- (el orquestador entra con service role y evade RLS; esto protege el acceso vía web/anon.)
drop policy if exists cotizaciones_select on public.cotizaciones;
create policy cotizaciones_select on public.cotizaciones for select to authenticated using (true);
drop policy if exists cotizaciones_insert on public.cotizaciones;
create policy cotizaciones_insert on public.cotizaciones for insert to authenticated
  with check (current_rol() = any (array['direccion','administracion','comercial']));
drop policy if exists cotizaciones_update on public.cotizaciones;
create policy cotizaciones_update on public.cotizaciones for update to authenticated
  using (current_rol() = any (array['direccion','administracion','comercial']));
drop policy if exists cotizaciones_delete on public.cotizaciones;
create policy cotizaciones_delete on public.cotizaciones for delete to authenticated
  using (current_rol() = any (array['direccion','administracion']));
