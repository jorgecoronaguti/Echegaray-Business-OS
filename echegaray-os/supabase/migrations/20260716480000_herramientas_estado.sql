-- Mejor gestión de herramientas: hasta ahora solo se sabía DÓNDE está cada herramienta, no en
-- qué ESTADO. Para una constructora, distinguir una herramienta rota/perdida/en reparación de
-- una disponible es lo más caro de no tener. Columnas OS-owned: el sync del AppSheet NO las
-- toca (su upsert solo actualiza nombre/ubicacion/fecha), igual que imagen_url.
alter table public.herramientas
  add column if not exists estado          text not null default 'disponible',
  add column if not exists categoria       text,
  add column if not exists estado_nota      text,   -- p.ej. "en Serv. Técnico por motor"
  add column if not exists estado_actualizado_en timestamptz;

-- Estados válidos (constraint suave: no rompe el sync, solo valida escrituras del OS).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'herramientas_estado_chk') then
    alter table public.herramientas add constraint herramientas_estado_chk
      check (estado in ('disponible', 'en_uso', 'en_reparacion', 'fuera_servicio', 'perdida'));
  end if;
end $$;

create index if not exists herramientas_estado on public.herramientas (estado);
