-- PRP-012: Post Mortem de Obra.
-- Todo lo derivable (margen esperado/real, desvíos de costo y HH, certificación,
-- adicionales, compras, alertas) ya existe en vistas y funciones TypeScript de
-- capacidades anteriores — no se duplica ningún cálculo. Lo genuinamente nuevo es la
-- capa de juicio humano: causas de desvío, aprendizajes, acciones recomendadas,
-- cambios sugeridos para la próxima cotización, y el estado del cierre en sí
-- (borrador/cerrado) — eso sí necesita una tabla real.
--
-- Decisión sobre snapshot: mientras el post mortem está en 'borrador', los resúmenes
-- se muestran en vivo desde las vistas existentes (obra_resumen_economico, etc.) —
-- así se puede revisar el estado actual antes de decidir cerrar. Al CERRAR, se congela
-- un snapshot (jsonb, no columnas separadas: es un dato de solo lectura histórica, no
-- algo que se vaya a filtrar por SQL) para que el aprendizaje quede estable aunque
-- después se corrija un costo_real u otro dato de la obra ya cerrada.

create table post_mortems (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,

  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),

  causas_desvio text,
  aprendizajes text,
  acciones_recomendadas text,
  cambios_sugeridos_cotizacion text,

  -- Congelado únicamente al cerrar (ver función/trigger de cierre en el service de
  -- TypeScript, que arma este JSON reutilizando los mismos cálculos existentes).
  resumen_snapshot jsonb,
  fecha_cierre date,

  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (obra_id),

  -- Un post mortem "cerrado" siempre tiene fecha de cierre y snapshot — evita un
  -- estado inconsistente (cerrado sin registro estable de lo que se cerró).
  constraint post_mortems_cierre_check check (
    estado = 'borrador' or (estado = 'cerrado' and fecha_cierre is not null and resumen_snapshot is not null)
  )
);

create index post_mortems_obra_idx on post_mortems(obra_id);

alter table post_mortems enable row level security;
create policy "authenticated_full_access" on post_mortems
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.post_mortems to authenticated;
create trigger post_mortems_set_updated_at before update on post_mortems
  for each row execute function set_updated_at();
